"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Zap,
  AlertTriangle,
  Target,
  ArrowRight,
  Scale,
  Loader2,
} from "lucide-react";
import { useAuth } from "@/lib/AuthContext";
import { supabase } from "@/lib/supabase";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

interface ActionItem {
  action: string;
  priority: "high" | "medium" | "low";
  deadline?: string;
}

interface ImpactAnalysis {
  id: string;
  alert_id: string;
  alert_title?: string;
  impact_level: "high" | "medium" | "low" | "none";
  affected_areas: string[];
  analysis: string;
  action_items: ActionItem[];
  created_at: string;
}

const IMPACT_CONFIG: Record<string, { label: string; color: string; bg: string; border: string }> = {
  high: { label: "عالي", color: "text-red-700", bg: "bg-red-50", border: "border-red-200" },
  medium: { label: "متوسط", color: "text-amber-700", bg: "bg-amber-50", border: "border-amber-200" },
  low: { label: "منخفض", color: "text-emerald-700", bg: "bg-emerald-50", border: "border-emerald-200" },
  none: { label: "لا يوجد", color: "text-slate-500", bg: "bg-slate-50", border: "border-slate-200" },
};

const PRIORITY_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  high: { label: "عالية", color: "text-red-700", bg: "bg-red-50" },
  medium: { label: "متوسطة", color: "text-amber-700", bg: "bg-amber-50" },
  low: { label: "منخفضة", color: "text-emerald-700", bg: "bg-emerald-50" },
};

