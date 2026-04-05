import { supabase } from "./supabase";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export interface Message {
  role: "user" | "assistant";
  content: string;
}

export interface ConversationPreview {
  id: string;
  created_at: string;
  preview: string;
  message_count: number;
}

async function getAuthHeaders(): Promise<Record<string, string>> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.access_token) {
    throw new Error("Not authenticated");
  }
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${session.access_token}`,
  };
}

export async function sendMessage(
  message: string,
  conversationId?: string
): Promise<{ response: string; conversation_id: string }> {
  const headers = await getAuthHeaders();
  const res = await fetch(`${API_URL}/api/chat`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      message,
      conversation_id: conversationId,
    }),
  });

  if (!res.ok) {
    throw new Error(`API error: ${res.status}`);
  }

  return res.json();
}

export async function streamMessage(
  message: string,
  conversationId: string | undefined,
  onText: (text: string) => void,
  onConversationId: (id: string) => void,
  onDone: () => void,
  onError: (error: string) => void,
  mode?: string
): Promise<void> {
  const headers = await getAuthHeaders();
  const body: Record<string, unknown> = {
    message,
    conversation_id: conversationId,
  };
  if (mode) body.mode = mode;

  const res = await fetch(`${API_URL}/api/chat/stream`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    let detail = `API error: ${res.status}`;
    try {
      const body = await res.json();
      if (body.detail) detail = body.detail;
    } catch {
      // Use default status-based message
    }
    onError(detail);
    return;
  }

  const reader = res.body?.getReader();
  if (!reader) {
    onError("No response body");
    return;
  }

  const decoder = new TextDecoder();
  let buffer = "";
  let doneReceived = false;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";

    for (const line of lines) {
      if (line.startsWith("data: ")) {
        try {
          const data = JSON.parse(line.slice(6));
          if (data.type === "text") {
            onText(data.text);
          } else if (data.type === "conversation_id") {
            onConversationId(data.conversation_id);
          } else if (data.type === "done") {
            doneReceived = true;
            onDone();
          } else if (data.type === "error") {
            doneReceived = true;
            onError(data.error);
          }
        } catch {
          // Skip malformed JSON
        }
      }
    }
  }

  // Process any remaining data in the buffer after stream ends
  if (buffer.trim().startsWith("data: ")) {
    try {
      const data = JSON.parse(buffer.trim().slice(6));
      if (data.type === "text") onText(data.text);
      else if (data.type === "conversation_id") onConversationId(data.conversation_id);
      else if (data.type === "done") {
        doneReceived = true;
        onDone();
      } else if (data.type === "error") {
        doneReceived = true;
        onError(data.error);
      }
    } catch {
      // Skip malformed remaining buffer
    }
  }

  // Safety net: if the stream ended without a "done" or "error" event
  // (e.g. connection dropped or backend crashed mid-stream), call onDone
  // so the UI commits whatever streaming content was received and resets
  // the loading state instead of spinning forever.
  if (!doneReceived) {
    onDone();
  }
}

export interface UserProfile {
  id: string;
  email: string;
  name: string;
  organization: string;
  role: string;
  firm_id: string | null;
  language_pref: string;
}

export async function getProfile(): Promise<UserProfile> {
  const headers = await getAuthHeaders();
  const res = await fetch(`${API_URL}/api/auth/me`, { headers });
  if (!res.ok) throw new Error(`${res.status}`);
  return res.json();
}

export async function logoutBackend(): Promise<void> {
  const headers = await getAuthHeaders();
  await fetch(`${API_URL}/api/auth/logout`, { method: "POST", headers });
}

export async function getConversations(): Promise<ConversationPreview[]> {
  const headers = await getAuthHeaders();
  const res = await fetch(`${API_URL}/api/conversations`, { headers });
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

export async function getConversation(
  id: string
): Promise<{ id: string; messages: Message[]; created_at: string }> {
  const headers = await getAuthHeaders();
  const res = await fetch(`${API_URL}/api/conversations/${id}`, { headers });
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

export async function deleteConversation(id: string): Promise<void> {
  const headers = await getAuthHeaders();
  const res = await fetch(`${API_URL}/api/conversations/${id}`, {
    method: "DELETE",
    headers,
  });
  if (!res.ok) throw new Error(`API error: ${res.status}`);
}

// ─── Policies & Procedures ──────────────────────────────────

export interface PolicyDocument {
  id: string;
  title: string;
  doc_type: string;
  language: string | null;
  created_at: string | null;
  chunk_count: number;
}

export async function uploadPolicyDocument(file: File): Promise<PolicyDocument> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error("Not authenticated");

  const formData = new FormData();
  formData.append("file", file);

  const res = await fetch(`${API_URL}/api/policies/upload`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${session.access_token}`,
    },
    body: formData,
  });

  if (!res.ok) {
    let detail = `Upload failed: ${res.status}`;
    try {
      const body = await res.json();
      if (body.detail) detail = body.detail;
    } catch {}
    throw new Error(detail);
  }

  return res.json();
}

export async function getPolicyDocuments(): Promise<PolicyDocument[]> {
  const headers = await getAuthHeaders();
  const res = await fetch(`${API_URL}/api/policies/documents`, { headers });
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

export async function deletePolicyDocument(id: string): Promise<void> {
  const headers = await getAuthHeaders();
  const res = await fetch(`${API_URL}/api/policies/documents/${id}`, {
    method: "DELETE",
    headers,
  });
  if (!res.ok) throw new Error(`API error: ${res.status}`);
}
