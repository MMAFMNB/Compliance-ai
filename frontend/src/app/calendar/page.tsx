"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  Calendar,
  Clock,
  AlertTriangle,
  Plus,
  CheckCircle2,
  Loader2,
  ArrowRight,
  Scale,
} from "lucide-react";
import { useRequireAuth } from "@/lib/useRequireAuth";
import { supabase } from "@/lib/supabase";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

interface Deadline {
  id: string;
  title: string;
  title_en: string | null;
  deadline_date: string;
  category: string;
  description: string | null;
  notes: string | null;
  status: string;
  cma_reference: string | null;
  frequency: string | null;
  is_recurring: boolean;
  completed_at: string | null;
}

interface Stats {
  total: number;
  overdue: number;
  upcoming_7d: number;
}

const CATEGORY_CONFIG: Record<string, { label: string; color: string }> = {
  quarterly_report: { label: "تقارير ربعية", color: "text-blue-600 bg-blue-50" },
  annual_report: { label: "تقارير سنوية", color: "text-purple-600 bg-purple-50" },
  aml: { label: "مكافحة غسل الأموال", color: "text-red-600 bg-red-50" },
  fund_report: { label: "تقارير الصناديق", color: "text-green-600 bg-green-50" },
  board_notification: { label: "إشعارات مجلس الإدارة", color: "text-amber-600 bg-amber-50" },
  other: { label: "أخرى", color: "text-slate-500 bg-slate-100" },
};

const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  pending: { label: "قيد الانتظار", color: "text-yellow-700 bg-yellow-50 border-yellow-200" },
  in_progress: { label: "قيد التنفيذ", color: "text-blue-700 bg-blue-50 border-blue-200" },
  completed: { label: "مكتمل", color: "text-green-700 bg-green-50 border-green-200" },
  overdue: { label: "متأخر", color: "text-red-700 bg-red-50 border-red-200" },
};

const CATEGORY_FILTERS = [
  { key: "all", label: "الكل" },
  { key: "quarterly_report", label: "تقارير ربعية" },
  { key: "annual_report", label: "تقارير سنوية" },
  { key: "aml", label: "مكافحة غسل الأموال" },
  { key: "fund_report", label: "تقارير الصناديق" },
  { key: "board_notification", label: "إشعارات مجلس الإدارة" },
  { key: "other", label: "أخرى" },
];

