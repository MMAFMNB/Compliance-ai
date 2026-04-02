import time
import json
import uuid
from datetime import datetime, timezone
from typing import Optional

import anthropic
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel

from auth import get_current_user
from api_utils import call_anthropic
from config import ANTHROPIC_API_KEY, MODEL, load_system_prompt
from database import supabase_admin

router = APIRouter(prefix="/api/documents", tags=["docgen"])


# ---------------------------------------------------------------------------
# Pydantic Models
# ---------------------------------------------------------------------------

class TemplateOut(BaseModel):
    id: str
    name: str
    name_en: str | None
    category: str
    description: str | None
    required_fields: list[dict]


class GenerateRequest(BaseModel):
    template_id: str
    input_data: dict
    letterhead_id: str | None = None


class GeneratedDocumentOut(BaseModel):
    id: str
    title: str
    content: str
    template_id: str | None
    input_data: dict
    latency_ms: int
    created_at: str


# ---------------------------------------------------------------------------
# Seed Templates
# ---------------------------------------------------------------------------

SEED_TEMPLATES = [
    {
        "id": str(uuid.uuid5(uuid.NAMESPACE_DNS, "aml_policy")),
        "name": "سياسة مكافحة غسل الأموال",
        "name_en": "AML Policy",
        "category": "aml_policy",
        "description": "إنشاء وثيقة سياسة مكافحة غسل الأموال وتمويل الإرهاب متوافقة مع متطلبات هيئة السوق المالية",
        "prompt_template": (
            "أنت خبير تنظيمي متخصص في لوائح هيئة السوق المالية السعودية (CMA). "
            "قم بإنشاء وثيقة سياسة شاملة لمكافحة غسل الأموال وتمويل الإرهاب (AML/CTF) "
            "متوافقة مع معايير هيئة السوق المالية للشركة التالية:\n\n"
            "اسم الشركة: {company_name}\n"
            "رقم الترخيص: {license_number}\n"
            "اسم مسؤول الالتزام: {compliance_officer_name}\n"
            "مستوى المخاطر: {risk_level}\n\n"
            "يجب أن تتضمن الوثيقة جميع الأقسام المطلوبة وفقاً للوائح هيئة السوق المالية "
            "بما في ذلك إجراءات العناية الواجبة، وتقييم المخاطر، والإبلاغ عن العمليات المشبوهة. "
            "اكتب الوثيقة باللغة العربية مع ترجمة إنجليزية، واستخدم المصطلحات التنظيمية الصحيحة لهيئة السوق المالية."
        ),
        "required_fields": json.dumps([
            {"field_name": "company_name", "label": "اسم الشركة", "label_en": "Company Name", "type": "text"},
            {"field_name": "license_number", "label": "رقم الترخيص", "label_en": "License Number", "type": "text"},
            {"field_name": "compliance_officer_name", "label": "اسم مسؤول الالتزام", "label_en": "Compliance Officer Name", "type": "text"},
            {"field_name": "risk_level", "label": "مستوى المخاطر", "label_en": "Risk Level", "type": "select", "options": ["high", "medium", "low"]}
        ])
    },
    {
        "id": str(uuid.uuid5(uuid.NAMESPACE_DNS, "compliance_report")),
        "name": "تقرير الالتزام السنوي",
        "name_en": "Annual Compliance Report",
        "category": "compliance_report",
        "description": "إنشاء تقرير الالتزام السنوي وفقاً لمتطلبات هيئة السوق المالية",
        "prompt_template": (
            "أنت خبير تنظيمي متخصص في لوائح هيئة السوق المالية السعودية (CMA). "
            "قم بإنشاء تقرير التزام سنوي شامل ومتوافق مع معايير هيئة السوق المالية "
            "للشركة التالية:\n\n"
            "اسم الشركة: {company_name}\n"
            "فترة التقرير: {reporting_period}\n"
            "نوع الترخيص: {license_type}\n"
            "النتائج الرئيسية: {key_findings}\n\n"
            "يجب أن يتضمن التقرير ملخصاً تنفيذياً، ونتائج المراجعة، والتوصيات، "
            "وخطة العمل التصحيحية وفقاً لمتطلبات الإفصاح لهيئة السوق المالية. "
            "اكتب التقرير باللغة العربية مع ترجمة إنجليزية، واستخدم المصطلحات التنظيمية الصحيحة لهيئة السوق المالية."
        ),
        "required_fields": json.dumps([
            {"field_name": "company_name", "label": "اسم الشركة", "label_en": "Company Name", "type": "text"},
            {"field_name": "reporting_period", "label": "فترة التقرير", "label_en": "Reporting Period", "type": "text"},
            {"field_name": "license_type", "label": "نوع الترخيص", "label_en": "License Type", "type": "text"},
            {"field_name": "key_findings", "label": "النتائج الرئيسية", "label_en": "Key Findings", "type": "textarea"}
        ])
    },
    {
        "id": str(uuid.uuid5(uuid.NAMESPACE_DNS, "board_notification")),
        "name": "إشعار مجلس الإدارة",
        "name_en": "Board Notification",
        "category": "board_notification",
        "description": "إنشاء خطاب إشعار مجلس الإدارة وفقاً لمتطلبات هيئة السوق المالية",
        "prompt_template": (
            "أنت خبير تنظيمي متخصص في لوائح هيئة السوق المالية السعودية (CMA). "
            "قم بإنشاء خطاب إشعار رسمي لمجلس الإدارة متوافق مع متطلبات هيئة السوق المالية "
            "بالتفاصيل التالية:\n\n"
            "اسم الشركة: {company_name}\n"
            "نوع الإشعار: {notification_type}\n"
            "التفاصيل: {details}\n"
            "تاريخ قرار مجلس الإدارة: {board_resolution_date}\n\n"
            "يجب أن يتضمن الخطاب جميع العناصر المطلوبة وفقاً لقواعد حوكمة الشركات "
            "الصادرة عن هيئة السوق المالية، بما في ذلك المراجع التنظيمية المناسبة. "
            "اكتب الخطاب باللغة العربية مع ترجمة إنجليزية، واستخدم المصطلحات التنظيمية الصحيحة لهيئة السوق المالية."
        ),
        "required_fields": json.dumps([
            {"field_name": "company_name", "label": "اسم الشركة", "label_en": "Company Name", "type": "text"},
            {"field_name": "notification_type", "label": "نوع الإشعار", "label_en": "Notification Type", "type": "text"},
            {"field_name": "details", "label": "التفاصيل", "label_en": "Details", "type": "textarea"},
            {"field_name": "board_resolution_date", "label": "تاريخ قرار مجلس الإدارة", "label_en": "Board Resolution Date", "type": "text"}
        ])
    },
    {
        "id": str(uuid.uuid5(uuid.NAMESPACE_DNS, "fund_prospectus")),
        "name": "قسم نشرة إصدار الصندوق",
        "name_en": "Fund Prospectus Section",
        "category": "fund_prospectus",
        "description": "إنشاء أقسام الالتزام في نشرة إصدار الصندوق وفقاً لمتطلبات هيئة السوق المالية",
        "prompt_template": (
            "أنت خبير تنظيمي متخصص في لوائح هيئة السوق المالية السعودية (CMA). "
            "قم بإنشاء أقسام الالتزام التنظيمي لنشرة إصدار الصندوق الاستثماري "
            "متوافقة مع لائحة صناديق الاستثمار الصادرة عن هيئة السوق المالية "
            "بالتفاصيل التالية:\n\n"
            "اسم الصندوق: {fund_name}\n"
            "نوع الصندوق: {fund_type}\n"
            "اسم مدير الصندوق: {manager_name}\n"
            "استراتيجية الاستثمار: {investment_strategy}\n\n"
            "يجب أن تتضمن الأقسام الإفصاحات المطلوبة، وعوامل المخاطر، "
            "والبيانات التنظيمية وفقاً للائحة صناديق الاستثمار لهيئة السوق المالية. "
            "اكتب الوثيقة باللغة العربية مع ترجمة إنجليزية، واستخدم المصطلحات التنظيمية الصحيحة لهيئة السوق المالية."
        ),
        "required_fields": json.dumps([
            {"field_name": "fund_name", "label": "اسم الصندوق", "label_en": "Fund Name", "type": "text"},
            {"field_name": "fund_type", "label": "نوع الصندوق", "label_en": "Fund Type", "type": "select", "options": ["public", "private"]},
            {"field_name": "manager_name", "label": "اسم مدير الصندوق", "label_en": "Manager Name", "type": "text"},
            {"field_name": "investment_strategy", "label": "استراتيجية الاستثمار", "label_en": "Investment Strategy", "type": "textarea"}
        ])
    },
    {
        "id": str(uuid.uuid5(uuid.NAMESPACE_DNS, "str_report")),
        "name": "تقرير العمليات المشبوهة (STR)",
        "name_en": "Suspicious Transaction Report",
        "category": "aml_policy",
        "description": "إعداد تقرير عمليات مشبوهة لتقديمه للجهات المختصة وفقاً لمتطلبات هيئة السوق المالية",
        "prompt_template": (
            "أنت خبير تنظيمي متخصص في لوائح هيئة السوق المالية السعودية (CMA). "
            "قم بإنشاء تقرير عمليات مشبوهة (STR) شامل ومتوافق مع متطلبات هيئة السوق المالية "
            "ووحدة التحريات المالية بالتفاصيل التالية:\n\n"
            "اسم الشركة: {company_name}\n"
            "اسم العميل/الطرف المشتبه به: {suspect_name}\n"
            "وصف العملية المشبوهة: {transaction_description}\n"
            "المبلغ التقريبي: {amount}\n\n"
            "يجب أن يتضمن التقرير وصفاً تفصيلياً للعملية، ومؤشرات الاشتباه، "
            "والإجراءات المتخذة، وتوصية الإبلاغ. اكتب باللغة العربية مع ترجمة إنجليزية."
        ),
        "required_fields": json.dumps([
            {"field_name": "company_name", "label": "اسم الشركة", "label_en": "Company Name", "type": "text"},
            {"field_name": "suspect_name", "label": "اسم العميل/الطرف المشتبه به", "label_en": "Suspect Name", "type": "text"},
            {"field_name": "transaction_description", "label": "وصف العملية المشبوهة", "label_en": "Transaction Description", "type": "textarea"},
            {"field_name": "amount", "label": "المبلغ التقريبي", "label_en": "Approximate Amount", "type": "text"},
        ])
    },
    {
        "id": str(uuid.uuid5(uuid.NAMESPACE_DNS, "board_pack")),
        "name": "قسم الالتزام في حزمة مجلس الإدارة",
        "name_en": "Board Pack Compliance Section",
        "category": "compliance_report",
        "description": "إعداد قسم الالتزام في حزمة مجلس الإدارة الدورية",
        "prompt_template": (
            "أنت خبير تنظيمي متخصص في لوائح هيئة السوق المالية السعودية (CMA). "
            "قم بإنشاء قسم الالتزام التنظيمي لحزمة مجلس الإدارة:\n\n"
            "اسم الشركة: {company_name}\n"
            "فترة التقرير: {reporting_period}\n"
            "ملخص حالة الالتزام: {compliance_summary}\n"
            "الحوادث أو المخالفات: {incidents}\n\n"
            "يجب أن يتضمن ملخصاً تنفيذياً، وحالة الالتزام الحالية، والمخاطر الرئيسية، "
            "والتوصيات لمجلس الإدارة. اكتب باللغة العربية مع ترجمة إنجليزية."
        ),
        "required_fields": json.dumps([
            {"field_name": "company_name", "label": "اسم الشركة", "label_en": "Company Name", "type": "text"},
            {"field_name": "reporting_period", "label": "فترة التقرير", "label_en": "Reporting Period", "type": "text"},
            {"field_name": "compliance_summary", "label": "ملخص حالة الالتزام", "label_en": "Compliance Status Summary", "type": "textarea"},
            {"field_name": "incidents", "label": "الحوادث أو المخالفات", "label_en": "Incidents or Violations", "type": "textarea"},
        ])
    },
    {
        "id": str(uuid.uuid5(uuid.NAMESPACE_DNS, "sharia_attestation")),
        "name": "شهادة التوافق الشرعي",
        "name_en": "Sharia Compliance Attestation",
        "category": "fund_prospectus",
        "description": "إعداد شهادة التوافق الشرعي لصندوق استثماري وفقاً لمتطلبات هيئة السوق المالية",
        "prompt_template": (
            "أنت خبير تنظيمي وشرعي متخصص في لوائح هيئة السوق المالية السعودية (CMA). "
            "قم بإنشاء شهادة التوافق الشرعي لصندوق استثماري:\n\n"
            "اسم الصندوق: {fund_name}\n"
            "اسم مدير الصندوق: {manager_name}\n"
            "اسم الهيئة الشرعية / المستشار الشرعي: {sharia_advisor}\n"
            "فترة المراجعة: {review_period}\n\n"
            "يجب أن تتضمن الشهادة نطاق المراجعة الشرعية، والنتائج، "
            "والتأكيد على التوافق مع أحكام الشريعة الإسلامية. اكتب باللغة العربية مع ترجمة إنجليزية."
        ),
        "required_fields": json.dumps([
            {"field_name": "fund_name", "label": "اسم الصندوق", "label_en": "Fund Name", "type": "text"},
            {"field_name": "manager_name", "label": "اسم مدير الصندوق", "label_en": "Fund Manager", "type": "text"},
            {"field_name": "sharia_advisor", "label": "المستشار الشرعي", "label_en": "Sharia Advisor", "type": "text"},
            {"field_name": "review_period", "label": "فترة المراجعة", "label_en": "Review Period", "type": "text"},
        ])
    },
    {
        "id": str(uuid.uuid5(uuid.NAMESPACE_DNS, "cma_form")),
        "name": "نموذج تقارير هيئة السوق المالية",
        "name_en": "CMA Reporting Form",
        "category": "cma_form",
        "description": "إنشاء نماذج التقارير التنظيمية لهيئة السوق المالية",
        "prompt_template": (
            "أنت خبير تنظيمي متخصص في لوائح هيئة السوق المالية السعودية (CMA). "
            "قم بملء نموذج التقارير التنظيمية لهيئة السوق المالية "
            "بالبيانات والتفاصيل التالية:\n\n"
            "اسم الشركة: {company_name}\n"
            "نوع النموذج: {form_type}\n"
            "فترة التقرير: {reporting_period}\n"
            "ملخص البيانات: {data_summary}\n\n"
            "يجب أن يتوافق النموذج مع التنسيق والمتطلبات المحددة من قبل هيئة السوق المالية، "
            "بما في ذلك جميع الحقول الإلزامية والإفصاحات المطلوبة. "
            "اكتب النموذج باللغة العربية مع ترجمة إنجليزية، واستخدم المصطلحات التنظيمية الصحيحة لهيئة السوق المالية."
        ),
        "required_fields": json.dumps([
            {"field_name": "company_name", "label": "اسم الشركة", "label_en": "Company Name", "type": "text"},
            {"field_name": "form_type", "label": "نوع النموذج", "label_en": "Form Type", "type": "text"},
            {"field_name": "reporting_period", "label": "فترة التقرير", "label_en": "Reporting Period", "type": "text"},
            {"field_name": "data_summary", "label": "ملخص البيانات", "label_en": "Data Summary", "type": "textarea"}
        ])
    },
]


