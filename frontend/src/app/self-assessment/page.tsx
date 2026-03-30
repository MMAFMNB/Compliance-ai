"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  Activity,
  TrendingUp,
  TrendingDown,
  Minus,
  ArrowRight,
  Scale,
  Loader2,
  ChevronDown,
} from "lucide-react";
import { useAuth } from "@/lib/AuthContext";
import { supabase } from "@/lib/supabase";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

interface CategoryScore {
  category: string;
  category_en: string;
  score: number;
}

interface Recommendation {
  priority: "high" | "medium" | "low";
  category: string;
  finding: string;
  recommendation: string;
}

interface AssessmentResult {
  id: string;
  overall_score: number;
  category_scores: CategoryScore[];
  recommendations: Recommendation[];
  created_at: string;
}

interface HistoryEntry {
  id: string;
  overall_score: number;
  created_at: string;
}

const CATEGORY_DEFAULTS: CategoryScore[] = [
  { category: "الحوكمة", category_en: "Governance", score: 0 },
  { category: "مكافحة غسل الأموال", category_en: "AML/KYC", score: 0 },
  { category: "التقارير", category_en: "Reporting", score: 0 },
  { category: "إدارة العملاء", category_en: "Client Management", score: 0 },
  { category: "إدارة المخاطر", category_en: "Risk Management", score: 0 },
  { category: "العمليات", category_en: "Operations", score: 0 },
];

const PRIORITY_CONFIG = {
  high: { label: "عالية — High", bg: "bg-red-100 text-red-700" },
  medium: { label: "متوسطة — Medium", bg: "bg-amber-100 text-amber-700" },
  low: { label: "منخفضة — Low", bg: "bg-emerald-100 text-emerald-700" },
};

function getScoreColor(score: number) {
  if (score > 80) return { text: "text-emerald-600", border: "border-emerald-400", bg: "bg-emerald-500" };
  if (score >= 60) return { text: "text-amber-600", border: "border-amber-400", bg: "bg-amber-500" };
  return { text: "text-red-600", border: "border-red-400", bg: "bg-red-500" };
}

function getBarColor(score: number) {
  if (score > 80) return "bg-emerald-500";
  if (score >= 60) return "bg-amber-500";
  return "bg-red-500";
}

