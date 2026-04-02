"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  FileText,
  Loader2,
  Plus,
  Search,
  Shield,
  TrendingUp,
  Clock,
  User,
  DollarSign,
  MapPin,
} from "lucide-react";
import { useRequireAuth } from "@/lib/useRequireAuth";
import { supabase } from "@/lib/supabase";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

type AMLCaseStatus = "open" | "under_review" | "escalated" | "closed";
type CasePriority = "low" | "medium" | "high" | "critical";
type CaseType = "kyc_failure" | "unusual_activity" | "pep" | "sanctions" | "other";
type SubjectType = "individual" | "corporate" | "legal_entity";
type IDType = "passport" | "national_id" | "driver_license" | "other";

interface AMLCase {
  id: string;
  case_number: string;
  case_type: CaseType;
  status: AMLCaseStatus;
  priority: CasePriority;
  subject_name: string;
  subject_name_ar: string;
  subject_type: SubjectType;
  subject_id_type: IDType;
  subject_id_number: string;
  subject_account_number: string;
  assigned_to: string;
  title: string;
  title_ar: string;
  description: string;
  description_ar: string;
  total_amount: number;
  currency: string;
  transaction_date: string;
  created_at: string;
  updated_at: string;
  evidence: Evidence[];
}

interface Evidence {
  id: string;
  case_id: string;
  file_name: string;
  file_type: string;
  description: string;
  uploaded_at: string;
}

interface ScreeningResult {
  match_found: boolean;
  match_score: number;
  match_details?: string;
  screening_date: string;
}

interface STRReport {
  id: string;
  case_id: string;
  report_text: string;
  report_text_ar: string;
  generated_at: string;
  status: "draft" | "submitted";
}

const STATUS_CONFIG: Record<AMLCaseStatus, { label: string; color: string; bg: string; border: string }> = {
  open: { label: "مفتوح — Open", color: "text-blue-600", bg: "bg-blue-50", border: "border-blue-200" },
  under_review: { label: "قيد المراجعة — Under Review", color: "text-amber-600", bg: "bg-amber-50", border: "border-amber-200" },
  escalated: { label: "مصعد — Escalated", color: "text-red-600", bg: "bg-red-50", border: "border-red-200" },
  closed: { label: "مغلق — Closed", color: "text-emerald-600", bg: "bg-emerald-50", border: "border-emerald-200" },
};

const PRIORITY_CONFIG: Record<CasePriority, { label: string; color: string }> = {
  low: { label: "منخفضة — Low", color: "text-slate-600" },
  medium: { label: "متوسطة — Medium", color: "text-amber-600" },
  high: { label: "عالية — High", color: "text-orange-600" },
  critical: { label: "حرجة — Critical", color: "text-red-600" },
};

const CASE_TYPES: { key: CaseType; label: string }[] = [
  { key: "kyc_failure", label: "فشل التحقق من الهوية" },
  { key: "unusual_activity", label: "نشاط غير معتاد" },
  { key: "pep", label: "شخصية سياسية بارزة" },
  { key: "sanctions", label: "قوائم العقوبات" },
  { key: "other", label: "أخرى" },
];

const ID_TYPES: { key: IDType; label: string }[] = [
  { key: "passport", label: "جواز سفر" },
  { key: "national_id", label: "بطاقة هوية وطنية" },
  { key: "driver_license", label: "رخصة قيادة" },
  { key: "other", label: "أخرى" },
];

const SUBJECT_TYPES: { key: SubjectType; label: string }[] = [
  { key: "individual", label: "فرد" },
  { key: "corporate", label: "شركة" },
  { key: "legal_entity", label: "كيان قانوني" },
];

