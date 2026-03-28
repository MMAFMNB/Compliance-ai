"""Document compliance review: upload a PDF, get clause-by-clause review against CMA regulations."""

import json
import logging
import tempfile
import time

import anthropic
from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from pydantic import BaseModel

from auth import get_current_user
from config import ANTHROPIC_API_KEY, MODEL, load_system_prompt
from database import supabase_admin
from ingest import extract_text_from_pdf, detect_language
from rag import rag_query, build_rag_context

router = APIRouter(prefix="/api", tags=["review"])
logger = logging.getLogger(__name__)

client = anthropic.Anthropic(api_key=ANTHROPIC_API_KEY)
SYSTEM_PROMPT = load_system_prompt()


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
  {
    "clause": "Fund management fees shall be 2% per annum",
    "regulation": "Investment Funds Regulations",
    "status": "needs_review",
    "recommendation": "Verify fee disclosure meets Article 32 requirements for fund terms and conditions",
    "citations": ["Investment Funds Regulations, Article (32), Paragraph (a)"]
  }
]"""


@router.post("/review", response_model=ReviewResponse)
def review_document(
    file: UploadFile = File(...),
    user: dict = Depends(get_current_user),
):
    """Upload a PDF document and get a clause-by-clause compliance review."""
    if not file.filename or not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files are accepted")

    # Save uploaded file to temp location
    content = file.file.read()
    with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as tmp:
        tmp.write(content)
        tmp_path = tmp.name

    try:
        # Extract text from the uploaded PDF
        document_text = extract_text_from_pdf(tmp_path)
        if not document_text.strip():
            raise HTTPException(status_code=400, detail="Could not extract text from PDF")

        language = detect_language(document_text)

        # Truncate very long documents to fit in context
        max_doc_chars = 15000
        if len(document_text) > max_doc_chars:
            document_text = document_text[:max_doc_chars]

        # Get relevant regulatory context via RAG
        chunks = rag_query(
            query=f"compliance review requirements for {file.filename}",
            doc_type="regulation",
        )
        rag_context = build_rag_context(chunks)

        # Build the review prompt
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

        # Parse the response as JSON
        text_blocks = [b for b in response.content if b.type == "text"]
        if not text_blocks:
            raise HTTPException(status_code=502, detail="LLM returned no text content")

        raw_text = text_blocks[0].text.strip()

        # Extract JSON from response (handle markdown code blocks)
        if raw_text.startswith("```"):
            raw_text = raw_text.split("\n", 1)[1]
            raw_text = raw_text.rsplit("```", 1)[0]

        try:
            findings_data = json.loads(raw_text)
        except json.JSONDecodeError:
            logger.error("Failed to parse review response as JSON: %s", raw_text[:500])
            raise HTTPException(
                status_code=502,
                detail="LLM response was not valid JSON. Try again.",
            )

        findings = [ReviewFinding(**f) for f in findings_data]

        compliant_count = sum(1 for f in findings if f.status == "compliant")
        non_compliant_count = sum(1 for f in findings if f.status == "non_compliant")
        needs_review_count = sum(1 for f in findings if f.status == "needs_review")

        # Save to audit trail
        supabase_admin.table("document_reviews").insert({
            "user_id": user["id"],
            "filename": file.filename,
            "language": language,
            "total_findings": len(findings),
            "compliant": compliant_count,
            "non_compliant": non_compliant_count,
            "needs_review": needs_review_count,
            "findings": findings_data,
            "latency_ms": latency_ms,
        }).execute()

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
        import os
        os.unlink(tmp_path)
