import { createPlan, updatePlan, deletePlan, isUserAdmin } from "../services/firebaseService.js";

export async function createPlanHandler(req, res) {
  const { planData, uid } = req.body;
  if (!uid || !(await isUserAdmin(uid))) {
    return res.status(403).json({ error: "Admin privileges required" });
  }
  try {
    const planId = await createPlan(planData);
    res.json({ success: true, planId });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}

export async function updatePlanHandler(req, res) {
  const { planId } = req.params;
  const { planData, uid } = req.body;
  if (!uid || !(await isUserAdmin(uid))) {
    return res.status(403).json({ error: "Admin privileges required" });
  }
  try {
    await updatePlan(planId, planData);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}

export async function deletePlanHandler(req, res) {
  const uid = req.user?.uid;
  if (!uid || !(await isUserAdmin(uid))) {
    return res.status(403).json({ error: "Admin privileges required" });
  }
  const { planId } = req.params;
  try {
    await deletePlan(planId);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}



