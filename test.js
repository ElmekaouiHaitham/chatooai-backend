import {
  makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
} from "@whiskeysockets/baileys";
import { Boom } from "@hapi/boom";
import qrcode from "qrcode-terminal"; // to print QR nicely

async function startBot() {
  // store auth credentials in a folder
  const { state, saveCreds } = await useMultiFileAuthState("auth_info");

  // create socket connection
  const sock = makeWASocket({
    auth: state,
  });

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

    // reply "hi" to any text
    if (text) {
      await sock.sendMessage(sender, { text: "hi 👋" });
    }
  });

  // handle connection updates
  sock.ev.on("connection.update", (update) => {
    const { connection, lastDisconnect, qr } = update;

    // ✅ display QR in terminal when available
    if (qr) {
      qrcode.generate(qr, { small: true });
    }

    if (connection === "close") {
      const shouldReconnect =
        (lastDisconnect.error = new Boom(lastDisconnect?.error))?.output
          ?.statusCode !== DisconnectReason.loggedOut;
      console.log("Connection closed. Reconnect:", shouldReconnect);
      if (shouldReconnect) startBot();
    } else if (connection === "open") {
      console.log("✅ Bot connected");
    }
  });

  // save auth credentials
  sock.ev.on("creds.update", saveCreds);
}

startBot();
