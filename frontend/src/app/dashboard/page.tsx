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
  ChevronDown,
  ChevronUp,
  RefreshCw,
  CheckCircle,
  AlertTriangle,
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

interface DetailItem {
  id: string;
  title: string;
  subtitle?: string;
  date: string;
}

export default function DashboardPage() {
  const router = useRouter();
  const { user, isLoading: isAuthLoading } = useRequireAuth();

  const [stats, setStats] = useState<Stats | null>(null);
  const [audit, setAudit] = useState<AuditEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [scanResult, setScanResult] = useState<{ total_saved: number; news_found: number; circulars_found: number; regulations_found: number } | null>(null);
  const [ingestingAml, setIngestingAml] = useState(false);
  const [amlIngestResult, setAmlIngestResult] = useState<{ documents_ingested: number; chunks_created: number; errors: string[] } | null>(null);
  const [scanningAml, setScanningAml] = useState(false);
  const [amlScanResult, setAmlScanResult] = useState<{ new_publications: number; high_risk_countries_updated: number } | null>(null);

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

  const handleScanCMA = async () => {
    setScanning(true);
    setScanResult(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`${API_URL}/api/dashboard/scan-cma`, {
        method: "POST",
        headers: { Authorization: `Bearer ${session?.access_token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setScanResult(data);
        // Refresh dashboard stats after scan
        fetchData();
      }
    } catch (err) {
      console.error("CMA scan failed:", err);
    } finally {
      setScanning(false);
    }
  };

  const handleIngestAml = async () => {
    setIngestingAml(true);
    setAmlIngestResult(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`${API_URL}/api/dashboard/ingest-aml`, {
        method: "POST",
        headers: { Authorization: `Bearer ${session?.access_token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setAmlIngestResult(data);
        fetchData();
      }
    } catch (err) {
      console.error("AML ingestion failed:", err);
    } finally {
      setIngestingAml(false);
    }
  };

  const handleScanAml = async () => {
    setScanningAml(true);
    setAmlScanResult(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`${API_URL}/api/dashboard/scan-aml`, {
        method: "POST",
        headers: { Authorization: `Bearer ${session?.access_token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setAmlScanResult(data);
        fetchData();
      }
    } catch (err) {
      console.error("AML scan failed:", err);
    } finally {
      setScanningAml(false);
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
            {/* Scan & Ingest Buttons */}
            <div className="mb-6 flex items-center gap-4 flex-wrap">
              <button
                onClick={handleScanCMA}
                disabled={scanning}
                className="flex items-center gap-2 px-4 py-2.5 bg-tam-primary text-white rounded-lg text-sm font-medium hover:bg-tam-primary/90 disabled:opacity-60 transition-all"
              >
                <RefreshCw size={16} className={scanning ? "animate-spin" : ""} />
                {scanning ? "جارٍ الفحص..." : "فحص تحديثات هيئة السوق المالية"}
              </button>
              <button
                onClick={handleIngestAml}
                disabled={ingestingAml}
                className="flex items-center gap-2 px-4 py-2.5 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 disabled:opacity-60 transition-all"
              >
                <RefreshCw size={16} className={ingestingAml ? "animate-spin" : ""} />
                {ingestingAml ? "جارٍ الاستيعاب..." : "استيعاب وثائق مكافحة غسل الأموال"}
              </button>
              <button
                onClick={handleScanAml}
                disabled={scanningAml}
                className="flex items-center gap-2 px-4 py-2.5 bg-emerald-700 text-white rounded-lg text-sm font-medium hover:bg-emerald-800 disabled:opacity-60 transition-all"
              >
                <RefreshCw size={16} className={scanningAml ? "animate-spin" : ""} />
                {scanningAml ? "جارٍ الفحص..." : "فحص تحديثات مكافحة غسل الأموال"}
              </button>
              {scanResult && (
                <div className="flex items-center gap-2 text-xs bg-white border border-slate-200 rounded-lg px-3 py-2">
                  {scanResult.total_saved > 0 ? (
                    <>
                      <AlertTriangle size={14} className="text-amber-500" />
                      <span className="text-slate-700">
                        {scanResult.total_saved} تحديث جديد
                        <span className="text-slate-400 mr-2">
                          ({scanResult.news_found} أخبار، {scanResult.circulars_found} تعاميم، {scanResult.regulations_found} أنظمة)
                        </span>
                      </span>
                    </>
                  ) : (
                    <>
                      <CheckCircle size={14} className="text-emerald-500" />
                      <span className="text-slate-600">لا توجد تحديثات جديدة</span>
                    </>
                  )}
                </div>
              )}
              {amlIngestResult && (
                <div className="flex items-center gap-2 text-xs bg-white border border-emerald-200 rounded-lg px-3 py-2">
                  {amlIngestResult.documents_ingested > 0 ? (
                    <>
                      <AlertTriangle size={14} className="text-emerald-500" />
                      <span className="text-slate-700">
                        {amlIngestResult.documents_ingested} وثيقة، {amlIngestResult.chunks_created} جزء مفهرس
                        {amlIngestResult.errors.length > 0 && (
                          <span className="text-red-500 mr-2">({amlIngestResult.errors.length} أخطاء)</span>
                        )}
                      </span>
                    </>
                  ) : (
                    <>
                      <CheckCircle size={14} className="text-emerald-500" />
                      <span className="text-slate-600">لا توجد وثائق جديدة</span>
                    </>
                  )}
                </div>
              )}
              {amlScanResult && (
                <div className="flex items-center gap-2 text-xs bg-white border border-emerald-200 rounded-lg px-3 py-2">
                  {amlScanResult.new_publications > 0 || amlScanResult.high_risk_countries_updated > 0 ? (
                    <>
                      <AlertTriangle size={14} className="text-emerald-500" />
                      <span className="text-slate-700">
                        {amlScanResult.new_publications} منشور جديد، {amlScanResult.high_risk_countries_updated} تحديث دول عالية المخاطر
                      </span>
                    </>
                  ) : (
                    <>
                      <CheckCircle size={14} className="text-emerald-500" />
                      <span className="text-slate-600">لا توجد تحديثات جديدة</span>
                    </>
                  )}
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4 mb-8">
              <StatCard icon={<MessageSquare size={16} />} label="المحادثات" value={stats.total_conversations} color="text-tam-light" statType="conversations" />
              <StatCard icon={<MessageSquare size={16} />} label="الرسائل" value={stats.total_messages} color="text-tam-accent" statType="messages" />
              <StatCard icon={<Database size={16} />} label="المستندات" value={stats.total_documents} color="text-emerald-600" statType="documents" />
              <StatCard icon={<FileSearch size={16} />} label="المراجعات" value={stats.total_reviews} color="text-amber-600" statType="reviews" />
              <StatCard icon={<Bell size={16} />} label="التنبيهات" value={stats.total_alerts} sublabel={stats.unread_alerts > 0 ? `${stats.unread_alerts} جديدة` : undefined} color="text-red-500" statType="alerts" />
              <StatCard icon={<FileText size={16} />} label="الأجزاء المفهرسة" value={stats.total_chunks} color="text-slate-500" statType="chunks" />
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

function StatCard({ icon, label, value, sublabel, color, statType }: { icon: React.ReactNode; label: string; value: number; sublabel?: string; color: string; statType: string }) {
  const [expanded, setExpanded] = useState(false);
  const [items, setItems] = useState<DetailItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [fetched, setFetched] = useState(false);

  const toggle = async () => {
    if (value === 0) return;
    const next = !expanded;
    setExpanded(next);

    if (next && !fetched) {
      setLoading(true);
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const res = await fetch(`${API_URL}/api/dashboard/stat-detail?type=${statType}&limit=5`, {
          headers: { Authorization: `Bearer ${session?.access_token}` },
        });
        if (res.ok) {
          const data = await res.json();
          setItems(data.items || []);
        }
      } catch {
        // silently fail
      } finally {
        setLoading(false);
        setFetched(true);
      }
    }
  };

  return (
    <div
      className={`bg-white border border-slate-200 rounded-xl p-4 transition-all ${value > 0 ? "cursor-pointer hover:border-slate-300 hover:shadow-sm" : ""} ${expanded ? "col-span-2 sm:col-span-3" : ""}`}
      onClick={toggle}
    >
      <div className="flex items-start justify-between">
        <div>
          <div className={`${color} mb-2`}>{icon}</div>
          <p className="text-2xl font-bold text-slate-800">{value}</p>
          <p className="text-[10px] text-slate-500">{label}</p>
          {sublabel && <p className="text-[10px] text-red-500 mt-0.5">{sublabel}</p>}
        </div>
        {value > 0 && (
          <div className="text-slate-300 mt-1">
            {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </div>
        )}
      </div>

      {expanded && (
        <div className="mt-3 pt-3 border-t border-slate-100">
          {loading ? (
            <Loader2 size={14} className="animate-spin text-slate-400 mx-auto" />
          ) : items.length === 0 ? (
            <p className="text-[10px] text-slate-400">لا توجد بيانات</p>
          ) : (
            <div className="space-y-2">
              {items.map((item) => (
                <div key={item.id} className="text-xs bg-slate-50 rounded-lg px-3 py-2">
                  <p dir="auto" className="text-slate-700 truncate leading-5">{item.title}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    {item.subtitle && <span className="text-[10px] text-slate-400">{item.subtitle}</span>}
                    <span className="text-[10px] text-slate-400">
                      {new Date(item.date).toLocaleString("ar-SA", { dateStyle: "short", timeStyle: "short" })}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
