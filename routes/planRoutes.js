import express from "express";
import { verifyToken } from "../middlewares/auth.js";
import { createPlanHandler, updatePlanHandler, deletePlanHandler } from "../controllers/planController.js";

const router = express.Router();

router.post("/plan", verifyToken, createPlanHandler);
router.put("/plan/:planId", verifyToken, updatePlanHandler);
router.delete("/plan/:planId", verifyToken, deletePlanHandler);

export default router;