function getDaysRemaining(dateStr: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const deadline = new Date(dateStr);
  deadline.setHours(0, 0, 0, 0);
  return Math.ceil((deadline.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

export default function CalendarPage() {
  const router = useRouter();
  const { user, isLoading: isAuthLoading } = useRequireAuth();

  const [deadlines, setDeadlines] = useState<Deadline[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [selectedDeadline, setSelectedDeadline] = useState<string | null>(null);
  const [stats, setStats] = useState<Stats>({ total: 0, overdue: 0, upcoming_7d: 0 });
  const [showAddForm, setShowAddForm] = useState(false);
  const [editNotes, setEditNotes] = useState<Record<string, string>>({});
  const [editStatus, setEditStatus] = useState<Record<string, string>>({});
  const [savingId, setSavingId] = useState<string | null>(null);

  const [newDeadline, setNewDeadline] = useState({
    title: "",
    title_en: "",
    deadline_date: "",
    category: "other",
    description: "",
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (user) fetchDeadlines();
  }, [user]);

  const fetchDeadlines = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`${API_URL}/api/calendar/deadlines`, {
        headers: { Authorization: `Bearer ${session?.access_token}` },
      });
      if (!res.ok) throw new Error(`${res.status}`);
      const data = await res.json();
      setDeadlines(data.deadlines || []);

      const now = new Date();
      now.setHours(0, 0, 0, 0);
      const in7Days = new Date(now);
      in7Days.setDate(in7Days.getDate() + 7);

      const allDeadlines: Deadline[] = data.deadlines || [];
      const overdueCount = allDeadlines.filter((d) => {
        const dd = new Date(d.deadline_date);
        dd.setHours(0, 0, 0, 0);
        return dd < now && d.status !== "completed";
      }).length;
      const upcoming7d = allDeadlines.filter((d) => {
        const dd = new Date(d.deadline_date);
        dd.setHours(0, 0, 0, 0);
        return dd >= now && dd <= in7Days && d.status !== "completed";
      }).length;

      setStats({ total: allDeadlines.length, overdue: overdueCount, upcoming_7d: upcoming7d });
    } catch (err) {
      console.error("Failed to fetch deadlines:", err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleExpand = (deadlineId: string) => {
    if (selectedDeadline === deadlineId) {
      setSelectedDeadline(null);
    } else {
      setSelectedDeadline(deadlineId);
      const dl = deadlines.find((d) => d.id === deadlineId);
      if (dl) {
        setEditNotes((prev) => ({ ...prev, [deadlineId]: dl.notes || "" }));
        setEditStatus((prev) => ({ ...prev, [deadlineId]: dl.status }));
      }
    }
  };

  const handleSaveStatus = async (deadlineId: string) => {
    setSavingId(deadlineId);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`${API_URL}/api/calendar/deadlines/${deadlineId}/status`, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${session?.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          status: editStatus[deadlineId],
          notes: editNotes[deadlineId],
        }),
      });
      if (!res.ok) throw new Error(`${res.status}`);
      setDeadlines((prev) =>
        prev.map((d) =>
          d.id === deadlineId
            ? { ...d, status: editStatus[deadlineId], notes: editNotes[deadlineId] }
            : d
        )
      );
      setSelectedDeadline(null);
    } catch (err) {
      console.error("Failed to update deadline:", err);
    } finally {
      setSavingId(null);
    }
  };

  const handleAddDeadline = async () => {
    if (!newDeadline.title || !newDeadline.deadline_date) return;
    setIsSubmitting(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`${API_URL}/api/calendar/deadlines`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session?.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(newDeadline),
      });
      if (!res.ok) throw new Error(`${res.status}`);
      setNewDeadline({ title: "", title_en: "", deadline_date: "", category: "other", description: "" });
      setShowAddForm(false);
      await fetchDeadlines();
    } catch (err) {
      console.error("Failed to add deadline:", err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const filteredDeadlines = categoryFilter === "all"
    ? deadlines
    : deadlines.filter((d) => d.category === categoryFilter);

  const upcomingDeadlines = filteredDeadlines.filter((d) => {
    const days = getDaysRemaining(d.deadline_date);
    return days >= 0 && days <= 7 && d.status !== "completed";
  });

  const otherDeadlines = filteredDeadlines.filter((d) => {
    const days = getDaysRemaining(d.deadline_date);
    return !(days >= 0 && days <= 7 && d.status !== "completed");
  });

  if (isAuthLoading || !user) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Loader2 size={32} className="animate-spin text-tam-light" />
      </div>
    );
  }

  const renderDeadlineCard = (deadline: Deadline) => {
    const catConfig = CATEGORY_CONFIG[deadline.category] || CATEGORY_CONFIG.other;
    const statusConfig = STATUS_CONFIG[deadline.status] || STATUS_CONFIG.pending;
    const daysRemaining = getDaysRemaining(deadline.deadline_date);
    const isExpanded = selectedDeadline === deadline.id;
    const isUpcoming = daysRemaining >= 0 && daysRemaining <= 7 && deadline.status !== "completed";

    return (
      <div
        key={deadline.id}
        className={`bg-white border rounded-xl transition-all ${
          isUpcoming ? "border-amber-300 shadow-sm" : "border-slate-200"
        }`}
      >
        <button
          onClick={() => handleExpand(deadline.id)}
          className="w-full p-5 text-right"
        >
          <div className="flex items-start gap-3">
            <div className={`rounded-lg p-1.5 mt-0.5 ${
              daysRemaining < 0 ? "text-red-600 bg-red-50" : isUpcoming ? "text-amber-600 bg-amber-50" : "text-tam-light bg-tam-light/10"
            }`}>
              {daysRemaining < 0 ? <AlertTriangle size={14} /> : <Calendar size={14} />}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1 flex-wrap">
                <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${catConfig.color}`}>
                  {catConfig.label}
                </span>
                <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full border ${statusConfig.color}`}>
                  {statusConfig.label}
                </span>
                <span className="text-[10px] text-slate-400 flex items-center gap-1">
                  <Clock size={10} />
                  {daysRemaining === 0
                    ? "اليوم"
                    : daysRemaining > 0
                    ? `${daysRemaining} يوم متبقي`
                    : `متأخر ${Math.abs(daysRemaining)} يوم`}
                </span>
              </div>
              <p dir="auto" className="text-sm font-medium text-slate-800 leading-6">
                {deadline.title}
              </p>
              {deadline.title_en && deadline.title_en !== deadline.title && (
                <p className="text-xs text-slate-400 mt-0.5">{deadline.title_en}</p>
              )}
              <p className="text-[10px] text-slate-400 mt-1">
                {new Date(deadline.deadline_date).toLocaleDateString("ar-SA", {
                  year: "numeric",
                  month: "long",
                  day: "numeric",
                })}
              </p>
              {deadline.cma_reference && (
                <p className="text-[10px] text-slate-400 mt-0.5">
                  مرجع الهيئة: {deadline.cma_reference}
                </p>
              )}
            </div>
          </div>
        </button>

        {isExpanded && (
          <div className="px-5 pb-5 border-t border-slate-100 pt-4">
            {deadline.description && (
              <div className="bg-slate-50 rounded-lg p-4 mb-3">
                <p dir="auto" className="text-sm text-slate-700 leading-7 whitespace-pre-line">
                  {deadline.description}
                </p>
              </div>
            )}

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">ملاحظات</label>
                <textarea
                  value={editNotes[deadline.id] || ""}
                  onChange={(e) => setEditNotes((prev) => ({ ...prev, [deadline.id]: e.target.value }))}
                  rows={3}
                  dir="auto"
                  className="w-full text-sm border border-slate-200 rounded-lg p-3 focus:outline-none focus:ring-2 focus:ring-tam-light/50 focus:border-tam-light resize-none"
                  placeholder="أضف ملاحظاتك هنا..."
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">الحالة</label>
                <select
                  value={editStatus[deadline.id] || deadline.status}
                  onChange={(e) => setEditStatus((prev) => ({ ...prev, [deadline.id]: e.target.value }))}
                  className="w-full text-sm border border-slate-200 rounded-lg p-2.5 focus:outline-none focus:ring-2 focus:ring-tam-light/50 focus:border-tam-light bg-white"
                >
                  <option value="pending">قيد الانتظار</option>
                  <option value="in_progress">قيد التنفيذ</option>
                  <option value="completed">مكتمل</option>
                </select>
              </div>

              <button
                onClick={() => handleSaveStatus(deadline.id)}
                disabled={savingId === deadline.id}
                className="w-full bg-gradient-to-l from-tam-accent to-tam-light text-white text-sm font-medium py-2.5 rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {savingId === deadline.id ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <CheckCircle2 size={14} />
                )}
                حفظ التغييرات
              </button>
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
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
                تقويم الالتزام والمواعيد النهائية
              </h1>
              <p className="text-[11px] text-slate-400">
                Compliance Calendar &amp; Deadlines
              </p>
            </div>
          </div>
          <div className="w-8 h-8 bg-gradient-to-br from-tam-accent to-tam-light rounded-lg flex items-center justify-center">
            <Scale size={16} className="text-white" />
          </div>
        </div>
      </header>

      <div className="max-w-4xl mx-auto p-6">
        {/* Stats bar */}
        {!isLoading && (
          <div className="grid grid-cols-3 gap-3 mb-6">
            <div className="bg-white rounded-xl border border-slate-200 p-4 text-center">
              <p className="text-2xl font-bold text-tam-primary">{stats.total}</p>
              <p className="text-[11px] text-slate-500 mt-1">إجمالي المواعيد</p>
            </div>
            <div className="bg-white rounded-xl border border-red-200 p-4 text-center">
              <p className="text-2xl font-bold text-red-600">{stats.overdue}</p>
              <p className="text-[11px] text-red-500 mt-1">متأخرة</p>
            </div>
            <div className="bg-white rounded-xl border border-amber-200 p-4 text-center">
              <p className="text-2xl font-bold text-amber-600">{stats.upcoming_7d}</p>
              <p className="text-[11px] text-amber-500 mt-1">خلال 7 أيام</p>
            </div>
          </div>
        )}

        {/* Category filter bar */}
        <div className="flex gap-2 overflow-x-auto pb-3 mb-6 scrollbar-hide">
          {CATEGORY_FILTERS.map((cat) => (
            <button
              key={cat.key}
              onClick={() => setCategoryFilter(cat.key)}
              className={`whitespace-nowrap text-xs font-medium px-4 py-2 rounded-full border transition-colors ${
                categoryFilter === cat.key
                  ? "bg-tam-light text-white border-tam-light"
                  : "bg-white text-slate-600 border-slate-200 hover:border-tam-light/50"
              }`}
            >
              {cat.label}
            </button>
          ))}
        </div>

        {/* Add custom deadline button */}
        <button
          onClick={() => setShowAddForm(!showAddForm)}
          className="w-full mb-6 bg-white border border-dashed border-slate-300 rounded-xl p-4 text-sm text-slate-500 hover:border-tam-light hover:text-tam-light transition-colors flex items-center justify-center gap-2"
        >
          <Plus size={16} />
          إضافة موعد نهائي مخصص
        </button>

        {/* Add deadline form */}
        {showAddForm && (
          <div className="bg-white border border-slate-200 rounded-xl p-5 mb-6 space-y-3">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">العنوان بالعربية *</label>
              <input
                type="text"
                value={newDeadline.title}
                onChange={(e) => setNewDeadline((prev) => ({ ...prev, title: e.target.value }))}
                dir="auto"
                className="w-full text-sm border border-slate-200 rounded-lg p-2.5 focus:outline-none focus:ring-2 focus:ring-tam-light/50 focus:border-tam-light"
                placeholder="عنوان الموعد النهائي"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Title in English</label>
              <input
                type="text"
                value={newDeadline.title_en}
                onChange={(e) => setNewDeadline((prev) => ({ ...prev, title_en: e.target.value }))}
                className="w-full text-sm border border-slate-200 rounded-lg p-2.5 focus:outline-none focus:ring-2 focus:ring-tam-light/50 focus:border-tam-light"
                placeholder="Deadline title in English"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">تاريخ الموعد النهائي *</label>
              <input
                type="date"
                value={newDeadline.deadline_date}
                onChange={(e) => setNewDeadline((prev) => ({ ...prev, deadline_date: e.target.value }))}
                className="w-full text-sm border border-slate-200 rounded-lg p-2.5 focus:outline-none focus:ring-2 focus:ring-tam-light/50 focus:border-tam-light"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">التصنيف</label>
              <select
                value={newDeadline.category}
                onChange={(e) => setNewDeadline((prev) => ({ ...prev, category: e.target.value }))}
                className="w-full text-sm border border-slate-200 rounded-lg p-2.5 focus:outline-none focus:ring-2 focus:ring-tam-light/50 focus:border-tam-light bg-white"
              >
                {CATEGORY_FILTERS.filter((c) => c.key !== "all").map((cat) => (
                  <option key={cat.key} value={cat.key}>{cat.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">الوصف</label>
              <textarea
                value={newDeadline.description}
                onChange={(e) => setNewDeadline((prev) => ({ ...prev, description: e.target.value }))}
                rows={3}
                dir="auto"
                className="w-full text-sm border border-slate-200 rounded-lg p-3 focus:outline-none focus:ring-2 focus:ring-tam-light/50 focus:border-tam-light resize-none"
                placeholder="وصف الموعد النهائي..."
              />
            </div>
            <div className="flex gap-3">
              <button
                onClick={handleAddDeadline}
                disabled={isSubmitting || !newDeadline.title || !newDeadline.deadline_date}
                className="flex-1 bg-gradient-to-l from-tam-accent to-tam-light text-white text-sm font-medium py-2.5 rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {isSubmitting ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <Plus size={14} />
                )}
                إضافة
              </button>
              <button
                onClick={() => setShowAddForm(false)}
                className="px-6 text-sm text-slate-500 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
              >
                إلغاء
              </button>
            </div>
          </div>
        )}

        {/* Loading state */}
        {isLoading && (
          <div className="text-center py-12">
            <Loader2 size={24} className="animate-spin text-tam-light mx-auto mb-3" />
            <p className="text-sm text-slate-500">جاري التحميل...</p>
          </div>
        )}

        {/* Empty state */}
        {!isLoading && filteredDeadlines.length === 0 && (
          <div className="text-center py-12">
            <Calendar size={32} className="text-slate-300 mx-auto mb-3" />
            <p className="text-sm text-slate-500">لا توجد مواعيد نهائية حالياً</p>
            <p className="text-xs text-slate-400 mt-1">
              Add compliance deadlines to track them here.
            </p>
          </div>
        )}

        {/* Upcoming alerts section */}
        {!isLoading && upcomingDeadlines.length > 0 && (
          <div className="mb-6">
            <div className="flex items-center gap-2 mb-3">
              <AlertTriangle size={14} className="text-amber-600" />
              <h2 className="text-xs font-semibold text-amber-700">مواعيد قادمة خلال 7 أيام</h2>
            </div>
            <div className="space-y-3">
              {upcomingDeadlines.map((deadline) => renderDeadlineCard(deadline))}
            </div>
          </div>
        )}

        {/* Other deadlines */}
        {!isLoading && otherDeadlines.length > 0 && (
          <div>
            {upcomingDeadlines.length > 0 && (
              <div className="flex items-center gap-2 mb-3">
                <Calendar size={14} className="text-slate-500" />
                <h2 className="text-xs font-semibold text-slate-600">جميع المواعيد النهائية</h2>
              </div>
            )}
            <div className="space-y-3">
              {otherDeadlines.map((deadline) => renderDeadlineCard(deadline))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
