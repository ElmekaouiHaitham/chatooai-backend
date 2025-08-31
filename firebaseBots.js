import admin from "firebase-admin";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import path from "node:path";
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const serviceAccountPath = path.join(__dirname, "serviceAccountKey.json");

// Read the JSON file content and parse it
const serviceAccount = JSON.parse(readFileSync(serviceAccountPath, "utf8"));

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL:
    "https://chatooai-default-rtdb.europe-west1.firebasedatabase.app",
});

// Middleware to verify Firebase ID token
export async function verifyToken(req, res, next) {
  const authHeader = req.headers.authorization || "";
  const token = authHeader.startsWith("Bearer ")
    ? authHeader.split(" ")[1]
    : null;

  if (!token) return res.status(401).json({ error: "No token provided" });

  try {
    const decoded = await admin.auth().verifyIdToken(token);
    req.user = decoded; // attach user info (uid, email, claims)
    next();
  } catch (error) {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
}
// backend/firebaseBots.js
// Loads bots from Firestore using firebase/app and firebase/firestore client SDK
import { initializeApp } from "firebase/app";
import {
  getFirestore,
  collection,
  getDocs,
  query,
  orderBy,
  limit,
  where,
  doc,
  getDoc,
  updateDoc,
  deleteDoc,
  setDoc,
  Timestamp,
  increment,
} from "firebase/firestore";

// export interface BotData {
//   id: string;
//   uid: string; // User ID who owns this bot
//   name: string;
//   description: string;
//   aiModel: string;
//   personality: string;
//   autoReply: boolean;
//   whatsapp: {
//     phoneNumber?: string;
//     status: 'disconnected' | 'connecting' | 'connected' | 'error';
//     qrCode?: string;
//     lastConnected?: Timestamp;
//     authFiles?: string[]; // Firebase Storage URLs
//   };
//   stats: {
//     messageCount: number;
//     lastActive?: Timestamp;
//     totalUsers: number;
//   };
//   createdAt: Timestamp;
//   updatedAt: Timestamp;
// }

const firebaseConfig = {
  apiKey: "AIzaSyBSOYzR0SzGI_sszKDOBYPaLX5_ZLWPMeI",
  authDomain: "chatooai.firebaseapp.com",
  databaseURL:
    "https://chatooai-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "chatooai",
  storageBucket: "chatooai.firebasestorage.app",
  messagingSenderId: "730182896787",
  appId: "1:730182896787:web:253231731b29f8f9ced166",
  measurementId: "G-54BM5SJ57L",
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

export async function getAllBots() {
  const botsCol = collection(db, "bots");
  const botsSnapshot = await getDocs(botsCol);
  return botsSnapshot.docs.map((doc) => ({ botId: doc.id, ...doc.data() }));
}

/**
 * Atomically increments the message count for a given bot.
 * @param {string} botId The ID of the bot to update.
 */
export async function incrementMessageCount(botId) {
  const botRef = doc(db, "bots", botId);
  // Atomically increment the message count for the bot
  await updateDoc(botRef, {
    "stats.messageCount": increment(1),
  });

  // Also increment the user's monthlyUsage.messages for the current month
  // Get the bot to find the user
  const botSnap = await getDoc(botRef);
  if (!botSnap.exists()) return;
  const bot = botSnap.data();
  const userId = bot.uid;
  if (!userId) return;
  // Use Firestore Admin SDK for backend
  const userRef = admin.firestore().doc(`users/${userId}`);
  const userSnap = await userRef.get();
  if (!userSnap.exists) return;
  const user = userSnap.data();
  let monthlyUsage = Array.isArray(user.monthlyUsage) ? user.monthlyUsage : [];
  if (monthlyUsage.length > 0) {
    // Increment messages for the last entry
    monthlyUsage[monthlyUsage.length - 1].messages = (monthlyUsage[monthlyUsage.length - 1].messages || 0) + 1;
    await userRef.update({ monthlyUsage });
  }
}
export async function updateBotWhatsappStatus(botId, status) {
  const botRef = doc(db, "bots", botId);
  await updateDoc(botRef, {
    "whatsapp.status": status,
  });
}
