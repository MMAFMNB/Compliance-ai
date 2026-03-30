import json
import time
from typing import Optional

import anthropic
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel

from auth import get_current_user
from config import ANTHROPIC_API_KEY, MODEL
from database import supabase_admin

router = APIRouter(prefix="/api/checklist", tags=["checklist"])
client = anthropic.Anthropic(api_key=ANTHROPIC_API_KEY)


# ---------------------------------------------------------------------------
# Pydantic Models
# ---------------------------------------------------------------------------

class RequirementOut(BaseModel):
    id: str
    license_type: str
    category: str
    requirement: str
    requirement_en: Optional[str] = None
    cma_reference: Optional[str] = None
    severity: str


class AssessmentItemInput(BaseModel):
    requirement_id: str
    status: str  # compliant / partial / non_compliant / not_assessed / not_applicable
    notes: Optional[str] = None


class AssessmentCreate(BaseModel):
    license_type: str
    items: list[AssessmentItemInput]


class AssessmentOut(BaseModel):
    id: str
    license_type: str
    overall_score: Optional[float] = None
    total_items: int
    compliant_items: int
    gap_analysis: Optional[str] = None
    remediation_plan: Optional[str] = None
    latency_ms: Optional[int] = None
    created_at: str


class AssessmentDetailOut(AssessmentOut):
    items: list[dict]


# ---------------------------------------------------------------------------
# Seed Requirements
# ---------------------------------------------------------------------------

