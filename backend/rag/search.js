const fs = require("fs");
const path = require("path");

// ✅ Tu archivo real:
const CHUNKS_PATH = path.join(__dirname, "..", "data", "chunks", "chunks.json");

let _cache = null;

function loadChunks() {
  if (_cache) return _cache;

  if (!fs.existsSync(CHUNKS_PATH)) {
    throw new Error(
      `No existe el archivo de chunks: ${CHUNKS_PATH}. Genera los chunks primero.`
    );
  }

  const raw = fs.readFileSync(CHUNKS_PATH, "utf-8").trim();

  // Soporta: JSON array (chunks.json) o JSONL (chunks.jsonl)
  let chunks;
  if (raw.startsWith("[")) {
    chunks = JSON.parse(raw);
  } else {
    chunks = raw
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => JSON.parse(line));
  }

  // Normalizar y filtrar basura
  chunks = (chunks || [])
    .filter((c) => c && Array.isArray(c.embedding) && c.embedding.length > 0)
    .map((c) => ({
      _id: c._id,
      source: c.source,
      page: c.page,
      chunk_index: c.chunk_index,
      text: String(c.text || ""),
      embedding: c.embedding,
    }));

  _cache = chunks;
  return _cache;
}

function dot(a, b) {
  let s = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) s += a[i] * b[i];
  return s;
}

function norm(a) {
  return Math.sqrt(dot(a, a)) || 1e-9;
}

function cosineSim(a, b) {
  return dot(a, b) / (norm(a) * norm(b));
}

// Búsqueda vectorial topK
function searchSimilarChunks(chunks, queryEmbedding, topK = 6) {
  const scored = chunks.map((c) => ({
    ...c,
    score: cosineSim(queryEmbedding, c.embedding),
  }));

  scored.sort((x, y) => y.score - x.score);
  return scored.slice(0, topK);
}

module.exports = {
  loadChunks,
  searchSimilarChunks,
};
