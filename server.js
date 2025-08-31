import express from "express";
import { verifyToken } from "./firebaseBots.js";
import cors from "cors";
import {
  makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
} from "@whiskeysockets/baileys";
import qrcode from "qrcode";
import { Boom } from "@hapi/boom";
import { WebSocketServer } from "ws";
import fs from "fs-extra";
import path from "node:path";
import { fileURLToPath } from "url";
import { getAIResponse } from "./aiReply.js";
import { getAllBots, incrementMessageCount } from "./firebaseBots.js";

import { updateBotWhatsappStatus } from "./firebaseBots.js";
import { checkUserRateLimit } from "./rateLimit.js";
import { saveBotsToFile, broadcastQR } from "./botUtils.js";



const app = express();
const port = 5000;
app.use(cors());
app.use(express.json());

// Register API endpoints for user/plan/bot management

// Store all bots: botId => { sock, qrCodeData, chatbotName }
const bots = new Map();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const BOTS_FILE = path.join(__dirname, "user-bots.json");

// Load bots info from Firestore and auto-create bots
async function loadBotsFromFirebase() {
  try {
    const arr = await getAllBots();
    for (const data of arr) {
      await createBot(data);
    }
  } catch (e) {
    console.error("Failed to load bots from Firebase:", e);
    throw new Boom("Failed to load bots", { statusCode: 500, data: e });
  }
}

// WebSocket server for QR code updates
const wss = new WebSocketServer({ noServer: true });