export default function SelfAssessmentPage() {
  const router = useRouter();
  const { user, isLoading: isAuthLoading } = useAuth();

  const [assessment, setAssessment] = useState<AssessmentResult | null>(null);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRunning, setIsRunning] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [selectedHistoryId, setSelectedHistoryId] = useState<string | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!isAuthLoading && !user) {
      router.push("/login");
      return;
    }
    if (user) {
      fetchLatest();
      fetchHistory();
    }
  }, [user, isAuthLoading, router]);

  const fetchLatest = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`${API_URL}/api/assessment/latest`, {
        headers: { Authorization: `Bearer ${session?.access_token}` },
      });
      if (!res.ok) {
        if (res.status === 404) {
          setAssessment(null);
          return;
        }
        throw new Error(`${res.status}`);
      }
      const data: AssessmentResult = await res.json();
      setAssessment(data);
    } catch (err) {
      console.error("Failed to fetch latest assessment:", err);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchHistory = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`${API_URL}/api/assessment/history`, {
        headers: { Authorization: `Bearer ${session?.access_token}` },
      });
      if (!res.ok) throw new Error(`${res.status}`);
      const data = await res.json();
      setHistory(data.assessments || []);
    } catch (err) {
      console.error("Failed to fetch assessment history:", err);
    }
  };

  const runAssessment = async () => {
    setIsRunning(true);
    setError("");

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`${API_URL}/api/assessment/run`, {
        method: "POST",
        headers: { Authorization: `Bearer ${session?.access_token}` },
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => null);
        throw new Error(errData?.detail || `Assessment failed: ${res.status}`);
      }

      const data: AssessmentResult = await res.json();
      setAssessment(data);
      fetchHistory();
    } catch (err) {
      setError(err instanceof Error ? err.message : "حدث خطأ غير متوقع");
    } finally {
      setIsRunning(false);
    }
  };

  const viewHistoryDetail = async (id: string) => {
    if (selectedHistoryId === id) {
      setSelectedHistoryId(null);
      return;
    }
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`${API_URL}/api/assessment/${id}`, {
        headers: { Authorization: `Bearer ${session?.access_token}` },
      });
      if (!res.ok) throw new Error(`${res.status}`);
      const data: AssessmentResult = await res.json();
      setAssessment(data);
      setSelectedHistoryId(id);
    } catch (err) {
      console.error("Failed to fetch assessment detail:", err);
    }
  };

  if (isAuthLoading || !user) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Loader2 size={32} className="animate-spin text-tam-light" />
      </div>
    );
  }

  const scoreColor = assessment ? getScoreColor(assessment.overall_score) : null;

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
                التقييم الذاتي الدوري
              </h1>
              <p className="text-[11px] text-slate-400">
                Periodic Self-Assessment
              </p>
            </div>
          </div>
          <div className="w-8 h-8 bg-gradient-to-br from-tam-accent to-tam-light rounded-lg flex items-center justify-center">
            <Scale size={16} className="text-white" />
          </div>
        </div>
      </header>

      <div className="max-w-4xl mx-auto p-6">
        {/* Run Assessment Button */}
        <button
          onClick={runAssessment}
          disabled={isRunning}
          className="w-full py-4 bg-tam-primary text-white rounded-xl text-sm font-medium hover:bg-tam-secondary disabled:opacity-50 transition-colors flex items-center justify-center gap-3 mb-8"
        >
          {isRunning ? (
            <>
              <Loader2 size={20} className="animate-spin" />
              <span>جاري تقييم مستوى الامتثال...</span>
            </>
          ) : (
            <>
              <Activity size={20} />
              <span>تشغيل التقييم — Run Assessment</span>
            </>
          )}
        </button>

        {error && (
          <div className="mb-6 bg-red-50 text-red-700 text-xs rounded-lg p-3">{error}</div>
        )}

        {isLoading && (
          <div className="text-center py-12">
            <Loader2 size={24} className="animate-spin text-tam-light mx-auto mb-3" />
            <p className="text-sm text-slate-500">جاري التحميل...</p>
          </div>
        )}

        {/* Empty State */}
        {!isLoading && !assessment && !isRunning && (
          <div className="text-center py-16">
            <Activity size={40} className="text-slate-300 mx-auto mb-4" />
            <p className="text-sm text-slate-600 mb-1">لم يتم إجراء أي تقييم بعد</p>
            <p className="text-xs text-slate-400">No assessments yet. Run your first assessment to see compliance scores.</p>
          </div>
        )}

        {/* Assessment Results */}
        {!isLoading && assessment && (
          <div>
            {/* Overall Score */}
            <div className="bg-white border border-slate-200 rounded-xl p-8 mb-6 flex flex-col items-center">
              <div
                className={`w-32 h-32 rounded-full border-4 ${scoreColor!.border} flex items-center justify-center mb-4`}
              >
                <span className={`text-4xl font-bold ${scoreColor!.text}`}>
                  {assessment.overall_score}
                </span>
              </div>
              <p className="text-sm text-slate-600 text-center">
                نتيجة الامتثال الكلية — Overall Compliance Score
              </p>
              <p className="text-[10px] text-slate-400 mt-1">
                {new Date(assessment.created_at).toLocaleDateString("ar-SA", {
                  year: "numeric",
                  month: "long",
                  day: "numeric",
                })}
              </p>
            </div>

            {/* Category Scores */}
            <div className="bg-white border border-slate-200 rounded-xl p-6 mb-6">
              <h2 className="text-sm font-semibold text-tam-primary mb-4">
                تقييم الفئات — Category Scores
              </h2>
              <div className="space-y-4">
                {(assessment.category_scores || CATEGORY_DEFAULTS).map((cat, i) => (
                  <div key={i}>
                    <div className="flex items-center justify-between mb-1">
                      <div>
                        <span className="text-sm text-slate-700">{cat.category}</span>
                        <span className="text-[10px] text-slate-400 mr-2"> ({cat.category_en})</span>
                      </div>
                      <span className={`text-sm font-semibold ${getScoreColor(cat.score).text}`}>
                        {cat.score}%
                      </span>
                    </div>
                    <div className="w-full bg-slate-100 rounded-full h-2.5">
                      <div
                        className={`h-2.5 rounded-full ${getBarColor(cat.score)} transition-all duration-500`}
                        style={{ width: `${cat.score}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Recommendations */}
            {assessment.recommendations && assessment.recommendations.length > 0 && (
              <div className="mb-6">
                <h2 className="text-sm font-semibold text-tam-primary mb-4">
                  التوصيات — Recommendations
                </h2>
                <div className="space-y-3">
                  {assessment.recommendations.map((rec, i) => {
                    const priorityConf = PRIORITY_CONFIG[rec.priority];
                    return (
                      <div
                        key={i}
                        className="bg-white border border-slate-200 rounded-xl p-5"
                      >
                        <div className="flex items-center gap-2 mb-3">
                          <span
                            className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${priorityConf.bg}`}
                          >
                            {priorityConf.label}
                          </span>
                          <span className="text-[10px] text-slate-400">{rec.category}</span>
                        </div>
                        <p dir="auto" className="text-sm text-slate-700 leading-7 mb-2">
                          {rec.finding}
                        </p>
                        <p dir="auto" className="text-xs text-slate-500 leading-6">
                          {rec.recommendation}
                        </p>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Assessment History */}
            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
              <button
                onClick={() => setShowHistory(!showHistory)}
                className="w-full px-6 py-4 flex items-center justify-between text-right"
              >
                <h2 className="text-sm font-semibold text-tam-primary">
                  سجل التقييمات — Assessment History
                </h2>
                <ChevronDown
                  size={16}
                  className={`text-slate-400 transition-transform duration-200 ${
                    showHistory ? "rotate-180" : ""
                  }`}
                />
              </button>

              {showHistory && (
                <div className="border-t border-slate-100">
                  {history.length === 0 ? (
                    <p className="text-xs text-slate-400 text-center py-6">
                      لا يوجد سجل سابق
                    </p>
                  ) : (
                    <table className="w-full">
                      <thead>
                        <tr className="text-[10px] text-slate-400 border-b border-slate-100">
                          <th className="text-right px-6 py-2 font-medium">التاريخ — Date</th>
                          <th className="text-right px-6 py-2 font-medium">النتيجة — Score</th>
                          <th className="text-right px-6 py-2 font-medium">الاتجاه — Trend</th>
                        </tr>
                      </thead>
                      <tbody>
                        {history.map((entry, i) => {
                          const prev = history[i + 1];
                          let TrendIcon = Minus;
                          let trendColor = "text-slate-400";
                          let trendLabel = "→";
                          if (prev) {
                            if (entry.overall_score > prev.overall_score) {
                              TrendIcon = TrendingUp;
                              trendColor = "text-emerald-600";
                              trendLabel = "↑";
                            } else if (entry.overall_score < prev.overall_score) {
                              TrendIcon = TrendingDown;
                              trendColor = "text-red-600";
                              trendLabel = "↓";
                            }
                          }
                          const entryScoreColor = getScoreColor(entry.overall_score);
                          return (
                            <tr
                              key={entry.id}
                              onClick={() => viewHistoryDetail(entry.id)}
                              className={`border-b border-slate-50 cursor-pointer hover:bg-slate-50 transition-colors ${
                                selectedHistoryId === entry.id ? "bg-tam-light/5" : ""
                              }`}
                            >
                              <td className="px-6 py-3 text-xs text-slate-600">
                                {new Date(entry.created_at).toLocaleDateString("ar-SA", {
                                  year: "numeric",
                                  month: "short",
                                  day: "numeric",
                                })}
                              </td>
                              <td className={`px-6 py-3 text-sm font-semibold ${entryScoreColor.text}`}>
                                {entry.overall_score}
                              </td>
                              <td className={`px-6 py-3 ${trendColor}`}>
                                <div className="flex items-center gap-1">
                                  <TrendIcon size={14} />
                                  <span className="text-xs">{trendLabel}</span>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
