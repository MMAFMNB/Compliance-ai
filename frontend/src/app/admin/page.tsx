"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  Building2,
  Plus,
  Users,
  BarChart3,
  ArrowRight,
  Scale,
  Loader2,
  CheckCircle2,
  XCircle,
  Shield,
  Clock,
} from "lucide-react";
import { useRequireAuth } from "@/lib/useRequireAuth";
import {
  listFirms,
  createFirm,
  deactivateFirm,
  activateFirm,
  listUsers,
  listAuditLog,
  getUsageSummary,
  Firm,
  AdminUser,
  AuditEntry,
  UsageSummary,
} from "@/lib/admin-api";

type Tab = "firms" | "users" | "audit" | "usage";

const ROLE_LABELS: Record<string, { ar: string; color: string }> = {
  super_admin: { ar: "مدير النظام", color: "bg-red-100 text-red-700" },
  firm_admin: { ar: "مدير الشركة", color: "bg-purple-100 text-purple-700" },
  compliance_officer: { ar: "مسؤول الالتزام", color: "bg-blue-100 text-blue-700" },
  analyst: { ar: "محلل", color: "bg-emerald-100 text-emerald-700" },
  auditor: { ar: "مدقق", color: "bg-amber-100 text-amber-700" },
  read_only: { ar: "قراءة فقط", color: "bg-slate-100 text-slate-600" },
};

