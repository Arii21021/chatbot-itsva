import os
import re
import json
import time
import hashlib
from pathlib import Path

import requests

# Fallback
from pypdf import PdfReader

# Mejor extractor
import fitz  # PyMuPDF

# =========================
# CONFIG
# =========================
BASE_DIR = Path(__file__).resolve().parent.parent  # backend/
LIBROS_DIR = BASE_DIR / "data" / "libros"
OUT_DIR = BASE_DIR / "data" / "chunks"
OUT_FILE = OUT_DIR / "chunks.json"

LMSTUDIO_EMBED_URL = os.getenv("LMSTUDIO_EMBED_URL", "http://localhost:1234/api/v0/embeddings")
EMBED_MODEL = os.getenv("LMSTUDIO_EMBED_MODEL", "nomic-embed-text-v1.5")

TARGET_CHARS = int(os.getenv("CHUNK_SIZE", "900"))
OVERLAP_CHARS = int(os.getenv("CHUNK_OVERLAP", "120"))
MIN_CHUNK_CHARS = int(os.getenv("MIN_CHUNK_CHARS", "220"))

TIMEOUT_SECONDS = int(os.getenv("EMBED_TIMEOUT", "60"))
SLEEP_BETWEEN_CALLS = float(os.getenv("SLEEP_BETWEEN_CALLS", "0.0"))

TOC_DOTS_RE = re.compile(r"\.{5,}\s*\d+\s*$")
PAGE_NUMBER_RE = re.compile(r"^\s*\d+\s*$")


def normalize_spaced_letters(s: str) -> str:
    def repl(m):
        return m.group(0).replace(" ", "")
    return re.sub(r"(?:\b[A-Za-zÁÉÍÓÚÜÑáéíóúüñ]\s+){3,}[A-Za-zÁÉÍÓÚÜÑáéíóúüñ]\b", repl, s)


def clean_text(text: str) -> str:
    if not text:
        return ""
    text = text.replace("\x00", " ")
    text = normalize_spaced_letters(text)

    text = text.replace("\r\n", "\n").replace("\r", "\n")
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r"\n{3,}", "\n\n", text)

    lines = []
    for line in text.split("\n"):
        l = line.strip()

        if PAGE_NUMBER_RE.match(l):
            continue
        if TOC_DOTS_RE.search(l):
            continue
        if re.fullmatch(r"[.\-•·_ ]{6,}", l or ""):
            continue

        lines.append(line)

    text = "\n".join(lines)
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def stable_id(*parts: str) -> str:
    h = hashlib.sha256()
    for p in parts:
        h.update(p.encode("utf-8", errors="ignore"))
    return h.hexdigest()[:24]


def split_paragraphs(text: str):
    text = clean_text(text)
    if not text:
        return []
    paras = [p.strip() for p in text.split("\n\n") if p.strip()]
    return paras


def build_chunks_from_paragraphs(paras, target_chars, overlap_chars):
    chunks = []
    buf = ""

    def push_chunk(c):
        c = c.strip()
        if len(c) >= MIN_CHUNK_CHARS:
            chunks.append(c)

    for p in paras:
        if not buf:
            buf = p
        elif len(buf) + 2 + len(p) <= target_chars:
            buf = buf + "\n\n" + p
        else:
            push_chunk(buf)
            tail = buf[-overlap_chars:] if overlap_chars > 0 else ""
            buf = (tail + "\n\n" + p).strip()

    if buf:
        push_chunk(buf)

    return chunks


def get_embedding(text: str):
    payload = {
        "model": EMBED_MODEL,
        "input": f"search_document: {text}",
    }
    resp = requests.post(LMSTUDIO_EMBED_URL, json=payload, timeout=TIMEOUT_SECONDS)
    resp.raise_for_status()
    data = resp.json()
    return data["data"][0]["embedding"]


