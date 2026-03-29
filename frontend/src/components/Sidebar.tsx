"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  MessageSquare,
  Plus,
  FileSearch,
  Search,
  Bell,
  LayoutDashboard,
  Scale,
  LogOut,
  Trash2,
} from "lucide-react";
import { useAuth } from "@/lib/AuthContext";
import {
  getConversations,
  deleteConversation,
  ConversationPreview,
} from "@/lib/api";

interface SidebarProps {
  onNewChat: () => void;
  onSelectConversation: (id: string) => void;
  activeConversationId?: string;
  refreshKey: number;
}

export default function Sidebar({
  onNewChat,
  onSelectConversation,
  activeConversationId,
  refreshKey,
}: SidebarProps) {
  const router = useRouter();
  const { user, signOut } = useAuth();
  const [conversations, setConversations] = useState<ConversationPreview[]>([]);

  useEffect(() => {
    getConversations()
      .then(setConversations)
      .catch(() => setConversations([]));
  }, [refreshKey]);

  const handleDelete = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    try {
      await deleteConversation(id);
      setConversations((prev) => prev.filter((c) => c.id !== id));
    } catch (err) {
      console.error("Failed to delete conversation:", err);
    }
  };

  return (
    <div className="w-64 bg-tam-primary text-white flex flex-col h-full">
      {/* Logo */}
      <div className="p-4 border-b border-white/10">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-tam-gold rounded-lg flex items-center justify-center">
            <Scale size={18} className="text-tam-primary" />
          </div>
          <div>
            <h1 className="font-bold text-sm">تام للامتثال التنظيمي</h1>
            <p className="text-[10px] text-white/50">TAM Compliance AI</p>
          </div>
        </div>
      </div>

      {/* New Chat Button */}
      <div className="p-3">
        <button
          onClick={onNewChat}
          className="w-full flex items-center gap-2 px-3 py-2 rounded-lg border border-white/20 hover:bg-white/10 transition-colors text-sm"
        >
          <Plus size={16} />
          <span>محادثة جديدة</span>
        </button>
      </div>

      {/* Navigation */}
      <nav className="px-3 space-y-1 mb-2">
        <NavItem
          icon={<MessageSquare size={16} />}
          label="الاستشارات التنظيمية"
          sublabel="Regulatory Chat"
          active
          onClick={() => router.push("/")}
        />
        <NavItem
          icon={<FileSearch size={16} />}
          label="فحص المستندات"
          sublabel="Document Review"
          onClick={() => router.push("/review")}
        />
        <NavItem
          icon={<Search size={16} />}
          label="البحث في الأنظمة"
          sublabel="Regulation Search"
          onClick={() => router.push("/search")}
        />
        <NavItem
          icon={<Bell size={16} />}
          label="التنبيهات"
          sublabel="Alerts"
          onClick={() => router.push("/alerts")}
        />
        <NavItem
          icon={<LayoutDashboard size={16} />}
          label="لوحة المتابعة"
          sublabel="Dashboard"
          onClick={() => router.push("/dashboard")}
        />
      </nav>

      {/* Conversation History */}
      <div className="flex-1 overflow-y-auto px-3 border-t border-white/10 pt-2">
        <p className="text-[10px] text-white/40 px-1 mb-2">المحادثات السابقة</p>
        {conversations.length === 0 ? (
          <p className="text-[10px] text-white/20 px-1">لا توجد محادثات</p>
        ) : (
          <div className="space-y-0.5">
            {conversations.map((conv) => (
              <button
                key={conv.id}
                onClick={() => onSelectConversation(conv.id)}
                className={`w-full group flex items-center gap-2 px-2 py-2 rounded-lg text-right text-xs transition-colors ${
                  activeConversationId === conv.id
                    ? "bg-white/15 text-white"
                    : "text-white/60 hover:bg-white/10 hover:text-white/80"
                }`}
              >
                <MessageSquare size={12} className="flex-shrink-0 opacity-50" />
                <span className="flex-1 truncate">{conv.preview || "..."}</span>
                <button
                  onClick={(e) => handleDelete(e, conv.id)}
                  className="opacity-0 group-hover:opacity-60 hover:!opacity-100 transition-opacity"
                  aria-label="Delete conversation"
                >
                  <Trash2 size={12} />
                </button>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* User / Footer */}
      <div className="p-3 border-t border-white/10">
        {user && (
          <div className="flex items-center gap-2 mb-2">
            <div className="w-7 h-7 rounded-full bg-white/10 flex items-center justify-center text-[10px] font-bold">
              {(user.email?.[0] ?? "U").toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs truncate">{user.email}</p>
            </div>
            <button
              onClick={() => signOut()}
              className="text-white/40 hover:text-white/80 transition-colors"
              aria-label="Sign out"
            >
              <LogOut size={14} />
            </button>
          </div>
        )}
        <div className="text-[10px] text-white/40 space-y-1">
          <p>الإصدار 3.0.0</p>
          <p>&copy; 2026 تام المالية | TAM Capital</p>
        </div>
      </div>
    </div>
  );
}

function NavItem({
  icon,
  label,
  sublabel,
  active,
  disabled,
  badge,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  sublabel: string;
  active?: boolean;
  disabled?: boolean;
  badge?: string;
  onClick?: () => void;
}) {
  return (
    <button
      disabled={disabled}
      onClick={onClick}
      className={`w-full flex items-center gap-2 px-3 py-2.5 rounded-lg text-right transition-colors text-sm ${
        active
          ? "bg-white/15 text-white"
          : disabled
            ? "text-white/30 cursor-not-allowed"
            : "text-white/70 hover:bg-white/10"
      }`}
    >
      {icon}
      <div className="flex-1 min-w-0">
        <div className="truncate">{label}</div>
        <div className="text-[10px] opacity-50">{sublabel}</div>
      </div>
      {badge && (
        <span className="text-[9px] bg-tam-gold/20 text-tam-gold px-1.5 py-0.5 rounded">
          {badge}
        </span>
      )}
    </button>
  );
}