export default function AMLPage() {
  const router = useRouter();
  const { user, isLoading: isAuthLoading } = useRequireAuth();

  const [view, setView] = useState<"list" | "new" | "detail">("list");
  const [cases, setCases] = useState<AMLCase[]>([]);
  const [isLoadingCases, setIsLoadingCases] = useState(false);
  const [selectedCase, setSelectedCase] = useState<AMLCase | null>(null);

  const [statusFilter, setStatusFilter] = useState<AMLCaseStatus | "">("");
  const [priorityFilter, setPriorityFilter] = useState<CasePriority | "">("");
  const [typeFilter, setTypeFilter] = useState<CaseType | "">("");
  const [searchTerm, setSearchTerm] = useState("");

  // New case form
  const [formData, setFormData] = useState({
    case_type: "" as CaseType | "",
    priority: "" as CasePriority | "",
    subject_name: "",
    subject_name_ar: "",
    subject_type: "" as SubjectType | "",
    subject_id_type: "" as IDType | "",
    subject_id_number: "",
    subject_account_number: "",
    title: "",
    title_ar: "",
    description: "",
    description_ar: "",
    total_amount: "",
    currency: "USD",
    transaction_date: "",
  });

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showScreening, setShowScreening] = useState(false);
  const [screeningResult, setScreeningResult] = useState<ScreeningResult | null>(null);
  const [isScreening, setIsScreening] = useState(false);
  const [strReport, setSTRReport] = useState<STRReport | null>(null);
  const [isGeneratingSTR, setIsGeneratingSTR] = useState(false);
  const [showAddEvidence, setShowAddEvidence] = useState(false);

  useEffect(() => {
    if (user) fetchCases();
  }, [user]);

  const getAuthHeaders = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    return { Authorization: `Bearer ${session?.access_token}` };
  };

  const fetchCases = async () => {
    setIsLoadingCases(true);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`${API_URL}/api/aml/cases`, { headers });
      if (!res.ok) throw new Error(`${res.status}`);
      const data = await res.json();
      setCases(data.cases || []);
    } catch (err) {
      console.error("Failed to fetch cases:", err);
    } finally {
      setIsLoadingCases(false);
    }
  };

  const handleNewCase = async () => {
    if (!formData.case_type || !formData.priority || !formData.subject_name) {
      alert("يرجى ملء جميع الحقول المطلوبة — Please fill all required fields");
      return;
    }

    setIsSubmitting(true);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`${API_URL}/api/aml/cases`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({
          ...formData,
          total_amount: parseFloat(formData.total_amount) || 0,
        }),
      });
      if (!res.ok) throw new Error(`${res.status}`);
      const newCase = await res.json();
      setCases([newCase, ...cases]);
      setView("list");
      setFormData({
        case_type: "",
        priority: "",
        subject_name: "",
        subject_name_ar: "",
        subject_type: "",
        subject_id_type: "",
        subject_id_number: "",
        subject_account_number: "",
        title: "",
        title_ar: "",
        description: "",
        description_ar: "",
        total_amount: "",
        currency: "USD",
        transaction_date: "",
      });
    } catch (err) {
      console.error("Failed to create case:", err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleScreening = async () => {
    if (!selectedCase) return;
    setIsScreening(true);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`${API_URL}/api/screening/screen`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ subject_name: selectedCase.subject_name }),
      });
      if (!res.ok) throw new Error(`${res.status}`);
      const result = await res.json();
      setScreeningResult(result);
    } catch (err) {
      console.error("Failed to screen subject:", err);
    } finally {
      setIsScreening(false);
    }
  };

  const handleGenerateSTR = async () => {
    if (!selectedCase) return;
    setIsGeneratingSTR(true);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`${API_URL}/api/str/generate/${selectedCase.id}`, {
        method: "POST",
        headers,
      });
      if (!res.ok) throw new Error(`${res.status}`);
      const report = await res.json();
      setSTRReport(report);
    } catch (err) {
      console.error("Failed to generate STR:", err);
    } finally {
      setIsGeneratingSTR(false);
    }
  };

  const handleCloseCase = async () => {
    if (!selectedCase) return;
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`${API_URL}/api/aml/cases/${selectedCase.id}`, {
        method: "PATCH",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ status: "closed" }),
      });
      if (!res.ok) throw new Error(`${res.status}`);
      const updatedCase = await res.json();
      setCases(cases.map((c) => (c.id === updatedCase.id ? updatedCase : c)));
      setSelectedCase(updatedCase);
    } catch (err) {
      console.error("Failed to close case:", err);
    }
  };

  const handleEscalate = async () => {
    if (!selectedCase) return;
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`${API_URL}/api/aml/cases/${selectedCase.id}`, {
        method: "PATCH",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ status: "escalated" }),
      });
      if (!res.ok) throw new Error(`${res.status}`);
      const updatedCase = await res.json();
      setCases(cases.map((c) => (c.id === updatedCase.id ? updatedCase : c)));
      setSelectedCase(updatedCase);
    } catch (err) {
      console.error("Failed to escalate case:", err);
    }
  };

  const filteredCases = cases.filter((c) => {
    const matchStatus = !statusFilter || c.status === statusFilter;
    const matchPriority = !priorityFilter || c.priority === priorityFilter;
    const matchType = !typeFilter || c.case_type === typeFilter;
    const matchSearch =
      !searchTerm ||
      c.case_number.includes(searchTerm) ||
      c.subject_name.includes(searchTerm) ||
      c.subject_name_ar.includes(searchTerm);
    return matchStatus && matchPriority && matchType && matchSearch;
  });

  const stats = {
    open: cases.filter((c) => c.status === "open").length,
    under_review: cases.filter((c) => c.status === "under_review").length,
    escalated: cases.filter((c) => c.status === "escalated").length,
    closed: cases.filter((c) => c.status === "closed").length,
  };

  if (isAuthLoading || !user) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Loader2 size={32} className="animate-spin text-tam-light" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 px-6 py-4">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
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
                إدارة قضايا مكافحة غسل الأموال
              </h1>
              <p className="text-[11px] text-slate-400">
                AML Case Management
              </p>
            </div>
          </div>
          <div className="w-8 h-8 bg-gradient-to-br from-tam-accent to-tam-light rounded-lg flex items-center justify-center">
            <Shield size={16} className="text-white" />
          </div>
        </div>
      </header>

      <div className="max-w-6xl mx-auto p-6">
        {view === "list" && (
          <>
            {/* Stats Bar */}
            <div className="grid grid-cols-4 gap-3 mb-6">
              <div className="bg-white border border-slate-200 rounded-xl p-4">
                <p className="text-2xl font-bold text-blue-600">{stats.open}</p>
                <p className="text-xs text-slate-500 mt-1">مفتوح — Open</p>
              </div>
              <div className="bg-white border border-slate-200 rounded-xl p-4">
                <p className="text-2xl font-bold text-amber-600">{stats.under_review}</p>
                <p className="text-xs text-slate-500 mt-1">قيد المراجعة — Under Review</p>
              </div>
              <div className="bg-white border border-slate-200 rounded-xl p-4">
                <p className="text-2xl font-bold text-red-600">{stats.escalated}</p>
                <p className="text-xs text-slate-500 mt-1">مصعد — Escalated</p>
              </div>
              <div className="bg-white border border-slate-200 rounded-xl p-4">
                <p className="text-2xl font-bold text-emerald-600">{stats.closed}</p>
                <p className="text-xs text-slate-500 mt-1">مغلق — Closed</p>
              </div>
            </div>

            {/* Filters & Controls */}
            <div className="bg-white border border-slate-200 rounded-xl p-4 mb-6">
              <div className="grid grid-cols-5 gap-3">
                <div className="col-span-2">
                  <input
                    type="text"
                    placeholder="بحث عن قضية... — Search case..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full text-xs border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-tam-light"
                  />
                </div>
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value as AMLCaseStatus | "")}
                  className="text-xs border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-tam-light"
                >
                  <option value="">جميع الحالات — All Status</option>
                  <option value="open">مفتوح</option>
                  <option value="under_review">قيد المراجعة</option>
                  <option value="escalated">مصعد</option>
                  <option value="closed">مغلق</option>
                </select>
                <select
                  value={priorityFilter}
                  onChange={(e) => setPriorityFilter(e.target.value as CasePriority | "")}
                  className="text-xs border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-tam-light"
                >
                  <option value="">جميع الأولويات — All Priority</option>
                  <option value="low">منخفضة</option>
                  <option value="medium">متوسطة</option>
                  <option value="high">عالية</option>
                  <option value="critical">حرجة</option>
                </select>
                <select
                  value={typeFilter}
                  onChange={(e) => setTypeFilter(e.target.value as CaseType | "")}
                  className="text-xs border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-tam-light"
                >
                  <option value="">جميع الأنواع — All Type</option>
                  {CASE_TYPES.map((ct) => (
                    <option key={ct.key} value={ct.key}>{ct.label}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* New Case Button */}
            <button
              onClick={() => setView("new")}
              className="mb-6 px-4 py-2.5 bg-tam-primary text-white rounded-xl text-sm font-medium hover:bg-tam-secondary transition-colors flex items-center gap-2"
            >
              <Plus size={16} />
              قضية جديدة — New Case
            </button>

            {/* Cases Loading */}
            {isLoadingCases && (
              <div className="text-center py-12">
                <Loader2 size={24} className="animate-spin text-tam-light mx-auto mb-3" />
                <p className="text-sm text-slate-500">جاري تحميل القضايا...</p>
              </div>
            )}

            {/* Cases Table */}
            {!isLoadingCases && filteredCases.length === 0 && (
              <div className="bg-white border border-slate-200 rounded-xl p-8 text-center">
                <Shield size={32} className="text-slate-300 mx-auto mb-3" />
                <p className="text-sm text-slate-500">لا توجد قضايا — No cases found</p>
              </div>
            )}

            {!isLoadingCases && filteredCases.length > 0 && (
              <div className="space-y-2">
                {filteredCases.map((caseItem) => (
                  <div
                    key={caseItem.id}
                    onClick={() => {
                      setSelectedCase(caseItem);
                      setView("detail");
                      setScreeningResult(null);
                      setSTRReport(null);
                    }}
                    className="bg-white border border-slate-200 rounded-xl p-4 hover:shadow-md cursor-pointer transition-all"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                          <p className="text-sm font-semibold text-slate-900">{caseItem.case_number}</p>
                          <span className={`text-xs px-2 py-1 rounded-full border ${STATUS_CONFIG[caseItem.status].bg} ${STATUS_CONFIG[caseItem.status].color} ${STATUS_CONFIG[caseItem.status].border}`}>
                            {STATUS_CONFIG[caseItem.status].label}
                          </span>
                          <span className={`text-xs px-2 py-1 rounded-full bg-slate-100 ${PRIORITY_CONFIG[caseItem.priority].color}`}>
                            {PRIORITY_CONFIG[caseItem.priority].label}
                          </span>
                        </div>
                        <p className="text-xs text-slate-600 mb-2 dir-rtl">{caseItem.subject_name_ar} — {caseItem.subject_name}</p>
                        <div className="flex items-center gap-4 text-[10px] text-slate-500">
                          <span className="flex items-center gap-1">
                            <FileText size={12} />
                            {CASE_TYPES.find((ct) => ct.key === caseItem.case_type)?.label}
                          </span>
                          <span className="flex items-center gap-1">
                            <User size={12} />
                            {caseItem.assigned_to || "غير مخصص"}
                          </span>
                          <span className="flex items-center gap-1">
                            <Clock size={12} />
                            {new Date(caseItem.created_at).toLocaleDateString("ar-SA")}
                          </span>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-xs font-semibold text-slate-600">{caseItem.currency} {caseItem.total_amount.toLocaleString()}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {view === "new" && (
          <div className="bg-white border border-slate-200 rounded-xl p-6">
            <div className="flex items-center gap-2 mb-6">
              <button
                onClick={() => setView("list")}
                className="text-slate-400 hover:text-tam-primary transition-colors"
              >
                <ArrowRight size={20} />
              </button>
              <h2 className="text-sm font-semibold text-tam-primary">قضية جديدة — New Case</h2>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-medium text-slate-600 mb-2 block">نوع القضية *</label>
                <select
                  value={formData.case_type}
                  onChange={(e) => setFormData({ ...formData, case_type: e.target.value as CaseType })}
                  className="w-full text-xs border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-tam-light"
                >
                  <option value="">اختر نوع القضية</option>
                  {CASE_TYPES.map((ct) => (
                    <option key={ct.key} value={ct.key}>{ct.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-slate-600 mb-2 block">الأولوية *</label>
                <select
                  value={formData.priority}
                  onChange={(e) => setFormData({ ...formData, priority: e.target.value as CasePriority })}
                  className="w-full text-xs border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-tam-light"
                >
                  <option value="">اختر الأولوية</option>
                  <option value="low">منخفضة</option>
                  <option value="medium">متوسطة</option>
                  <option value="high">عالية</option>
                  <option value="critical">حرجة</option>
                </select>
              </div>

              <div>
                <label className="text-xs font-medium text-slate-600 mb-2 block">اسم الموضوع (AR) *</label>
                <input
                  type="text"
                  value={formData.subject_name_ar}
                  onChange={(e) => setFormData({ ...formData, subject_name_ar: e.target.value })}
                  placeholder="الاسم بالعربية"
                  className="w-full text-xs border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-tam-light"
                  dir="rtl"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-600 mb-2 block">Subject Name (EN) *</label>
                <input
                  type="text"
                  value={formData.subject_name}
                  onChange={(e) => setFormData({ ...formData, subject_name: e.target.value })}
                  placeholder="English name"
                  className="w-full text-xs border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-tam-light"
                />
              </div>

              <div>
                <label className="text-xs font-medium text-slate-600 mb-2 block">نوع الموضوع</label>
                <select
                  value={formData.subject_type}
                  onChange={(e) => setFormData({ ...formData, subject_type: e.target.value as SubjectType })}
                  className="w-full text-xs border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-tam-light"
                >
                  <option value="">اختر نوع الموضوع</option>
                  {SUBJECT_TYPES.map((st) => (
                    <option key={st.key} value={st.key}>{st.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-slate-600 mb-2 block">نوع الهوية</label>
                <select
                  value={formData.subject_id_type}
                  onChange={(e) => setFormData({ ...formData, subject_id_type: e.target.value as IDType })}
                  className="w-full text-xs border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-tam-light"
                >
                  <option value="">اختر نوع الهوية</option>
                  {ID_TYPES.map((it) => (
                    <option key={it.key} value={it.key}>{it.label}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs font-medium text-slate-600 mb-2 block">رقم الهوية</label>
                <input
                  type="text"
                  value={formData.subject_id_number}
                  onChange={(e) => setFormData({ ...formData, subject_id_number: e.target.value })}
                  className="w-full text-xs border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-tam-light"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-600 mb-2 block">رقم الحساب</label>
                <input
                  type="text"
                  value={formData.subject_account_number}
                  onChange={(e) => setFormData({ ...formData, subject_account_number: e.target.value })}
                  className="w-full text-xs border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-tam-light"
                />
              </div>

              <div className="col-span-2">
                <label className="text-xs font-medium text-slate-600 mb-2 block">العنوان (AR)</label>
                <input
                  type="text"
                  value={formData.title_ar}
                  onChange={(e) => setFormData({ ...formData, title_ar: e.target.value })}
                  placeholder="العنوان بالعربية"
                  className="w-full text-xs border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-tam-light"
                  dir="rtl"
                />
              </div>
              <div className="col-span-2">
                <label className="text-xs font-medium text-slate-600 mb-2 block">Title (EN)</label>
                <input
                  type="text"
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  placeholder="English title"
                  className="w-full text-xs border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-tam-light"
                />
              </div>

              <div className="col-span-2">
                <label className="text-xs font-medium text-slate-600 mb-2 block">الوصف (AR)</label>
                <textarea
                  value={formData.description_ar}
                  onChange={(e) => setFormData({ ...formData, description_ar: e.target.value })}
                  placeholder="الوصف بالعربية"
                  dir="rtl"
                  rows={3}
                  className="w-full text-xs border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-tam-light resize-none"
                />
              </div>
              <div className="col-span-2">
                <label className="text-xs font-medium text-slate-600 mb-2 block">Description (EN)</label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="English description"
                  rows={3}
                  className="w-full text-xs border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-tam-light resize-none"
                />
              </div>

              <div>
                <label className="text-xs font-medium text-slate-600 mb-2 block">المبلغ الإجمالي</label>
                <input
                  type="number"
                  value={formData.total_amount}
                  onChange={(e) => setFormData({ ...formData, total_amount: e.target.value })}
                  placeholder="0.00"
                  className="w-full text-xs border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-tam-light"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-600 mb-2 block">العملة</label>
                <select
                  value={formData.currency}
                  onChange={(e) => setFormData({ ...formData, currency: e.target.value })}
                  className="w-full text-xs border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-tam-light"
                >
                  <option value="USD">USD</option>
                  <option value="EUR">EUR</option>
                  <option value="SAR">SAR</option>
                  <option value="AED">AED</option>
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-slate-600 mb-2 block">تاريخ المعاملة</label>
                <input
                  type="date"
                  value={formData.transaction_date}
                  onChange={(e) => setFormData({ ...formData, transaction_date: e.target.value })}
                  className="w-full text-xs border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-tam-light"
                />
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={handleNewCase}
                disabled={isSubmitting}
                className="flex-1 py-2.5 bg-tam-primary text-white rounded-xl text-sm font-medium hover:bg-tam-secondary disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    جاري الإنشاء...
                  </>
                ) : (
                  <>
                    <Plus size={16} />
                    إنشاء القضية — Create Case
                  </>
                )}
              </button>
              <button
                onClick={() => setView("list")}
                className="flex-1 py-2.5 bg-white text-slate-600 border border-slate-200 rounded-xl text-sm font-medium hover:bg-slate-50 transition-colors"
              >
                إلغاء — Cancel
              </button>
            </div>
          </div>
        )}

        {view === "detail" && selectedCase && (
          <div className="space-y-4">
            {/* Case Header */}
            <div className="bg-white border border-slate-200 rounded-xl p-6">
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => setView("list")}
                    className="text-slate-400 hover:text-tam-primary transition-colors"
                  >
                    <ArrowRight size={20} />
                  </button>
                  <div>
                    <h2 className="text-sm font-semibold text-slate-900">{selectedCase.case_number}</h2>
                    <p className="text-xs text-slate-400">{selectedCase.title}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`text-xs px-3 py-1 rounded-full border ${STATUS_CONFIG[selectedCase.status].bg} ${STATUS_CONFIG[selectedCase.status].color} ${STATUS_CONFIG[selectedCase.status].border}`}>
                    {STATUS_CONFIG[selectedCase.status].label}
                  </span>
                  <span className={`text-xs px-3 py-1 rounded-full bg-slate-100 ${PRIORITY_CONFIG[selectedCase.priority].color}`}>
                    {PRIORITY_CONFIG[selectedCase.priority].label}
                  </span>
                </div>
              </div>
            </div>

            {/* Subject Info */}
            <div className="bg-white border border-slate-200 rounded-xl p-5">
              <h3 className="text-sm font-semibold text-tam-primary mb-4 flex items-center gap-2">
                <User size={14} />
                معلومات الموضوع — Subject Information
              </h3>
              <div className="grid grid-cols-2 gap-4 text-xs">
                <div>
                  <p className="text-slate-500 mb-1">الاسم</p>
                  <p className="font-medium text-slate-900 dir-rtl">{selectedCase.subject_name_ar}</p>
                  <p className="text-slate-600">{selectedCase.subject_name}</p>
                </div>
                <div>
                  <p className="text-slate-500 mb-1">نوع الموضوع</p>
                  <p className="font-medium text-slate-900">
                    {SUBJECT_TYPES.find((st) => st.key === selectedCase.subject_type)?.label}
                  </p>
                </div>
                <div>
                  <p className="text-slate-500 mb-1">نوع الهوية</p>
                  <p className="font-medium text-slate-900">
                    {ID_TYPES.find((it) => it.key === selectedCase.subject_id_type)?.label}
                  </p>
                </div>
                <div>
                  <p className="text-slate-500 mb-1">رقم الهوية</p>
                  <p className="font-medium text-slate-900">{selectedCase.subject_id_number}</p>
                </div>
                <div>
                  <p className="text-slate-500 mb-1">رقم الحساب</p>
                  <p className="font-medium text-slate-900">{selectedCase.subject_account_number}</p>
                </div>
              </div>
            </div>

            {/* Transaction Info */}
            <div className="bg-white border border-slate-200 rounded-xl p-5">
              <h3 className="text-sm font-semibold text-tam-primary mb-4 flex items-center gap-2">
                <DollarSign size={14} />
                معلومات المعاملة — Transaction Information
              </h3>
              <div className="grid grid-cols-3 gap-4 text-xs">
                <div>
                  <p className="text-slate-500 mb-1">المبلغ</p>
                  <p className="font-medium text-slate-900">{selectedCase.currency} {selectedCase.total_amount.toLocaleString()}</p>
                </div>
                <div>
                  <p className="text-slate-500 mb-1">التاريخ</p>
                  <p className="font-medium text-slate-900">{new Date(selectedCase.transaction_date).toLocaleDateString("ar-SA")}</p>
                </div>
                <div>
                  <p className="text-slate-500 mb-1">نوع القضية</p>
                  <p className="font-medium text-slate-900">
                    {CASE_TYPES.find((ct) => ct.key === selectedCase.case_type)?.label}
                  </p>
                </div>
              </div>
              <div className="mt-4 p-3 bg-slate-50 rounded-lg">
                <p className="text-[10px] text-slate-500 mb-1">الوصف</p>
                <p dir="auto" className="text-xs text-slate-700">{selectedCase.description_ar} — {selectedCase.description}</p>
              </div>
            </div>

            {/* Screening Result */}
            {screeningResult && (
              <div className={`border-l-4 rounded-xl p-5 ${screeningResult.match_found ? "bg-red-50 border-l-red-600" : "bg-emerald-50 border-l-emerald-600"}`}>
                <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                  <Search size={14} className={screeningResult.match_found ? "text-red-600" : "text-emerald-600"} />
                  نتائج الفحص — Screening Results
                </h3>
                <div className="text-xs">
                  <p className={`font-semibold mb-2 ${screeningResult.match_found ? "text-red-700" : "text-emerald-700"}`}>
                    {screeningResult.match_found ? "تحذير: تم العثور على تطابق" : "✓ لم يتم العثور على تطابق"}
                  </p>
                  <p className="text-slate-600">
                    درجة التطابق: <span className="font-semibold">{(screeningResult.match_score * 100).toFixed(0)}%</span>
                  </p>
                  {screeningResult.match_details && (
                    <p className="text-slate-600 mt-2">{screeningResult.match_details}</p>
                  )}
                </div>
              </div>
            )}

            {/* STR Report */}
            {strReport && (
              <div className="bg-blue-50 border border-blue-200 rounded-xl p-5">
                <h3 className="text-sm font-semibold text-blue-900 mb-3 flex items-center gap-2">
                  <FileText size={14} />
                  تقرير الإبلاغ المريب — STR Report
                </h3>
                <div dir="rtl" className="text-xs text-slate-700 bg-white rounded-lg p-3 mb-3 leading-6 max-h-40 overflow-y-auto whitespace-pre-wrap">
                  {strReport.report_text_ar}
                </div>
                <div className="text-xs text-slate-600 bg-white rounded-lg p-3 mb-3 leading-6 max-h-40 overflow-y-auto whitespace-pre-wrap">
                  {strReport.report_text}
                </div>
                <div className="text-[10px] text-blue-600">
                  الحالة: <span className="font-semibold">{strReport.status === "submitted" ? "مرسل" : "مسودة"}</span>
                </div>
              </div>
            )}

            {/* Evidence Section */}
            <div className="bg-white border border-slate-200 rounded-xl p-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold text-tam-primary flex items-center gap-2">
                  <FileText size={14} />
                  الأدلة — Evidence
                </h3>
                <button
                  onClick={() => setShowAddEvidence(!showAddEvidence)}
                  className="text-xs text-tam-light hover:text-tam-primary transition-colors flex items-center gap-1"
                >
                  <Plus size={12} />
                  إضافة دليل
                </button>
              </div>

              {showAddEvidence && (
                <div className="mb-4 p-3 bg-slate-50 rounded-lg border border-slate-200">
                  <p className="text-xs text-slate-600">ميزة رفع الأدلة قريباً...</p>
                </div>
              )}

              {selectedCase.evidence && selectedCase.evidence.length > 0 ? (
                <div className="space-y-2">
                  {selectedCase.evidence.map((ev) => (
                    <div key={ev.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg text-xs">
                      <div>
                        <p className="font-medium text-slate-900">{ev.file_name}</p>
                        <p className="text-slate-500">{ev.file_type}</p>
                      </div>
                      <span className="text-slate-400">{new Date(ev.uploaded_at).toLocaleDateString("ar-SA")}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-slate-500">لا توجد أدلة</p>
              )}
            </div>

            {/* Action Buttons */}
            <div className="grid grid-cols-3 gap-3">
              <button
                onClick={handleScreening}
                disabled={isScreening}
                className="py-2.5 bg-blue-50 text-blue-600 border border-blue-200 rounded-xl text-sm font-medium hover:bg-blue-100 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
              >
                {isScreening ? (
                  <>
                    <Loader2 size={14} className="animate-spin" />
                    جاري الفحص...
                  </>
                ) : (
                  <>
                    <Search size={14} />
                    فحص الموضوع
                  </>
                )}
              </button>

              <button
                onClick={handleGenerateSTR}
                disabled={isGeneratingSTR}
                className="py-2.5 bg-amber-50 text-amber-600 border border-amber-200 rounded-xl text-sm font-medium hover:bg-amber-100 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
              >
                {isGeneratingSTR ? (
                  <>
                    <Loader2 size={14} className="animate-spin" />
                    جاري الإنشاء...
                  </>
                ) : (
                  <>
                    <FileText size={14} />
                    إنشاء STR
                  </>
                )}
              </button>

              {selectedCase.status !== "escalated" && (
                <button
                  onClick={handleEscalate}
                  className="py-2.5 bg-red-50 text-red-600 border border-red-200 rounded-xl text-sm font-medium hover:bg-red-100 transition-colors flex items-center justify-center gap-2"
                >
                  <AlertTriangle size={14} />
                  تصعيد
                </button>
              )}

              {selectedCase.status !== "closed" && (
                <button
                  onClick={handleCloseCase}
                  className="py-2.5 bg-emerald-50 text-emerald-600 border border-emerald-200 rounded-xl text-sm font-medium hover:bg-emerald-100 transition-colors flex items-center justify-center gap-2"
                >
                  <CheckCircle2 size={14} />
                  إغلاق
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
