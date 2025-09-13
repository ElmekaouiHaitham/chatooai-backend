import { updateUserStatus, updateCurrentUserPlan, isUserAdmin } from "../services/firebaseService.js";

export async function updateUserStatusHandler(req, res) {
  const { uid } = req.params;
  const { status } = req.body;
  if (!status) return res.status(400).json({ error: "Missing status" });
  try {
    await updateUserStatus(uid, status);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}

export async function updateUserPlanHandler(req, res) {
  const { uid } = req.params;
  const { planId } = req.body;
  if (!planId) return res.status(400).json({ error: "Missing planId" });
  try {
    await updateCurrentUserPlan(uid, planId);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}



