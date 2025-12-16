const axios = require("axios");

const EMBED_URL = process.env.LMSTUDIO_EMBED_URL;
const EMBED_MODEL = process.env.LMSTUDIO_EMBED_MODEL || "nomic-embed-text-v1.5";

const CHAT_URL = process.env.LMSTUDIO_CHAT_URL;
const CHAT_MODEL = process.env.LMSTUDIO_CHAT_MODEL || "meta-llama-3.1-8b-instruct-hf";

async function embedText({ text, mode }) {
  // Nomic requiere prefijos
  const prefix = mode === "query" ? "search_query: " : "search_document: ";
  const input = prefix + text;

  const payload = {
    model: EMBED_MODEL,
    input,
  };

  const res = await axios.post(EMBED_URL, payload, { timeout: 60000 });

  // LM Studio puede devolver distintas formas:
  // /api/v0/embeddings -> { data: [{ embedding: [...] }] } o { embedding: [...] }
  const emb =
    res.data?.data?.[0]?.embedding ||
    res.data?.embedding ||
    res.data?.data?.[0]?.vector;

  if (!emb || !Array.isArray(emb)) {
    throw new Error("No se pudo leer el embedding desde LM Studio.");
  }

  return emb;
}

async function chatCompletion({ messages }) {
  const res = await axios.post(
    CHAT_URL,
    {
      model: CHAT_MODEL,
      messages,
      temperature: 0.2,
      max_tokens: 700,
    },
    { timeout: 120000 }
  );

  const reply = res.data?.choices?.[0]?.message?.content;
  return reply || "No recibí respuesta del modelo.";
}

module.exports = { embedText, chatCompletion };
