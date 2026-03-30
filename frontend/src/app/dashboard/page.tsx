"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  LayoutDashboard,
  Loader2,
  ArrowRight,
  Scale,
  MessageSquare,
  FileText,
  Database,
  Bell,
  FileSearch,
  Clock,
} from "lucide-react";
import { useRequireAuth } from "@/lib/useRequireAuth";
import { supabase } from "@/lib/supabase";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

interface Stats {
  total_conversations: number;
  total_messages: number;
  total_documents: number;
  total_chunks: number;
  total_reviews: number;
  total_alerts: number;
  unread_alerts: number;
  recent_topics: string[];
}

interface AuditEntry {
  id: string;
  type: string;
  summary: string;
  created_at: string;
}

export default function DashboardPage() {
  const router = useRouter();
  const { user, isLoading: isAuthLoading } = useRequireAuth();

  const [stats, setStats] = useState<Stats | null>(null);
  const [audit, setAudit] = useState<AuditEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (user) fetchData();
  }, [user]);

  const fetchData = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const headers = { Authorization: `Bearer ${session?.access_token}` };

      const [statsRes, auditRes] = await Promise.all([
        fetch(`${API_URL}/api/dashboard/stats`, { headers }),
        fetch(`${API_URL}/api/dashboard/audit?limit=15`, { headers }),
      ]);

      if (statsRes.ok) setStats(await statsRes.json());
      if (auditRes.ok) {
        const data = await auditRes.json();
        setAudit(data.entries);
      }
    } catch (err) {
      console.error("Failed to fetch dashboard:", err);
    } finally {
      setIsLoading(false);
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
                لوحة المتابعة
              </h1>
              <p className="text-[11px] text-slate-400">Dashboard</p>
            </div>
          </div>
          <div className="w-8 h-8 bg-gradient-to-br from-tam-accent to-tam-light rounded-lg flex items-center justify-center">
            <Scale size={16} className="text-white" />
          </div>
        </div>
      </header>

      <div className="max-w-5xl mx-auto p-6">
        {isLoading && (
          <div className="text-center py-12">
            <Loader2 size={24} className="animate-spin text-tam-light mx-auto mb-3" />
          </div>
        )}

        {!isLoading && stats && (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4 mb-8">
              <StatCard icon={<MessageSquare size={16} />} label="المحادثات" value={stats.total_conversations} color="text-tam-light" />
              <StatCard icon={<MessageSquare size={16} />} label="الرسائل" value={stats.total_messages} color="text-tam-accent" />
              <StatCard icon={<Database size={16} />} label="المستندات" value={stats.total_documents} color="text-emerald-600" />
              <StatCard icon={<FileSearch size={16} />} label="المراجعات" value={stats.total_reviews} color="text-amber-600" />
              <StatCard icon={<Bell size={16} />} label="التنبيهات" value={stats.total_alerts} sublabel={stats.unread_alerts > 0 ? `${stats.unread_alerts} جديدة` : undefined} color="text-red-500" />
              <StatCard icon={<FileText size={16} />} label="الأجزاء المفهرسة" value={stats.total_chunks} color="text-slate-500" />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="bg-white border border-slate-200 rounded-xl p-5">
                <h2 className="text-sm font-semibold text-tam-primary mb-4 flex items-center gap-2">
                  <MessageSquare size={14} />
                  آخر المواضيع
                </h2>
                {stats.recent_topics.length === 0 ? (
                  <p className="text-xs text-slate-400">لا توجد محادثات بعد</p>
                ) : (
                  <div className="space-y-2">
                    {stats.recent_topics.map((topic, i) => (
                      <div key={i} dir="auto" className="text-xs text-slate-600 bg-slate-50 rounded-lg px-3 py-2 leading-6 truncate">
                        {topic}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="bg-white border border-slate-200 rounded-xl p-5">
                <h2 className="text-sm font-semibold text-tam-primary mb-4 flex items-center gap-2">
                  <Clock size={14} />
                  سجل النشاط
                </h2>
                {audit.length === 0 ? (
                  <p className="text-xs text-slate-400">لا يوجد نشاط بعد</p>
                ) : (
                  <div className="space-y-2">
                    {audit.map((entry) => (
                      <div key={entry.id} className="flex items-start gap-2 text-xs">
                        <div className={`mt-1 w-5 h-5 rounded flex items-center justify-center flex-shrink-0 ${entry.type === "chat" ? "bg-tam-light/10 text-tam-light" : "bg-amber-50 text-amber-600"}`}>
                          {entry.type === "chat" ? <MessageSquare size={10} /> : <FileSearch size={10} />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p dir="auto" className="text-slate-600 truncate leading-5">{entry.summary}</p>
                          <p className="text-[10px] text-slate-400">
                            {new Date(entry.created_at).toLocaleString("ar-SA", { dateStyle: "short", timeStyle: "short" })}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function StatCard({ icon, label, value, sublabel, color }: { icon: React.ReactNode; label: string; value: number; sublabel?: string; color: string }) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4">
      <div className={`${color} mb-2`}>{icon}</div>
      <p className="text-2xl font-bold text-slate-800">{value}</p>
      <p className="text-[10px] text-slate-500">{label}</p>
      {sublabel && <p className="text-[10px] text-red-500 mt-0.5">{sublabel}</p>}
    </div>
  );
}
