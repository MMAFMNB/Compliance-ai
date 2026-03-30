"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  Users,
  UserPlus,
  ArrowRight,
  Scale,
  Loader2,
  Shield,
  Clock,
  Building2,
} from "lucide-react";
import { useRequireAuth } from "@/lib/useRequireAuth";
import {
  listUsers,
  inviteUser,
  updateUserRole,
  listAuditLog,
  AdminUser,
  AuditEntry,
} from "@/lib/admin-api";

type Tab = "users" | "audit";

const ROLE_OPTIONS = [
  { value: "compliance_officer", ar: "مسؤول الالتزام", en: "Compliance Officer" },
  { value: "analyst", ar: "محلل", en: "Analyst" },
  { value: "auditor", ar: "مدقق", en: "Auditor" },
  { value: "read_only", ar: "قراءة فقط", en: "Read Only" },
];

const ROLE_LABELS: Record<string, { ar: string; color: string }> = {
  super_admin: { ar: "مدير النظام", color: "bg-red-100 text-red-700" },
  firm_admin: { ar: "مدير الشركة", color: "bg-purple-100 text-purple-700" },
  compliance_officer: { ar: "مسؤول الالتزام", color: "bg-blue-100 text-blue-700" },
  analyst: { ar: "محلل", color: "bg-emerald-100 text-emerald-700" },
  auditor: { ar: "مدقق", color: "bg-amber-100 text-amber-700" },
  read_only: { ar: "قراءة فقط", color: "bg-slate-100 text-slate-600" },
};