def seed_requirements():
    """Insert CMA compliance requirements if the table is empty."""
    existing = (
        supabase_admin.table("compliance_requirements")
        .select("id")
        .limit(1)
        .execute()
    )
    if existing.data:
        return

    requirements: list[dict] = []
    sort_order = 0

    # --- fund_management ------------------------------------------------
    fm_governance = [
        ("تعيين مسؤول التزام مؤهل ومعتمد من الهيئة", "Appoint a qualified compliance officer approved by CMA", "المادة 42 من لائحة أعمال الأوراق المالية", "required"),
        ("إعداد وتحديث دليل الالتزام الداخلي", "Prepare and maintain an internal compliance manual", "المادة 43 من لائحة أعمال الأوراق المالية", "required"),
        ("إشراف مجلس الإدارة على أنشطة الصندوق", "Board oversight of fund activities", "المادة 18 من لائحة صناديق الاستثمار", "required"),
        ("وضع سياسة لتعارض المصالح والإفصاح عنها", "Establish and disclose a conflicts of interest policy", "المادة 44 من لائحة أعمال الأوراق المالية", "required"),
        ("تشكيل لجنة مراجعة داخلية", "Establish an internal audit committee", "المادة 19 من لائحة صناديق الاستثمار", "required"),
        ("وضع هيكل حوكمة واضح ومعتمد", "Establish a clear and approved governance structure", "المادة 17 من لائحة صناديق الاستثمار", "recommended"),
    ]
    fm_aml = [
        ("تطبيق إجراءات العناية الواجبة تجاه العملاء", "Implement customer due diligence (CDD) procedures", "المادة 10 من لائحة مكافحة غسل الأموال", "required"),
        ("الإبلاغ عن العمليات المشبوهة", "Report suspicious transactions", "المادة 16 من لائحة مكافحة غسل الأموال", "required"),
        ("فحص قوائم العقوبات والحظر", "Perform sanctions screening", "المادة 12 من لائحة مكافحة غسل الأموال", "required"),
        ("الاحتفاظ بسجلات العملاء لمدة لا تقل عن 10 سنوات", "Maintain client records for at least 10 years", "المادة 14 من لائحة مكافحة غسل الأموال", "required"),
        ("تدريب الموظفين على مكافحة غسل الأموال", "Train staff on AML procedures", "المادة 18 من لائحة مكافحة غسل الأموال", "required"),
    ]
    fm_reporting = [
        ("تقديم التقارير الربع سنوية للهيئة", "Submit quarterly reports to CMA", "المادة 71 من لائحة صناديق الاستثمار", "required"),
        ("إعداد التقرير السنوي المدقق", "Prepare the audited annual report", "المادة 72 من لائحة صناديق الاستثمار", "required"),
        ("الإفصاح عن الأحداث الجوهرية فور وقوعها", "Disclose material events promptly", "المادة 73 من لائحة صناديق الاستثمار", "required"),
        ("نشر صافي قيمة الأصول بشكل دوري", "Publish NAV periodically", "المادة 70 من لائحة صناديق الاستثمار", "required"),
    ]
    fm_client = [
        ("إجراء تقييم ملاءمة للمستثمرين", "Conduct suitability assessment for investors", "المادة 45 من لائحة أعمال الأوراق المالية", "required"),
        ("الإفصاح عن المخاطر والرسوم للمستثمرين", "Disclose risks and fees to investors", "المادة 46 من لائحة صناديق الاستثمار", "required"),
        ("وضع آلية لمعالجة شكاوى المستثمرين", "Establish an investor complaints handling mechanism", "المادة 47 من لائحة أعمال الأوراق المالية", "required"),
        ("توفير شروط وأحكام الصندوق للمستثمرين", "Provide fund terms and conditions to investors", "المادة 48 من لائحة صناديق الاستثمار", "recommended"),
    ]
    fm_risk = [
        ("وضع إطار لإدارة المخاطر الشاملة", "Establish a comprehensive risk management framework", "المادة 25 من لائحة صناديق الاستثمار", "required"),
        ("إعداد خطة استمرارية الأعمال", "Prepare a business continuity plan", "المادة 50 من لائحة أعمال الأوراق المالية", "required"),
        ("الالتزام بمتطلبات كفاية رأس المال", "Comply with capital adequacy requirements", "المادة 52 من لائحة أعمال الأوراق المالية", "required"),
        ("إجراء اختبارات الضغط بشكل دوري", "Conduct periodic stress testing", "المادة 26 من لائحة صناديق الاستثمار", "recommended"),
    ]
    fm_operations = [
        ("فصل أصول الصندوق عن أصول المدير", "Segregate fund assets from manager assets", "المادة 30 من لائحة صناديق الاستثمار", "required"),
        ("اتباع إجراءات تقييم عادلة ومستقلة", "Follow fair and independent valuation procedures", "المادة 31 من لائحة صناديق الاستثمار", "required"),
        ("احتساب صافي قيمة الأصول بدقة وانتظام", "Calculate NAV accurately and regularly", "المادة 32 من لائحة صناديق الاستثمار", "required"),
        ("ترتيبات حفظ الأصول مع أمين حفظ مستقل", "Asset custody arrangements with an independent custodian", "المادة 33 من لائحة صناديق الاستثمار", "required"),
        ("تنفيذ أفضل سياسة تنفيذ للأوامر", "Implement a best execution policy", "المادة 51 من لائحة أعمال الأوراق المالية", "recommended"),
    ]

    for cat, items in [
        ("governance", fm_governance), ("aml_kyc", fm_aml), ("reporting", fm_reporting),
        ("client_management", fm_client), ("risk_management", fm_risk), ("operations", fm_operations),
    ]:
        for req_ar, req_en, ref, sev in items:
            sort_order += 1
            requirements.append({
                "license_type": "fund_management",
                "category": cat,
                "requirement": req_ar,
                "requirement_en": req_en,
                "cma_reference": ref,
                "severity": sev,
                "sort_order": sort_order,
            })

    # --- brokerage -------------------------------------------------------
    bk_governance = [
        ("تعيين مسؤول التزام مرخص من الهيئة", "Appoint a CMA-licensed compliance officer", "المادة 42 من لائحة أعمال الأوراق المالية", "required"),
        ("الحفاظ على دليل إجراءات التداول", "Maintain a trading procedures manual", "المادة 43(أ) من لائحة أعمال الأوراق المالية", "required"),
        ("إشراف مجلس الإدارة على عمليات الوساطة", "Board oversight of brokerage operations", "المادة 18 من لائحة أعمال الأوراق المالية", "required"),
        ("سياسة إدارة تعارض المصالح", "Conflicts of interest management policy", "المادة 44 من لائحة أعمال الأوراق المالية", "required"),
    ]
    bk_aml = [
        ("التحقق من هوية العملاء قبل فتح الحسابات", "Verify client identity before opening accounts", "المادة 10 من لائحة مكافحة غسل الأموال", "required"),
        ("الإبلاغ عن العمليات المشبوهة خلال المدة المحددة", "Report suspicious transactions within the specified period", "المادة 16 من لائحة مكافحة غسل الأموال", "required"),
        ("فحص العملاء مقابل قوائم العقوبات", "Screen clients against sanctions lists", "المادة 12 من لائحة مكافحة غسل الأموال", "required"),
        ("حفظ سجلات المعاملات لمدة 10 سنوات", "Retain transaction records for 10 years", "المادة 14 من لائحة مكافحة غسل الأموال", "required"),
    ]
    bk_reporting = [
        ("تقديم تقارير التداول اليومية", "Submit daily trading reports", "المادة 60 من قواعد السوق", "required"),
        ("إعداد التقارير المالية الربع سنوية", "Prepare quarterly financial reports", "المادة 61 من لائحة أعمال الأوراق المالية", "required"),
        ("تقديم التقرير السنوي المراجع", "Submit the audited annual report", "المادة 62 من لائحة أعمال الأوراق المالية", "required"),
    ]
    bk_client = [
        ("تقييم مدى ملاءمة المنتجات للعملاء", "Assess product suitability for clients", "المادة 45 من لائحة أعمال الأوراق المالية", "required"),
        ("الإفصاح عن العمولات والرسوم", "Disclose commissions and fees", "المادة 46 من لائحة أعمال الأوراق المالية", "required"),
        ("معالجة شكاوى العملاء خلال 10 أيام عمل", "Handle client complaints within 10 business days", "المادة 47 من لائحة أعمال الأوراق المالية", "required"),
        ("تقديم كشوف حسابات دورية للعملاء", "Provide periodic account statements to clients", "المادة 48 من لائحة أعمال الأوراق المالية", "required"),
    ]
    bk_risk = [
        ("وضع حدود للتعرض للمخاطر", "Set risk exposure limits", "المادة 25 من لائحة أعمال الأوراق المالية", "required"),
        ("خطة استمرارية الأعمال والتعافي من الكوارث", "Business continuity and disaster recovery plan", "المادة 50 من لائحة أعمال الأوراق المالية", "required"),
        ("الالتزام بنسب كفاية رأس المال المحددة", "Comply with specified capital adequacy ratios", "المادة 52 من لائحة أعمال الأوراق المالية", "required"),
    ]
    bk_operations = [
        ("فصل أموال العملاء في حسابات مستقلة", "Segregate client funds in separate accounts", "المادة 30 من لائحة أعمال الأوراق المالية", "required"),
        ("تنفيذ سياسة أفضل تنفيذ للأوامر", "Implement best execution policy for orders", "المادة 51 من لائحة أعمال الأوراق المالية", "required"),
        ("تسوية المعاملات في الإطار الزمني المحدد", "Settle transactions within the specified timeframe", "المادة 53 من قواعد السوق", "required"),
        ("الاحتفاظ بسجلات دقيقة للأوامر والمعاملات", "Maintain accurate order and transaction records", "المادة 54 من لائحة أعمال الأوراق المالية", "required"),
    ]

    for cat, items in [
        ("governance", bk_governance), ("aml_kyc", bk_aml), ("reporting", bk_reporting),
        ("client_management", bk_client), ("risk_management", bk_risk), ("operations", bk_operations),
    ]:
        for req_ar, req_en, ref, sev in items:
            sort_order += 1
            requirements.append({
                "license_type": "brokerage",
                "category": cat,
                "requirement": req_ar,
                "requirement_en": req_en,
                "cma_reference": ref,
                "severity": sev,
                "sort_order": sort_order,
            })

    # --- advisory --------------------------------------------------------
    ad_governance = [
        ("تعيين مسؤول التزام مؤهل", "Appoint a qualified compliance officer", "المادة 42 من لائحة أعمال الأوراق المالية", "required"),
        ("إعداد دليل السياسات والإجراءات الاستشارية", "Prepare an advisory policies and procedures manual", "المادة 43 من لائحة أعمال الأوراق المالية", "required"),
        ("رقابة مجلس الإدارة على الخدمات الاستشارية", "Board oversight of advisory services", "المادة 18 من لائحة أعمال الأوراق المالية", "required"),
        ("سياسة تعارض المصالح للمستشارين", "Conflicts of interest policy for advisors", "المادة 44 من لائحة أعمال الأوراق المالية", "required"),
    ]
    ad_aml = [
        ("إجراءات العناية الواجبة للعملاء", "Customer due diligence procedures", "المادة 10 من لائحة مكافحة غسل الأموال", "required"),
        ("رصد والإبلاغ عن المعاملات المشبوهة", "Monitor and report suspicious transactions", "المادة 16 من لائحة مكافحة غسل الأموال", "required"),
        ("فحص قوائم العقوبات الدولية والمحلية", "Screen international and local sanctions lists", "المادة 12 من لائحة مكافحة غسل الأموال", "required"),
        ("الاحتفاظ بسجلات العملاء والمعاملات", "Maintain client and transaction records", "المادة 14 من لائحة مكافحة غسل الأموال", "required"),
    ]
    ad_reporting = [
        ("تقديم التقارير الدورية للهيئة", "Submit periodic reports to CMA", "المادة 61 من لائحة أعمال الأوراق المالية", "required"),
        ("إعداد التقرير السنوي المدقق", "Prepare the audited annual report", "المادة 62 من لائحة أعمال الأوراق المالية", "required"),
        ("الإبلاغ عن التغييرات الجوهرية في الوقت المناسب", "Report material changes in a timely manner", "المادة 63 من لائحة أعمال الأوراق المالية", "required"),
    ]
    ad_client = [
        ("تقييم ملاءمة الاستشارة لكل عميل", "Assess suitability of advice for each client", "المادة 45 من لائحة أعمال الأوراق المالية", "required"),
        ("الإفصاح عن أساس التوصيات المقدمة", "Disclose the basis of recommendations provided", "المادة 46(أ) من لائحة أعمال الأوراق المالية", "required"),
        ("معالجة شكاوى العملاء بشكل فعال", "Handle client complaints effectively", "المادة 47 من لائحة أعمال الأوراق المالية", "required"),
        ("توثيق جميع التوصيات الاستشارية", "Document all advisory recommendations", "المادة 48(أ) من لائحة أعمال الأوراق المالية", "required"),
    ]
    ad_risk = [
        ("تقييم المخاطر المرتبطة بالتوصيات", "Assess risks associated with recommendations", "المادة 25 من لائحة أعمال الأوراق المالية", "required"),
        ("إعداد خطة استمرارية الأعمال", "Prepare a business continuity plan", "المادة 50 من لائحة أعمال الأوراق المالية", "required"),
        ("الالتزام بمتطلبات الحد الأدنى لرأس المال", "Comply with minimum capital requirements", "المادة 52 من لائحة أعمال الأوراق المالية", "required"),
    ]
    ad_operations = [
        ("الاحتفاظ بسجلات دقيقة للتوصيات المقدمة", "Maintain accurate records of advice given", "المادة 54 من لائحة أعمال الأوراق المالية", "required"),
        ("فصل أموال العملاء إن وجدت", "Segregate client funds if applicable", "المادة 30 من لائحة أعمال الأوراق المالية", "required"),
        ("تنفيذ ضوابط أمن المعلومات", "Implement information security controls", "المادة 55 من لائحة أعمال الأوراق المالية", "recommended"),
    ]

    for cat, items in [
        ("governance", ad_governance), ("aml_kyc", ad_aml), ("reporting", ad_reporting),
        ("client_management", ad_client), ("risk_management", ad_risk), ("operations", ad_operations),
    ]:
        for req_ar, req_en, ref, sev in items:
            sort_order += 1
            requirements.append({
                "license_type": "advisory",
                "category": cat,
                "requirement": req_ar,
                "requirement_en": req_en,
                "cma_reference": ref,
                "severity": sev,
                "sort_order": sort_order,
            })

    # --- custody ---------------------------------------------------------
    cu_governance = [
        ("تعيين مسؤول التزام للحفظ الأمين", "Appoint a compliance officer for custody operations", "المادة 42 من لائحة أعمال الأوراق المالية", "required"),
        ("إعداد دليل إجراءات الحفظ الأمين", "Prepare a custody procedures manual", "المادة 43 من لائحة أعمال الأوراق المالية", "required"),
        ("رقابة مجلس الإدارة على أنشطة الحفظ", "Board oversight of custody activities", "المادة 18 من لائحة أعمال الأوراق المالية", "required"),
        ("سياسة تعارض المصالح لأنشطة الحفظ", "Conflicts of interest policy for custody activities", "المادة 44 من لائحة أعمال الأوراق المالية", "required"),
    ]
    cu_aml = [
        ("التحقق من هوية أصحاب الأصول المحفوظة", "Verify identity of asset holders in custody", "المادة 10 من لائحة مكافحة غسل الأموال", "required"),
        ("الإبلاغ عن العمليات المشبوهة المتعلقة بالأصول", "Report suspicious transactions related to assets", "المادة 16 من لائحة مكافحة غسل الأموال", "required"),
        ("فحص قوائم العقوبات بشكل دوري", "Screen sanctions lists periodically", "المادة 12 من لائحة مكافحة غسل الأموال", "required"),
        ("حفظ سجلات الأصول والمعاملات", "Maintain asset and transaction records", "المادة 14 من لائحة مكافحة غسل الأموال", "required"),
    ]
    cu_reporting = [
        ("تقديم تقارير دورية عن الأصول المحفوظة", "Submit periodic reports on custodied assets", "المادة 61 من لائحة أعمال الأوراق المالية", "required"),
        ("إعداد التقرير السنوي المدقق", "Prepare the audited annual report", "المادة 62 من لائحة أعمال الأوراق المالية", "required"),
        ("الإخطار بأي اختلاف أو نقص في الأصول", "Notify of any discrepancy or shortfall in assets", "المادة 63(أ) من لائحة أعمال الأوراق المالية", "required"),
    ]
    cu_client = [
        ("تقديم كشوف حساب دورية لأصحاب الأصول", "Provide periodic statements to asset holders", "المادة 48 من لائحة أعمال الأوراق المالية", "required"),
        ("الإفصاح عن رسوم الحفظ والخدمات", "Disclose custody fees and service charges", "المادة 46 من لائحة أعمال الأوراق المالية", "required"),
        ("معالجة شكاوى أصحاب الأصول", "Handle asset holder complaints", "المادة 47 من لائحة أعمال الأوراق المالية", "required"),
    ]
    cu_risk = [
        ("إطار إدارة مخاطر الحفظ الأمين", "Custody risk management framework", "المادة 25 من لائحة أعمال الأوراق المالية", "required"),
        ("خطة استمرارية الأعمال لعمليات الحفظ", "Business continuity plan for custody operations", "المادة 50 من لائحة أعمال الأوراق المالية", "required"),
        ("كفاية رأس المال لأنشطة الحفظ", "Capital adequacy for custody activities", "المادة 52 من لائحة أعمال الأوراق المالية", "required"),
        ("التأمين ضد المخاطر التشغيلية", "Insurance against operational risks", "المادة 53 من لائحة أعمال الأوراق المالية", "recommended"),
    ]
    cu_operations = [
        ("فصل الأصول المحفوظة عن أصول الحافظ", "Segregate custodied assets from custodian assets", "المادة 30 من لائحة أعمال الأوراق المالية", "required"),
        ("إجراء مطابقة يومية للأصول المحفوظة", "Perform daily reconciliation of custodied assets", "المادة 31(أ) من لائحة أعمال الأوراق المالية", "required"),
        ("تنفيذ ضوابط الوصول للأصول المحفوظة", "Implement access controls for custodied assets", "المادة 55 من لائحة أعمال الأوراق المالية", "required"),
        ("إجراءات تسوية إجراءات الشركات", "Corporate actions settlement procedures", "المادة 56 من لائحة أعمال الأوراق المالية", "required"),
        ("ترتيبات الحفظ الفرعي مع أطراف مؤهلة", "Sub-custody arrangements with qualified parties", "المادة 57 من لائحة أعمال الأوراق المالية", "recommended"),
    ]

    for cat, items in [
        ("governance", cu_governance), ("aml_kyc", cu_aml), ("reporting", cu_reporting),
        ("client_management", cu_client), ("risk_management", cu_risk), ("operations", cu_operations),
    ]:
        for req_ar, req_en, ref, sev in items:
            sort_order += 1
            requirements.append({
                "license_type": "custody",
                "category": cat,
                "requirement": req_ar,
                "requirement_en": req_en,
                "cma_reference": ref,
                "severity": sev,
                "sort_order": sort_order,
            })

    # Bulk insert
    supabase_admin.table("compliance_requirements").insert(requirements).execute()


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.get("/requirements", response_model=dict)
async def get_requirements(
    license_type: str = Query(..., description="License type to filter requirements"),
    user: dict = Depends(get_current_user),
):
    """Return compliance requirements for a license type, grouped by category."""
    seed_requirements()

    result = (
        supabase_admin.table("compliance_requirements")
        .select("*")
        .eq("license_type", license_type)
        .order("sort_order")
        .execute()
    )

    grouped: dict[str, list] = {}
    for req in result.data:
        cat = req["category"]
        if cat not in grouped:
            grouped[cat] = []
        grouped[cat].append(req)

    return {"license_type": license_type, "categories": grouped}


