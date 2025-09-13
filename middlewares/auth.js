import admin from "../config/firebaseAdmin.js";

// Middleware to verify Firebase ID token
export async function verifyToken(req, res, next) {
  const authHeader = req.headers.authorization || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.split(" ")[1] : null;

  if (!token) return res.status(401).json({ error: "No token provided" });

  try {
    const decoded = await admin.auth().verifyIdToken(token);
    req.user = decoded; // attach user info (uid, email, claims)
    next();
  } catch (error) {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
}



