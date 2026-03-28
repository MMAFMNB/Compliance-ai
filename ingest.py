"""Document ingestion pipeline: PDF → text → chunks → embeddings → Supabase pgvector."""

import logging
import re
import uuid

import fitz  # PyMuPDF

from config import EMBEDDING_MODEL
from database import supabase_admin

logger = logging.getLogger(__name__)

EMBEDDING_BATCH_SIZE = 64

# Target chunk size in characters (~500-1500 tokens)
MIN_CHUNK_CHARS = 200
MAX_CHUNK_CHARS = 4000

# Local multilingual model — supports Arabic, 1024d output, no API key needed
_model = None


def _get_model():
    """Lazy-load the embedding model on first use."""
    global _model
    if _model is None:
        from sentence_transformers import SentenceTransformer
        logger.info("Loading embedding model: %s", EMBEDDING_MODEL)
        _model = SentenceTransformer(EMBEDDING_MODEL)
    return _model


# ─── PDF Text Extraction ────────────────────────────────────

def extract_text_from_pdf(file_path: str) -> str:
    """Extract full text from a PDF using PyMuPDF."""
    doc = fitz.open(file_path)
    pages = []
    for page in doc:
        pages.append(page.get_text("text"))
    doc.close()
    return "\n".join(pages)


# ─── Language Detection ─────────────────────────────────────

def detect_language(text: str) -> str:
    """Detect if text is predominantly Arabic, English, or bilingual."""
    arabic_chars = len(re.findall(r"[\u0600-\u06FF]", text))
    latin_chars = len(re.findall(r"[a-zA-Z]", text))
    total = arabic_chars + latin_chars
    if total == 0:
        return "ar"
    ratio = arabic_chars / total
    if ratio > 0.7:
        return "ar"
    if ratio < 0.3:
        return "en"
    return "bilingual"


# ─── Smart Chunking ─────────────────────────────────────────

# Arabic article pattern: المادة (32) or المادة الثانية والثلاثون
ARTICLE_PATTERN_AR = re.compile(
    r"المادة\s*\(?\s*(\d+|[\u0660-\u0669]+)\s*\)?",
    re.MULTILINE,
)

# English article pattern: Article (32) or Article 32
ARTICLE_PATTERN_EN = re.compile(
    r"Article\s*\(?\s*(\d+)\s*\)?",
    re.MULTILINE | re.IGNORECASE,
)

# Part/chapter patterns for context
PART_PATTERN_AR = re.compile(r"(الباب\s+.+?)(?:\n|$)")
PART_PATTERN_EN = re.compile(r"(Part\s+\w+.+?)(?:\n|$)", re.IGNORECASE)
CHAPTER_PATTERN_AR = re.compile(r"(الفصل\s+.+?)(?:\n|$)")
CHAPTER_PATTERN_EN = re.compile(r"(Chapter\s+\w+.+?)(?:\n|$)", re.IGNORECASE)


def _find_article_boundaries(text: str) -> list[tuple[int, str]]:
    """Find all article start positions and their article numbers."""
    boundaries = []
    for match in ARTICLE_PATTERN_AR.finditer(text):
        boundaries.append((match.start(), match.group(0)))
    for match in ARTICLE_PATTERN_EN.finditer(text):
        boundaries.append((match.start(), match.group(0)))
    boundaries.sort(key=lambda x: x[0])
    return boundaries


def _extract_article_number(header: str) -> str:
    """Extract numeric article number from header text."""
    # Try Arabic numerals first
    m = re.search(r"[\u0660-\u0669]+", header)
    if m:
        arabic_digits = {"٠": "0", "١": "1", "٢": "2", "٣": "3", "٤": "4",
                         "٥": "5", "٦": "6", "٧": "7", "٨": "8", "٩": "9"}
        return "".join(arabic_digits.get(c, c) for c in m.group())
    # Try Western numerals
    m = re.search(r"\d+", header)
    if m:
        return m.group()
    return header.strip()


def _find_context_above(text: str, position: int) -> tuple[str, str]:
    """Find the most recent Part and Chapter headings above a position."""
    text_above = text[:position]

    part = ""
    for m in PART_PATTERN_AR.finditer(text_above):
        part = m.group(1).strip()
    if not part:
        for m in PART_PATTERN_EN.finditer(text_above):
            part = m.group(1).strip()

    chapter = ""
    for m in CHAPTER_PATTERN_AR.finditer(text_above):
        chapter = m.group(1).strip()
    if not chapter:
        for m in CHAPTER_PATTERN_EN.finditer(text_above):
            chapter = m.group(1).strip()

    return part, chapter


def chunk_document(text: str) -> list[dict]:
    """Split document text into chunks by article boundaries.

    Each chunk contains one article with its parent Part/Chapter context.
    Falls back to paragraph-based splitting if no articles are found.
    """
    boundaries = _find_article_boundaries(text)

    if not boundaries:
        return _chunk_by_paragraphs(text)

    chunks = []
    for i, (start, header) in enumerate(boundaries):
        end = boundaries[i + 1][0] if i + 1 < len(boundaries) else len(text)
        content = text[start:end].strip()

        if len(content) < MIN_CHUNK_CHARS:
            continue

        # Truncate extremely long articles
        if len(content) > MAX_CHUNK_CHARS:
            content = content[:MAX_CHUNK_CHARS]

        part, chapter = _find_context_above(text, start)
        article_number = _extract_article_number(header)

        chunks.append({
            "content": content,
            "article_number": article_number,
            "part": part,
            "chapter": chapter,
            "chunk_index": i,
        })

    return chunks


