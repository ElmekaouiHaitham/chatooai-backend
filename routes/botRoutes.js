import express from "express";
import { verifyToken } from "../middlewares/auth.js";
import {
  createBotHandler,
  getQrHandler,
  updateBotHandler,
  updateWhatsappStatusHandler,
  disconnectBotHandler,
} from "../controllers/botController.js";

const router = express.Router();

router.post("/bot", verifyToken, createBotHandler);
router.get("/qr/:botId", verifyToken, getQrHandler);
router.put("/bot/:botId", verifyToken, updateBotHandler);
router.post("/bot/:botId/whatsapp-status", verifyToken, updateWhatsappStatusHandler);
router.post("/bot/:botId/disconnect", verifyToken, disconnectBotHandler);

export default router;