def seed_templates():
    """Insert seed templates if the templates table is empty."""
    existing = supabase_admin.table("templates").select("id").limit(1).execute()
    if existing.data:
        return
    for tpl in SEED_TEMPLATES:
        supabase_admin.table("templates").insert(tpl).execute()


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.get("/templates", response_model=list[TemplateOut])
async def list_templates(
    category: Optional[str] = Query(None, description="Filter by template category"),
    user: dict = Depends(get_current_user),
):
    """List available document templates, optionally filtered by category."""
    seed_templates()

    query = supabase_admin.table("templates").select("*")
    if category:
        query = query.eq("category", category)
    result = query.execute()

    templates = []
    for row in result.data:
        fields = row.get("required_fields", "[]")
        if isinstance(fields, str):
            fields = json.loads(fields)
        # Map field_name -> name for frontend compatibility
        mapped_fields = []
        for f in fields:
            mapped = dict(f)
            if "field_name" in mapped and "name" not in mapped:
                mapped["name"] = mapped.pop("field_name")
            mapped_fields.append(mapped)
        templates.append(
            TemplateOut(
                id=row["id"],
                name=row["name"],
                name_en=row.get("name_en"),
                category=row["category"],
                description=row.get("description"),
                required_fields=mapped_fields,
            )
        )
    return templates


