import { supabase } from "./supabase";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

async function adminHeaders(): Promise<Record<string, string>> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error("Not authenticated");
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${session.access_token}`,
  };
}

// ─── Firms ──────────────────────────────────────────────

export interface Firm {
  id: string;
  name: string;
  name_ar: string | null;
  cma_license: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export async function listFirms(): Promise<Firm[]> {
  const headers = await adminHeaders();
  const res = await fetch(`${API_URL}/api/admin/firms`, { headers });
  if (!res.ok) throw new Error(`${res.status}`);
  return res.json();
}

export async function createFirm(data: {
  name: string;
  name_ar?: string;
  cma_license?: string;
}): Promise<Firm> {
  const headers = await adminHeaders();
  const res = await fetch(`${API_URL}/api/admin/firms`, {
    method: "POST",
    headers,
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.detail || `${res.status}`);
  }
  return res.json();
}

export async function updateFirm(
  firmId: string,
  data: Partial<Pick<Firm, "name" | "name_ar" | "cma_license" | "is_active">>
): Promise<Firm> {
  const headers = await adminHeaders();
  const res = await fetch(`${API_URL}/api/admin/firms/${firmId}`, {
    method: "PATCH",
    headers,
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.detail || `${res.status}`);
  }
  return res.json();
}

export async function deactivateFirm(firmId: string): Promise<void> {
  const headers = await adminHeaders();
  const res = await fetch(`${API_URL}/api/admin/firms/${firmId}/deactivate`, {
    method: "PUT",
    headers,
  });
  if (!res.ok) throw new Error(`${res.status}`);
}

export async function activateFirm(firmId: string): Promise<void> {
  const headers = await adminHeaders();
  const res = await fetch(`${API_URL}/api/admin/firms/${firmId}/activate`, {
    method: "PUT",
    headers,
  });
  if (!res.ok) throw new Error(`${res.status}`);
}

// ─── Users ──────────────────────────────────────────────

export interface AdminUser {
  id: string;
  email: string;
  name: string;
  organization: string;
  role: string;
  firm_id: string | null;
  language_pref: string;
  created_at: string | null;
}

export async function listUsers(firmId?: string): Promise<AdminUser[]> {
  const headers = await adminHeaders();
  const params = firmId ? `?firm_id=${firmId}` : "";
  const res = await fetch(`${API_URL}/api/admin/users${params}`, { headers });
  if (!res.ok) throw new Error(`${res.status}`);
  return res.json();
}

export async function updateUserRole(
  userId: string,
  role: string
): Promise<void> {
  const headers = await adminHeaders();
  const res = await fetch(`${API_URL}/api/admin/users/${userId}/role`, {
    method: "PATCH",
    headers,
    body: JSON.stringify({ role }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.detail || `${res.status}`);
  }
}

export async function inviteUser(data: {
  email: string;
  name: string;
  role?: string;
}): Promise<{ user_id: string; email: string }> {
  const headers = await adminHeaders();
  const res = await fetch(`${API_URL}/api/admin/users/invite`, {
    method: "POST",
    headers,
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.detail || `${res.status}`);
  }
  return res.json();
}

// ─── Audit & Usage ──────────────────────────────────────

export interface AuditEntry {
  id: string;
  user_id: string | null;
  action: string;
  resource_type: string | null;
  resource_id: string | null;
  details: Record<string, unknown>;
  created_at: string;
}

export async function listAuditLog(
  limit = 50,
  action?: string
): Promise<AuditEntry[]> {
  const headers = await adminHeaders();
  const params = new URLSearchParams({ limit: String(limit) });
  if (action) params.set("action", action);
  const res = await fetch(
    `${API_URL}/api/admin/audit-log?${params}`,
    { headers }
  );
  if (!res.ok) throw new Error(`${res.status}`);
  return res.json();
}

export interface UsageSummary {
  period_days: number;
  total_events: number;
  by_type: Record<string, number>;
  active_users: number;
}

export async function getUsageSummary(days = 30): Promise<UsageSummary> {
  const headers = await adminHeaders();
  const res = await fetch(
    `${API_URL}/api/admin/usage/summary?days=${days}`,
    { headers }
  );
  if (!res.ok) throw new Error(`${res.status}`);
  return res.json();
}