def _chunk_by_paragraphs(text: str) -> list[dict]:
    """Fallback chunker: split by double newlines into ~1000 char chunks."""
    paragraphs = re.split(r"\n\s*\n", text)
    chunks = []
    current = ""
    idx = 0

    for para in paragraphs:
        para = para.strip()
        if not para:
            continue

        if len(current) + len(para) > MAX_CHUNK_CHARS and len(current) >= MIN_CHUNK_CHARS:
            chunks.append({
                "content": current.strip(),
                "article_number": None,
                "part": None,
                "chapter": None,
                "chunk_index": idx,
            })
            idx += 1
            current = para
        else:
            current = f"{current}\n\n{para}" if current else para

    if current.strip() and len(current.strip()) >= MIN_CHUNK_CHARS:
        chunks.append({
            "content": current.strip(),
            "article_number": None,
            "part": None,
            "chapter": None,
            "chunk_index": idx,
        })

    return chunks


# ─── Embeddings ─────────────────────────────────────────────

def embed_texts(texts: list[str]) -> list[list[float]]:
    """Embed a list of texts using the local multilingual model.

    Prepends 'passage: ' prefix as required by E5 models for documents.
    """
    model = _get_model()
    prefixed = [f"passage: {t}" for t in texts]
    embeddings = model.encode(prefixed, batch_size=EMBEDDING_BATCH_SIZE, show_progress_bar=True)
    return [emb.tolist() for emb in embeddings]


def embed_query(query: str) -> list[float]:
    """Embed a single query string.

    Prepends 'query: ' prefix as required by E5 models for queries.
    """
    model = _get_model()
    embedding = model.encode(f"query: {query}")
    return embedding.tolist()


# ─── Database Storage ───────────────────────────────────────

def store_document(
    title: str,
    title_en: str | None,
    doc_type: str,
    source_url: str | None,
    amendment_date: str | None,
    file_path: str | None,
    language: str,
) -> str:
    """Create a document record and return its ID."""
    doc_id = str(uuid.uuid4())
    supabase_admin.table("documents").insert({
        "id": doc_id,
        "title": title,
        "title_en": title_en,
        "doc_type": doc_type,
        "source_url": source_url,
        "amendment_date": amendment_date,
        "file_path": file_path,
        "language": language,
    }).execute()
    return doc_id


def store_chunks(document_id: str, chunks: list[dict], embeddings: list[list[float]]) -> int:
    """Store chunks with embeddings in Supabase pgvector. Returns count stored."""
    rows = []
    for chunk, embedding in zip(chunks, embeddings):
        rows.append({
            "document_id": document_id,
            "content": chunk["content"],
            "article_number": chunk.get("article_number"),
            "paragraph": chunk.get("paragraph"),
            "part": chunk.get("part"),
            "chapter": chunk.get("chapter"),
            "chunk_index": chunk["chunk_index"],
            "embedding": embedding,
            "metadata": {},
        })

    # Insert in batches to avoid payload limits
    batch_size = 50
    stored = 0
    for i in range(0, len(rows), batch_size):
        batch = rows[i : i + batch_size]
        supabase_admin.table("chunks").insert(batch).execute()
        stored += len(batch)

    return stored


# ─── Full Pipeline ──────────────────────────────────────────

def ingest_pdf(
    file_path: str,
    title: str,
    title_en: str | None = None,
    doc_type: str = "regulation",
    source_url: str | None = None,
    amendment_date: str | None = None,
) -> dict:
    """Full ingestion pipeline: PDF → chunks → embeddings → database.

    Returns a summary dict with document_id, chunk_count, etc.
    """
    logger.info("Extracting text from %s", file_path)
    text = extract_text_from_pdf(file_path)
    if not text.strip():
        raise ValueError(f"No text extracted from {file_path}")

    language = detect_language(text)
    logger.info("Detected language: %s (%d chars)", language, len(text))

    logger.info("Chunking document...")
    chunks = chunk_document(text)
    if not chunks:
        raise ValueError(f"No chunks produced from {file_path}")
    logger.info("Produced %d chunks", len(chunks))

    logger.info("Embedding %d chunks...", len(chunks))
    texts = [c["content"] for c in chunks]
    embeddings = embed_texts(texts)

    logger.info("Storing document and chunks...")
    doc_id = store_document(
        title=title,
        title_en=title_en,
        doc_type=doc_type,
        source_url=source_url,
        amendment_date=amendment_date,
        file_path=file_path,
        language=language,
    )
    stored = store_chunks(doc_id, chunks, embeddings)

    logger.info("Done: %s → %d chunks stored", title, stored)
    return {
        "document_id": doc_id,
        "title": title,
        "language": language,
        "chunk_count": stored,
        "char_count": len(text),
    }
