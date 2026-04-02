"""RAG pipeline: query → vector search → rerank → prompt building → Claude."""

import logging
import re

from database import supabase_admin
from ingest import embed_query, detect_language

logger = logging.getLogger(__name__)

TOP_K_VECTOR = 20
TOP_K_FINAL = 10
CONTEXT_MAX_CHARS = 12000


# ─── Vector Search ──────────────────────────────────────────

def vector_search(
    query_embedding: list[float],
    top_k: int = TOP_K_VECTOR,
    doc_type: str | None = None,
    language: str | None = None,
) -> list[dict]:
    """Search chunks by cosine similarity using pgvector.

    Uses a Supabase RPC function for the vector similarity query.
    """
    params = {
        "query_embedding": query_embedding,
        "match_count": top_k,
        "filter_doc_type": doc_type,
        "filter_language": language,
    }

    result = supabase_admin.rpc("match_chunks", params).execute()
    return result.data or []


def keyword_search(query: str, top_k: int = 10) -> list[dict]:
    """Search chunks by keyword matching (article numbers, regulation names).

    Extracts article numbers and key terms from the query for targeted lookup.
    """
    # Extract article numbers from query
    article_nums = re.findall(r"(?:المادة|Article)\s*\(?\s*(\d+)\s*\)?", query, re.IGNORECASE)

    if not article_nums:
        return []

    # Search by article number
    results = []
    for num in article_nums[:3]:
        result = (
            supabase_admin.table("chunks")
            .select("id, content, article_number, part, chapter, document_id, chunk_index")
            .eq("article_number", num)
            .limit(top_k)
            .execute()
        )
        results.extend(result.data or [])

    return results


# ─── Reranking ──────────────────────────────────────────────

def rerank_chunks(
    chunks: list[dict],
    query: str,
    query_language: str,
    top_k: int = TOP_K_FINAL,
) -> list[dict]:
    """Rerank retrieved chunks by relevance signals.

    Scoring factors:
    - Base similarity score (from vector search)
    - Language match boost
    - Article number match boost
    - Recency boost (recent amendments rank higher)
    """
    query_lower = query.lower()

    # Extract article numbers from query for boosting
    query_articles = set(re.findall(r"\d+", query))

    scored = []
    seen_ids = set()

    for chunk in chunks:
        chunk_id = chunk.get("id", chunk.get("content", "")[:50])
        if chunk_id in seen_ids:
            continue
        seen_ids.add(chunk_id)

        score = chunk.get("similarity", 0.5)

        # Boost if article number matches query
        article_num = chunk.get("article_number", "")
        if article_num and article_num in query_articles:
            score += 0.15

        # Boost matching language chunks
        chunk_lang = detect_language(chunk.get("content", ""))
        if chunk_lang == query_language or chunk_lang == "bilingual":
            score += 0.05

        # Boost if chunk content contains query keywords
        content_lower = chunk.get("content", "").lower()
        query_words = [w for w in query_lower.split() if len(w) > 3]
        if query_words:
            keyword_hits = sum(1 for w in query_words if w in content_lower)
            score += 0.02 * keyword_hits

        scored.append({**chunk, "relevance_score": score})

    scored.sort(key=lambda x: x["relevance_score"], reverse=True)
    return scored[:top_k]


# ─── Prompt Building ────────────────────────────────────────

def build_rag_context(chunks: list[dict]) -> str:
    """Build the context section from retrieved chunks for the Claude prompt."""
    if not chunks:
        return ""

    sections = []
    total_chars = 0

    for chunk in chunks:
        # Build header with metadata
        header_parts = []
        if chunk.get("part"):
            header_parts.append(chunk["part"])
        if chunk.get("chapter"):
            header_parts.append(chunk["chapter"])
        if chunk.get("article_number"):
            header_parts.append(f"Article {chunk['article_number']}")

        header = " > ".join(header_parts) if header_parts else f"Chunk {chunk.get('chunk_index', '?')}"
        content = chunk.get("content", "")

        # Respect context window budget
        section = f"[{header}]\n{content}"
        if total_chars + len(section) > CONTEXT_MAX_CHARS:
            break

        sections.append(section)
        total_chars += len(section)

    return "\n\n---\n\n".join(sections)


def build_rag_prompt(
    system_prompt: str,
    rag_context: str,
    conversation_messages: list[dict],
    user_query: str,
) -> tuple[str, list[dict]]:
    """Build the full prompt with RAG context injected.

    Returns (system_prompt_with_context, messages).
    """
    if rag_context:
        augmented_system = (
            f"{system_prompt}\n\n"
            "## Retrieved Regulatory Context\n\n"
            "The following sections from CMA regulations have been retrieved as relevant to the user's query. "
            "Use these as your PRIMARY source for answering. Cite the specific article/section for every claim.\n\n"
            f"{rag_context}"
        )
    else:
        augmented_system = system_prompt

    # Use last 5 conversation turns (10 messages) for context
    recent_messages = conversation_messages[-10:]

    return augmented_system, recent_messages


# ─── Full RAG Query ─────────────────────────────────────────

def rag_query(query: str, doc_type: str | None = None) -> list[dict]:
    """Execute the full RAG retrieval pipeline for a query.

    Returns the top-k reranked chunks with relevance scores.
    """
    query_language = detect_language(query)
    query_embedding = embed_query(query)

    # Hybrid search: vector + keyword
    vector_results = vector_search(
        query_embedding,
        top_k=TOP_K_VECTOR,
        doc_type=doc_type,
    )
    keyword_results = keyword_search(query)

    # Merge results
    all_results = vector_results + keyword_results

    if not all_results:
        return []

    # Rerank
    reranked = rerank_chunks(all_results, query, query_language)
    return reranked
