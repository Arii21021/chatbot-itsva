const jwt = require("jsonwebtoken");

const JWT_SECRET = process.env.JWT_SECRET || "ariel_super_secreto_123";

function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization || "";

  const [type, token] = authHeader.split(" ");

  if (type !== "Bearer" || !token) {
    return res.status(401).json({ error: "No autorizado. Falta token." });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    // guardamos info del usuario en la request
    req.user = {
      id: decoded.id,
      email: decoded.email,
      name: decoded.name,
    };
    next();
  } catch (err) {
    console.error("Token inválido:", err.message);
    return res.status(401).json({ error: "Token inválido o expirado." });
  }
}

module.exports = authMiddleware;
