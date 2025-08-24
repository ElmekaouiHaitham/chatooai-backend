// backend/firebaseBots.js
// Loads bots from Firestore using firebase/app and firebase/firestore client SDK
import { initializeApp } from 'firebase/app';
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
  increment
} from 'firebase/firestore';

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
  databaseURL: "https://chatooai-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "chatooai",
  storageBucket: "chatooai.firebasestorage.app",
  messagingSenderId: "730182896787",
  appId: "1:730182896787:web:253231731b29f8f9ced166",
  measurementId: "G-54BM5SJ57L"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

export async function getAllBots() {
  const botsCol = collection(db, 'bots');
  const botsSnapshot = await getDocs(botsCol);
  return botsSnapshot.docs.map(doc => ({ botId: doc.id, ...doc.data() }));
}

/**
 * Atomically increments the message count for a given bot.
 * @param {string} botId The ID of the bot to update.
 */
export async function incrementMessageCount(botId) {
  const botRef = doc(db, 'bots', botId);
  // Atomically increment the message count
  await updateDoc(botRef, {
    'stats.messageCount': increment(1)
  });
}
