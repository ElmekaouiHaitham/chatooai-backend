import express from "express";
import { verifyToken } from "../middlewares/auth.js";
import { updateUserStatusHandler, updateUserPlanHandler } from "../controllers/userController.js";

const router = express.Router();

router.post("/user/:uid/status", verifyToken, updateUserStatusHandler);
router.post("/user/:uid/plan", verifyToken, updateUserPlanHandler);

export default router;



