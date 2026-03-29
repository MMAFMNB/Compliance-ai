"""Document compliance review: upload a PDF, get clause-by-clause review against CMA regulations."""

import json
import logging
import os
import tempfile
import time

import anthropic
from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from pydantic import BaseModel

from auth import get_current_user
from config import ANTHROPIC_API_KEY, MODEL, load_system_prompt
from database import supabase_admin

router = APIRouter(prefix="/api", tags=["review"])
logger = logging.getLogger(__name__)

client = anthropic.Anthropic(api_key=ANTHROPIC_API_KEY)
SYSTEM_PROMPT = load_system_prompt()

RAG_ENABLED = os.getenv("RAG_ENABLED", "false").lower() == "true"


class ReviewFinding(BaseModel):
    clause: str
    regulation: str
    status: str  # "compliant", "non_compliant", "needs_review", "not_applicable"
    recommendation: str
    citations: list[str]


class ReviewResponse(BaseModel):
    filename: str
    language: str
    total_findings: int
    compliant: int
    non_compliant: int
    needs_review: int
    findings: list[ReviewFinding]
    latency_ms: int


REVIEW_INSTRUCTION = """You are reviewing the following document for compliance with CMA regulations.

## Document Under Review:
{document_text}

## Relevant Regulatory Context:
{rag_context}

## Instructions:
Analyze the document above against the relevant CMA regulations. For each significant clause or provision in the document:

1. Identify the clause/provision
2. Determine the applicable CMA regulation
3. Assess compliance status: "compliant", "non_compliant", "needs_review", or "not_applicable"
4. Provide a specific recommendation
5. Cite the exact regulatory article

Return your analysis as a JSON array of objects with these fields:
- "clause": the document clause being reviewed (quote or summarize it)
- "regulation": which CMA regulation applies
- "status": one of "compliant", "non_compliant", "needs_review", "not_applicable"
- "recommendation": specific actionable recommendation
- "citations": array of regulatory citations in standard format

Return ONLY the JSON array, no other text. Example:
[
  {{
    "clause": "Fund management fees shall be 2% per annum",
    "regulation": "Investment Funds Regulations",
    "status": "needs_review",
    "recommendation": "Verify fee disclosure meets Article 32 requirements for fund terms and conditions",
    "citations": ["Investment Funds Regulations, Article (32), Paragraph (a)"]
  }}
]"""


def _extract_text_from_pdf(file_path: str) -> str:
    """Extract text from PDF. Requires PyMuPDF (fitz) to be installed."""
    import fitz
    doc = fitz.open(file_path)
    pages = [page.get_text("text") for page in doc]
    doc.close()
    return "\n".join(pages)


def _detect_language(text: str) -> str:
    """Detect if text is predominantly Arabic, English, or bilingual."""
    import re
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


@router.post("/review", response_model=ReviewResponse)
def review_document(
    file: UploadFile = File(...),
    user: dict = Depends(get_current_user),
):
    """Upload a PDF document and get a clause-by-clause compliance review."""
    if not RAG_ENABLED:
        raise HTTPException(
            status_code=501,
            detail="Document review requires RAG to be enabled. Set RAG_ENABLED=true with PyMuPDF and sentence-transformers installed.",
        )

    if not file.filename or not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files are accepted")

    content = file.file.read()
    with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as tmp:
        tmp.write(content)
        tmp_path = tmp.name

    try:
        document_text = _extract_text_from_pdf(tmp_path)
        if not document_text.strip():
            raise HTTPException(status_code=400, detail="Could not extract text from PDF")

        language = _detect_language(document_text)

        max_doc_chars = 15000
        if len(document_text) > max_doc_chars:
            document_text = document_text[:max_doc_chars]

        # Lazy import RAG only when actually needed
        from rag import rag_query, build_rag_context

        chunks = rag_query(
            query=f"compliance review requirements for {file.filename}",
            doc_type="regulation",
        )
        rag_context = build_rag_context(chunks)

        review_prompt = REVIEW_INSTRUCTION.format(
            document_text=document_text,
            rag_context=rag_context if rag_context else "No specific regulatory context retrieved. Use your knowledge of CMA regulations.",
        )

        start = time.perf_counter()
        response = client.messages.create(
            model=MODEL,
            max_tokens=8192,
            system=SYSTEM_PROMPT,
            messages=[{"role": "user", "content": review_prompt}],
        )
        latency_ms = int((time.perf_counter() - start) * 1000)

        text_blocks = [b for b in response.content if b.type == "text"]
        if not text_blocks:
            raise HTTPException(status_code=502, detail="LLM returned no text content")

        raw_text = text_blocks[0].text.strip()

        # Strip markdown code fences if present
        if raw_text.startswith("```"):
            raw_text = raw_text.split("\n", 1)[1]
            raw_text = raw_text.rsplit("```", 1)[0].strip()

        # Try to extract JSON array even if LLM added surrounding text
        import re
        json_match = re.search(r'\[.*\]', raw_text, re.DOTALL)
        if json_match:
            raw_text = json_match.group(0)

        try:
            findings_data = json.loads(raw_text)
        except json.JSONDecodeError:
            logger.error("Failed to parse review response as JSON: %s", raw_text[:500])
            raise HTTPException(
                status_code=502,
                detail="LLM response was not valid JSON. Try again.",
            )

        # Ensure it's a list
        if not isinstance(findings_data, list):
            findings_data = [findings_data]

        findings = [ReviewFinding(**f) for f in findings_data]

        compliant_count = sum(1 for f in findings if f.status == "compliant")
        non_compliant_count = sum(1 for f in findings if f.status == "non_compliant")
        needs_review_count = sum(1 for f in findings if f.status == "needs_review")

        try:
            supabase_admin.table("document_reviews").insert({
                "user_id": user["id"],
                "filename": file.filename,
                "language": language,
                "total_findings": len(findings),
                "findings": findings_data,
                "latency_ms": latency_ms,
            }).execute()
        except Exception as db_err:
            logger.warning("Failed to save review to DB (non-fatal): %s", db_err)

        return ReviewResponse(
            filename=file.filename,
            language=language,
            total_findings=len(findings),
            compliant=compliant_count,
            non_compliant=non_compliant_count,
            needs_review=needs_review_count,
            findings=findings,
            latency_ms=latency_ms,
        )

    finally:
        os.unlink(tmp_path)
