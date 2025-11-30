const express = require("express");
const axios = require("axios");
const Conversation = require("../models/Conversation");
const authMiddleware = require("../middleware/auth"); // 👈 middleware JWT

const router = express.Router();

const LMSTUDIO_URL = process.env.LMSTUDIO_URL || "http://192.168.16.212:1234";
const MODEL_ID =
  process.env.LMSTUDIO_MODEL_ID || "meta-llama-3.1-8b-instruct-hf";

// pequeña ayuda para crear un título corto con el primer mensaje
function generateTitleFromMessage(text) {
  const clean = text.trim().slice(0, 80);
  return clean || "Nueva conversación";
}

// -----------------------------
// POST /api/chat
// -----------------------------
// Envía un mensaje al modelo y guarda/actualiza la conversación
router.post("/", authMiddleware, async (req, res) => {
  try {
    const { message, history, conversationId } = req.body;
    const userId = req.user.id; // 👈 viene del token JWT

    if (!message) {
      return res.status(400).json({ error: "Falta el mensaje del usuario." });
    }

    if (!userId) {
      return res
        .status(400)
        .json({ error: "No se pudo obtener el usuario desde el token." });
    }

    // Armamos historial para el modelo
    const messagesForModel = [
      {
        role: "system",
        content:
        "Eres el Asistente IA del Instituto Tecnológico Superior de Valladolid (ITSVA). " +
      "Respondes SIEMPRE en español, de forma clara, ordenada y SIN usar emojis. " +
      "Tu formato de salida es SOLO TEXTO (no generas imágenes reales), " +
      "pero cuando el usuario pida un cuadro, tabla, organizador gráfico o comparativo, " +
      "debes responder usando TABLAS EN MARKDOWN con barras verticales (|), encabezados y filas. " +
      "No expliques tus limitaciones técnicas, simplemente entrega la tabla de texto pedida. " +
      "Si el usuario pide una imagen, gráfico o ilustración, responde igualmente con una TABLA o LISTA de TEXTO que represente la información solicitada.",
      },
      ...(history || []).map((m) => ({
        role: m.role === "assistant" ? "assistant" : "user",
        content: m.content,
      })),
      { role: "user", content: message },
    ];

    // Llamada a LM Studio
    const response = await axios.post(
      `${LMSTUDIO_URL}/v1/chat/completions`,
      {
        model: MODEL_ID,
        messages: messagesForModel,
        temperature: 0.7,
        max_tokens: 512,
      },
      {
        timeout: 60000,
      }
    );

    const reply =
      response.data?.choices?.[0]?.message?.content ||
      "No recibí respuesta del modelo.";

    // -----------------------------
    // Guardar en MongoDB
    // -----------------------------
    let conversation;

    if (conversationId) {
      // Buscar conversación existente del mismo usuario
      conversation = await Conversation.findOne({
        _id: conversationId,
        userId,
      });
    }

    if (!conversation) {
      // Crear nueva conversación
      conversation = await Conversation.create({
        userId,
        title: generateTitleFromMessage(message),
        messages: [
          { role: "user", content: message },
          { role: "assistant", content: reply },
        ],
      });
    } else {
      // Actualizar conversación existente
      conversation.messages.push(
        { role: "user", content: message },
        { role: "assistant", content: reply }
      );
      await conversation.save();
    }

    res.json({
      reply,
      conversationId: conversation._id,
    });
  } catch (err) {
    console.error(
      "Error en /api/chat:",
      err.response?.data || err.message || err
    );
    res
      .status(500)
      .json({ error: "Error al comunicarse con el modelo de IA." });
  }
});

// -----------------------------
// GET /api/chat/history
// -----------------------------
// Lista las conversaciones del usuario autenticado
router.get("/history", authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;

    const conversations = await Conversation.find({ userId })
      .sort({ updatedAt: -1 })
      .select("_id title createdAt updatedAt");

    res.json({ conversations });
  } catch (err) {
    console.error("Error en /api/chat/history:", err.message);
    res.status(500).json({ error: "Error al obtener el historial." });
  }
});

// -----------------------------
// GET /api/chat/conversation/:id
// -----------------------------
// Obtiene una conversación específica del usuario
router.get("/conversation/:id", authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;

    const conversation = await Conversation.findOne({
      _id: id,
      userId: req.user.id, // 👈 aseguramos que sea del mismo usuario
    });

    if (!conversation) {
      return res.status(404).json({ error: "Conversación no encontrada." });
    }

    res.json({ conversation });
  } catch (err) {
    console.error("Error en /api/chat/conversation:", err.message);
    res.status(500).json({ error: "Error al obtener la conversación." });
  }
});

// -----------------------------
// PATCH /api/chat/conversation/:id
// Renombrar una conversación
// -----------------------------
router.patch("/conversation/:id", authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const { title } = req.body;

    if (!title || !title.trim()) {
      return res.status(400).json({ error: "El título no puede estar vacío." });
    }

    const conversation = await Conversation.findOneAndUpdate(
      { _id: id, userId: req.user.id },
      { title: title.trim() },
      { new: true }
    );

    if (!conversation) {
      return res.status(404).json({ error: "Conversación no encontrada." });
    }

    res.json({ conversation });
  } catch (err) {
    console.error("Error en PATCH /api/chat/conversation:", err.message);
    res.status(500).json({ error: "Error al renombrar la conversación." });
  }
});

// -----------------------------
// DELETE /api/chat/conversation/:id
// Eliminar una conversación
// -----------------------------
router.delete("/conversation/:id", authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;

    const conversation = await Conversation.findOneAndDelete({
      _id: id,
      userId: req.user.id,
    });

    if (!conversation) {
      return res.status(404).json({ error: "Conversación no encontrada." });
    }

    res.json({ success: true });
  } catch (err) {
    console.error("Error en DELETE /api/chat/conversation:", err.message);
    res.status(500).json({ error: "Error al eliminar la conversación." });
  }
});

module.exports = router;