@router.post("/generate", response_model=GeneratedDocumentOut)
async def generate_document(
    req: GenerateRequest,
    user: dict = Depends(get_current_user),
):
    """Generate a document from a template using Claude."""
    # Look up template
    tpl_result = (
        supabase_admin.table("templates")
        .select("*")
        .eq("id", req.template_id)
        .execute()
    )
    if not tpl_result.data:
        raise HTTPException(status_code=404, detail="Template not found")

    template = tpl_result.data[0]

    # Format prompt with input data
    prompt_template = template["prompt_template"]
    try:
        formatted_prompt = prompt_template.format(**req.input_data)
    except KeyError as e:
        raise HTTPException(
            status_code=400,
            detail=f"Missing required field: {e}",
        )

    # Call Claude
    system_prompt = load_system_prompt()
    start = time.time()
    response = call_anthropic(
        max_tokens=4096,
        system=system_prompt,
        messages=[{"role": "user", "content": formatted_prompt}],
    )
    latency_ms = int((time.time() - start) * 1000)

    content = response.content[0].text
    title = f"{template.get('name_en', template['name'])} - {req.input_data.get('company_name', req.input_data.get('fund_name', ''))}"

    # Store generated document
    doc_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()
    doc_row = {
        "id": doc_id,
        "user_id": user["id"],
        "title": title,
        "content": content,
        "template_id": req.template_id,
        "input_data": json.dumps(req.input_data),
        "letterhead_id": req.letterhead_id,
        "latency_ms": latency_ms,
        "created_at": now,
    }
    supabase_admin.table("generated_documents").insert(doc_row).execute()

    return GeneratedDocumentOut(
        id=doc_id,
        title=title,
        content=content,
        template_id=req.template_id,
        input_data=req.input_data,
        latency_ms=latency_ms,
        created_at=now,
    )


