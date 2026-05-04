import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import botRoutes from "./routes/botRoutes.js";
import userRoutes from "./routes/userRoutes.js";
import planRoutes from "./routes/planRoutes.js";
import { getWss, loadBotsFromFirebase } from "./services/whatsappService.js";

// Load environment variables
dotenv.config();

const app = express();
const port = process.env.PORT || 5000;
const corsOrigins = (process.env.CORS_ORIGINS || process.env.CORS_ORIGIN || "http://localhost:3000")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

app.use(
  cors({
    origin: corsOrigins,
  })
);
app.use(express.json());

// Register API endpoints for user/plan/bot management

// Routes
app.use(botRoutes);
app.use(userRoutes);
app.use(planRoutes);
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
// No in-file handlers; handled by controllers via routers

// Load and reconnect all bots from Firestore on startup
loadBotsFromFirebase();

// Start HTTP server and handle WebSocket upgrades
const server = app.listen(port, () =>
  console.log(`Backend running on ${port}`)
);

server.on("upgrade", (req, socket, head) => {
  const wss = getWss();
  wss.handleUpgrade(req, socket, head, (ws) => {
    wss.emit("connection", ws, req);
  });
});
