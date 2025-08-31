// rateLimit.js
// Helper for checking user plan and usage limits
import admin from "firebase-admin";

/**
 * Checks if a user is within their plan's monthly usage limits.
 * @param {string} userId - The user's UID
 * @param {'messages'|'bots'} type - The type of usage to check
 * @returns {Promise<{ allowed: boolean, reason?: string, planLimits?: any, usage?: any }>}
 */
export async function checkUserRateLimit(userId, type = 'messages') {
  if (!userId) return { allowed: false, reason: 'No userId provided' };
  const userSnap = await admin.firestore().doc(`users/${userId}`).get();
  if (!userSnap.exists) return { allowed: false, reason: 'User not found' };
  const user = userSnap.data();
  const planId = user.planId || user.plan || "";
  const monthlyUsage = Array.isArray(user.monthlyUsage) ? user.monthlyUsage : [];
  const usage = monthlyUsage.length > 0 ? monthlyUsage[monthlyUsage.length - 1] : { bots: 0, messages: 0 };
  let planLimits = { botsPerMonth: -1, messagesPerMonth: -1 };
  if (planId) {
    const planSnap = await admin.firestore().collection("plans").doc(planId).get();
    if (planSnap.exists) {
      const plan = planSnap.data();
      if (plan.limits) {
        planLimits = {
          botsPerMonth: typeof plan.limits.botsPerMonth === 'number' ? plan.limits.botsPerMonth : -1,
          messagesPerMonth: typeof plan.limits.messagesPerMonth === 'number' ? plan.limits.messagesPerMonth : -1,
        };
      }
    }
  }
  if (type === 'messages' && planLimits.messagesPerMonth !== -1 && usage.messages >= planLimits.messagesPerMonth) {
    return { allowed: false, reason: 'message_limit', planLimits, usage };
  }
  if (type === 'bots' && planLimits.botsPerMonth !== -1 && usage.bots >= planLimits.botsPerMonth) {
    return { allowed: false, reason: 'bot_limit', planLimits, usage };
  }
  return { allowed: true, planLimits, usage };
}
