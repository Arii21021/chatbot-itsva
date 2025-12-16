const express = require("express");
const axios = require("axios");
const Conversation = require("../models/Conversation");
const authMiddleware = require("../middleware/auth");

// RAG
const { loadChunks, searchSimilarChunks } = require("../rag/search");

const router = express.Router();

// ✅ LM Studio
const LMSTUDIO_URL = process.env.LMSTUDIO_URL || "http://127.0.0.1:1234";
const LMSTUDIO_EMBED_MODEL_ID =
  process.env.LMSTUDIO_EMBED_MODEL_ID || "text-embedding-nomic-embed-text-v1.5";

// -----------------------------
// Helpers
// -----------------------------
function generateTitleFromMessage(text) {
  const clean = String(text || "").trim().slice(0, 60);
  return clean || "Nueva conversación";
}

// ✅ Saludos / identidad (se responden sin RAG)
function isGreeting(text) {
  const t = (text || "").toLowerCase().trim();
  return [
    "hola",
    "holi",
    "buenas",
    "buenos días",
    "buenas tardes",
    "buenas noches",
    "como estas",
    "cómo estás",
    "quien eres",
    "quién eres",
    "que eres",
    "qué eres",
    "ayuda",
  ].some((p) => t.includes(p));
}

// ✅ Detectar si es “tema de sistemas” (NO depende de que esté en libros)
function isSystemsTopic(text) {
  const t = (text || "").toLowerCase();

  // puedes ampliar esta lista cuando metas más libros
  const keywords = [
    "css",
    "html",
    "xhtml",
    "javascript",
    "js",
    "dom",
    "web",
    "frontend",
    "backend",
    "programacion",
    "programación",
    "informatica",
    "informática",
    "computacion",
    "computación",
    "sistemas",
    "software",
    "internet",
    "navegador",
    "http",
    "url",
    "api",
    "base de datos",
    "sql",
    "redes",
    "servidor",
    "framework",
    "algoritmo",
    "poo",
    "clase",
    "objeto",
  ];

  return keywords.some((k) => t.includes(k));
}

// ✅ Embedding query
async function getEmbeddingForQuery(text) {
  const url = `${LMSTUDIO_URL}/v1/embeddings`;

  // Nomic: prefijo correcto para query
  const input = `search_query: ${text}`;

  const payload = {
    model: LMSTUDIO_EMBED_MODEL_ID,
    input,
  };

  const resp = await axios.post(url, payload, { timeout: 60000 });

  const emb = resp.data?.data?.[0]?.embedding;
  if (!Array.isArray(emb)) throw new Error("Embedding inválido desde LM Studio.");
  return emb;
}

