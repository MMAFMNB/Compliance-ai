"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  TrendingUp,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  ArrowRight,
  Loader2,
  Star,
} from "lucide-react";
import { useRequireAuth } from "@/lib/useRequireAuth";
import { supabase } from "@/lib/supabase";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

type ClientType = "individual" | "institutional";
type RiskTolerance = "conservative" | "moderate" | "aggressive";
type InvestmentExperience = "none" | "limited" | "moderate" | "extensive";
type InvestmentHorizon = "short" | "medium" | "long";
type RiskCategory = "low" | "moderate" | "high";
type AssessmentStatus = "draft" | "completed" | "approved";

interface ClientInfo {
  client_name: string;
  client_name_ar: string;
  client_id_number: string;
  client_type: ClientType;
}

interface RiskProfile {
  risk_tolerance: RiskTolerance;
  investment_experience: InvestmentExperience;
  investment_horizon: InvestmentHorizon;
  annual_income_range: string;
  net_worth_range: string;
  investment_objectives: string[];
  source_of_funds: string;
}

interface Assessment {
  id: string;
  client_name: string;
  risk_category: RiskCategory;
  overall_risk_score: number;
  status: AssessmentStatus;
  created_at: string;
}

interface AssessmentDetail extends Assessment {
  client_info: ClientInfo;
  risk_profile: RiskProfile;
  suitable_products: string[];
  unsuitable_products: string[];
  ai_analysis_ar: string;
  ai_analysis_en: string;
  conditions_and_recommendations: string;
}

const CLIENT_TYPES = [
  { key: "individual" as ClientType, label: "فرد" },
  { key: "institutional" as ClientType, label: "مؤسسة" },
];

const RISK_TOLERANCE_OPTIONS = [
  { key: "conservative" as RiskTolerance, label: "محافظ" },
  { key: "moderate" as RiskTolerance, label: "متوسط" },
  { key: "aggressive" as RiskTolerance, label: "عدواني" },
];

const INVESTMENT_EXPERIENCE_OPTIONS = [
  { key: "none" as InvestmentExperience, label: "بدون خبرة" },
  { key: "limited" as InvestmentExperience, label: "محدودة" },
  { key: "moderate" as InvestmentExperience, label: "متوسطة" },
  { key: "extensive" as InvestmentExperience, label: "واسعة" },
];

const INVESTMENT_HORIZON_OPTIONS = [
  { key: "short" as InvestmentHorizon, label: "قصيرة (< 3 سنوات)" },
  { key: "medium" as InvestmentHorizon, label: "متوسطة (3-10 سنوات)" },
  { key: "long" as InvestmentHorizon, label: "طويلة (> 10 سنوات)" },
];

const INCOME_RANGES = [
  "أقل من 100,000 ريال سعودي",
  "100,000 - 500,000 ريال سعودي",
  "500,000 - 1,000,000 ريال سعودي",
  "أكثر من 1,000,000 ريال سعودي",
];

const NET_WORTH_RANGES = [
  "أقل من 250,000 ريال سعودي",
  "250,000 - 1,000,000 ريال سعودي",
  "1,000,000 - 5,000,000 ريال سعودي",
  "أكثر من 5,000,000 ريال سعودي",
];

const INVESTMENT_OBJECTIVES = [
  { key: "capital_preservation", label: "الحفاظ على رأس المال" },
  { key: "income", label: "الدخل" },
  { key: "growth", label: "النمو" },
  { key: "speculation", label: "المضاربة" },
];

const RISK_CATEGORY_CONFIG: Record<RiskCategory, { label: string; color: string; bg: string; border: string }> = {
  low: { label: "منخفض", color: "text-emerald-600", bg: "bg-emerald-50", border: "border-emerald-200" },
  moderate: { label: "متوسط", color: "text-amber-600", bg: "bg-amber-50", border: "border-amber-200" },
  high: { label: "مرتفع", color: "text-red-600", bg: "bg-red-50", border: "border-red-200" },
};