export default function SuperAdminPage() {
  const router = useRouter();
  const { user, isLoading: isAuthLoading } = useRequireAuth();

  const [tab, setTab] = useState<Tab>("firms");
  const [firms, setFirms] = useState<Firm[]>([]);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [audit, setAudit] = useState<AuditEntry[]>([]);
  const [usage, setUsage] = useState<UsageSummary | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  // Create firm form
  const [showCreateFirm, setShowCreateFirm] = useState(false);
  const [newFirm, setNewFirm] = useState({ name: "", name_ar: "", cma_license: "" });
  const [isCreating, setIsCreating] = useState(false);

  useEffect(() => {
    if (!user) return;
    // Check role client-side
    const meta = user.user_metadata || {};
    // Allow access — backend will enforce the actual role check
    loadData();
  }, [user, tab]);

  const loadData = async () => {
    setIsLoading(true);
    setError("");
    try {
      if (tab === "firms") {
        setFirms(await listFirms());
      } else if (tab === "users") {
        setUsers(await listUsers());
      } else if (tab === "audit") {
        setAudit(await listAuditLog(100));
      } else if (tab === "usage") {
        setUsage(await getUsageSummary(30));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "حدث خطأ");
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreateFirm = async () => {
    if (!newFirm.name) return;
    setIsCreating(true);
    try {
      await createFirm({
        name: newFirm.name,
        name_ar: newFirm.name_ar || undefined,
        cma_license: newFirm.cma_license || undefined,
      });
      setNewFirm({ name: "", name_ar: "", cma_license: "" });
      setShowCreateFirm(false);
      setFirms(await listFirms());
    } catch (err) {
      setError(err instanceof Error ? err.message : "فشل إنشاء الشركة");
    } finally {
      setIsCreating(false);
    }
  };

  const handleToggleFirm = async (firm: Firm) => {
    try {
      if (firm.is_active) {
        await deactivateFirm(firm.id);
      } else {
        await activateFirm(firm.id);
      }
      setFirms(await listFirms());
    } catch (err) {
      setError(err instanceof Error ? err.message : "فشل تحديث الشركة");
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
                لوحة إدارة النظام
              </h1>
              <p className="text-[11px] text-slate-400">Super Admin Panel</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Shield size={16} className="text-red-500" />
            <span className="text-[10px] bg-red-100 text-red-700 px-2 py-0.5 rounded-full font-medium">
              Super Admin
            </span>
          </div>
        </div>
      </header>

      <div className="max-w-6xl mx-auto p-6">
        {/* Tabs */}
        <div className="flex gap-2 mb-6 overflow-x-auto">
          {([
            { key: "firms", icon: Building2, label: "الشركات", labelEn: "Firms" },
            { key: "users", icon: Users, label: "المستخدمون", labelEn: "Users" },
            { key: "audit", icon: Clock, label: "سجل النشاط", labelEn: "Audit Log" },
            { key: "usage", icon: BarChart3, label: "الاستخدام", labelEn: "Usage" },
          ] as const).map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all whitespace-nowrap ${
                tab === t.key
                  ? "bg-tam-primary text-white shadow-sm"
                  : "bg-white text-slate-600 border border-slate-200 hover:border-tam-light"
              }`}
            >
              <t.icon size={16} />
              <span>{t.label}</span>
              <span className="text-[10px] opacity-60">{t.labelEn}</span>
            </button>
          ))}
        </div>

        {error && (
          <div className="bg-red-50 text-red-700 text-xs rounded-lg p-3 mb-4">{error}</div>
        )}

        {isLoading && (
          <div className="text-center py-12">
            <Loader2 size={24} className="animate-spin text-tam-light mx-auto mb-3" />
          </div>
        )}

        {/* Firms Tab */}
        {!isLoading && tab === "firms" && (
          <div>
            <button
              onClick={() => setShowCreateFirm(!showCreateFirm)}
              className="mb-4 flex items-center gap-2 px-4 py-2.5 bg-tam-primary text-white rounded-xl text-sm font-medium hover:bg-tam-secondary transition-colors"
            >
              <Plus size={16} />
              إنشاء شركة — Create Firm
            </button>

            {showCreateFirm && (
              <div className="bg-white border border-slate-200 rounded-xl p-5 mb-6 space-y-3">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">
                      Firm Name (English) *
                    </label>
                    <input
                      type="text"
                      value={newFirm.name}
                      onChange={(e) => setNewFirm((p) => ({ ...p, name: e.target.value }))}
                      className="w-full text-sm border border-slate-200 rounded-lg p-2.5 focus:outline-none focus:border-tam-light"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">
                      اسم الشركة (عربي)
                    </label>
                    <input
                      type="text"
                      value={newFirm.name_ar}
                      onChange={(e) => setNewFirm((p) => ({ ...p, name_ar: e.target.value }))}
                      dir="auto"
                      className="w-full text-sm border border-slate-200 rounded-lg p-2.5 focus:outline-none focus:border-tam-light"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">
                      رقم ترخيص الهيئة — CMA License
                    </label>
                    <input
                      type="text"
                      value={newFirm.cma_license}
                      onChange={(e) => setNewFirm((p) => ({ ...p, cma_license: e.target.value }))}
                      className="w-full text-sm border border-slate-200 rounded-lg p-2.5 focus:outline-none focus:border-tam-light"
                    />
                  </div>
                </div>
                <div className="flex gap-3">
                  <button
                    onClick={handleCreateFirm}
                    disabled={isCreating || !newFirm.name}
                    className="px-6 py-2.5 bg-tam-primary text-white rounded-lg text-sm font-medium disabled:opacity-50 flex items-center gap-2"
                  >
                    {isCreating && <Loader2 size={14} className="animate-spin" />}
                    إنشاء — Create
                  </button>
                  <button
                    onClick={() => setShowCreateFirm(false)}
                    className="px-4 py-2.5 text-sm text-slate-500 border border-slate-200 rounded-lg hover:bg-slate-50"
                  >
                    إلغاء
                  </button>
                </div>
              </div>
            )}

            <div className="space-y-3">
              {firms.map((firm) => (
                <div
                  key={firm.id}
                  className="bg-white border border-slate-200 rounded-xl p-5 flex items-center justify-between"
                >
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <Building2 size={14} className="text-tam-light" />
                      <span className="text-sm font-semibold text-slate-800">{firm.name}</span>
                      {firm.name_ar && (
                        <span className="text-xs text-slate-400">({firm.name_ar})</span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 text-[10px] text-slate-400">
                      {firm.cma_license && <span>رخصة: {firm.cma_license}</span>}
                      <span>{new Date(firm.created_at).toLocaleDateString("ar-SA")}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span
                      className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${
                        firm.is_active
                          ? "bg-emerald-100 text-emerald-700"
                          : "bg-red-100 text-red-700"
                      }`}
                    >
                      {firm.is_active ? "نشطة — Active" : "معطلة — Inactive"}
                    </span>
                    <button
                      onClick={() => handleToggleFirm(firm)}
                      className="text-xs text-slate-400 hover:text-slate-600 transition-colors"
                    >
                      {firm.is_active ? (
                        <XCircle size={16} className="text-red-400 hover:text-red-600" />
                      ) : (
                        <CheckCircle2 size={16} className="text-emerald-400 hover:text-emerald-600" />
                      )}
                    </button>
                  </div>
                </div>
              ))}
              {firms.length === 0 && (
                <p className="text-sm text-slate-400 text-center py-8">لا توجد شركات</p>
              )}
            </div>
          </div>
        )}

        {/* Users Tab */}
        {!isLoading && tab === "users" && (
          <div className="space-y-3">
            {users.map((u) => {
              const roleCfg = ROLE_LABELS[u.role] || ROLE_LABELS.read_only;
              return (
                <div
                  key={u.id}
                  className="bg-white border border-slate-200 rounded-xl p-5 flex items-center justify-between"
                >
                  <div>
                    <p className="text-sm font-semibold text-slate-800">{u.full_name || u.email}</p>
                    <p className="text-xs text-slate-400">{u.email}</p>
                  </div>
                  <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${roleCfg.color}`}>
                    {roleCfg.ar}
                  </span>
                </div>
              );
            })}
            {users.length === 0 && (
              <p className="text-sm text-slate-400 text-center py-8">لا يوجد مستخدمون</p>
            )}
          </div>
        )}

        {/* Audit Log Tab */}
        {!isLoading && tab === "audit" && (
          <div className="space-y-2">
            {audit.map((entry) => (
              <div
                key={entry.id}
                className="bg-white border border-slate-200 rounded-xl p-4 flex items-start gap-3"
              >
                <Clock size={14} className="text-slate-400 mt-0.5 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-xs font-medium text-tam-primary">{entry.action}</span>
                    {entry.resource_type && (
                      <span className="text-[10px] text-slate-400">
                        {entry.resource_type}
                      </span>
                    )}
                  </div>
                  <p className="text-[10px] text-slate-400">
                    {new Date(entry.created_at).toLocaleString("ar-SA", {
                      dateStyle: "short",
                      timeStyle: "short",
                    })}
                  </p>
                </div>
              </div>
            ))}
            {audit.length === 0 && (
              <p className="text-sm text-slate-400 text-center py-8">لا يوجد سجل نشاط</p>
            )}
          </div>
        )}

        {/* Usage Tab */}
        {!isLoading && tab === "usage" && usage && (
          <div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
              <div className="bg-white border border-slate-200 rounded-xl p-4 text-center">
                <p className="text-2xl font-bold text-tam-primary">{usage.total_events}</p>
                <p className="text-[10px] text-slate-500 mt-1">إجمالي الأحداث</p>
                <p className="text-[10px] text-slate-400">Total Events</p>
              </div>
              <div className="bg-white border border-slate-200 rounded-xl p-4 text-center">
                <p className="text-2xl font-bold text-emerald-600">{usage.active_users}</p>
                <p className="text-[10px] text-slate-500 mt-1">المستخدمون</p>
                <p className="text-[10px] text-slate-400">Active Users</p>
              </div>
              <div className="bg-white border border-slate-200 rounded-xl p-4 text-center">
                <p className="text-2xl font-bold text-amber-600">{usage.period_days}</p>
                <p className="text-[10px] text-slate-500 mt-1">أيام</p>
                <p className="text-[10px] text-slate-400">Period (days)</p>
              </div>
              <div className="bg-white border border-slate-200 rounded-xl p-4 text-center">
                <p className="text-2xl font-bold text-slate-600">
                  {Object.keys(usage.by_type).length}
                </p>
                <p className="text-[10px] text-slate-500 mt-1">أنواع الأحداث</p>
                <p className="text-[10px] text-slate-400">Event Types</p>
              </div>
            </div>

            {Object.keys(usage.by_type).length > 0 && (
              <div className="bg-white border border-slate-200 rounded-xl p-5">
                <h3 className="text-sm font-semibold text-tam-primary mb-4">
                  الاستخدام حسب النوع — Usage by Type
                </h3>
                <div className="space-y-3">
                  {Object.entries(usage.by_type)
                    .sort(([, a], [, b]) => b - a)
                    .map(([type, count]) => {
                      const maxCount = Math.max(...Object.values(usage.by_type));
                      const pct = maxCount > 0 ? (count / maxCount) * 100 : 0;
                      return (
                        <div key={type}>
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-xs text-slate-600">{type}</span>
                            <span className="text-xs font-semibold text-slate-700">{count}</span>
                          </div>
                          <div className="w-full bg-slate-100 rounded-full h-2">
                            <div
                              className="h-2 rounded-full bg-tam-light transition-all"
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                        </div>
                      );
                    })}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
