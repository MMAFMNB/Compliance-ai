"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  Shield,
  AlertTriangle,
  CheckCircle2,
  Clock,
  ArrowRight,
  Scale,
  Loader2,
  Filter,
  BarChart3,
  Target,
} from "lucide-react";
import { useRequireAuth } from "@/lib/useRequireAuth";
import { supabase } from "@/lib/supabase";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

interface Obligation {
  id: string;
  alert_id: string;
  obligation: string;
  obligation_en: string | null;
  category: string;
  deadline: string | null;
  deadline_date: string | null;
  priority: string;
  affected_roles: string[];
  assigned_to: string | null;
  status: string;
  created_at: string;
  alerts?: {
    title: string;
    title_en: string | null;
    doc_type: string;
    source_url: string;
  };
}

interface Summary {
  total: number;
  pending: number;
  acknowledged: number;
  completed: number;
  high_priority_open: number;
  by_category: Record<string, number>;
}

const PRIORITY_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  high: { label: "عالية", color: "text-red-700", bg: "bg-red-50" },
  medium: { label: "متوسطة", color: "text-amber-700", bg: "bg-amber-50" },
  low: { label: "منخفضة", color: "text-emerald-700", bg: "bg-emerald-50" },
};

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: typeof Clock }> = {
  pending: { label: "قيد الانتظار", color: "text-yellow-700 bg-yellow-50 border-yellow-200", icon: Clock },
  acknowledged: { label: "قيد المعالجة", color: "text-blue-700 bg-blue-50 border-blue-200", icon: Target },
  completed: { label: "مكتمل", color: "text-emerald-700 bg-emerald-50 border-emerald-200", icon: CheckCircle2 },
};

const CATEGORY_LABELS: Record<string, string> = {
  governance: "الحوكمة",
  aml_kyc: "مكافحة غسل الأموال",
  reporting: "التقارير",
  client_management: "إدارة العملاء",
  risk_management: "إدارة المخاطر",
  operations: "العمليات",
  licensing: "التراخيص",
  disclosure: "الإفصاح",
  market_conduct: "سلوك السوق",
  technology: "التقنية",
};