@router.post("/assessment", response_model=AssessmentOut)
async def create_assessment(
    payload: AssessmentCreate,
    user: dict = Depends(get_current_user),
):
    """Create a compliance assessment with gap analysis from Claude."""
    start = time.time()

    # Calculate scores
    total_items = len(payload.items)
    compliant_items = sum(1 for it in payload.items if it.status == "compliant")
    overall_score = round((compliant_items / total_items) * 100, 2) if total_items > 0 else 0.0

    # Insert assessment record
    assessment_data = {
        "user_id": user["id"],
        "license_type": payload.license_type,
        "overall_score": overall_score,
        "total_items": total_items,
        "compliant_items": compliant_items,
    }
    assessment_result = (
        supabase_admin.table("compliance_assessments")
        .insert(assessment_data)
        .execute()
    )
    assessment = assessment_result.data[0]
    assessment_id = assessment["id"]

    # Bulk insert assessment items
    items_to_insert = [
        {
            "assessment_id": assessment_id,
            "requirement_id": item.requirement_id,
            "status": item.status,
            "notes": item.notes,
        }
        for item in payload.items
    ]
    supabase_admin.table("assessment_items").insert(items_to_insert).execute()

    # Fetch requirement details for non-compliant / partial items
    gap_items = [it for it in payload.items if it.status in ("non_compliant", "partial")]
    gap_requirement_ids = [it.requirement_id for it in gap_items]

    gap_details = []
    if gap_requirement_ids:
        reqs_result = (
            supabase_admin.table("compliance_requirements")
            .select("*")
            .in_("id", gap_requirement_ids)
            .execute()
        )
        req_map = {r["id"]: r for r in reqs_result.data}
        for it in gap_items:
            req = req_map.get(it.requirement_id, {})
            gap_details.append({
                "requirement": req.get("requirement", ""),
                "requirement_en": req.get("requirement_en", ""),
                "category": req.get("category", ""),
                "cma_reference": req.get("cma_reference", ""),
                "severity": req.get("severity", ""),
                "status": it.status,
                "notes": it.notes,
            })

    # Call Claude for gap analysis and remediation plan
    gap_analysis = None
    remediation_plan = None

    if gap_details:
        prompt = f"""You are a Saudi CMA compliance expert. Analyze the following compliance assessment results and provide a detailed gap analysis and remediation plan.

License Type: {payload.license_type}
Overall Score: {overall_score}%
Total Items: {total_items}
Compliant Items: {compliant_items}

Non-compliant and partial items:
{json.dumps(gap_details, ensure_ascii=False, indent=2)}

Provide your response as a JSON object with two keys:
1. "gap_analysis" - A detailed analysis of the compliance gaps found, organized by category. Include the severity and CMA reference for each gap. Write in both Arabic and English.
2. "remediation_plan" - Specific, actionable remediation steps for each gap, prioritized by severity. Include timelines and responsible parties where applicable. Write in both Arabic and English.

Respond ONLY with the JSON object, no additional text."""

        try:
            response = client.messages.create(
                model=MODEL,
                max_tokens=4096,
                messages=[{"role": "user", "content": prompt}],
            )
            response_text = response.content[0].text
            parsed = json.loads(response_text)
            gap_analysis = parsed.get("gap_analysis")
            if isinstance(gap_analysis, (dict, list)):
                gap_analysis = json.dumps(gap_analysis, ensure_ascii=False)
            remediation_plan = parsed.get("remediation_plan")
            if isinstance(remediation_plan, (dict, list)):
                remediation_plan = json.dumps(remediation_plan, ensure_ascii=False)
        except Exception:
            gap_analysis = "Error generating gap analysis"
            remediation_plan = "Error generating remediation plan"

    latency_ms = int((time.time() - start) * 1000)

    # Update assessment with Claude output
    supabase_admin.table("compliance_assessments").update({
        "gap_analysis": gap_analysis,
        "remediation_plan": remediation_plan,
        "latency_ms": latency_ms,
    }).eq("id", assessment_id).execute()

    # Return final assessment
    final = (
        supabase_admin.table("compliance_assessments")
        .select("*")
        .eq("id", assessment_id)
        .single()
        .execute()
    )
    return final.data


@router.get("/assessments", response_model=list[AssessmentOut])
async def list_assessments(user: dict = Depends(get_current_user)):
    """List the current user's past compliance assessments."""
    result = (
        supabase_admin.table("compliance_assessments")
        .select("*")
        .eq("user_id", user["id"])
        .order("created_at", desc=True)
        .execute()
    )
    return result.data


@router.get("/assessments/{assessment_id}", response_model=AssessmentDetailOut)
async def get_assessment(
    assessment_id: str,
    user: dict = Depends(get_current_user),
):
    """Get a specific assessment with all its items and requirement details."""
    assessment_result = (
        supabase_admin.table("compliance_assessments")
        .select("*")
        .eq("id", assessment_id)
        .eq("user_id", user["id"])
        .single()
        .execute()
    )
    if not assessment_result.data:
        raise HTTPException(status_code=404, detail="Assessment not found")

    items_result = (
        supabase_admin.table("assessment_items")
        .select("*, compliance_requirements(*)")
        .eq("assessment_id", assessment_id)
        .execute()
    )

    return {
        **assessment_result.data,
        "items": items_result.data,
    }