@router.get("/generated", response_model=list[GeneratedDocumentOut])
async def list_generated_documents(
    user: dict = Depends(get_current_user),
):
    """List the current user's generated documents."""
    result = (
        supabase_admin.table("generated_documents")
        .select("*")
        .eq("user_id", user["id"])
        .order("created_at", desc=True)
        .execute()
    )

    docs = []
    for row in result.data:
        input_data = row.get("input_data", "{}")
        if isinstance(input_data, str):
            input_data = json.loads(input_data)
        docs.append(
            GeneratedDocumentOut(
                id=row["id"],
                title=row["title"],
                content=row["content"],
                template_id=row.get("template_id"),
                input_data=input_data,
                latency_ms=row.get("latency_ms", 0),
                created_at=row["created_at"],
            )
        )
    return docs


@router.get("/generated/{doc_id}", response_model=GeneratedDocumentOut)
async def get_generated_document(
    doc_id: str,
    user: dict = Depends(get_current_user),
):
    """Get a specific generated document by ID."""
    result = (
        supabase_admin.table("generated_documents")
        .select("*")
        .eq("id", doc_id)
        .eq("user_id", user["id"])
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=404, detail="Document not found")

    row = result.data[0]
    input_data = row.get("input_data", "{}")
    if isinstance(input_data, str):
        input_data = json.loads(input_data)

    return GeneratedDocumentOut(
        id=row["id"],
        title=row["title"],
        content=row["content"],
        template_id=row.get("template_id"),
        input_data=input_data,
        latency_ms=row.get("latency_ms", 0),
        created_at=row["created_at"],
    )


