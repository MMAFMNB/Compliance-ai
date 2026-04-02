"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  ClipboardCheck,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  MinusCircle,
  ArrowRight,
  Scale,
  Loader2,
} from "lucide-react";
import { useRequireAuth } from "@/lib/useRequireAuth";
import { supabase } from "@/lib/supabase";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

type LicenseType = "fund_management" | "brokerage" | "advisory" | "custody";
type ComplianceStatus = "compliant" | "partial" | "non_compliant" | "not_applicable";

interface Requirement {
  id: string;
  text_ar: string;
  text_en: string;
  cma_reference: string;
  category: string;
}

interface AssessmentItem {
  requirement_id: string;
  status: ComplianceStatus;
  notes: string;
}

interface GapReport {
  overall_score: number;
  total_items: number;
  compliant_count: number;
  partial_count: number;
  non_compliant_count: number;
  gap_analysis: string;
  remediation_plan: string;
}

interface PastAssessment {
  id: string;
  license_type: string;
  overall_score: number;
  created_at: string;
}

const LICENSE_TYPES: { key: LicenseType; label: string }[] = [
  { key: "fund_management", label: "إدارة الصناديق" },
  { key: "brokerage", label: "الوساطة" },
  { key: "advisory", label: "الاستشارات" },
  { key: "custody", label: "الحفظ" },
];

const CATEGORY_LABELS: Record<string, { ar: string; en: string }> = {
  governance: { ar: "الحوكمة", en: "Governance" },
  aml_kyc: { ar: "مكافحة غسل الأموال", en: "AML / KYC" },
  reporting: { ar: "التقارير", en: "Reporting" },
  client_management: { ar: "إدارة العملاء", en: "Client Management" },
  risk_management: { ar: "إدارة المخاطر", en: "Risk Management" },
  operations: { ar: "العمليات", en: "Operations" },
};

const STATUS_CONFIG: Record<ComplianceStatus, { icon: typeof CheckCircle2; label: string; color: string; bg: string; border: string }> = {
  compliant: { icon: CheckCircle2, label: "✓", color: "text-emerald-600", bg: "bg-emerald-50 hover:bg-emerald-100", border: "border-emerald-300" },
  partial: { icon: AlertTriangle, label: "◐", color: "text-amber-600", bg: "bg-amber-50 hover:bg-amber-100", border: "border-amber-300" },
  non_compliant: { icon: XCircle, label: "✗", color: "text-red-600", bg: "bg-red-50 hover:bg-red-100", border: "border-red-300" },
  not_applicable: { icon: MinusCircle, label: "N/A", color: "text-slate-400", bg: "bg-slate-50 hover:bg-slate-100", border: "border-slate-300" },
};

