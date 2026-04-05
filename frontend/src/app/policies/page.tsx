"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import ChatMessage from "@/components/ChatMessage";
import ChatInput from "@/components/ChatInput";
import Sidebar from "@/components/Sidebar";
import {
  streamMessage,
  getConversation,
  Message,
  uploadPolicyDocument,
  getPolicyDocuments,
  deletePolicyDocument,
  PolicyDocument,
} from "@/lib/api";
import { useRequireAuth } from "@/lib/useRequireAuth";
import { FileText, Upload, Loader2, Trash2, X } from "lucide-react";

export default function PoliciesPage() {
  const router = useRouter();
  const { user, isLoading: isAuthLoading } = useRequireAuth();

  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [conversationId, setConversationId] = useState<string | undefined>();
  const [streamingContent, setStreamingContent] = useState("");
  const [conversationRefreshKey, setConversationRefreshKey] = useState(0);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Document management state
  const [documents, setDocuments] = useState<PolicyDocument[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [showDocPanel, setShowDocPanel] = useState(true);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streamingContent]);

  // Load documents on mount
  const loadDocuments = useCallback(async () => {
    try {
      const docs = await getPolicyDocuments();
      setDocuments(docs);
    } catch {
      // Silently fail
    }
  }, []);

  useEffect(() => {
    if (user) loadDocuments();
  }, [user, loadDocuments]);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setUploadError("");

    try {
      await uploadPolicyDocument(file);
      await loadDocuments();
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
      // Reset file input
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleDeleteDoc = async (id: string) => {
    try {
      await deletePolicyDocument(id);
      setDocuments((prev) => prev.filter((d) => d.id !== id));
    } catch (err) {
      console.error("Failed to delete document:", err);
    }
  };

  const handleSend = async (message: string) => {
    const userMessage: Message = { role: "user", content: message };
    setMessages((prev) => [...prev, userMessage]);
    setIsLoading(true);
    setStreamingContent("");

    try {
      await streamMessage(
        message,
        conversationId,
        (text) => {
          setStreamingContent((prev) => prev + text);
        },
        (id) => {
          setConversationId(id);
        },
        () => {
          setStreamingContent((prev) => {
            const assistantMessage: Message = {
              role: "assistant",
              content: prev,
            };
            setMessages((msgs) => [...msgs, assistantMessage]);
            return "";
          });
          setIsLoading(false);
          setConversationRefreshKey((k) => k + 1);
        },
        (error) => {
          console.error("Stream error:", error);
          const errorMessage: Message = {
            role: "assistant",
            content: `حدث خطأ في الاتصال. يرجى المحاولة مرة أخرى.\n\nError: ${error}`,
          };
          setMessages((prev) => [...prev, errorMessage]);
          setStreamingContent("");
          setIsLoading(false);
        },
        "policies"
      );
    } catch (error) {
      console.error("Fetch error:", error);
      const detail = error instanceof Error ? error.message : "Unknown error";
      const errorMessage: Message = {
        role: "assistant",
        content: `لم يتم الاتصال بالخادم. يرجى المحاولة مرة أخرى.\n\nCould not connect to the server: ${detail}`,
      };
      setMessages((prev) => [...prev, errorMessage]);
      setStreamingContent("");
      setIsLoading(false);
    }
  };

  const handleNewChat = () => {
    setMessages([]);
    setConversationId(undefined);
    setStreamingContent("");
  };

  const handleSelectConversation = async (id: string) => {
    try {
      const conv = await getConversation(id);
      setConversationId(id);
      setMessages(
        conv.messages.map((m) => ({
          role: m.role as "user" | "assistant",
          content: m.content,
        }))
      );
      setStreamingContent("");
    } catch (err) {
      console.error("Failed to load conversation:", err);
    }
  };

  // Show loading spinner while checking auth
  if (isAuthLoading || !user) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Loader2 size={32} className="animate-spin text-indigo-500" />
      </div>
    );
  }

  return (
    <div className="flex h-screen">
      <Sidebar
        onNewChat={handleNewChat}
        onSelectConversation={handleSelectConversation}
        activeConversationId={conversationId}
        refreshKey={conversationRefreshKey}
      />

      <div className="flex-1 flex flex-col h-screen">
        {/* Header */}
        <header className="bg-white border-b border-slate-200 px-6 py-3 flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold text-indigo-700">
              وكيل السياسات والإجراءات
            </h2>
            <p className="text-[11px] text-slate-400">
              P&P Agent
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setShowDocPanel(!showDocPanel)}
              className="text-xs text-indigo-600 hover:text-indigo-800 transition-colors border border-indigo-200 px-2 py-1 rounded"
            >
              {showDocPanel ? "إخفاء المستندات" : "عرض المستندات"}
            </button>
            <div className="flex items-center gap-2 text-[11px] text-slate-400">
              <div className="w-2 h-2 rounded-full bg-indigo-400" />
              متصل
            </div>
          </div>
        </header>

        {/* Document Upload Panel */}
        {showDocPanel && (
          <div className="bg-indigo-50/50 border-b border-indigo-100 px-6 py-4">
            <div className="max-w-3xl mx-auto">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-xs font-semibold text-indigo-700">
                  ارفع وثائق السياسات والإجراءات — Upload P&P Documents
                </h3>
                <button
                  onClick={() => setShowDocPanel(false)}
                  className="text-slate-400 hover:text-slate-600"
                >
                  <X size={14} />
                </button>
              </div>

              {/* Upload Area */}
              <div
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-indigo-200 rounded-lg p-4 text-center cursor-pointer hover:border-indigo-400 hover:bg-indigo-50 transition-all"
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf"
                  onChange={handleUpload}
                  className="hidden"
                />
                {uploading ? (
                  <div className="flex items-center justify-center gap-2 text-indigo-600">
                    <Loader2 size={16} className="animate-spin" />
                    <span className="text-xs">جارٍ الرفع والمعالجة...</span>
                  </div>
                ) : (
                  <div className="flex items-center justify-center gap-2 text-indigo-500">
                    <Upload size={16} />
                    <span className="text-xs">
                      اضغط لرفع ملف PDF — Click to upload PDF
                    </span>
                  </div>
                )}
              </div>

              {uploadError && (
                <p className="text-xs text-red-500 mt-2">{uploadError}</p>
              )}

              {/* Document List */}
              {documents.length > 0 && (
                <div className="mt-3 space-y-1.5">
                  <p className="text-[10px] text-indigo-400 font-medium">
                    المستندات المرفوعة ({documents.length})
                  </p>
                  {documents.map((doc) => (
                    <div
                      key={doc.id}
                      className="flex items-center justify-between bg-white rounded-lg px-3 py-2 border border-indigo-100"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <FileText size={14} className="text-indigo-400 flex-shrink-0" />
                        <div className="min-w-0">
                          <p className="text-xs text-slate-700 truncate">
                            {doc.title}
                          </p>
                          <p className="text-[10px] text-slate-400">
                            {doc.chunk_count} chunks &middot; {doc.language || "—"}
                          </p>
                        </div>
                      </div>
                      <button
                        onClick={() => handleDeleteDoc(doc.id)}
                        className="text-slate-300 hover:text-red-500 transition-colors flex-shrink-0 ml-2"
                        aria-label="Delete document"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Messages */}
        <div
          className="flex-1 overflow-y-auto"
          tabIndex={0}
          role="log"
          aria-label="Chat messages"
        >
          {messages.length === 0 && !streamingContent ? (
            <WelcomeScreen onSuggestion={handleSend} />
          ) : (
            <div className="max-w-3xl mx-auto">
              {messages.map((msg, i) => (
                <ChatMessage key={i} role={msg.role} content={msg.content} />
              ))}
              {streamingContent && (
                <ChatMessage
                  role="assistant"
                  content={streamingContent}
                  isStreaming
                />
              )}
              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        <ChatInput onSend={handleSend} isLoading={isLoading} />
      </div>
    </div>
  );
}

function WelcomeScreen({
  onSuggestion,
}: {
  onSuggestion: (q: string) => void;
}) {
  return (
    <div className="flex items-center justify-center h-full">
      <div className="text-center max-w-lg px-4">
        <div className="w-16 h-16 bg-gradient-to-br from-indigo-500 to-purple-500 rounded-2xl flex items-center justify-center mx-auto mb-6">
          <FileText size={32} className="text-white" />
        </div>
        <h1 className="text-2xl font-bold text-indigo-800 mb-2">
          وكيل السياسات والإجراءات
        </h1>
        <p className="text-sm text-slate-500 mb-2">
          P&P Agent
        </p>
        <p className="text-xs text-slate-400 mb-8">
          ارفع وثائق السياسات والإجراءات الداخلية واطرح أسئلتك عنها
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-right">
          <SuggestionCard
            title="سياسة الالتزام"
            question="ما هي إجراءات الإبلاغ عن المخالفات التنظيمية؟"
            onClick={onSuggestion}
          />
          <SuggestionCard
            title="سياسة تضارب المصالح"
            question="ما هي متطلبات الإفصاح عن تضارب المصالح للموظفين؟"
            onClick={onSuggestion}
          />
          <SuggestionCard
            title="إجراءات العمليات"
            question="ما هي خطوات فتح حساب عميل جديد؟"
            onClick={onSuggestion}
          />
          <SuggestionCard
            title="P&P Search"
            question="What is the approval workflow for new investment products?"
            onClick={onSuggestion}
          />
        </div>

        <p className="text-[11px] text-slate-400 mt-8">
          يستند إلى وثائق السياسات والإجراءات المرفوعة في النظام
        </p>
      </div>
    </div>
  );
}

function SuggestionCard({
  title,
  question,
  onClick,
}: {
  title: string;
  question: string;
  onClick: (q: string) => void;
}) {
  return (
    <button
      onClick={() => onClick(question)}
      className="bg-white border border-slate-200 rounded-lg p-3 text-right hover:border-indigo-300 hover:shadow-sm transition-all group"
    >
      <div className="text-[10px] font-medium text-indigo-500 mb-1">
        {title}
      </div>
      <div className="text-xs text-slate-600 group-hover:text-indigo-700 transition-colors">
        {question}
      </div>
    </button>
  );
}