# ---------------------------------------------------------------------------
# Document Workflow Endpoints
# ---------------------------------------------------------------------------

class WorkflowAction(BaseModel):
    notes: Optional[str] = None


@router.post("/generated/{doc_id}/submit-review")
async def submit_for_review(
    doc_id: str,
    body: WorkflowAction,
    user: dict = Depends(get_current_user),
):
    """Submit a draft document for review."""
    result = (
        supabase_admin.table("generated_documents")
        .select("id, status, user_id")
        .eq("id", doc_id)
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=404, detail="Document not found")

    doc = result.data[0]
    if doc["status"] not in ("draft", "rejected"):
        raise HTTPException(status_code=400, detail=f"Cannot submit document in '{doc['status']}' state")

    supabase_admin.table("generated_documents").update(
        {"status": "pending_review"}
    ).eq("id", doc_id).execute()

    supabase_admin.table("document_reviews_log").insert({
        "document_id": doc_id,
        "action": "submit_review",
        "user_id": user["id"],
        "notes": body.notes,
    }).execute()

    return {"status": "pending_review"}


@router.post("/generated/{doc_id}/approve")
async def approve_document(
    doc_id: str,
    body: WorkflowAction,
    user: dict = Depends(get_current_user),
):
    """Approve a document under review."""
    result = (
        supabase_admin.table("generated_documents")
        .select("id, status")
        .eq("id", doc_id)
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=404, detail="Document not found")

    if result.data[0]["status"] != "pending_review":
        raise HTTPException(status_code=400, detail="Document is not pending review")

    now = datetime.now(timezone.utc).isoformat()
    supabase_admin.table("generated_documents").update({
        "status": "approved",
        "approved_by": user["id"],
        "approved_at": now,
        "review_notes": body.notes,
    }).eq("id", doc_id).execute()

    supabase_admin.table("document_reviews_log").insert({
        "document_id": doc_id,
        "action": "approve",
        "user_id": user["id"],
        "notes": body.notes,
    }).execute()

    return {"status": "approved"}