// ✅ Extraer “fragmento útil” alrededor de palabras de la pregunta
function buildSmartSnippet(chunkText, question) {
  const text = String(chunkText || "").replace(/\s+/g, " ").trim();
  if (!text) return "";

  // tokens significativos
  const tokens = String(question || "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 4); // evita "que", "como", etc.

  if (tokens.length === 0) return text.slice(0, 600) + (text.length > 600 ? "…" : "");

  const lower = text.toLowerCase();

  // buscar primera coincidencia de token
  let idx = -1;
  let matched = "";
  for (const tok of tokens) {
    const pos = lower.indexOf(tok);
    if (pos !== -1) {
      idx = pos;
      matched = tok;
      break;
    }
  }

  // si no hay coincidencia literal, regresamos inicio recortado
  if (idx === -1) {
    return text.slice(0, 600) + (text.length > 600 ? "…" : "");
  }

  // ventana alrededor de match
  const start = Math.max(0, idx - 250);
  const end = Math.min(text.length, idx + 350);

  let snippet = text.slice(start, end);

  // indicar recorte
  if (start > 0) snippet = "… " + snippet;
  if (end < text.length) snippet = snippet + " …";

  return snippet;
}

// ✅ Validar que realmente haya “match textual” en los top chunks
function hasRealTextMatch(topChunks, question) {
  const tokens = String(question || "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 4);

  if (tokens.length === 0) return true;

  return topChunks.some((c) => {
    const lower = String(c.text || "").toLowerCase();
    return tokens.some((t) => lower.includes(t));
  });
}

function buildReplyFromChunks(question, topChunks) {
  // ✅ Solo 3 resultados y con snippet inteligente
  const used = topChunks.slice(0, 3);

  let out = `Respuesta basada únicamente en los libros cargados.\n\n`;
  out += `**Pregunta:** ${question}\n\n`;
  out += `**Fragmentos encontrados (top ${used.length}):**\n\n`;

  used.forEach((c, i) => {
    const score = typeof c.score === "number" ? c.score.toFixed(3) : "NA";
    const snippet = buildSmartSnippet(c.text, question);

    out += `---\n`;
    out += `**Fuente ${i + 1}:** ${c.source} (pág. ${c.page}) — score ${score}\n\n`;
    out += `${snippet}\n\n`;
  });

  return out.trim();
}

// ✅ Respuesta rápida para saludos
function replyGreeting(question) {
  const q = question.toLowerCase();
  if (q.includes("quien") || q.includes("qué eres") || q.includes("que eres")) {
    return "Soy el Asistente IA del ITSVA. Puedo ayudarte con temas del área de Sistemas basándome en los libros cargados.";
  }
  if (q.includes("como estas") || q.includes("cómo estás")) {
    return "¡Bien! Listo para ayudarte. Pregúntame algo del área de Sistemas (CSS, JavaScript, XHTML, etc.).";
  }
  return "¡Hola! Soy el Asistente IA del ITSVA. ¿Qué tema de Sistemas necesitas?";
}

// -----------------------------
// POST /api/chat
// -----------------------------
router.post("/", authMiddleware, async (req, res) => {
  try {
    const { message, conversationId } = req.body;
    const userId = req.user.id;

    const question = String(message || "").trim();
    if (!question) {
      return res.status(400).json({ error: "Falta el mensaje del usuario." });
    }

    // 0) Saludos / identidad (SIN RAG)
    if (isGreeting(question)) {
      const reply = replyGreeting(question);

      let conv = null;
      if (conversationId) {
        conv = await Conversation.findOne({ _id: conversationId, userId });
      }
      if (!conv) {
        conv = await Conversation.create({
          userId,
          title: generateTitleFromMessage(question),
          messages: [
            { role: "user", content: question },
            { role: "assistant", content: reply },
          ],
        });
      } else {
        conv.messages.push(
          { role: "user", content: question },
          { role: "assistant", content: reply }
        );
        await conv.save();
      }

      return res.json({ reply, conversationId: conv._id });
    }

    // 1) Si NO es tema de sistemas → bloquear
    if (!isSystemsTopic(question)) {
      const reply =
        "Solo atiendo preguntas del área de Sistemas basadas en los libros cargados. " +
        "Ejemplos: CSS, JavaScript, XHTML, programación, informática, redes, web.";

      let conv = null;
      if (conversationId) {
        conv = await Conversation.findOne({ _id: conversationId, userId });
      }
      if (!conv) {
        conv = await Conversation.create({
          userId,
          title: generateTitleFromMessage(question),
          messages: [
            { role: "user", content: question },
            { role: "assistant", content: reply },
          ],
        });
      } else {
        conv.messages.push(
          { role: "user", content: question },
          { role: "assistant", content: reply }
        );
        await conv.save();
      }

      return res.json({ reply, conversationId: conv._id });
    }

    // 2) Tema de sistemas → buscar en libros
    const queryEmbedding = await getEmbeddingForQuery(question);

    const chunks = loadChunks();
    const top = searchSimilarChunks(chunks, queryEmbedding, 8);

    const bestScore = top[0]?.score ?? -1;

    // ✅ Regla final: si no hay match real o score bajo → “no está en libros”
    const matchOk = hasRealTextMatch(top.slice(0, 5), question);
    if (!top.length || bestScore < 0.25 || !matchOk) {
      const reply =
        "Ese tema sí es del área de Sistemas, pero no encontré la información en los libros cargados.";

      let conv = null;
      if (conversationId) {
        conv = await Conversation.findOne({ _id: conversationId, userId });
      }
      if (!conv) {
        conv = await Conversation.create({
          userId,
          title: generateTitleFromMessage(question),
          messages: [
            { role: "user", content: question },
            { role: "assistant", content: reply },
          ],
        });
      } else {
        conv.messages.push(
          { role: "user", content: question },
          { role: "assistant", content: reply }
        );
        await conv.save();
      }

      return res.json({ reply, conversationId: conv._id });
    }

    // 3) Construir respuesta con fragmentos útiles
    const reply = buildReplyFromChunks(question, top);

    // 4) Guardar conversación
    let conv = null;
    if (conversationId) {
      conv = await Conversation.findOne({ _id: conversationId, userId });
    }
    if (!conv) {
      conv = await Conversation.create({
        userId,
        title: generateTitleFromMessage(question),
        messages: [
          { role: "user", content: question },
          { role: "assistant", content: reply },
        ],
      });
    } else {
      conv.messages.push(
        { role: "user", content: question },
        { role: "assistant", content: reply }
      );
      await conv.save();
    }

    return res.json({ reply, conversationId: conv._id });
  } catch (err) {
    console.error("Error en /api/chat:", err.response?.data || err.message || err);
    return res.status(500).json({
      error: "Error al procesar la consulta con embeddings/RAG.",
    });
  }
});

// -----------------------------
// GET /api/chat/history
// -----------------------------
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
router.get("/conversation/:id", authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;

    const conversation = await Conversation.findOne({
      _id: id,
      userId: req.user.id,
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
// -----------------------------
router.patch("/conversation/:id", authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const title = String(req.body?.title || "").trim();

    if (!title) return res.status(400).json({ error: "Título inválido." });

    const conv = await Conversation.findOneAndUpdate(
      { _id: id, userId: req.user.id },
      { title },
      { new: true }
    );

    if (!conv) return res.status(404).json({ error: "Conversación no encontrada." });

    res.json({ message: "Renombrada.", conversation: conv });
  } catch (err) {
    console.error("Error en PATCH conversation:", err.message);
    res.status(500).json({ error: "Error al renombrar conversación." });
  }
});

// -----------------------------
// DELETE /api/chat/conversation/:id
// -----------------------------
router.delete("/conversation/:id", authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;

    const deleted = await Conversation.findOneAndDelete({
      _id: id,
      userId: req.user.id,
    });

    if (!deleted) return res.status(404).json({ error: "Conversación no encontrada." });

    res.json({ message: "Eliminada." });
  } catch (err) {
    console.error("Error en DELETE conversation:", err.message);
    res.status(500).json({ error: "Error al eliminar conversación." });
  }
});

module.exports = router;
