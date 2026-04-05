"use client";

import { useState, useEffect } from "react";
import {
  Brain,
  Loader2,
  BookOpen,
  Plus,
  Trash2,
  TrendingUp,
  TrendingDown,
  Minus,
  BarChart3,
  Settings2,
  Sparkles,
  RefreshCcw,
  ChevronDown,
  ChevronUp,
  FileText,
  Tag,
  CheckCircle2,
  XCircle,
  Clock,
} from "lucide-react";
import { useRequireAuth } from "@/lib/useRequireAuth";
import { supabase } from "@/lib/supabase";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

/* ── Types ──────────────────────────────────────────────── */
interface KBEntry {
  id: string;
  title: string;
  title_ar?: string;
  content: string;
  category: string;
  tags: string[];
  source_type: string;
  embedding_status: string;
  is_active: boolean;
  created_at: string;
}

interface PromptConfig {
  id: string;
  firm_id: string;
  config_key: string;
  config_value: string;
  config_value_ar?: string;
  description?: string;
  learned_from?: string;
  confidence_score?: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

interface TrendPoint {
  period: string;
  approval_rate: number;
  total: number;
  improvement: number | null;
}

interface AccuracySummary {
  current_approval_rate: number;
  trend_direction: "improving" | "declining" | "stable";
  best_feature: string | null;
  best_feature_rate: number;
  worst_feature: string | null;
  worst_feature_rate: number;
  total_feedback_collected: number;
  overall_improvement: number;
  last_computed_at: string;
}

interface LearningEvent {
  id: string;
  event_type: string;
  description: string;
  description_ar?: string;
  triggered_by: string;
  created_at: string;
}

/* ── Helpers ────────────────────────────────────────────── */
async function authHeaders() {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${session?.access_token}`,
  };
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function TrendBadge({ value }: { value: number | null }) {
  if (value === null || value === undefined)
    return <span className="text-xs text-gray-400">—</span>;
  if (value > 0)
    return (
      <span className="inline-flex items-center gap-0.5 text-xs text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded">
        <TrendingUp size={12} /> +{value.toFixed(1)}%
      </span>
    );
  if (value < 0)
    return (
      <span className="inline-flex items-center gap-0.5 text-xs text-red-600 bg-red-50 px-1.5 py-0.5 rounded">
        <TrendingDown size={12} /> {value.toFixed(1)}%
      </span>
    );
  return (
    <span className="inline-flex items-center gap-0.5 text-xs text-gray-500 bg-gray-50 px-1.5 py-0.5 rounded">
      <Minus size={12} /> 0%
    </span>
  );
}

/* ── Main Page ──────────────────────────────────────────── */
export default function LearningDashboardPage() {
  const { user, isLoading: isAuthLoading } = useRequireAuth();
  const [activeTab, setActiveTab] = useState<
    "overview" | "knowledge" | "prompts" | "accuracy"
  >("overview");

  if (isAuthLoading || !user) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Loader2 size={32} className="animate-spin text-tam-light" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50" dir="rtl">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-gradient-to-br from-purple-500 to-indigo-600 rounded-xl flex items-center justify-center">
            <Brain size={22} className="text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900">
              التعلم التكيفي
            </h1>
            <p className="text-sm text-gray-500">
              Adaptive Learning Dashboard — AI quality tracking &amp; knowledge
              base
            </p>
          </div>
        </div>
      </header>

      {/* Tabs */}
      <div className="bg-white border-b border-gray-200 px-6">
        <nav className="flex gap-6 -mb-px" dir="ltr">
          {(
            [
              ["overview", "Overview", BarChart3],
              ["knowledge", "Knowledge Base", BookOpen],
              ["prompts", "Prompt Configs", Settings2],
              ["accuracy", "Accuracy Metrics", Sparkles],
            ] as const
          ).map(([key, label, Icon]) => (
            <button
              key={key}
              onClick={() => setActiveTab(key as typeof activeTab)}
              className={`flex items-center gap-1.5 py-3 px-1 text-sm font-medium border-b-2 transition-colors ${
                activeTab === key
                  ? "border-indigo-600 text-indigo-600"
                  : "border-transparent text-gray-500 hover:text-gray-700"
              }`}
            >
              <Icon size={16} />
              {label}
            </button>
          ))}
        </nav>
      </div>

      {/* Content */}
      <main className="max-w-7xl mx-auto px-6 py-6">
        {activeTab === "overview" && <OverviewTab />}
        {activeTab === "knowledge" && <KnowledgeTab />}
        {activeTab === "prompts" && <PromptsTab />}
        {activeTab === "accuracy" && <AccuracyTab />}
      </main>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   OVERVIEW TAB
   ═══════════════════════════════════════════════════════════ */
function OverviewTab() {
  const [summary, setSummary] = useState<AccuracySummary | null>(null);
  const [events, setEvents] = useState<LearningEvent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const h = await authHeaders();
      const [sumRes, evtRes] = await Promise.all([
        fetch(`${API_URL}/api/accuracy/summary`, { headers: h }).catch(
          () => null
        ),
        fetch(`${API_URL}/api/accuracy/trends?feature=all&last_n_periods=4`, {
          headers: h,
        }).catch(() => null),
      ]);

      if (sumRes?.ok) setSummary(await sumRes.json());

      // Also fetch learning events
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const eventsRes = await fetch(
          `${API_URL}/api/prompts/configs`,
          { headers: { Authorization: `Bearer ${session?.access_token}` } }
        );
        // We'll use a simple fallback for events
      } catch {}

      setLoading(false);
    })();
  }, []);

  if (loading)
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="animate-spin text-indigo-500" size={28} />
      </div>
    );

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <KpiCard
          label="معدل الموافقة الإجمالي"
          sublabel="Overall Approval Rate"
          value={summary ? `${summary.current_approval_rate.toFixed(1)}%` : "—"}
          icon={<CheckCircle2 size={20} />}
          color="emerald"
        />
        <KpiCard
          label="إجمالي الملاحظات"
          sublabel="Total Feedback"
          value={summary?.total_feedback_collected?.toLocaleString() ?? "0"}
          icon={<BarChart3 size={20} />}
          color="blue"
        />
        <KpiCard
          label="الاتجاه العام"
          sublabel="Overall Trend"
          value={
            summary?.trend_direction === "improving"
              ? "تحسّن"
              : summary?.trend_direction === "declining"
                ? "انخفاض"
                : "مستقر"
          }
          icon={
            summary?.trend_direction === "improving" ? (
              <TrendingUp size={20} />
            ) : summary?.trend_direction === "declining" ? (
              <TrendingDown size={20} />
            ) : (
              <Minus size={20} />
            )
          }
          color={
            summary?.trend_direction === "improving"
              ? "emerald"
              : summary?.trend_direction === "declining"
                ? "red"
                : "gray"
          }
        />
        <KpiCard
          label="التحسن العام"
          sublabel="Overall Improvement"
          value={summary ? `${summary.overall_improvement >= 0 ? "+" : ""}${summary.overall_improvement.toFixed(1)}%` : "—"}
          icon={<Sparkles size={20} />}
          color="purple"
        />
      </div>

      {/* Best / Worst Feature */}
      {summary && (summary.best_feature || summary.worst_feature) && (
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h3 className="text-sm font-semibold text-gray-800 mb-4" dir="ltr">
              Feature Quality Highlights
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {summary.best_feature && (
                <div className="border border-emerald-100 bg-emerald-50/30 rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <CheckCircle2 size={16} className="text-emerald-600" />
                    <span className="text-sm font-medium text-emerald-800">Best Feature</span>
                  </div>
                  <p className="text-lg font-bold text-emerald-700 capitalize">{summary.best_feature}</p>
                  <p className="text-xs text-emerald-600 mt-1">{summary.best_feature_rate.toFixed(1)}% approval rate</p>
                </div>
              )}
              {summary.worst_feature && (
                <div className="border border-red-100 bg-red-50/30 rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <XCircle size={16} className="text-red-600" />
                    <span className="text-sm font-medium text-red-800">Needs Improvement</span>
                  </div>
                  <p className="text-lg font-bold text-red-700 capitalize">{summary.worst_feature}</p>
                  <p className="text-xs text-red-600 mt-1">{summary.worst_feature_rate.toFixed(1)}% approval rate</p>
                </div>
              )}
            </div>
          </div>
        )}

      {/* Empty State */}
      {!summary && (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
          <Brain size={48} className="mx-auto text-gray-300 mb-4" />
          <h3 className="text-lg font-medium text-gray-700 mb-2">
            لا توجد بيانات بعد
          </h3>
          <p className="text-sm text-gray-500 max-w-md mx-auto">
            سيبدأ النظام بتتبع جودة الذكاء الاصطناعي تلقائيًا مع استخدام
            الميزات المختلفة. تحقق لاحقًا لرؤية الاتجاهات والمقاييس.
          </p>
          <p className="text-xs text-gray-400 mt-2" dir="ltr">
            Metrics will populate automatically as features are used.
          </p>
        </div>
      )}
    </div>
  );
}

function KpiCard({
  label,
  sublabel,
  value,
  icon,
  color,
}: {
  label: string;
  sublabel: string;
  value: string;
  icon: React.ReactNode;
  color: string;
}) {
  const colorMap: Record<string, string> = {
    emerald: "bg-emerald-50 text-emerald-600",
    blue: "bg-blue-50 text-blue-600",
    purple: "bg-purple-50 text-purple-600",
    red: "bg-red-50 text-red-600",
    gray: "bg-gray-50 text-gray-600",
  };
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4">
      <div className="flex items-center gap-3 mb-3">
        <div
          className={`w-9 h-9 rounded-lg flex items-center justify-center ${colorMap[color] || colorMap.gray}`}
        >
          {icon}
        </div>
        <div>
          <p className="text-xs text-gray-500">{label}</p>
          <p className="text-[10px] text-gray-400" dir="ltr">
            {sublabel}
          </p>
        </div>
      </div>
      <p className="text-2xl font-bold text-gray-900" dir="ltr">
        {value}
      </p>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   KNOWLEDGE BASE TAB
   ═══════════════════════════════════════════════════════════ */
function KnowledgeTab() {
  const [entries, setEntries] = useState<KBEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [filter, setFilter] = useState("all");

  // New entry form
  const [newTitle, setNewTitle] = useState("");
  const [newContent, setNewContent] = useState("");
  const [newCategory, setNewCategory] = useState("policy");
  const [newTags, setNewTags] = useState("");
  const [saving, setSaving] = useState(false);

  const fetchEntries = async () => {
    setLoading(true);
    const h = await authHeaders();
    const params = filter !== "all" ? `?category=${filter}` : "";
    const res = await fetch(`${API_URL}/api/knowledge/items${params}`, {
      headers: h,
    }).catch(() => null);
    if (res?.ok) {
      const data = await res.json();
      setEntries(Array.isArray(data) ? data : []);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchEntries();
  }, [filter]);

  const handleAdd = async () => {
    if (!newTitle.trim() || !newContent.trim()) return;
    setSaving(true);
    const h = await authHeaders();
    const res = await fetch(`${API_URL}/api/knowledge/items`, {
      method: "POST",
      headers: h,
      body: JSON.stringify({
        title: newTitle,
        content: newContent,
        category: newCategory,
        source_type: "manual",
        tags: newTags
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean),
      }),
    }).catch(() => null);
    if (res?.ok) {
      setNewTitle("");
      setNewContent("");
      setNewTags("");
      setShowAdd(false);
      fetchEntries();
    }
    setSaving(false);
  };

  const handleDelete = async (id: string) => {
    const h = await authHeaders();
    await fetch(`${API_URL}/api/knowledge/items/${id}`, {
      method: "DELETE",
      headers: h,
    }).catch(() => null);
    setEntries((prev) => prev.filter((e) => e.id !== id));
  };

  const categories = [
    "all",
    "policy",
    "decision",
    "procedure",
    "template",
    "guideline",
    "faq",
  ];

  return (
    <div className="space-y-4">
      {/* Header Row */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex gap-2 flex-wrap" dir="ltr">
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setFilter(cat)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium capitalize transition-colors ${
                filter === cat
                  ? "bg-indigo-600 text-white"
                  : "bg-white border border-gray-200 text-gray-600 hover:bg-gray-50"
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
        <button
          onClick={() => setShowAdd(!showAdd)}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 text-white rounded-lg text-sm hover:bg-indigo-700 transition-colors"
        >
          <Plus size={14} />
          إضافة معرفة جديدة
        </button>
      </div>

      {/* Add Form */}
      {showAdd && (
        <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
          <h3 className="text-sm font-semibold text-gray-800">
            إضافة عنصر جديد للقاعدة المعرفية
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <input
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              placeholder="العنوان / Title"
              className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none"
            />
            <select
              value={newCategory}
              onChange={(e) => setNewCategory(e.target.value)}
              className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none"
            >
              <option value="policy">Policy</option>
              <option value="decision">Decision</option>
              <option value="procedure">Procedure</option>
              <option value="template">Template</option>
              <option value="guideline">Guideline</option>
              <option value="faq">FAQ</option>
            </select>
          </div>
          <textarea
            value={newContent}
            onChange={(e) => setNewContent(e.target.value)}
            placeholder="المحتوى / Content"
            rows={4}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none resize-none"
          />
          <input
            value={newTags}
            onChange={(e) => setNewTags(e.target.value)}
            placeholder="الوسوم (مفصولة بفاصلة) / Tags (comma separated)"
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none"
          />
          <div className="flex gap-2 justify-end">
            <button
              onClick={() => setShowAdd(false)}
              className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800"
            >
              إلغاء
            </button>
            <button
              onClick={handleAdd}
              disabled={saving || !newTitle.trim() || !newContent.trim()}
              className="px-4 py-2 bg-indigo-600 text-white text-sm rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors"
            >
              {saving ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                "حفظ"
              )}
            </button>
          </div>
        </div>
      )}

      {/* List */}
      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="animate-spin text-indigo-500" size={24} />
        </div>
      ) : entries.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
          <BookOpen size={40} className="mx-auto text-gray-300 mb-3" />
          <p className="text-sm text-gray-500">
            لا توجد عناصر في القاعدة المعرفية بعد
          </p>
          <p className="text-xs text-gray-400 mt-1" dir="ltr">
            No knowledge base entries yet. Add one above or let the AI learn
            from feedback.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {entries.map((entry) => (
            <div
              key={entry.id}
              className="bg-white rounded-xl border border-gray-200 p-4 hover:shadow-sm transition-shadow"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <h4 className="text-sm font-medium text-gray-900">
                      {entry.title}
                    </h4>
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-600 capitalize">
                      {entry.category}
                    </span>
                    {entry.source_type && (
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">
                        {entry.source_type}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-gray-500 line-clamp-2">
                    {entry.content}
                  </p>
                  {entry.tags?.length > 0 && (
                    <div className="flex gap-1 mt-2 flex-wrap">
                      {entry.tags.map((tag, i) => (
                        <span
                          key={i}
                          className="text-[10px] px-1.5 py-0.5 bg-gray-50 text-gray-500 rounded"
                        >
                          <Tag size={8} className="inline mr-0.5" />
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-gray-400">
                    {fmtDate(entry.created_at)}
                  </span>
                  <button
                    onClick={() => handleDelete(entry.id)}
                    className="text-gray-300 hover:text-red-500 transition-colors"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   PROMPTS TAB
   ═══════════════════════════════════════════════════════════ */
function PromptsTab() {
  const [configs, setConfigs] = useState<PromptConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState(false);

  const fetchConfigs = async () => {
    setLoading(true);
    const h = await authHeaders();
    const res = await fetch(`${API_URL}/api/prompts/configs`, {
      headers: h,
    }).catch(() => null);
    if (res?.ok) {
      const data = await res.json();
      setConfigs(Array.isArray(data) ? data : []);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchConfigs();
  }, []);

  const handleAnalyzeFeedback = async () => {
    setAnalyzing(true);
    const h = await authHeaders();
    await fetch(`${API_URL}/api/prompts/analyze-feedback`, {
      method: "POST",
      headers: h,
    }).catch(() => null);
    await fetchConfigs();
    setAnalyzing(false);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500">
          إعدادات المطالبات المخصصة لشركتك — يتم تعلمها تلقائيًا من الملاحظات
        </p>
        <button
          onClick={handleAnalyzeFeedback}
          disabled={analyzing}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-purple-600 text-white rounded-lg text-sm hover:bg-purple-700 disabled:opacity-50 transition-colors"
        >
          {analyzing ? (
            <Loader2 size={14} className="animate-spin" />
          ) : (
            <RefreshCcw size={14} />
          )}
          تحليل الملاحظات
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="animate-spin text-purple-500" size={24} />
        </div>
      ) : configs.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
          <Settings2 size={40} className="mx-auto text-gray-300 mb-3" />
          <p className="text-sm text-gray-500">
            لم يتم تخصيص أي إعدادات بعد
          </p>
          <p className="text-xs text-gray-400 mt-1" dir="ltr">
            Click &ldquo;Analyze Feedback&rdquo; to auto-generate prompt
            configurations from user feedback patterns.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {configs.map((cfg) => (
            <div
              key={cfg.id}
              className="bg-white rounded-xl border border-gray-200 overflow-hidden"
            >
              <button
                onClick={() =>
                  setExpandedId(expandedId === cfg.id ? null : cfg.id)
                }
                className="w-full flex items-center justify-between p-4 hover:bg-gray-50 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 bg-purple-50 rounded-lg flex items-center justify-center">
                    <Settings2 size={16} className="text-purple-600" />
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-medium text-gray-900 capitalize">
                      {cfg.config_key.replace(/_/g, " ")}
                    </p>
                    <p className="text-[10px] text-gray-400">
                      {cfg.learned_from || "manual"}
                      {cfg.confidence_score != null && ` · Confidence: ${cfg.confidence_score.toFixed(0)}%`}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span
                    className={`text-[10px] px-2 py-0.5 rounded-full ${cfg.is_active ? "bg-emerald-50 text-emerald-600" : "bg-gray-100 text-gray-500"}`}
                  >
                    {cfg.is_active ? "Active" : "Inactive"}
                  </span>
                  {expandedId === cfg.id ? (
                    <ChevronUp size={16} className="text-gray-400" />
                  ) : (
                    <ChevronDown size={16} className="text-gray-400" />
                  )}
                </div>
              </button>
              {expandedId === cfg.id && (
                <div className="px-4 pb-4 border-t border-gray-100 pt-3">
                  <div className="bg-gray-50 rounded-lg p-3">
                    <p className="text-xs text-gray-600 whitespace-pre-wrap" dir="ltr">
                      {cfg.config_value}
                    </p>
                  </div>
                  {cfg.description && (
                    <p className="text-xs text-gray-500 mt-2">
                      {cfg.description}
                    </p>
                  )}
                  {cfg.confidence_score != null && (
                    <div className="mt-3">
                      <div className="flex justify-between text-[10px] text-gray-400 mb-1">
                        <span>Confidence</span>
                        <span>{cfg.confidence_score.toFixed(0)}%</span>
                      </div>
                      <div className="w-full bg-gray-100 rounded-full h-1.5">
                        <div
                          className="h-1.5 rounded-full bg-purple-500"
                          style={{
                            width: `${Math.min(cfg.confidence_score, 100)}%`,
                          }}
                        />
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   ACCURACY TAB
   ═══════════════════════════════════════════════════════════ */
function AccuracyTab() {
  const [metrics, setMetrics] = useState<TrendPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [computing, setComputing] = useState(false);
  const [selectedFeature, setSelectedFeature] = useState("all");

  const fetchMetrics = async () => {
    setLoading(true);
    const h = await authHeaders();
    const res = await fetch(
      `${API_URL}/api/accuracy/trends?feature=${selectedFeature}&last_n_periods=12`,
      { headers: h }
    ).catch(() => null);
    if (res?.ok) {
      const data = await res.json();
      setMetrics(Array.isArray(data.trends) ? data.trends : []);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchMetrics();
  }, [selectedFeature]);

  const handleCompute = async () => {
    setComputing(true);
    const h = await authHeaders();
    await fetch(`${API_URL}/api/accuracy/compute-all?weeks_back=12`, {
      method: "POST",
      headers: h,
    }).catch(() => null);
    await fetchMetrics();
    setComputing(false);
  };

  const features = [
    "all",
    "chat",
    "review",
    "docgen",
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex gap-2 flex-wrap" dir="ltr">
          {features.map((f) => (
            <button
              key={f}
              onClick={() => setSelectedFeature(f)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium capitalize transition-colors ${
                selectedFeature === f
                  ? "bg-indigo-600 text-white"
                  : "bg-white border border-gray-200 text-gray-600 hover:bg-gray-50"
              }`}
            >
              {f}
            </button>
          ))}
        </div>
        <button
          onClick={handleCompute}
          disabled={computing}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 text-white rounded-lg text-sm hover:bg-indigo-700 disabled:opacity-50 transition-colors"
        >
          {computing ? (
            <Loader2 size={14} className="animate-spin" />
          ) : (
            <RefreshCcw size={14} />
          )}
          حساب المقاييس
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="animate-spin text-indigo-500" size={24} />
        </div>
      ) : metrics.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
          <BarChart3 size={40} className="mx-auto text-gray-300 mb-3" />
          <p className="text-sm text-gray-500">
            لا توجد مقاييس دقة بعد
          </p>
          <p className="text-xs text-gray-400 mt-1" dir="ltr">
            Click &ldquo;Compute Metrics&rdquo; to generate accuracy data from
            feedback history.
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm" dir="ltr">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">
                    Period
                  </th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-gray-500">
                    Total
                  </th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-gray-500">
                    Approval Rate
                  </th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-gray-500">
                    Trend
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {metrics.map((m, i) => (
                  <tr key={i} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-xs text-gray-600">
                      {fmtDate(m.period)}
                    </td>
                    <td className="px-4 py-3 text-center text-xs text-gray-600">
                      {m.total}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span
                        className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                          m.approval_rate >= 80
                            ? "bg-emerald-50 text-emerald-700"
                            : m.approval_rate >= 60
                              ? "bg-yellow-50 text-yellow-700"
                              : "bg-red-50 text-red-700"
                        }`}
                      >
                        {m.approval_rate.toFixed(1)}%
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <TrendBadge value={m.improvement} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