const STATUS_CONFIG: Record<AssessmentStatus, { label: string; color: string; bg: string }> = {
  draft: { label: "مسودة", color: "text-slate-600", bg: "bg-slate-50" },
  completed: { label: "مكتمل", color: "text-blue-600", bg: "bg-blue-50" },
  approved: { label: "موافق عليه", color: "text-emerald-600", bg: "bg-emerald-50" },
};

export default function SuitabilityPage() {
  const router = useRouter();
  const { user, isLoading: isAuthLoading } = useRequireAuth();

  const [view, setView] = useState<"list" | "new" | "detail">("list");
  const [assessments, setAssessments] = useState<Assessment[]>([]);
  const [selectedAssessment, setSelectedAssessment] = useState<AssessmentDetail | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const [clientInfo, setClientInfo] = useState<ClientInfo>({
    client_name: "",
    client_name_ar: "",
    client_id_number: "",
    client_type: "individual",
  });

  const [riskProfile, setRiskProfile] = useState<RiskProfile>({
    risk_tolerance: "moderate",
    investment_experience: "limited",
    investment_horizon: "medium",
    annual_income_range: "",
    net_worth_range: "",
    investment_objectives: [],
    source_of_funds: "",
  });

  const [filterStatus, setFilterStatus] = useState<AssessmentStatus | "all">("all");
  const [filterRiskCategory, setFilterRiskCategory] = useState<RiskCategory | "all">("all");

  useEffect(() => {
    if (user) fetchAssessments();
  }, [user]);

  const getAuthHeaders = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    return { Authorization: `Bearer ${session?.access_token}` };
  };

  const fetchAssessments = async () => {
    setIsLoading(true);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`${API_URL}/api/suitability/assessments`, { headers });
      if (!res.ok) throw new Error(`${res.status}`);
      const data = await res.json();
      setAssessments(data.assessments || []);
    } catch (err) {
      console.error("Failed to fetch assessments:", err);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchAssessmentDetail = async (id: string) => {
    setIsLoading(true);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`${API_URL}/api/suitability/assessment/${id}`, { headers });
      if (!res.ok) throw new Error(`${res.status}`);
      const data = await res.json();
      setSelectedAssessment(data.assessment);
      setView("detail");
    } catch (err) {
      console.error("Failed to fetch assessment detail:", err);
    } finally {
      setIsLoading(false);
    }
  };

  const toggleObjective = (objective: string) => {
    setRiskProfile((prev) => ({
      ...prev,
      investment_objectives: prev.investment_objectives.includes(objective)
        ? prev.investment_objectives.filter((o) => o !== objective)
        : [...prev.investment_objectives, objective],
    }));
  };

  const handleSubmitAssessment = async () => {
    if (!clientInfo.client_name || !clientInfo.client_name_ar || !riskProfile.annual_income_range || !riskProfile.net_worth_range) {
      alert("الرجاء ملء جميع الحقول المطلوبة");
      return;
    }

    setIsLoading(true);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`${API_URL}/api/suitability/assess`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({
          client_info: clientInfo,
          risk_profile: riskProfile,
        }),
      });
      if (!res.ok) throw new Error(`${res.status}`);
      const data = await res.json();
      setSelectedAssessment(data.assessment);
      setView("detail");
      await fetchAssessments();
    } catch (err) {
      console.error("Failed to submit assessment:", err);
      alert("حدث خطأ أثناء إنشاء التقييم");
    } finally {
      setIsLoading(false);
    }
  };

  const handleApproveAssessment = async () => {
    if (!selectedAssessment) return;
    setIsLoading(true);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`${API_URL}/api/suitability/assessment/${selectedAssessment.id}/approve`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
      });
      if (!res.ok) throw new Error(`${res.status}`);
      await fetchAssessmentDetail(selectedAssessment.id);
      await fetchAssessments();
    } catch (err) {
      console.error("Failed to approve assessment:", err);
    } finally {
      setIsLoading(false);
    }
  };

  const filteredAssessments = assessments.filter(
    (a) =>
      (filterStatus === "all" || a.status === filterStatus) &&
      (filterRiskCategory === "all" || a.risk_category === filterRiskCategory)
  );

  const statsTotal = assessments.length;
  const statsDraft = assessments.filter((a) => a.status === "draft").length;
  const statsCompleted = assessments.filter((a) => a.status === "completed").length;
  const statsApproved = assessments.filter((a) => a.status === "approved").length;

  const scoreColor = (score: number) =>
    score < 40 ? "text-emerald-600" : score < 70 ? "text-amber-600" : "text-red-600";

  const scoreBg = (score: number) =>
    score < 40 ? "bg-emerald-50" : score < 70 ? "bg-amber-50" : "bg-red-50";

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
        <div className="max-w-5xl mx-auto flex items-center justify-between">
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
                تقييم ملاءمة العميل
              </h1>
              <p className="text-[11px] text-slate-400">
                Client Suitability Assessments
              </p>
            </div>
          </div>
          <div className="w-8 h-8 bg-gradient-to-br from-tam-accent to-tam-light rounded-lg flex items-center justify-center">
            <TrendingUp size={16} className="text-white" />
          </div>
        </div>
      </header>

      <div className="max-w-5xl mx-auto p-6">
        {/* LIST VIEW */}
        {view === "list" && (
          <>
            {/* Stats */}
            <div className="grid grid-cols-4 gap-3 mb-6">
              <div className="bg-white border border-slate-200 rounded-xl p-4 text-center">
                <p className="text-2xl font-bold text-slate-700">{statsTotal}</p>
                <p className="text-xs text-slate-500 mt-1">الإجمالي</p>
              </div>
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 text-center">
                <p className="text-2xl font-bold text-slate-600">{statsDraft}</p>
                <p className="text-xs text-slate-500 mt-1">مسودة</p>
              </div>
              <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-center">
                <p className="text-2xl font-bold text-blue-600">{statsCompleted}</p>
                <p className="text-xs text-blue-600 mt-1">مكتمل</p>
              </div>
              <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 text-center">
                <p className="text-2xl font-bold text-emerald-600">{statsApproved}</p>
                <p className="text-xs text-emerald-600 mt-1">موافق عليه</p>
              </div>
            </div>

            {/* Filters */}
            <div className="flex gap-3 mb-6 flex-wrap">
              <div>
                <label className="text-xs text-slate-500 block mb-1">الحالة</label>
                <select
                  value={filterStatus}
                  onChange={(e) => setFilterStatus(e.target.value as AssessmentStatus | "all")}
                  className="text-xs border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-tam-light"
                >
                  <option value="all">جميع الحالات</option>
                  <option value="draft">مسودة</option>
                  <option value="completed">مكتمل</option>
                  <option value="approved">موافق عليه</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-slate-500 block mb-1">فئة المخاطر</label>
                <select
                  value={filterRiskCategory}
                  onChange={(e) => setFilterRiskCategory(e.target.value as RiskCategory | "all")}
                  className="text-xs border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-tam-light"
                >
                  <option value="all">جميع الفئات</option>
                  <option value="low">منخفض</option>
                  <option value="moderate">متوسط</option>
                  <option value="high">مرتفع</option>
                </select>
              </div>
            </div>

            {/* New Assessment Button */}
            <button
              onClick={() => {
                setClientInfo({ client_name: "", client_name_ar: "", client_id_number: "", client_type: "individual" });
                setRiskProfile({
                  risk_tolerance: "moderate",
                  investment_experience: "limited",
                  investment_horizon: "medium",
                  annual_income_range: "",
                  net_worth_range: "",
                  investment_objectives: [],
                  source_of_funds: "",
                });
                setView("new");
              }}
              className="w-full py-3 bg-tam-primary text-white rounded-xl text-sm font-medium hover:bg-tam-secondary transition-colors mb-6 flex items-center justify-center gap-2"
            >
              <TrendingUp size={16} />
              تقييم جديد — New Assessment
            </button>

            {/* Assessments Table */}
            {isLoading && (
              <div className="text-center py-12">
                <Loader2 size={24} className="animate-spin text-tam-light mx-auto mb-3" />
                <p className="text-sm text-slate-500">جاري تحميل التقييمات...</p>
              </div>
            )}

            {!isLoading && filteredAssessments.length === 0 && (
              <div className="bg-white border border-slate-200 rounded-xl p-8 text-center">
                <p className="text-sm text-slate-500">لا توجد تقييمات</p>
              </div>
            )}

            {!isLoading && filteredAssessments.length > 0 && (
              <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                <div className="divide-y divide-slate-100">
                  {filteredAssessments.map((assessment) => (
                    <button
                      key={assessment.id}
                      onClick={() => fetchAssessmentDetail(assessment.id)}
                      className="w-full px-5 py-4 flex items-center justify-between hover:bg-slate-50 transition-colors text-right"
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-slate-700">{assessment.client_name}</p>
                        <p className="text-xs text-slate-400 mt-1">
                          {new Date(assessment.created_at).toLocaleString("ar-SA", {
                            dateStyle: "short",
                            timeStyle: "short",
                          })}
                        </p>
                      </div>
                      <div className="flex items-center gap-3 flex-shrink-0">
                        <div className="text-right">
                          <span
                            className={`inline-block text-xs font-semibold px-2.5 py-1 rounded-lg ${
                              RISK_CATEGORY_CONFIG[assessment.risk_category].bg
                            } ${RISK_CATEGORY_CONFIG[assessment.risk_category].color}`}
                          >
                            {RISK_CATEGORY_CONFIG[assessment.risk_category].label}
                          </span>
                          <p className="text-xs text-slate-400 mt-1">{assessment.overall_risk_score}/100</p>
                        </div>
                        <span
                          className={`text-xs font-semibold px-2 py-1 rounded-lg ${
                            STATUS_CONFIG[assessment.status].bg
                          } ${STATUS_CONFIG[assessment.status].color}`}
                        >
                          {STATUS_CONFIG[assessment.status].label}
                        </span>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        {/* NEW ASSESSMENT FORM */}
        {view === "new" && (
          <div className="space-y-6 max-w-2xl">
            {/* Client Info Section */}
            <div className="bg-white border border-slate-200 rounded-xl p-6">
              <h2 className="text-sm font-semibold text-tam-primary mb-4 flex items-center gap-2">
                <Star size={14} />
                معلومات العميل — Client Information
              </h2>
              <div className="space-y-4">
                <div>
                  <label className="text-xs font-medium text-slate-600 block mb-1">اسم العميل (العربية)</label>
                  <input
                    type="text"
                    value={clientInfo.client_name_ar}
                    onChange={(e) => setClientInfo({ ...clientInfo, client_name_ar: e.target.value })}
                    className="w-full text-xs border border-slate-200 rounded-lg px-3 py-2.5 focus:outline-none focus:border-tam-light"
                    placeholder="الاسم بالعربية"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-600 block mb-1">Client Name (English)</label>
                  <input
                    type="text"
                    value={clientInfo.client_name}
                    onChange={(e) => setClientInfo({ ...clientInfo, client_name: e.target.value })}
                    className="w-full text-xs border border-slate-200 rounded-lg px-3 py-2.5 focus:outline-none focus:border-tam-light"
                    placeholder="Name in English"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-600 block mb-1">رقم الهوية — ID Number</label>
                  <input
                    type="text"
                    value={clientInfo.client_id_number}
                    onChange={(e) => setClientInfo({ ...clientInfo, client_id_number: e.target.value })}
                    className="w-full text-xs border border-slate-200 rounded-lg px-3 py-2.5 focus:outline-none focus:border-tam-light"
                    placeholder="1234567890"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-600 block mb-1">نوع العميل — Client Type</label>
                  <div className="flex gap-3">
                    {CLIENT_TYPES.map((ct) => (
                      <label key={ct.key} className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="radio"
                          name="client_type"
                          value={ct.key}
                          checked={clientInfo.client_type === ct.key}
                          onChange={(e) => setClientInfo({ ...clientInfo, client_type: e.target.value as ClientType })}
                          className="w-4 h-4"
                        />
                        <span className="text-xs text-slate-600">{ct.label}</span>
                      </label>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Risk Profile Section */}
            <div className="bg-white border border-slate-200 rounded-xl p-6">
              <h2 className="text-sm font-semibold text-tam-primary mb-4 flex items-center gap-2">
                <TrendingUp size={14} />
                ملف المخاطر — Risk Profile
              </h2>
              <div className="space-y-5">
                {/* Risk Tolerance */}
                <div>
                  <label className="text-xs font-medium text-slate-600 block mb-2">تحمل المخاطر — Risk Tolerance</label>
                  <div className="flex gap-3">
                    {RISK_TOLERANCE_OPTIONS.map((rt) => (
                      <label key={rt.key} className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="radio"
                          name="risk_tolerance"
                          value={rt.key}
                          checked={riskProfile.risk_tolerance === rt.key}
                          onChange={(e) => setRiskProfile({ ...riskProfile, risk_tolerance: e.target.value as RiskTolerance })}
                          className="w-4 h-4"
                        />
                        <span className="text-xs text-slate-600">{rt.label}</span>
                      </label>
                    ))}
                  </div>
                </div>

                {/* Investment Experience */}
                <div>
                  <label className="text-xs font-medium text-slate-600 block mb-2">الخبرة الاستثمارية — Investment Experience</label>
                  <div className="flex gap-3">
                    {INVESTMENT_EXPERIENCE_OPTIONS.map((ie) => (
                      <label key={ie.key} className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="radio"
                          name="investment_experience"
                          value={ie.key}
                          checked={riskProfile.investment_experience === ie.key}
                          onChange={(e) => setRiskProfile({ ...riskProfile, investment_experience: e.target.value as InvestmentExperience })}
                          className="w-4 h-4"
                        />
                        <span className="text-xs text-slate-600">{ie.label}</span>
                      </label>
                    ))}
                  </div>
                </div>

                {/* Investment Horizon */}
                <div>
                  <label className="text-xs font-medium text-slate-600 block mb-2">الأفق الاستثماري — Investment Horizon</label>
                  <div className="flex gap-3">
                    {INVESTMENT_HORIZON_OPTIONS.map((ih) => (
                      <label key={ih.key} className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="radio"
                          name="investment_horizon"
                          value={ih.key}
                          checked={riskProfile.investment_horizon === ih.key}
                          onChange={(e) => setRiskProfile({ ...riskProfile, investment_horizon: e.target.value as InvestmentHorizon })}
                          className="w-4 h-4"
                        />
                        <span className="text-xs text-slate-600">{ih.label}</span>
                      </label>
                    ))}
                  </div>
                </div>

                {/* Annual Income Range */}
                <div>
                  <label className="text-xs font-medium text-slate-600 block mb-1">نطاق الدخل السنوي — Annual Income</label>
                  <select
                    value={riskProfile.annual_income_range}
                    onChange={(e) => setRiskProfile({ ...riskProfile, annual_income_range: e.target.value })}
                    className="w-full text-xs border border-slate-200 rounded-lg px-3 py-2.5 focus:outline-none focus:border-tam-light"
                  >
                    <option value="">اختر نطاقًا</option>
                    {INCOME_RANGES.map((range) => (
                      <option key={range} value={range}>
                        {range}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Net Worth Range */}
                <div>
                  <label className="text-xs font-medium text-slate-600 block mb-1">نطاق الثروة الصافية — Net Worth</label>
                  <select
                    value={riskProfile.net_worth_range}
                    onChange={(e) => setRiskProfile({ ...riskProfile, net_worth_range: e.target.value })}
                    className="w-full text-xs border border-slate-200 rounded-lg px-3 py-2.5 focus:outline-none focus:border-tam-light"
                  >
                    <option value="">اختر نطاقًا</option>
                    {NET_WORTH_RANGES.map((range) => (
                      <option key={range} value={range}>
                        {range}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Investment Objectives */}
                <div>
                  <label className="text-xs font-medium text-slate-600 block mb-2">الأهداف الاستثمارية — Investment Objectives</label>
                  <div className="space-y-2">
                    {INVESTMENT_OBJECTIVES.map((obj) => (
                      <label key={obj.key} className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={riskProfile.investment_objectives.includes(obj.key)}
                          onChange={() => toggleObjective(obj.key)}
                          className="w-4 h-4 rounded"
                        />
                        <span className="text-xs text-slate-600">{obj.label}</span>
                      </label>
                    ))}
                  </div>
                </div>

                {/* Source of Funds */}
                <div>
                  <label className="text-xs font-medium text-slate-600 block mb-1">مصدر الأموال — Source of Funds</label>
                  <textarea
                    value={riskProfile.source_of_funds}
                    onChange={(e) => setRiskProfile({ ...riskProfile, source_of_funds: e.target.value })}
                    className="w-full text-xs border border-slate-200 rounded-lg px-3 py-2.5 focus:outline-none focus:border-tam-light resize-none"
                    rows={2}
                    placeholder="الراتب، الأرباح، الوراثة، إلخ..."
                  />
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex gap-3">
              <button
                onClick={handleSubmitAssessment}
                disabled={isLoading}
                className="flex-1 py-3 bg-tam-primary text-white rounded-xl text-sm font-medium hover:bg-tam-secondary disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
              >
                {isLoading ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    جاري التحليل...
                  </>
                ) : (
                  <>
                    <CheckCircle2 size={16} />
                    إنشاء التقييم — Create Assessment
                  </>
                )}
              </button>
              <button
                onClick={() => setView("list")}
                disabled={isLoading}
                className="flex-1 py-3 bg-white text-tam-primary border border-tam-primary rounded-xl text-sm font-medium hover:bg-tam-primary hover:text-white transition-colors"
              >
                إلغاء — Cancel
              </button>
            </div>
          </div>
        )}

        {/* DETAIL VIEW */}
        {view === "detail" && selectedAssessment && (
          <div className="space-y-6 max-w-3xl">
            {/* Back Button */}
            <button
              onClick={() => setView("list")}
              className="text-tam-light hover:text-tam-primary transition-colors text-sm font-medium flex items-center gap-1"
            >
              <ArrowRight size={14} />
              العودة للقائمة
            </button>

            {/* Client Info Card */}
            <div className="bg-white border border-slate-200 rounded-xl p-6">
              <h3 className="text-sm font-semibold text-tam-primary mb-4">معلومات العميل — Client Information</h3>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-xs text-slate-500 mb-1">الاسم (العربية)</p>
                  <p className="text-slate-700">{selectedAssessment.client_info.client_name_ar}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500 mb-1">Name (English)</p>
                  <p className="text-slate-700">{selectedAssessment.client_info.client_name}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500 mb-1">رقم الهوية</p>
                  <p className="text-slate-700">{selectedAssessment.client_info.client_id_number}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500 mb-1">نوع العميل</p>
                  <p className="text-slate-700">
                    {selectedAssessment.client_info.client_type === "individual" ? "فرد" : "مؤسسة"}
                  </p>
                </div>
              </div>
            </div>

            {/* Risk Score */}
            <div className={`${scoreBg(selectedAssessment.overall_risk_score)} border border-slate-200 rounded-xl p-8 text-center`}>
              <p className={`text-6xl font-bold ${scoreColor(selectedAssessment.overall_risk_score)}`}>
                {selectedAssessment.overall_risk_score}
              </p>
              <p className="text-sm text-slate-600 mt-2">درجة المخاطر — Risk Score</p>
              <span className={`inline-block mt-4 text-xs font-semibold px-3 py-1 rounded-lg ${RISK_CATEGORY_CONFIG[selectedAssessment.risk_category].bg} ${RISK_CATEGORY_CONFIG[selectedAssessment.risk_category].color}`}>
                {RISK_CATEGORY_CONFIG[selectedAssessment.risk_category].label}
              </span>
            </div>

            {/* Suitable Products */}
            {selectedAssessment.suitable_products.length > 0 && (
              <div className="bg-white border border-slate-200 rounded-xl p-6">
                <h3 className="text-sm font-semibold text-emerald-700 mb-4 flex items-center gap-2">
                  <CheckCircle2 size={14} />
                  المنتجات المناسبة — Suitable Products
                </h3>
                <div className="space-y-2">
                  {selectedAssessment.suitable_products.map((product, idx) => (
                    <div key={idx} className="flex items-start gap-2 text-sm">
                      <CheckCircle2 size={14} className="text-emerald-600 flex-shrink-0 mt-0.5" />
                      <span className="text-slate-700">{product}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Unsuitable Products */}
            {selectedAssessment.unsuitable_products.length > 0 && (
              <div className="bg-white border border-slate-200 rounded-xl p-6">
                <h3 className="text-sm font-semibold text-red-700 mb-4 flex items-center gap-2">
                  <XCircle size={14} />
                  المنتجات غير المناسبة — Unsuitable Products
                </h3>
                <div className="space-y-2">
                  {selectedAssessment.unsuitable_products.map((product, idx) => (
                    <div key={idx} className="flex items-start gap-2 text-sm">
                      <XCircle size={14} className="text-red-600 flex-shrink-0 mt-0.5" />
                      <span className="text-slate-700">{product}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* AI Analysis */}
            <div className="bg-white border border-slate-200 rounded-xl p-6">
              <h3 className="text-sm font-semibold text-tam-primary mb-4 flex items-center gap-2">
                <AlertTriangle size={14} />
                التحليل الذكي — AI Analysis
              </h3>
              <div className="space-y-4">
                <div>
                  <p className="text-xs font-medium text-tam-primary mb-2">التحليل العربي</p>
                  <div dir="rtl" className="text-sm text-slate-700 leading-7 whitespace-pre-line bg-slate-50 rounded-lg p-4">
                    {selectedAssessment.ai_analysis_ar}
                  </div>
                </div>
                <div>
                  <p className="text-xs font-medium text-tam-primary mb-2">English Analysis</p>
                  <div dir="ltr" className="text-sm text-slate-700 leading-7 whitespace-pre-line bg-slate-50 rounded-lg p-4">
                    {selectedAssessment.ai_analysis_en}
                  </div>
                </div>
              </div>
            </div>

            {/* Conditions and Recommendations */}
            <div className="bg-white border border-slate-200 rounded-xl p-6">
              <h3 className="text-sm font-semibold text-tam-primary mb-4 flex items-center gap-2">
                <Star size={14} />
                الشروط والتوصيات — Conditions & Recommendations
              </h3>
              <div dir="auto" className="text-sm text-slate-700 leading-7 whitespace-pre-line bg-slate-50 rounded-lg p-4">
                {selectedAssessment.conditions_and_recommendations}
              </div>
            </div>

            {/* Approve Button */}
            {selectedAssessment.status !== "approved" && (
              <button
                onClick={handleApproveAssessment}
                disabled={isLoading}
                className="w-full py-3 bg-emerald-600 text-white rounded-xl text-sm font-medium hover:bg-emerald-700 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
              >
                {isLoading ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    جاري الموافقة...
                  </>
                ) : (
                  <>
                    <CheckCircle2 size={16} />
                    الموافقة على التقييم — Approve Assessment
                  </>
                )}
              </button>
            )}

            {selectedAssessment.status === "approved" && (
              <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 text-center">
                <p className="text-sm font-medium text-emerald-700 flex items-center justify-center gap-2">
                  <CheckCircle2 size={16} />
                  تم الموافقة على هذا التقييم
                </p>
              </div>
            )}

            {/* Back to List */}
            <button
              onClick={() => setView("list")}
              className="w-full py-3 bg-white text-tam-primary border border-tam-primary rounded-xl text-sm font-medium hover:bg-tam-primary hover:text-white transition-colors"
            >
              العودة للقائمة — Back to List
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
