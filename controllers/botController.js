import path from "node:path";
import fs from "fs-extra";
import { fileURLToPath } from "url";
import { createBot } from "../services/whatsappService.js";
import {
  createBotFirebase,
  updateBotFirebase,
  updateBotWhatsappStatus,
  incrementMessageCount
} from "../services/firebaseService.js";
import { getBotsMap, setBotsMap, wss } from "../services/whatsappService.js";
import { checkUserRateLimit } from "../services/rateLimit.js";
import qrcode from "qrcode";
import {
  makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
} from "@whiskeysockets/baileys";
import { Boom } from "@hapi/boom";
import { getAIResponse } from "../services/aiReplyService.js";

import { broadcastQR } from "../utils/botUtils.js";
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export async function createBotHandler(req, res) {
  const data = req.body;
  try {
    const { uid, name, description, aiModel, personality, autoReply } = data;
    if (!uid || !name) {
      return res
        .status(400)
        .json({ error: "User ID (uid) and bot name are required" });
    }
    // Rate limit check identical to original
    const rate = await checkUserRateLimit(uid, "bots");
    if (!rate.allowed) {
      return res.status(403).json({
        error:
          "[Rate Limit] You have reached your monthly bot creation limit for your plan. Upgrade to continue.",
      });
    }
    const botId = await createBotFirebase({
      uid,
      name,
      description,
      aiModel,
      personality,
      autoReply,
    });
    if (!botId) {
      return res
        .status(500)
        .json({ error: "Failed to create bot in Firebase" });
    }
    await createBot({ id: botId, ...data });
    res.json({ success: true, botId });
  } catch (e) {
    console.error("Error in createBotHandler:", e);
    res.status(500).json({ error: "Failed to create bot", details: e.message });
  }
}

export async function getQrHandler(req, res) {
  const botId = req.params.botId;
  const bot = getBotsMap().get(botId);
  if (!bot) return res.status(404).json({ error: "Bot not found" });
  res.json({ qr: bot.qrCodeData });
}

export async function updateBotHandler(req, res) {
  const botId = req.params.botId;
  const updateData = req.body;
  try {
    const bot = getBotsMap().get(botId);
    if (bot) {
      Object.assign(bot, updateData);
      getBotsMap().set(botId, bot);
    }
    await updateBotFirebase(botId, updateData);
    res.json({ success: true, botId });
  } catch (e) {
    console.error("Error updating bot:", e);
    res.status(500).json({ error: "Failed to update bot", details: e.message });
  }
}

export async function updateWhatsappStatusHandler(req, res) {
  const { botId } = req.params;
  const { status, qrCode } = req.body;
  if (!status) return res.status(400).json({ error: "Missing status" });
  try {
    await updateBotWhatsappStatus(botId, status, qrCode);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}

export async function disconnectBotHandler(req, res) {
  const { botId } = req.params;
  try {
    // Update Firebase status to disconnected
    await updateBotWhatsappStatus(botId, "disconnected");

    // Get bot from in-memory Map and disconnect WhatsApp connection
    const botsMap = getBotsMap();
    const bot = botsMap.get(botId);
    if (bot && bot.sock) {
      // Close the WhatsApp socket connection but keep bot data
      await bot.sock.logout();
      // Clear the socket reference and QR code to prepare for new connection
      bot.sock = null;
      bot.qrCodeData = null;
      // Update the bot in the Map with cleared connection data
      botsMap.set(botId, bot);
    }

    // Clean up auth folder and files to force fresh authentication
    const authFolder = path.join(__dirname, `../auth_info_${botId}`);
    if (fs.existsSync(authFolder)) {
      const files = await fs.readdir(authFolder);
      for (const file of files) {
        await fs.remove(path.join(authFolder, file));
      }
    }

    await botReinitializeHandler(bot, botId);
    res.json({
      success: true,
      message: "Bot disconnected and ready for new connection",
    });
  } catch (e) {
    console.error("Error disconnecting bot:", e);
    res
      .status(500)
      .json({ error: "Failed to disconnect bot", details: e.message });
  }
}

async function botReinitializeHandler(BotData, botId) {
  let botData = BotData;
  let name = botData.name || "Default Bot";
  const { state, saveCreds } = await useMultiFileAuthState(
    `auth_info_${botId}`
  );
  const sock = makeWASocket({ auth: state });

  botData.sock = sock;
  botData.qrCodeData = null;
  botData.chatbotName = name || botData.chatbotName || "Default Bot";
  setBotsMap(botId, botData);

  sock.ev.on("messages.upsert", async (m) => {
    if (m.type !== "notify") return;
    const msg = m.messages[0];
    if (!msg.message) return;
    if (msg.key.fromMe) return;
    const sender = msg.key.remoteJid;
    const text =
      msg.message.conversation || msg.message.extendedTextMessage?.text;
    console.log("📩 Received:", text);
    if (text) {
      try {
        const userId = botData.uid;
        if (!userId) {
          await sock.sendMessage(sender, {
            text: "[Error] User not found for this bot.",
          });
          return;
        }
        const rate = await checkUserRateLimit(userId, "messages");
        if (!rate.allowed) {
          let msgText =
            "[Rate Limit] You have reached your monthly message limit for your plan. Upgrade to continue.";
          if (rate.reason === "bot_limit")
            msgText =
              "[Rate Limit] You have reached your monthly bot creation limit for your plan.";
          await sock.sendMessage(sender, { text: msgText });
          return;
        }
        let systemPrompt = `You are a WhatsApp chatbot named '${
          botData.name || "Bot"
        }'.`;
        if (botData.personality)
          systemPrompt += ` Personality: ${botData.personality}.`;
        if (botData.description)
          systemPrompt += ` Description: ${botData.description}.`;
        const aiReply = await getAIResponse(
          text,
          systemPrompt,
          botData.aiModel
        );
        await sock.sendMessage(sender, { text: aiReply });
        console.log("🤖 Replied:", aiReply);
        await incrementMessageCount(botId);
        try {
          const admin = await import("firebase-admin");
          const userRef = admin.firestore().doc(`users/${userId}`);
          const userSnap = await userRef.get();
          if (userSnap.exists) {
            const user = userSnap.data();
            let monthlyUsage = Array.isArray(user.monthlyUsage)
              ? user.monthlyUsage
              : [];
            if (monthlyUsage.length > 0) {
              monthlyUsage[monthlyUsage.length - 1].messages =
                (monthlyUsage[monthlyUsage.length - 1].messages || 0) + 1;
              await userRef.update({ monthlyUsage });
            }
          }
        } catch (err) {
          console.error("Failed to increment user monthlyUsage.messages:", err);
        }
      } catch (err) {
        await sock.sendMessage(sender, { text: "[AI error] " + err.message });
      }
    }
  });

  sock.ev.on("connection.update", async (update) => {
    const { connection, lastDisconnect, qr } = update;
    if (qr) {
      botData.qrCodeData = await qrcode.toDataURL(qr);
      broadcastQR(wss, botId, botData.qrCodeData);
    }
    if (connection === "close") {
      try {
        await updateBotWhatsappStatus(botId, "disconnected");
      } catch (err) {
        console.error(
          "Failed to update whatsapp.status to disconnected in Firestore:",
          err
        );
      }
      const shouldReconnect =
        (lastDisconnect.error = new Boom(lastDisconnect?.error))?.output
          ?.statusCode !== DisconnectReason.loggedOut;
      console.log("Connection closed. Reconnect:", shouldReconnect);
      if (shouldReconnect) createBot({ id: botId, ...botData });
    } else if (connection === "open") {
      console.log("✅ Bot connected");
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