export default function ChecklistPage() {
  const router = useRouter();
  const { user, isLoading: isAuthLoading } = useRequireAuth();

  const [selectedLicense, setSelectedLicense] = useState<LicenseType | null>(null);
  const [requirements, setRequirements] = useState<Requirement[]>([]);
  const [isLoadingReqs, setIsLoadingReqs] = useState(false);
  const [items, setItems] = useState<Record<string, AssessmentItem>>({});
  const [expandedCategories, setExpandedCategories] = useState<Record<string, boolean>>({});
  const [notesOpen, setNotesOpen] = useState<Record<string, boolean>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [gapReport, setGapReport] = useState<GapReport | null>(null);
  const [pastAssessments, setPastAssessments] = useState<PastAssessment[]>([]);
  const [showPastAssessments, setShowPastAssessments] = useState(false);
  const [isLoadingPast, setIsLoadingPast] = useState(false);

  useEffect(() => {
    if (user) fetchPastAssessments();
  }, [user]);

  useEffect(() => {
    if (selectedLicense && user) {
      fetchRequirements(selectedLicense);
    }
  }, [selectedLicense, user]);

  const getAuthHeaders = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    return { Authorization: `Bearer ${session?.access_token}` };
  };

  const fetchRequirements = async (licenseType: LicenseType) => {
    setIsLoadingReqs(true);
    setGapReport(null);
    setItems({});
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`${API_URL}/api/checklist/requirements?license_type=${licenseType}`, { headers });
      if (!res.ok) throw new Error(`${res.status}`);
      const data = await res.json();
      setRequirements(data.requirements || []);
      const allCategories: Record<string, boolean> = {};
      (data.requirements || []).forEach((r: Requirement) => {
        allCategories[r.category] = true;
      });
      setExpandedCategories(allCategories);
    } catch (err) {
      console.error("Failed to fetch requirements:", err);
    } finally {
      setIsLoadingReqs(false);
    }
  };

  const fetchPastAssessments = async () => {
    setIsLoadingPast(true);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`${API_URL}/api/checklist/assessments`, { headers });
      if (!res.ok) throw new Error(`${res.status}`);
      const data = await res.json();
      setPastAssessments(data.assessments || []);
    } catch (err) {
      console.error("Failed to fetch past assessments:", err);
    } finally {
      setIsLoadingPast(false);
    }
  };

  const setItemStatus = (reqId: string, status: ComplianceStatus) => {
    setItems((prev) => ({
      ...prev,
      [reqId]: {
        requirement_id: reqId,
        status,
        notes: prev[reqId]?.notes || "",
      },
    }));
  };

  const setItemNotes = (reqId: string, notes: string) => {
    setItems((prev) => ({
      ...prev,
      [reqId]: {
        ...prev[reqId],
        requirement_id: reqId,
        notes,
        status: prev[reqId]?.status || "non_compliant",
      },
    }));
  };

  const toggleCategory = (category: string) => {
    setExpandedCategories((prev) => ({ ...prev, [category]: !prev[category] }));
  };

  const toggleNotes = (reqId: string) => {
    setNotesOpen((prev) => ({ ...prev, [reqId]: !prev[reqId] }));
  };

  const handleSubmit = async () => {
    if (!selectedLicense) return;
    setIsSubmitting(true);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`${API_URL}/api/checklist/assessment`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({
          license_type: selectedLicense,
          items: Object.values(items),
        }),
      });
      if (!res.ok) throw new Error(`${res.status}`);
      const data: GapReport = await res.json();
      setGapReport(data);
      fetchPastAssessments();
    } catch (err) {
      console.error("Failed to submit assessment:", err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleNewAssessment = () => {
    setGapReport(null);
    setSelectedLicense(null);
    setRequirements([]);
    setItems({});
  };

  const groupedRequirements = requirements.reduce<Record<string, Requirement[]>>((acc, req) => {
    if (!acc[req.category]) acc[req.category] = [];
    acc[req.category].push(req);
    return acc;
  }, {});

  const scoreColor = (score: number) =>
    score > 80 ? "text-emerald-600" : score > 60 ? "text-amber-600" : "text-red-600";

  const scoreBg = (score: number) =>
    score > 80 ? "bg-emerald-50" : score > 60 ? "bg-amber-50" : "bg-red-50";

  if (isAuthLoading || !user) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Loader2 size={32} className="animate-spin text-tam-light" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200 px-6 py-4">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => router.push("/")}
              className="text-slate-400 hover:text-tam-primary transition-colors"
              aria-label="Back to chat"
            >
              <ArrowRight size={20} />
            </button>
            <div>
              <h1 className="text-sm font-semibold text-tam-primary">
                قائمة الامتثال وتحليل الفجوات
              </h1>
              <p className="text-[11px] text-slate-400">
                Compliance Checklist &amp; Gap Analysis
              </p>
            </div>
          </div>
          <div className="w-8 h-8 bg-gradient-to-br from-tam-accent to-tam-light rounded-lg flex items-center justify-center">
            <Scale size={16} className="text-white" />
          </div>
        </div>
      </header>

      <div className="max-w-4xl mx-auto p-6">
        {/* License Type Selector */}
        {!gapReport && (
          <div className="mb-6">
            <p className="text-xs text-slate-500 mb-3">اختر نوع الترخيص — Select License Type</p>
            <div className="flex flex-wrap gap-2">
              {LICENSE_TYPES.map((lt) => (
                <button
                  key={lt.key}
                  onClick={() => setSelectedLicense(lt.key)}
                  className={`px-4 py-2.5 rounded-xl text-sm font-medium transition-all ${
                    selectedLicense === lt.key
                      ? "bg-tam-primary text-white shadow-sm"
                      : "bg-white text-slate-600 border border-slate-200 hover:border-tam-light"
                  }`}
                >
                  {lt.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Loading Requirements */}
        {isLoadingReqs && (
          <div className="text-center py-12">
            <Loader2 size={24} className="animate-spin text-tam-light mx-auto mb-3" />
            <p className="text-sm text-slate-500">جاري تحميل المتطلبات...</p>
          </div>
        )}

        {/* Requirements Section */}
        {!isLoadingReqs && !gapReport && selectedLicense && requirements.length > 0 && (
          <div className="space-y-4 mb-6">
            {Object.entries(groupedRequirements).map(([category, reqs]) => {
              const catLabel = CATEGORY_LABELS[category] || { ar: category, en: category };
              const isExpanded = expandedCategories[category];
              return (
                <div key={category} className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                  <button
                    onClick={() => toggleCategory(category)}
                    className="w-full px-5 py-4 flex items-center justify-between text-right hover:bg-slate-50 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <ClipboardCheck size={16} className="text-tam-light" />
                      <div>
                        <p className="text-sm font-semibold text-tam-primary">{catLabel.ar}</p>
                        <p className="text-[10px] text-slate-400">{catLabel.en}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full">
                        {reqs.length}
                      </span>
                      {isExpanded ? <ChevronUp size={16} className="text-slate-400" /> : <ChevronDown size={16} className="text-slate-400" />}
                    </div>
                  </button>
                  {isExpanded && (
                    <div className="border-t border-slate-100">
                      {reqs.map((req) => {
                        const currentStatus = items[req.id]?.status;
                        return (
                          <div key={req.id} className="px-5 py-4 border-b border-slate-50 last:border-b-0">
                            <div className="flex items-start gap-4">
                              <div className="flex-1 min-w-0">
                                <p dir="auto" className="text-sm text-slate-700 leading-7 mb-1">
                                  {req.text_ar}
                                </p>
                                <p className="text-xs text-slate-400 leading-5 mb-2">
                                  {req.text_en}
                                </p>
                                <span className="text-[10px] bg-blue-50 text-blue-700 px-2 py-0.5 rounded">
                                  {req.cma_reference}
                                </span>
                              </div>
                              <div className="flex items-center gap-1 flex-shrink-0">
                                {(Object.keys(STATUS_CONFIG) as ComplianceStatus[]).map((status) => {
                                  const config = STATUS_CONFIG[status];
                                  const isActive = currentStatus === status;
                                  return (
                                    <button
                                      key={status}
                                      onClick={() => setItemStatus(req.id, status)}
                                      className={`w-9 h-9 rounded-lg text-xs font-medium flex items-center justify-center transition-all border ${
                                        isActive
                                          ? `${config.bg} ${config.color} ${config.border}`
                                          : "bg-white text-slate-300 border-slate-200 hover:border-slate-300"
                                      }`}
                                      title={status}
                                    >
                                      {config.label}
                                    </button>
                                  );
                                })}
                              </div>
                            </div>
                            <div className="mt-2">
                              <button
                                onClick={() => toggleNotes(req.id)}
                                className="text-[10px] text-tam-light hover:text-tam-primary transition-colors"
                              >
                                {notesOpen[req.id] ? "إخفاء الملاحظات" : "إضافة ملاحظات"}
                              </button>
                              {notesOpen[req.id] && (
                                <textarea
                                  value={items[req.id]?.notes || ""}
                                  onChange={(e) => setItemNotes(req.id, e.target.value)}
                                  placeholder="ملاحظات إضافية... — Additional notes..."
                                  dir="auto"
                                  className="mt-2 w-full text-xs border border-slate-200 rounded-lg p-3 focus:outline-none focus:border-tam-light resize-none leading-6"
                                  rows={2}
                                />
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}

            {/* Submit Button */}
            <button
              onClick={handleSubmit}
              disabled={isSubmitting || Object.keys(items).length === 0}
              className="w-full py-3 bg-tam-primary text-white rounded-xl text-sm font-medium hover:bg-tam-secondary disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
            >
              {isSubmitting ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  جاري التحليل بالذكاء الاصطناعي...
                </>
              ) : (
                <>
                  <ClipboardCheck size={16} />
                  إرسال التقييم — Submit Assessment
                </>
              )}
            </button>
          </div>
        )}

        {/* Gap Report Panel */}
        {gapReport && (
          <div className="space-y-4 mb-6">
            {/* Overall Score */}
            <div className={`${scoreBg(gapReport.overall_score)} border border-slate-200 rounded-xl p-6 text-center`}>
              <p className={`text-5xl font-bold ${scoreColor(gapReport.overall_score)}`}>
                {gapReport.overall_score}
              </p>
              <p className="text-sm text-slate-500 mt-2">درجة الامتثال — Compliance Score</p>
            </div>

            {/* Stats Bar */}
            <div className="grid grid-cols-4 gap-3">
              <div className="bg-white border border-slate-200 rounded-xl p-3 text-center">
                <p className="text-xl font-bold text-slate-700">{gapReport.total_items}</p>
                <p className="text-[10px] text-slate-500">الإجمالي</p>
              </div>
              <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 text-center">
                <p className="text-xl font-bold text-emerald-600">{gapReport.compliant_count}</p>
                <p className="text-[10px] text-emerald-600">متوافق</p>
              </div>
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-center">
                <p className="text-xl font-bold text-amber-600">{gapReport.partial_count}</p>
                <p className="text-[10px] text-amber-600">جزئي</p>
              </div>
              <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-center">
                <p className="text-xl font-bold text-red-600">{gapReport.non_compliant_count}</p>
                <p className="text-[10px] text-red-600">غير متوافق</p>
              </div>
            </div>

            {/* Gap Analysis */}
            <div className="bg-white border border-slate-200 rounded-xl p-5">
              <h3 className="text-sm font-semibold text-tam-primary mb-3 flex items-center gap-2">
                <AlertTriangle size={14} />
                تحليل الفجوات — Gap Analysis
              </h3>
              <div
                dir="auto"
                className="text-sm text-slate-700 leading-7 whitespace-pre-line bg-slate-50 rounded-lg p-4"
              >
                {gapReport.gap_analysis}
              </div>
            </div>

            {/* Remediation Plan */}
            <div className="bg-white border border-slate-200 rounded-xl p-5">
              <h3 className="text-sm font-semibold text-tam-primary mb-3 flex items-center gap-2">
                <CheckCircle2 size={14} />
                خطة المعالجة — Remediation Plan
              </h3>
              <div
                dir="auto"
                className="text-sm text-slate-700 leading-7 whitespace-pre-line bg-slate-50 rounded-lg p-4"
              >
                {gapReport.remediation_plan}
              </div>
            </div>

            {/* New Assessment Button */}
            <button
              onClick={handleNewAssessment}
              className="w-full py-3 bg-white text-tam-primary border border-tam-primary rounded-xl text-sm font-medium hover:bg-tam-primary hover:text-white transition-colors flex items-center justify-center gap-2"
            >
              <ClipboardCheck size={16} />
              تقييم جديد — New Assessment
            </button>
          </div>
        )}

        {/* Past Assessments */}
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <button
            onClick={() => setShowPastAssessments(!showPastAssessments)}
            className="w-full px-5 py-4 flex items-center justify-between text-right hover:bg-slate-50 transition-colors"
          >
            <div className="flex items-center gap-3">
              <ClipboardCheck size={16} className="text-slate-400" />
              <div>
                <p className="text-sm font-semibold text-tam-primary">التقييمات السابقة</p>
                <p className="text-[10px] text-slate-400">Past Assessments</p>
              </div>
            </div>
            {showPastAssessments ? <ChevronUp size={16} className="text-slate-400" /> : <ChevronDown size={16} className="text-slate-400" />}
          </button>
          {showPastAssessments && (
            <div className="border-t border-slate-100">
              {isLoadingPast && (
                <div className="text-center py-6">
                  <Loader2 size={16} className="animate-spin text-tam-light mx-auto" />
                </div>
              )}
              {!isLoadingPast && pastAssessments.length === 0 && (
                <p className="text-xs text-slate-400 text-center py-6">
                  لا توجد تقييمات سابقة
                </p>
              )}
              {!isLoadingPast && pastAssessments.length > 0 && (
                <div className="divide-y divide-slate-50">
                  {pastAssessments.map((assessment) => (
                    <div key={assessment.id} className="px-5 py-3 flex items-center justify-between">
                      <div>
                        <p className="text-xs text-slate-600">
                          {LICENSE_TYPES.find((lt) => lt.key === assessment.license_type)?.label || assessment.license_type}
                        </p>
                        <p className="text-[10px] text-slate-400">
                          {new Date(assessment.created_at).toLocaleString("ar-SA", {
                            dateStyle: "short",
                            timeStyle: "short",
                          })}
                        </p>
                      </div>
                      <span
                        className={`text-sm font-bold ${scoreColor(assessment.overall_score)}`}
                      >
                        {assessment.overall_score}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
