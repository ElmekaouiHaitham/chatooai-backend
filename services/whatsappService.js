import {
  makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
} from "@whiskeysockets/baileys";
import qrcode from "qrcode";
import { Boom } from "@hapi/boom";
import { WebSocketServer } from "ws";
import { getAIResponse } from "./aiReplyService.js";
import {
  getAllBots,
  incrementMessageCount,
  updateBotWhatsappStatus,
} from "./firebaseService.js";
import { checkUserRateLimit } from "./rateLimit.js";
import { broadcastQR } from "../utils/botUtils.js";

const bots = new Map();
const wss = new WebSocketServer({ noServer: true });
export { wss };

export function getBotsMap() {
  return bots;
}

export function setBotsMap(botId, botData) {
  bots.set(botId, botData);
}

export function getWss() {
  return wss;
}

export async function loadBotsFromFirebase() {
  try {
    const arr = await getAllBots();
    console.log("Loaded bots from Firebase:", arr);
    for (const data of arr) {
      await createBot(data);
    }
  } catch (e) {
    console.error("Failed to load bots from Firebase:", e);
    throw new Boom("Failed to load bots", { statusCode: 500, data: e });
  }
}

export async function createBot(data) {
  console.log("Creating bot:", data);
  let botId = data.id;
  let name = data.name || "Default Bot";
  let botData = bots.get(botId) || {};
  Object.assign(botData, data);

  const { state, saveCreds } = await useMultiFileAuthState(
    `auth/auth_info_${botId}`
  );
  const sock = makeWASocket({ auth: state });

  botData.sock = sock;
  botData.qrCodeData = null;
  botData.chatbotName = name || botData.chatbotName || "Default Bot";
  bots.set(botId, botData);

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
      try {
        await updateBotWhatsappStatus(botId, "disconnected", botData.qrCodeData);
      } catch (err) {
        console.error("Failed to update whatsapp QR in Firestore:", err);
      }
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
      if (shouldReconnect) createBot(data);
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


