const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const User = require("../models/User");

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || "ariel_super_secreto_123";

// misma validación que en el frontend
const isInstitutionalEmail = (value) => {
  const regex = /^[lL][0-9]+@valladolid\.tecnm\.mx$/;
  return regex.test(value.trim());
};

// función para crear token siempre igual
function createTokenFromUser(user) {
  return jwt.sign(
    {
      id: user._id.toString(),
      email: user.email,
      name: user.name,
    },
    JWT_SECRET,
    { expiresIn: "7d" }
  );
}

// ---------- REGISTRO ----------
router.post("/register", async (req, res) => {
  try {
    const { name, email, password, confirmPassword } = req.body;

    if (!name || !email || !password || !confirmPassword) {
      return res
        .status(400)
        .json({ error: "Todos los campos son obligatorios." });
    }

    if (!isInstitutionalEmail(email)) {
      return res.status(400).json({
        error:
          "Usa tu correo institucional (L + matrícula@valladolid.tecnm.mx).",
      });
    }

    if (password !== confirmPassword) {
      return res
        .status(400)
        .json({ error: "Las contraseñas no coinciden." });
    }

    // ¿Ya existe el correo?
    const existing = await User.findOne({ email: email.toLowerCase() });
    if (existing) {
      return res
        .status(409)
        .json({ error: "Este correo ya está registrado." });
    }

    // hash de contraseña
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    const user = await User.create({
      name,
      email: email.toLowerCase(),
      passwordHash,
    });

    // generar token con id, email y name
    const token = createTokenFromUser(user);

    res.status(201).json({
      message: "Usuario registrado correctamente.",
      token,
      user: {
        id: user._id.toString(),
        name: user.name,
        email: user.email,
      },
    });
  } catch (err) {
    console.error("Error en /api/auth/register:", err);
    res.status(500).json({ error: "Error interno del servidor." });
  }
});

// ---------- LOGIN ----------
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res
        .status(400)
        .json({ error: "Completa todos los campos." });
    }

    if (!isInstitutionalEmail(email)) {
      return res.status(400).json({
        error:
          "Usa tu correo institucional (L + matrícula@valladolid.tecnm.mx).",
      });
    }

    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) {
      return res
        .status(401)
        .json({ error: "Correo o contraseña incorrectos." });
    }

    const isMatch = await bcrypt.compare(password, user.passwordHash);
    if (!isMatch) {
      return res
        .status(401)
        .json({ error: "Correo o contraseña incorrectos." });
    }

    const token = createTokenFromUser(user);

    res.json({
      message: "Inicio de sesión exitoso.",
      token,
      user: {
        id: user._id.toString(),
        name: user.name,
        email: user.email,
      },
    });
  } catch (err) {
    console.error("Error en /api/auth/login:", err);
    res.status(500).json({ error: "Error interno del servidor." });
  }
});

module.exports = router;
