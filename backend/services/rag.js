const fs = require("fs");
const path = require("path");

let CACHE = null;

function cosineSimilarity(a, b) {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    const x = a[i];
    const y = b[i];
    dot += x * y;
    na += x * x;
    nb += y * y;
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

function loadChunks() {
  if (CACHE) return CACHE;

  const chunksPath = process.env.CHUNKS_PATH || "./data/chunks.jsonl";
  const abs = path.resolve(process.cwd(), chunksPath);

  if (!fs.existsSync(abs)) {
    throw new Error(
      `No existe CHUNKS_PATH: ${abs}. Primero corre scripts/build_chunks.py`
    );
  }

  const content = fs.readFileSync(abs, "utf8").trim();
  const lines = content.split(/\r?\n/).filter(Boolean);

  CACHE = lines.map((line) => JSON.parse(line));
  return CACHE;
}

function retrieveTopK({ queryEmbedding, k = 6 }) {
  const chunks = loadChunks();

  const scored = chunks
    .filter((c) => Array.isArray(c.embedding) && c.embedding.length > 0)
    .map((c) => ({
      ...c,
      score: cosineSimilarity(queryEmbedding, c.embedding),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, k);

  return scored;
}

function buildContext(topChunks) {
  // Contexto con “citas” simples (libro + página)
  // Ajusta nombres según tu build_chunks.py: aquí asumo fields:
  // { text, source, page, chunk_id }
  return topChunks
    .map((c, idx) => {
      const src = c.source || "Libro";
      const page = c.page != null ? `pág. ${c.page}` : "pág. ?";
      const score = c.score != null ? `score:${c.score.toFixed(3)}` : "";
      return `[#${idx + 1}] (${src}, ${page}, ${score})\n${c.text}`;
    })
    .join("\n\n---\n\n");
}

module.exports = { loadChunks, retrieveTopK, buildContext };