def read_pdf_pages_pymupdf(pdf_path: Path):
    """
    PyMuPDF: suele extraer mejor que pypdf.
    """
    doc = fitz.open(str(pdf_path))
    pages = []
    for i in range(doc.page_count):
        page = doc.load_page(i)
        txt = page.get_text("text") or ""
        pages.append((i + 1, clean_text(txt)))
    doc.close()
    return pages


def read_pdf_pages_pypdf(pdf_path: Path):
    reader = PdfReader(str(pdf_path))
    pages = []
    for i, page in enumerate(reader.pages, start=1):
        try:
            txt = page.extract_text() or ""
        except Exception:
            txt = ""
        pages.append((i, clean_text(txt)))
    return pages


def read_pdf_pages(pdf_path: Path):
    """
    Intenta PyMuPDF primero; si sale vacío, usa pypdf.
    """
    pages = read_pdf_pages_pymupdf(pdf_path)
    total_len = sum(len(t) for _, t in pages)

    if total_len < 300:  # muy sospechoso: casi no extrajo nada
        pages2 = read_pdf_pages_pypdf(pdf_path)
        total_len2 = sum(len(t) for _, t in pages2)
        # usa el que tenga más texto
        return pages2 if total_len2 > total_len else pages

    return pages


def ensure_dirs():
    OUT_DIR.mkdir(parents=True, exist_ok=True)


def load_existing_chunks():
    if not OUT_FILE.exists():
        return [], set()
    try:
        with open(OUT_FILE, "r", encoding="utf-8") as f:
            data = json.load(f)
        seen = {item.get("_id") for item in data if item.get("_id")}
        return data, seen
    except Exception:
        return [], set()


def main():
    ensure_dirs()

    print(f"📚 Leyendo PDFs de: {LIBROS_DIR}")
    if not LIBROS_DIR.exists():
        print("❌ No existe la carpeta data/libros.")
        return

    pdfs = sorted([p for p in LIBROS_DIR.iterdir() if p.suffix.lower() == ".pdf"])
    if not pdfs:
        print("❌ No encontré PDFs en data/libros.")
        return

    existing, seen_ids = load_existing_chunks()
    if existing:
        print(f"↩️  Reanudando: ya hay {len(existing)} chunks guardados en {OUT_FILE.name}")

    all_chunks = existing[:]

    for pdf_path in pdfs:
        print(f"\n=== Procesando: {pdf_path.name} ===")
        pages = read_pdf_pages(pdf_path)

        total_chunks_pdf = 0
        for page_num, page_text in pages:
            if not page_text or len(page_text) < 40:
                continue

            paras = split_paragraphs(page_text)
            if not paras:
                continue

            chunks = build_chunks_from_paragraphs(paras, TARGET_CHARS, OVERLAP_CHARS)
            if not chunks:
                continue

            for idx, chunk in enumerate(chunks, start=1):
                cid = stable_id(pdf_path.name, str(page_num), str(idx), chunk[:160])
                if cid in seen_ids:
                    continue

                preview = chunk[:110].replace("\n", " ")
                print(f"  → pág {page_num:>3} chunk {idx:>2}/{len(chunks)} | Embedding... '{preview}...'")

                try:
                    emb = get_embedding(chunk)
                except Exception as e:
                    print(f"    ❌ Error embedding: {e}")
                    continue

                item = {
                    "_id": cid,
                    "source": pdf_path.name,
                    "page": page_num,
                    "chunk_index": idx,
                    "text": chunk,
                    "embedding": emb,
                }

                all_chunks.append(item)
                seen_ids.add(cid)
                total_chunks_pdf += 1

                with open(OUT_FILE, "w", encoding="utf-8") as f:
                    json.dump(all_chunks, f, ensure_ascii=False)

                if SLEEP_BETWEEN_CALLS > 0:
                    time.sleep(SLEEP_BETWEEN_CALLS)

        print(f"✅ {pdf_path.name}: {total_chunks_pdf} chunks nuevos guardados.")

    print(f"\n🎉 Listo. Total chunks: {len(all_chunks)}")
    print(f"📄 Archivo: {OUT_FILE}")


if __name__ == "__main__":
    main()
