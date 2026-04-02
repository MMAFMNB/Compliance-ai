"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  Bell,
  Loader2,
  ArrowRight,
  Scale,
  ExternalLink,
  CheckCheck,
  FileText,
  AlertTriangle,
  BookOpen,
  HelpCircle,
} from "lucide-react";
import { useRequireAuth } from "@/lib/useRequireAuth";
import { supabase } from "@/lib/supabase";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

interface Alert {
  id: string;
  title: string;
  title_en: string | null;
  source_url: string;
  publication_date: string | null;
  doc_type: string;
  summary: string | null;
  impact_summary: string | null;
  is_read: boolean;
  created_at: string;
}

const DOC_TYPE_CONFIG: Record<string, { icon: typeof FileText; label: string; color: string }> = {
  circular: { icon: FileText, label: "تعميم", color: "text-blue-600 bg-blue-50" },
  amendment: { icon: AlertTriangle, label: "تعديل", color: "text-amber-600 bg-amber-50" },
  regulation: { icon: BookOpen, label: "لائحة", color: "text-tam-light bg-tam-light/10" },
  guidance: { icon: HelpCircle, label: "دليل", color: "text-emerald-600 bg-emerald-50" },
  faq: { icon: HelpCircle, label: "أسئلة متكررة", color: "text-slate-500 bg-slate-100" },
  other: { icon: FileText, label: "أخرى", color: "text-slate-500 bg-slate-100" },
};

export default function AlertsPage() {
  const router = useRouter();
  const { user, isLoading: isAuthLoading } = useRequireAuth();

  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [unreadCount, setUnreadCount] = useState(0);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    if (user) fetchAlerts();
  }, [user]);

  const fetchAlerts = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`${API_URL}/api/alerts?limit=50`, {
        headers: { Authorization: `Bearer ${session?.access_token}` },
      });
      if (!res.ok) throw new Error(`${res.status}`);
      const data = await res.json();
      setAlerts(data.alerts);
      setUnreadCount(data.unread);
    } catch (err) {
      console.error("Failed to fetch alerts:", err);
    } finally {
      setIsLoading(false);
    }
  };

  const markAsRead = async (alertId: string) => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      await fetch(`${API_URL}/api/alerts/${alertId}/read`, {
        method: "POST",
        headers: { Authorization: `Bearer ${session?.access_token}` },
      });
      setAlerts((prev) =>
        prev.map((a) => (a.id === alertId ? { ...a, is_read: true } : a))
      );
      setUnreadCount((c) => Math.max(0, c - 1));
    } catch (err) {
      console.error("Failed to mark alert as read:", err);
    }
  };

  const handleExpand = (alertId: string) => {
    setExpandedId(expandedId === alertId ? null : alertId);
    const alert = alerts.find((a) => a.id === alertId);
    if (alert && !alert.is_read) {
      markAsRead(alertId);
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
                التنبيهات
              </h1>
              <p className="text-[11px] text-slate-400">
                CMA Alerts &middot; {unreadCount > 0 && `${unreadCount} غير مقروءة`}
              </p>
            </div>
          </div>
          <div className="w-8 h-8 bg-gradient-to-br from-tam-accent to-tam-light rounded-lg flex items-center justify-center">
            <Scale size={16} className="text-white" />
          </div>
        </div>
      </header>

      <div className="max-w-4xl mx-auto p-6">
        {isLoading && (
          <div className="text-center py-12">
            <Loader2 size={24} className="animate-spin text-tam-light mx-auto mb-3" />
            <p className="text-sm text-slate-500">جاري التحميل...</p>
          </div>
        )}

        {!isLoading && alerts.length === 0 && (
          <div className="text-center py-12">
            <Bell size={32} className="text-slate-300 mx-auto mb-3" />
            <p className="text-sm text-slate-500">لا توجد تنبيهات حالياً</p>
            <p className="text-xs text-slate-400 mt-1">
              New CMA publications will appear here automatically.
            </p>
          </div>
        )}

        {!isLoading && alerts.length > 0 && (
          <div className="space-y-3">
            {alerts.map((alert) => {
              const config = DOC_TYPE_CONFIG[alert.doc_type] || DOC_TYPE_CONFIG.other;
              const Icon = config.icon;
              const isExpanded = expandedId === alert.id;

              return (
                <div
                  key={alert.id}
                  className={`bg-white border rounded-xl transition-all ${
                    alert.is_read ? "border-slate-200" : "border-tam-light/50 shadow-sm"
                  }`}
                >
                  <button
                    onClick={() => handleExpand(alert.id)}
                    className="w-full p-5 text-right"
                  >
                    <div className="flex items-start gap-3">
                      <div className={`rounded-lg p-1.5 mt-0.5 ${config.color}`}>
                        <Icon size={14} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${config.color}`}>
                            {config.label}
                          </span>
                          {alert.publication_date && (
                            <span className="text-[10px] text-slate-400">
                              {alert.publication_date}
                            </span>
                          )}
                          {!alert.is_read && (
                            <span className="w-2 h-2 rounded-full bg-tam-light" />
                          )}
                        </div>
                        <p dir="auto" className="text-sm font-medium text-slate-800 leading-6">
                          {alert.title}
                        </p>
                        {alert.title_en && alert.title_en !== alert.title && (
                          <p className="text-xs text-slate-400 mt-0.5">{alert.title_en}</p>
                        )}
                      </div>
                    </div>
                  </button>

                  {isExpanded && (
                    <div className="px-5 pb-5 border-t border-slate-100 pt-4">
                      {alert.impact_summary ? (
                        <div className="bg-slate-50 rounded-lg p-4 mb-3">
                          <p className="text-[10px] font-medium text-tam-gold mb-2">
                            ملخص التأثير — Impact Summary
                          </p>
                          <p dir="auto" className="text-sm text-slate-700 leading-7 whitespace-pre-line">
                            {alert.impact_summary}
                          </p>
                        </div>
                      ) : (
                        <p className="text-xs text-slate-400 mb-3">
                          لم يتم إنشاء ملخص التأثير بعد
                        </p>
                      )}
                      <div className="flex items-center gap-3">
                        <a
                          href={alert.source_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-tam-light hover:text-tam-primary flex items-center gap-1 transition-colors"
                        >
                          <ExternalLink size={12} />
                          عرض المصدر
                        </a>
                        {!alert.is_read && (
                          <button
                            onClick={() => markAsRead(alert.id)}
                            className="text-xs text-slate-400 hover:text-slate-600 flex items-center gap-1 transition-colors"
                          >
                            <CheckCheck size={12} />
                            تحديد كمقروء
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
