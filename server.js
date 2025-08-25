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

const app = express();
const port = 5000;
app.use(cors());
app.use(express.json());

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

// Save bots info to file
function saveBotsToFile() {
  const arr = Array.from(bots.entries()).map(([botId, bot]) => ({
    botId,
    chatbotName: bot.chatbotName || "Default Bot",
  }));
  // Ensure directory exists before writing
  fs.ensureDirSync(path.dirname(BOTS_FILE));
  fs.writeFileSync(BOTS_FILE, JSON.stringify(arr, null, 2));
}

// WebSocket server for QR code updates
const wss = new WebSocketServer({ noServer: true });

// Broadcast QR code to all clients with botId
function broadcastQR(botId, data) {
  wss.clients.forEach((client) => {
    client.send(JSON.stringify({ botId, qr: data }));
  });
}

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
  saveBotsToFile();
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

    // reply with AI-generated message to any text, using all bot fields
    if (text) {
      try {
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
      broadcastQR(botId, botData.qrCodeData);
    }
    if (connection === "close") {
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
  let id = data.id;
  try {
    if (!id) return res.status(400).json({ error: "botId is required" });
  } catch (e) {
    console.error("Error in /bot:", e);
  }
  const bot = await createBot(data);
  saveBotsToFile();
  res.json({ success: true, botId: id });
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