export default function ImpactAnalysisPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, isLoading: isAuthLoading } = useAuth();

  const alertId = searchParams.get("alert_id");

  const [analyses, setAnalyses] = useState<ImpactAnalysis[]>([]);
  const [selectedAnalysis, setSelectedAnalysis] = useState<ImpactAnalysis | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [showRunButton, setShowRunButton] = useState(false);

  useEffect(() => {
    if (!isAuthLoading && !user) {
      router.push("/login");
      return;
    }
    if (user) {
      if (alertId) {
        checkExistingAnalysis(alertId);
      } else {
        fetchAnalyses();
      }
    }
  }, [user, isAuthLoading, router, alertId]);

  const getToken = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    return session?.access_token;
  };

  const fetchAnalyses = async () => {
    try {
      const token = await getToken();
      const res = await fetch(`${API_URL}/api/impact-analysis`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(`${res.status}`);
      const data = await res.json();
      setAnalyses(Array.isArray(data) ? data : data.analyses || []);
    } catch (err) {
      console.error("Failed to fetch analyses:", err);
    } finally {
      setIsLoading(false);
    }
  };

  const checkExistingAnalysis = async (id: string) => {
    try {
      const token = await getToken();
      const res = await fetch(`${API_URL}/api/impact-analysis/by-alert/${id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setSelectedAnalysis(data);
      } else if (res.status === 404) {
        setShowRunButton(true);
      } else {
        throw new Error(`${res.status}`);
      }
    } catch (err) {
      console.error("Failed to check existing analysis:", err);
      setShowRunButton(true);
    } finally {
      setIsLoading(false);
    }
  };

  const runAnalysis = async () => {
    if (!alertId) return;
    setIsAnalyzing(true);
    setShowRunButton(false);

    try {
      const token = await getToken();
      const res = await fetch(`${API_URL}/api/impact-analysis`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ alert_id: alertId }),
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => null);
        throw new Error(errData?.detail || `Analysis failed: ${res.status}`);
      }
      const data: ImpactAnalysis = await res.json();
      setSelectedAnalysis(data);
    } catch (err) {
      console.error("Failed to run analysis:", err);
      setShowRunButton(true);
    } finally {
      setIsAnalyzing(false);
    }
  };

  if (isAuthLoading || !user) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Loader2 size={32} className="animate-spin text-tam-light" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50" dir="rtl">
      <header className="bg-white border-b border-slate-200 px-6 py-4">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => router.push("/")}
              className="text-slate-400 hover:text-tam-primary transition-colors"
              aria-label="العودة"
            >
              <ArrowRight size={20} />
            </button>
            <div>
              <h1 className="text-sm font-semibold text-tam-primary">
                تحليل الأثر التنظيمي
              </h1>
              <p className="text-[11px] text-slate-400">
                Regulatory Change Impact Analysis
              </p>
            </div>
          </div>
          <div className="w-8 h-8 bg-gradient-to-br from-tam-accent to-tam-light rounded-lg flex items-center justify-center">
            <Scale size={16} className="text-white" />
          </div>
        </div>
      </header>

      <div className="max-w-4xl mx-auto p-6">
        {/* Loading state */}
        {isLoading && (
          <div className="text-center py-12">
            <Loader2 size={24} className="animate-spin text-tam-light mx-auto mb-3" />
            <p className="text-sm text-slate-500">جاري التحميل...</p>
          </div>
        )}

        {/* Analyzing state */}
        {isAnalyzing && (
          <div className="text-center py-16">
            <div className="w-16 h-16 bg-gradient-to-br from-tam-accent to-tam-light rounded-2xl flex items-center justify-center mx-auto mb-4">
              <Zap size={28} className="text-white animate-pulse" />
            </div>
            <Loader2 size={24} className="animate-spin text-tam-light mx-auto mb-3" />
            <p className="text-sm font-medium text-tam-primary">جاري تحليل الأثر التنظيمي...</p>
            <p className="text-xs text-slate-400 mt-1">Running Impact Analysis</p>
          </div>
        )}

        {/* Run analysis button (alert_id present but no existing analysis) */}
        {!isLoading && !isAnalyzing && showRunButton && alertId && (
          <div className="text-center py-16">
            <div className="w-16 h-16 bg-slate-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <Target size={28} className="text-slate-400" />
            </div>
            <p className="text-sm text-slate-600 mb-1">لم يتم إجراء تحليل أثر لهذا التنبيه بعد</p>
            <p className="text-xs text-slate-400 mb-6">No impact analysis found for this alert.</p>
            <button
              onClick={runAnalysis}
              className="px-6 py-3 bg-tam-primary text-white rounded-xl text-sm font-medium hover:bg-tam-secondary transition-colors inline-flex items-center gap-2"
            >
              <Zap size={16} />
              تشغيل تحليل الأثر
            </button>
          </div>
        )}

        {/* Detail view */}
        {!isLoading && !isAnalyzing && selectedAnalysis && (
          <div>
            {!alertId && (
              <button
                onClick={() => setSelectedAnalysis(null)}
                className="text-xs text-tam-light hover:text-tam-primary transition-colors mb-4 flex items-center gap-1"
              >
                <ArrowRight size={12} />
                العودة إلى القائمة
              </button>
            )}

            {/* Impact level badge */}
            <div className="bg-white border border-slate-200 rounded-xl p-6 mb-4">
              <div className="flex items-center justify-between mb-4">
                <div>
                  {selectedAnalysis.alert_title && (
                    <h2 dir="auto" className="text-sm font-semibold text-tam-primary mb-1">
                      {selectedAnalysis.alert_title}
                    </h2>
                  )}
                  <p className="text-[11px] text-slate-400">
                    {new Date(selectedAnalysis.created_at).toLocaleDateString("ar-SA")}
                  </p>
                </div>
                <div className={`px-4 py-2 rounded-lg ${IMPACT_CONFIG[selectedAnalysis.impact_level]?.bg || "bg-slate-50"} ${IMPACT_CONFIG[selectedAnalysis.impact_level]?.border || "border-slate-200"} border`}>
                  <div className="flex items-center gap-2">
                    <AlertTriangle size={16} className={IMPACT_CONFIG[selectedAnalysis.impact_level]?.color || "text-slate-500"} />
                    <span className={`text-sm font-semibold ${IMPACT_CONFIG[selectedAnalysis.impact_level]?.color || "text-slate-500"}`}>
                      مستوى الأثر: {IMPACT_CONFIG[selectedAnalysis.impact_level]?.label || selectedAnalysis.impact_level}
                    </span>
                  </div>
                </div>
              </div>

              {/* Affected areas */}
              {selectedAnalysis.affected_areas && selectedAnalysis.affected_areas.length > 0 && (
                <div className="mb-4">
                  <p className="text-[10px] font-medium text-slate-500 mb-2">المجالات المتأثرة</p>
                  <div className="flex flex-wrap gap-2">
                    {selectedAnalysis.affected_areas.map((area, i) => (
                      <span
                        key={i}
                        className="text-xs bg-tam-light/10 text-tam-light px-3 py-1 rounded-full font-medium"
                        dir="auto"
                      >
                        {area}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Analysis text */}
              <div className="bg-slate-50 rounded-lg p-4">
                <p className="text-[10px] font-medium text-tam-gold mb-2">التحليل التفصيلي — Detailed Analysis</p>
                <p dir="auto" className="text-sm text-slate-700 leading-7 whitespace-pre-line">
                  {selectedAnalysis.analysis}
                </p>
              </div>
            </div>

            {/* Action items */}
            {selectedAnalysis.action_items && selectedAnalysis.action_items.length > 0 && (
              <div>
                <h3 className="text-xs font-semibold text-tam-primary mb-3 flex items-center gap-2">
                  <Target size={14} />
                  الإجراءات المطلوبة — Action Items
                </h3>
                <div className="space-y-3">
                  {selectedAnalysis.action_items.map((item, i) => {
                    const priorityCfg = PRIORITY_CONFIG[item.priority] || PRIORITY_CONFIG.medium;
                    return (
                      <div key={i} className="bg-white border border-slate-200 rounded-xl p-4">
                        <div className="flex items-start gap-3">
                          <div className="w-7 h-7 bg-tam-primary/10 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5">
                            <span className="text-xs font-bold text-tam-primary">{i + 1}</span>
                          </div>
                          <div className="flex-1 min-w-0">
                            <p dir="auto" className="text-sm text-slate-700 leading-7 mb-2">
                              {item.action}
                            </p>
                            <div className="flex items-center gap-3">
                              <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${priorityCfg.bg} ${priorityCfg.color}`}>
                                الأولوية: {priorityCfg.label}
                              </span>
                              {item.deadline && (
                                <span className="text-[10px] text-slate-400">
                                  الموعد المقترح: {item.deadline}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {/* List view (no alert_id, no selected analysis) */}
        {!isLoading && !isAnalyzing && !alertId && !selectedAnalysis && (
          <div>
            {analyses.length === 0 && (
              <div className="text-center py-12">
                <Zap size={32} className="text-slate-300 mx-auto mb-3" />
                <p className="text-sm text-slate-500">لا توجد تحليلات أثر سابقة</p>
                <p className="text-xs text-slate-400 mt-1">
                  يمكنك تشغيل تحليل الأثر من صفحة التنبيهات
                </p>
                <button
                  onClick={() => router.push("/alerts")}
                  className="mt-4 text-xs text-tam-light hover:text-tam-primary transition-colors inline-flex items-center gap-1"
                >
                  الانتقال إلى التنبيهات
                  <ArrowRight size={12} className="rotate-180" />
                </button>
              </div>
            )}

            {analyses.length > 0 && (
              <div className="space-y-3">
                {analyses.map((analysis) => {
                  const impactCfg = IMPACT_CONFIG[analysis.impact_level] || IMPACT_CONFIG.none;
                  return (
                    <button
                      key={analysis.id}
                      onClick={() => setSelectedAnalysis(analysis)}
                      className="w-full bg-white border border-slate-200 rounded-xl p-5 text-right hover:border-tam-light/50 hover:shadow-sm transition-all"
                    >
                      <div className="flex items-start gap-3">
                        <div className={`rounded-lg p-1.5 mt-0.5 ${impactCfg.bg}`}>
                          <AlertTriangle size={14} className={impactCfg.color} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${impactCfg.bg} ${impactCfg.color}`}>
                              {impactCfg.label}
                            </span>
                            <span className="text-[10px] text-slate-400">
                              {new Date(analysis.created_at).toLocaleDateString("ar-SA")}
                            </span>
                          </div>
                          {analysis.alert_title && (
                            <p dir="auto" className="text-sm font-medium text-slate-800 leading-6">
                              {analysis.alert_title}
                            </p>
                          )}
                          {analysis.affected_areas && analysis.affected_areas.length > 0 && (
                            <div className="flex flex-wrap gap-1 mt-2">
                              {analysis.affected_areas.slice(0, 4).map((area, j) => (
                                <span
                                  key={j}
                                  className="text-[10px] bg-tam-light/10 text-tam-light px-2 py-0.5 rounded"
                                  dir="auto"
                                >
                                  {area}
                                </span>
                              ))}
                              {analysis.affected_areas.length > 4 && (
                                <span className="text-[10px] text-slate-400">+{analysis.affected_areas.length - 4}</span>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
