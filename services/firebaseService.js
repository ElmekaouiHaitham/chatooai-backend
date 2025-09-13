import admin from "../config/firebaseAdmin.js";

/**
 * Creates a new bot document in Firestore
 * @param {Object} botData - Bot data to store
 * @returns {Promise<string|null>} - Bot ID if successful, null otherwise
 */
export async function createBotFirebase(botData) {
  try {
    const { uid, name, description, aiModel, personality, autoReply } = botData;
    const botRef = admin.firestore().collection("bots").doc();
    const botId = botRef.id;

    await botRef.set({
      id: botId,
      uid,
      name,
      description: description || "",
      aiModel: aiModel || "openai/gpt-oss-20b:free",
      personality: personality || "friendly",
      autoReply: autoReply || false,
      whatsapp: {
        status: "disconnected",
      },
      stats: {
        messageCount: 0,
        totalUsers: 0,
      },
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    return botId;
  } catch (error) {
    console.error("Error creating bot in Firebase:", error);
    return null;
  }
}

/**
 * Updates bot data in Firestore
 * @param {string} botId - Bot ID to update
 * @param {Object} updateData - Data to update
 * @returns {Promise<boolean>} - Success status
 */
export async function updateBotFirebase(botId, updateData) {
  try {
    const botRef = admin.firestore().collection("bots").doc(botId);
    await botRef.update({
      ...updateData,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    return true;
  } catch (error) {
    console.error("Error updating bot in Firebase:", error);
    return false;
  }
}

/**
 * Updates WhatsApp status for a bot
 * @param {string} botId - Bot ID
 * @param {string} status - New status
 * @param {string|null} qrCode - QR code data (optional)
 * @returns {Promise<boolean>} - Success status
 */
export async function updateBotWhatsappStatus(botId, status, qrCode = null) {
  try {
    const botRef = admin.firestore().collection("bots").doc(botId);
    const updateData = {
      "whatsapp.status": status,
      "whatsapp.lastConnected":
        status === "connected"
          ? admin.firestore.FieldValue.serverTimestamp()
          : null,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    if (qrCode) {
      updateData["whatsapp.qrCode"] = qrCode;
    }

    await botRef.update(updateData);
    return true;
  } catch (error) {
    console.error("Error updating WhatsApp status:", error);
    return false;
  }
}

/**
 * Increments message count for a bot
 * @param {string} botId - Bot ID
 * @returns {Promise<boolean>} - Success status
 */
export async function incrementMessageCount(botId) {
  try {
    const botRef = admin.firestore().collection("bots").doc(botId);
    await botRef.update({
      messageCount: admin.firestore.FieldValue.increment(1),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    return true;
  } catch (error) {
    console.error("Error incrementing message count:", error);
    return false;
  }
}

/**
 * Increments user monthly usage message count
 * @param {string} userId - User ID
 * @returns {Promise<boolean>} - Success status
 */
export async function incrementUserMonthlyMessages(userId) {
  try {
    const userRef = admin.firestore().doc(`users/${userId}`);
    const userSnap = await userRef.get();

    if (userSnap.exists) {
      const user = userSnap.data();
      let monthlyUsage = Array.isArray(user.monthlyUsage)
        ? user.monthlyUsage
        : [];

      if (monthlyUsage.length > 0) {
        monthlyUsage[monthlyUsage.length - 1].messages =
          (monthlyUsage[monthlyUsage.length - 1].messages || 0) + 1;
        await userRef.update({ monthlyUsage });
      }
    }
    return true;
  } catch (error) {
    console.error("Failed to increment user monthlyUsage.messages:", error);
    return false;
  }
}

/**
 * Gets all bots from Firestore
 * @returns {Promise<Array>} - Array of bot documents
 */
export async function getAllBots() {
  try {
    const snapshot = await admin.firestore().collection("bots").get();
    return snapshot.docs.map((doc) => doc.data());
  } catch (error) {
    console.error("Error getting all bots:", error);
    return [];
  }
}

/**
 * Updates user status
 * @param {string} uid - User ID
 * @param {string} status - New status
 * @returns {Promise<boolean>} - Success status
 */
export async function updateUserStatus(uid, status) {
  try {
    const userRef = admin.firestore().doc(`users/${uid}`);
    await userRef.update({
      status,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    return true;
  } catch (error) {
    console.error("Error updating user status:", error);
    return false;
  }
}

/**
 * Updates current user plan
 * @param {string} uid - User ID
 * @param {string} planId - Plan ID
 * @returns {Promise<boolean>} - Success status
 */
export async function updateCurrentUserPlan(uid, planId) {
  try {
    const userRef = admin.firestore().doc(`users/${uid}`);
    await userRef.update({
      currentPlan: planId,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    return true;
  } catch (error) {
    console.error("Error updating user plan:", error);
    return false;
  }
}

/**
 * Checks if user is admin
 * @param {string} uid - User ID
 * @returns {Promise<boolean>} - Admin status
 */
export async function isUserAdmin(uid) {
  try {
    const userRef = admin.firestore().doc(`users/${uid}`);
    const userSnap = await userRef.get();

    if (userSnap.exists) {
      const userData = userSnap.data();
      return userData.role === "admin";
    }
    return false;
  } catch (error) {
    console.error("Error checking admin status:", error);
    return false;
  }
}

/**
 * Creates a new plan
 * @param {Object} planData - Plan data
 * @returns {Promise<string|null>} - Plan ID if successful, null otherwise
 */
export async function createPlan(planData) {
  try {
    const planRef = admin.firestore().collection("plans").doc();
    const planId = planRef.id;

    await planRef.set({
      id: planId,
      ...planData,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    return planId;
  } catch (error) {
    console.error("Error creating plan:", error);
    return null;
  }
}

/**
 * Updates a plan
 * @param {string} planId - Plan ID
 * @param {Object} updateData - Data to update
 * @returns {Promise<boolean>} - Success status
 */
export async function updatePlan(planId, updateData) {
  try {
    const planRef = admin.firestore().collection("plans").doc(planId);
    await planRef.update({
      ...updateData,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    return true;
  } catch (error) {
    console.error("Error updating plan:", error);
    return false;
  }
}

/**
 * Deletes a plan
 * @param {string} planId - Plan ID
 * @returns {Promise<boolean>} - Success status
 */
export async function deletePlan(planId) {
  try {
    const planRef = admin.firestore().collection("plans").doc(planId);
    await planRef.delete();
    return true;
  } catch (error) {
    console.error("Error deleting plan:", error);
    return false;
  }
}