export default function FirmAdminPage() {
  const router = useRouter();
  const { user, isLoading: isAuthLoading } = useRequireAuth();

  const [tab, setTab] = useState<Tab>("users");
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [audit, setAudit] = useState<AuditEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // Invite form
  const [showInvite, setShowInvite] = useState(false);
  const [inviteData, setInviteData] = useState({ email: "", name: "", role: "compliance_officer" });
  const [isInviting, setIsInviting] = useState(false);

  // Role editing
  const [editingUserId, setEditingUserId] = useState<string | null>(null);

  useEffect(() => {
    if (user) loadData();
  }, [user, tab]);

  const loadData = async () => {
    setIsLoading(true);
    setError("");
    try {
      if (tab === "users") {
        setUsers(await listUsers());
      } else if (tab === "audit") {
        setAudit(await listAuditLog(100));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "حدث خطأ");
    } finally {
      setIsLoading(false);
    }
  };

  const handleInvite = async () => {
    if (!inviteData.email || !inviteData.name) return;
    setIsInviting(true);
    setError("");
    setSuccess("");
    try {
      await inviteUser(inviteData);
      setSuccess(`تم إرسال الدعوة إلى ${inviteData.email}`);
      setInviteData({ email: "", name: "", role: "compliance_officer" });
      setShowInvite(false);
      setUsers(await listUsers());
    } catch (err) {
      setError(err instanceof Error ? err.message : "فشل إرسال الدعوة");
    } finally {
      setIsInviting(false);
    }
  };

  const handleRoleChange = async (userId: string, newRole: string) => {
    setError("");
    try {
      await updateUserRole(userId, newRole);
      setUsers(await listUsers());
      setEditingUserId(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "فشل تحديث الدور");
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
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => router.push("/")}
              className="text-slate-400 hover:text-tam-primary transition-colors"
            >
              <ArrowRight size={20} />
            </button>
            <div>
              <h1 className="text-sm font-semibold text-tam-primary">
                إدارة الشركة
              </h1>
              <p className="text-[11px] text-slate-400">Firm Admin Panel</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Building2 size={16} className="text-purple-500" />
            <span className="text-[10px] bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full font-medium">
              Firm Admin
            </span>
          </div>
        </div>
      </header>

      <div className="max-w-5xl mx-auto p-6">
        {/* Tabs */}
        <div className="flex gap-2 mb-6">
          <button
            onClick={() => setTab("users")}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all ${
              tab === "users"
                ? "bg-tam-primary text-white shadow-sm"
                : "bg-white text-slate-600 border border-slate-200 hover:border-tam-light"
            }`}
          >
            <Users size={16} />
            المستخدمون — Users
          </button>
          <button
            onClick={() => setTab("audit")}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all ${
              tab === "audit"
                ? "bg-tam-primary text-white shadow-sm"
                : "bg-white text-slate-600 border border-slate-200 hover:border-tam-light"
            }`}
          >
            <Clock size={16} />
            سجل النشاط — Audit Log
          </button>
        </div>

        {error && (
          <div className="bg-red-50 text-red-700 text-xs rounded-lg p-3 mb-4">{error}</div>
        )}
        {success && (
          <div className="bg-emerald-50 text-emerald-700 text-xs rounded-lg p-3 mb-4">{success}</div>
        )}

        {isLoading && (
          <div className="text-center py-12">
            <Loader2 size={24} className="animate-spin text-tam-light mx-auto" />
          </div>
        )}

        {/* Users Tab */}
        {!isLoading && tab === "users" && (
          <div>
            <button
              onClick={() => setShowInvite(!showInvite)}
              className="mb-4 flex items-center gap-2 px-4 py-2.5 bg-tam-primary text-white rounded-xl text-sm font-medium hover:bg-tam-secondary transition-colors"
            >
              <UserPlus size={16} />
              دعوة مستخدم — Invite User
            </button>

            {showInvite && (
              <div className="bg-white border border-slate-200 rounded-xl p-5 mb-6 space-y-3">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">
                      البريد الإلكتروني — Email *
                    </label>
                    <input
                      type="email"
                      value={inviteData.email}
                      onChange={(e) => setInviteData((p) => ({ ...p, email: e.target.value }))}
                      dir="ltr"
                      className="w-full text-sm border border-slate-200 rounded-lg p-2.5 focus:outline-none focus:border-tam-light"
                      placeholder="user@company.com"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">
                      الاسم — Name *
                    </label>
                    <input
                      type="text"
                      value={inviteData.name}
                      onChange={(e) => setInviteData((p) => ({ ...p, name: e.target.value }))}
                      dir="auto"
                      className="w-full text-sm border border-slate-200 rounded-lg p-2.5 focus:outline-none focus:border-tam-light"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">
                      الدور — Role
                    </label>
                    <select
                      value={inviteData.role}
                      onChange={(e) => setInviteData((p) => ({ ...p, role: e.target.value }))}
                      className="w-full text-sm border border-slate-200 rounded-lg p-2.5 focus:outline-none focus:border-tam-light bg-white"
                    >
                      {ROLE_OPTIONS.map((r) => (
                        <option key={r.value} value={r.value}>
                          {r.ar} — {r.en}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="flex gap-3">
                  <button
                    onClick={handleInvite}
                    disabled={isInviting || !inviteData.email || !inviteData.name}
                    className="px-6 py-2.5 bg-tam-primary text-white rounded-lg text-sm font-medium disabled:opacity-50 flex items-center gap-2"
                  >
                    {isInviting && <Loader2 size={14} className="animate-spin" />}
                    إرسال الدعوة — Send Invite
                  </button>
                  <button
                    onClick={() => setShowInvite(false)}
                    className="px-4 py-2.5 text-sm text-slate-500 border border-slate-200 rounded-lg hover:bg-slate-50"
                  >
                    إلغاء
                  </button>
                </div>
              </div>
            )}

            <div className="space-y-3">
              {users.map((u) => {
                const roleCfg = ROLE_LABELS[u.role] || ROLE_LABELS.read_only;
                const isEditing = editingUserId === u.id;
                return (
                  <div
                    key={u.id}
                    className="bg-white border border-slate-200 rounded-xl p-5 flex items-center justify-between"
                  >
                    <div>
                      <p className="text-sm font-semibold text-slate-800">
                        {u.name || u.email}
                      </p>
                      <p className="text-xs text-slate-400">{u.email}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      {isEditing ? (
                        <select
                          value={u.role}
                          onChange={(e) => handleRoleChange(u.id, e.target.value)}
                          onBlur={() => setEditingUserId(null)}
                          autoFocus
                          className="text-xs border border-slate-200 rounded-lg p-1.5 focus:outline-none focus:border-tam-light bg-white"
                        >
                          {ROLE_OPTIONS.map((r) => (
                            <option key={r.value} value={r.value}>
                              {r.ar}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <button
                          onClick={() => setEditingUserId(u.id)}
                          className={`text-[10px] font-medium px-2 py-0.5 rounded-full cursor-pointer hover:opacity-80 ${roleCfg.color}`}
                          title="Click to change role"
                        >
                          {roleCfg.ar}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
              {users.length === 0 && (
                <p className="text-sm text-slate-400 text-center py-8">لا يوجد مستخدمون</p>
              )}
            </div>
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
                      <span className="text-[10px] text-slate-400">{entry.resource_type}</span>
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
      </div>
    </div>
  );
}