export default function RegulatoryIntelligencePage() {
  const router = useRouter();
  const { user, isLoading: isAuthLoading } = useRequireAuth();

  const [obligations, setObligations] = useState<Obligation[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  // Filters
  const [filterCategory, setFilterCategory] = useState("");
  const [filterPriority, setFilterPriority] = useState("");
  const [filterStatus, setFilterStatus] = useState("");

  useEffect(() => {
    if (user) loadData();
  }, [user, filterCategory, filterPriority, filterStatus]);

  const getHeaders = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    return {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session?.access_token}`,
    };
  };

  const loadData = async () => {
    setIsLoading(true);
    setError("");
    try {
      const headers = await getHeaders();

      const params = new URLSearchParams();
      if (filterCategory) params.set("category", filterCategory);
      if (filterPriority) params.set("priority", filterPriority);
      if (filterStatus) params.set("status", filterStatus);

      const [obsRes, sumRes] = await Promise.all([
        fetch(`${API_URL}/api/obligations?${params}`, { headers }),
        fetch(`${API_URL}/api/obligations/summary`, { headers }),
      ]);

      if (obsRes.ok) {
        const data = await obsRes.json();
        setObligations(data.obligations || []);
      }
      if (sumRes.ok) {
        setSummary(await sumRes.json());
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "حدث خطأ");
    } finally {
      setIsLoading(false);
    }
  };

  const handleStatusChange = async (obligationId: string, newStatus: string) => {
    try {
      const headers = await getHeaders();
      await fetch(
        `${API_URL}/api/obligations/${obligationId}/status?status=${newStatus}`,
        { method: "PATCH", headers }
      );
      loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "فشل تحديث الحالة");
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
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 px-6 py-4">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => router.push("/")}
              className="text-slate-400 hover:text-tam-primary transition-colors"
            >
              <ArrowRight size={20} />
            </button>
            <div>
              <h1 className="text-sm font-semibold text-tam-primary">
                الاستخبارات التنظيمية
              </h1>
              <p className="text-[11px] text-slate-400">
                Regulatory Intelligence Dashboard
              </p>
            </div>
          </div>
          <div className="w-8 h-8 bg-gradient-to-br from-tam-accent to-tam-light rounded-lg flex items-center justify-center">
            <Scale size={16} className="text-white" />
          </div>
        </div>
      </header>

      <div className="max-w-6xl mx-auto p-6">
        {/* Summary Cards */}
        {summary && (
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
            <div className="bg-white border border-slate-200 rounded-xl p-4 text-center">
              <p className="text-2xl font-bold text-slate-700">{summary.total}</p>
              <p className="text-[10px] text-slate-500 mt-1">إجمالي الالتزامات</p>
              <p className="text-[10px] text-slate-400">Total</p>
            </div>
            <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4 text-center">
              <p className="text-2xl font-bold text-yellow-700">{summary.pending}</p>
              <p className="text-[10px] text-yellow-600 mt-1">قيد الانتظار</p>
              <p className="text-[10px] text-yellow-500">Pending</p>
            </div>
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-center">
              <p className="text-2xl font-bold text-blue-700">{summary.acknowledged}</p>
              <p className="text-[10px] text-blue-600 mt-1">قيد المعالجة</p>
              <p className="text-[10px] text-blue-500">In Progress</p>
            </div>
            <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 text-center">
              <p className="text-2xl font-bold text-emerald-700">{summary.completed}</p>
              <p className="text-[10px] text-emerald-600 mt-1">مكتمل</p>
              <p className="text-[10px] text-emerald-500">Completed</p>
            </div>
            <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-center">
              <p className="text-2xl font-bold text-red-700">{summary.high_priority_open}</p>
              <p className="text-[10px] text-red-600 mt-1">عالية الأولوية</p>
              <p className="text-[10px] text-red-500">High Priority Open</p>
            </div>
          </div>
        )}

        {/* Category breakdown */}
        {summary && Object.keys(summary.by_category).length > 0 && (
          <div className="bg-white border border-slate-200 rounded-xl p-5 mb-6">
            <h3 className="text-xs font-semibold text-tam-primary mb-3 flex items-center gap-2">
              <BarChart3 size={14} />
              التوزيع حسب الفئة — By Category
            </h3>
            <div className="flex flex-wrap gap-2">
              {Object.entries(summary.by_category)
                .sort(([, a], [, b]) => b - a)
                .map(([cat, count]) => (
                  <span
                    key={cat}
                    className="text-xs bg-tam-light/10 text-tam-light px-3 py-1.5 rounded-full font-medium"
                  >
                    {CATEGORY_LABELS[cat] || cat}: {count}
                  </span>
                ))}
            </div>
          </div>
        )}

        {/* Filters */}
        <div className="flex flex-wrap gap-2 mb-6 items-center">
          <Filter size={14} className="text-slate-400" />
          <select
            value={filterCategory}
            onChange={(e) => setFilterCategory(e.target.value)}
            className="text-xs border border-slate-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:border-tam-light"
          >
            <option value="">جميع الفئات</option>
            {Object.entries(CATEGORY_LABELS).map(([key, label]) => (
              <option key={key} value={key}>{label}</option>
            ))}
          </select>
          <select
            value={filterPriority}
            onChange={(e) => setFilterPriority(e.target.value)}
            className="text-xs border border-slate-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:border-tam-light"
          >
            <option value="">جميع الأولويات</option>
            <option value="high">عالية — High</option>
            <option value="medium">متوسطة — Medium</option>
            <option value="low">منخفضة — Low</option>
          </select>
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="text-xs border border-slate-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:border-tam-light"
          >
            <option value="">جميع الحالات</option>
            <option value="pending">قيد الانتظار</option>
            <option value="acknowledged">قيد المعالجة</option>
            <option value="completed">مكتمل</option>
          </select>
        </div>

        {error && (
          <div className="bg-red-50 text-red-700 text-xs rounded-lg p-3 mb-4">{error}</div>
        )}

        {isLoading && (
          <div className="text-center py-12">
            <Loader2 size={24} className="animate-spin text-tam-light mx-auto mb-3" />
            <p className="text-sm text-slate-500">جاري التحميل...</p>
          </div>
        )}

        {/* Obligations List */}
        {!isLoading && obligations.length === 0 && (
          <div className="text-center py-16">
            <Shield size={40} className="text-slate-300 mx-auto mb-4" />
            <p className="text-sm text-slate-600 mb-1">لا توجد التزامات تنظيمية</p>
            <p className="text-xs text-slate-400">
              No regulatory obligations found. Run the scraper to detect new circulars.
            </p>
          </div>
        )}

        {!isLoading && obligations.length > 0 && (
          <div className="space-y-3">
            {obligations.map((ob) => {
              const prCfg = PRIORITY_CONFIG[ob.priority] || PRIORITY_CONFIG.medium;
              const stCfg = STATUS_CONFIG[ob.status] || STATUS_CONFIG.pending;
              const StIcon = stCfg.icon;

              return (
                <div
                  key={ob.id}
                  className="bg-white border border-slate-200 rounded-xl p-5"
                >
                  <div className="flex items-start gap-3">
                    {/* Priority indicator */}
                    <div className={`rounded-lg p-1.5 mt-0.5 ${prCfg.bg}`}>
                      <AlertTriangle size={14} className={prCfg.color} />
                    </div>

                    <div className="flex-1 min-w-0">
                      {/* Badges row */}
                      <div className="flex items-center gap-2 flex-wrap mb-2">
                        <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${prCfg.bg} ${prCfg.color}`}>
                          {prCfg.label}
                        </span>
                        <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full border ${stCfg.color}`}>
                          {stCfg.label}
                        </span>
                        <span className="text-[10px] bg-tam-light/10 text-tam-light px-2 py-0.5 rounded-full">
                          {CATEGORY_LABELS[ob.category] || ob.category}
                        </span>
                        {ob.deadline && (
                          <span className="text-[10px] text-slate-400 flex items-center gap-1">
                            <Clock size={10} />
                            {ob.deadline}
                          </span>
                        )}
                      </div>

                      {/* Obligation text */}
                      <p dir="auto" className="text-sm text-slate-800 leading-7 mb-1">
                        {ob.obligation}
                      </p>
                      {ob.obligation_en && (
                        <p className="text-xs text-slate-400 leading-5 mb-2">
                          {ob.obligation_en}
                        </p>
                      )}

                      {/* Source alert */}
                      {ob.alerts && (
                        <div className="text-[10px] text-slate-400 mb-2">
                          المصدر: {ob.alerts.title_en || ob.alerts.title}
                        </div>
                      )}

                      {/* Affected roles */}
                      {ob.affected_roles && ob.affected_roles.length > 0 && (
                        <div className="flex flex-wrap gap-1 mb-3">
                          {ob.affected_roles.map((role) => (
                            <span
                              key={role}
                              className="text-[10px] bg-slate-100 text-slate-500 px-2 py-0.5 rounded"
                            >
                              {role}
                            </span>
                          ))}
                        </div>
                      )}

                      {/* Action buttons */}
                      {ob.status !== "completed" && (
                        <div className="flex gap-2">
                          {ob.status === "pending" && (
                            <button
                              onClick={() => handleStatusChange(ob.id, "acknowledged")}
                              className="text-[10px] px-3 py-1.5 bg-blue-50 text-blue-700 rounded-lg hover:bg-blue-100 transition-colors font-medium"
                            >
                              استلام — Acknowledge
                            </button>
                          )}
                          <button
                            onClick={() => handleStatusChange(ob.id, "completed")}
                            className="text-[10px] px-3 py-1.5 bg-emerald-50 text-emerald-700 rounded-lg hover:bg-emerald-100 transition-colors font-medium"
                          >
                            إكمال — Complete
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