@router.post("/generated/{doc_id}/reject")
async def reject_document(
    doc_id: str,
    body: WorkflowAction,
    user: dict = Depends(get_current_user),
):
    """Reject a document and send back to draft."""
    result = (
        supabase_admin.table("generated_documents")
        .select("id, status")
        .eq("id", doc_id)
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=404, detail="Document not found")

    if result.data[0]["status"] != "pending_review":
        raise HTTPException(status_code=400, detail="Document is not pending review")

    supabase_admin.table("generated_documents").update({
        "status": "rejected",
        "reviewed_by": user["id"],
        "reviewed_at": datetime.now(timezone.utc).isoformat(),
        "review_notes": body.notes,
    }).eq("id", doc_id).execute()

    supabase_admin.table("document_reviews_log").insert({
        "document_id": doc_id,
        "action": "reject",
        "user_id": user["id"],
        "notes": body.notes,
    }).execute()

    return {"status": "rejected"}


@router.post("/generated/{doc_id}/archive")
async def archive_document(
    doc_id: str,
    user: dict = Depends(get_current_user),
):
    """Archive an approved document."""
    result = (
        supabase_admin.table("generated_documents")
        .select("id, status")
        .eq("id", doc_id)
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=404, detail="Document not found")

    if result.data[0]["status"] != "approved":
        raise HTTPException(status_code=400, detail="Only approved documents can be archived")

    supabase_admin.table("generated_documents").update(
        {"status": "archived"}
    ).eq("id", doc_id).execute()

    supabase_admin.table("document_reviews_log").insert({
        "document_id": doc_id,
        "action": "archive",
        "user_id": user["id"],
    }).execute()

    return {"status": "archived"}


@router.get("/generated/{doc_id}/history")
async def get_document_history(
    doc_id: str,
    user: dict = Depends(get_current_user),
):
    """Get the review/approval history of a document."""
    result = (
        supabase_admin.table("document_reviews_log")
        .select("*")
        .eq("document_id", doc_id)
        .order("created_at", desc=True)
        .execute()
    )
    return {"history": result.data}


@router.post("/generated/{doc_id}/new-version")
async def create_new_version(
    doc_id: str,
    user: dict = Depends(get_current_user),
):
    """Create a new version of a document by cloning it as a draft."""
    result = (
        supabase_admin.table("generated_documents")
        .select("*")
        .eq("id", doc_id)
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=404, detail="Document not found")

    original = result.data[0]
    new_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()

    new_row = {
        "id": new_id,
        "user_id": user["id"],
        "title": original["title"],
        "content": original["content"],
        "template_id": original.get("template_id"),
        "input_data": original.get("input_data"),
        "letterhead_id": original.get("letterhead_id"),
        "latency_ms": 0,
        "status": "draft",
        "version": (original.get("version") or 1) + 1,
        "parent_id": doc_id,
        "language": original.get("language", "ar"),
        "firm_id": original.get("firm_id"),
        "created_at": now,
    }

    supabase_admin.table("generated_documents").insert(new_row).execute()

    return {"id": new_id, "version": new_row["version"], "status": "draft"}