// Create a new bot or reconnect existing
async function createBot(data) {
  let botId = data.id ;
  let name = data.name || "Default Bot";
  // Store all bot fields for use in message handling
  let botData = bots.get(botId) || {};
  Object.assign(botData, data);
  // if (bots.has(botId) && bots.get(botId).sock) return bots.get(botId);

  const { state, saveCreds } = await useMultiFileAuthState(
    `auth_info_${botId}`
  );

  const sock = makeWASocket({
    auth: state,
  });

  botData.sock = sock;
  botData.qrCodeData = null;
  botData.chatbotName = name || botData.chatbotName || "Default Bot";
  bots.set(botId, botData);
  saveBotsToFile(bots, BOTS_FILE, fs, path);
  // listen for incoming messages
  sock.ev.on("messages.upsert", async (m) => {
    if (m.type !== "notify") return;

    const msg = m.messages[0];
    if (!msg.message) return;
    if (msg.key.fromMe) return;

    const sender = msg.key.remoteJid;
    const text =
      msg.message.conversation || msg.message.extendedTextMessage?.text;

    console.log("📩 Received:", text);

    // Rate limit check before replying
    if (text) {
      try {
        const userId = botData.uid;
        if (!userId) {
          await sock.sendMessage(sender, { text: "[Error] User not found for this bot." });
          return;
        }
        // Use helper
        const rate = await checkUserRateLimit(userId, 'messages');
        if (!rate.allowed) {
          let msg = '[Rate Limit] You have reached your monthly message limit for your plan. Upgrade to continue.';
          if (rate.reason === 'bot_limit') msg = '[Rate Limit] You have reached your monthly bot creation limit for your plan.';
          await sock.sendMessage(sender, { text: msg });
          return;
        }
        // Compose a system prompt using bot's personality, autoReply, etc.
        let systemPrompt = `You are a WhatsApp chatbot named '${
          botData.name || "Bot"
        }'.`;
        if (botData.personality)
          systemPrompt += ` Personality: ${botData.personality}.`;
        if (botData.description)
          systemPrompt += ` Description: ${botData.description}.`;
        // Pass systemPrompt and aiModel to getAIResponse
        const aiReply = await getAIResponse(
          text,
          systemPrompt,
          botData.aiModel
        );
        await sock.sendMessage(sender, { text: aiReply });
        console.log("🤖 Replied:", aiReply);
        await incrementMessageCount(botId);
        // Increment user's monthlyUsage.messages in Firestore
        try {
          const admin = await import('firebase-admin');
          const userRef = admin.firestore().doc(`users/${userId}`);
          const userSnap = await userRef.get();
          if (userSnap.exists) {
            const user = userSnap.data();
            let monthlyUsage = Array.isArray(user.monthlyUsage) ? user.monthlyUsage : [];
            if (monthlyUsage.length > 0) {
              // Increment messages for the last entry
              monthlyUsage[monthlyUsage.length - 1].messages = (monthlyUsage[monthlyUsage.length - 1].messages || 0) + 1;
              await userRef.update({ monthlyUsage });
            }
          }
        } catch (err) {
          console.error('Failed to increment user monthlyUsage.messages:', err);
        }
      } catch (err) {
        await sock.sendMessage(sender, { text: "[AI error] " + err.message });
      }
    }
  });

  // handle connection updates
  sock.ev.on("connection.update", async (update) => {
    const { connection, lastDisconnect, qr } = update;
    if (qr) {
      botData.qrCodeData = await qrcode.toDataURL(qr);
  broadcastQR(wss, botId, botData.qrCodeData);
    }
    if (connection === "close") {
      // Update whatsapp.status to 'disconnected' in Firestore
      try {
        await updateBotWhatsappStatus(botId, "disconnected");
      } catch (err) {
        console.error("Failed to update whatsapp.status to disconnected in Firestore:", err);
      }
      // Delete auth_info_<botId> folder
      // try {
      //   const authFolder = path.join(__dirname, `auth_info_${botId}`);
      //   if (fs.existsSync(authFolder)) {
      //     fs.removeSync(authFolder);
      //     console.log(`Deleted auth folder: ${authFolder}`);
      //   }
      // } catch (err) {
      //   console.error(`Failed to delete auth_info_${botId} folder:`, err);
      // }
      const shouldReconnect =
        (lastDisconnect.error = new Boom(lastDisconnect?.error))?.output
          ?.statusCode !== DisconnectReason.loggedOut;
      console.log("Connection closed. Reconnect:", shouldReconnect);
      if (shouldReconnect) createBot(data);
    } else if (connection === "open") {
      console.log("✅ Bot connected");
      // Update whatsapp.status to 'connected' in Firestore
      try {
        await updateBotWhatsappStatus(botId, "connected");
      } catch (err) {
        console.error("Failed to update whatsapp.status in Firestore:", err);
      }
    }
  });

  sock.ev.on("creds.update", saveCreds);

  return botData;
}
// {
//         uid: user.uid,
//         name: formData.name,
//         description: formData.description,
//         aiModel: formData.aiModel,
//         personality: formData.personality,
//         autoReply: formData.autoReply,
//         whatsapp: {
//           status: "disconnected",
//         },
//         stats: {
//           messageCount: 0,
//           totalUsers: 0,
//         },
//       }
// API: Create a new bot
app.post("/bot", verifyToken, async (req, res) => {
  const data = req.body;
  try {
    const { uid, name, description, aiModel, personality, autoReply } = data;

    if (!uid || !name) {
      return res.status(400).json({ error: "User ID (uid) and bot name are required" });
    }

    // Check user's monthly bot creation limit before creating a new bot
    const rate = await checkUserRateLimit(uid, 'bots');
    if (!rate.allowed) {
      return res.status(403).json({ error: '[Rate Limit] You have reached your monthly bot creation limit for your plan. Upgrade to continue.' });
    }

    // Create bot in Firebase
    const admin = await import('firebase-admin');
    const botRef = admin.firestore().collection('bots').doc();
    const botId = botRef.id;

    await botRef.set({
      uid,
      name,
      description,
      aiModel,
      personality,
      autoReply,
      whatsapp: {
        status: "disconnected",
      },
      stats: {
        messageCount: 0,
        totalUsers: 0,
      },
    });

    // Save bot to in-memory storage
    const bot = await createBot({ id: botId, ...data });
    saveBotsToFile(bots, BOTS_FILE, fs, path);

    res.json({ success: true, botId });
  } catch (e) {
    console.error("Error in /bot:", e);
    res.status(500).json({ error: "Failed to create bot", details: e.message });
  }
});

// API: Get QR code for a bot
app.get("/qr/:botId", verifyToken, (req, res) => {
  const botId = req.params.botId;
  const bot = bots.get(botId);
  if (!bot) return res.status(404).json({ error: "Bot not found" });

  res.json({ qr: bot.qrCodeData });
});

// API: Update a bot
app.put("/bot/:botId", verifyToken, async (req, res) => {
  const botId = req.params.botId;
  const updateData = req.body;
  try {
    // Update in-memory bot if exists
    const bot = bots.get(botId);
    if (bot) {
      Object.assign(bot, updateData);
      bots.set(botId, bot);
    }
    res.json({ success: true, botId });
  } catch (e) {
    console.error("Error updating bot:", e);
    res.status(500).json({ error: "Failed to update bot", details: e.message });
  }
});


// Load and reconnect all bots from Firestore on startup
loadBotsFromFirebase();

// Start HTTP server and handle WebSocket upgrades
const server = app.listen(port, () =>
  console.log(`Backend running on http://localhost:${port}`)
);

server.on("upgrade", (req, socket, head) => {
  wss.handleUpgrade(req, socket, head, (ws) => {
    wss.emit("connection", ws, req);
  });
});
