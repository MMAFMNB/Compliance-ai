"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import ChatMessage from "@/components/ChatMessage";
import ChatInput from "@/components/ChatInput";
import Sidebar from "@/components/Sidebar";
import { streamMessage, getConversation, Message } from "@/lib/api";
import { useRequireAuth } from "@/lib/useRequireAuth";
import { Scale, Loader2 } from "lucide-react";

export default function Home() {
  const router = useRouter();
  const { user, isLoading: isAuthLoading } = useRequireAuth();

  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [conversationId, setConversationId] = useState<string | undefined>();
  const [streamingContent, setStreamingContent] = useState("");
  const [conversationRefreshKey, setConversationRefreshKey] = useState(0);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streamingContent]);

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
          // Refresh sidebar conversation list
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
        }
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
        conv.messages.map((m) => ({ role: m.role as "user" | "assistant", content: m.content }))
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
        <Loader2 size={32} className="animate-spin text-tam-light" />
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
            <h2 className="text-sm font-semibold text-tam-primary">
              الاستشارات التنظيمية
            </h2>
            <p className="text-[11px] text-slate-400">
              مستشار الامتثال لأنظمة هيئة السوق المالية
            </p>
          </div>
          <div className="flex items-center gap-2 text-[11px] text-slate-400">
            <div className="w-2 h-2 rounded-full bg-emerald-400" />
            متصل
          </div>
        </header>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto" tabIndex={0} role="log" aria-label="Chat messages">
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

function WelcomeScreen({ onSuggestion }: { onSuggestion: (q: string) => void }) {
  return (
    <div className="flex items-center justify-center h-full">
      <div className="text-center max-w-lg px-4">
        <div className="w-16 h-16 bg-gradient-to-br from-tam-accent to-tam-light rounded-2xl flex items-center justify-center mx-auto mb-6">
          <Scale size={32} className="text-white" />
        </div>
        <h1 className="text-2xl font-bold text-tam-primary mb-2">
          تام للامتثال التنظيمي
        </h1>
        <p className="text-sm text-slate-500 mb-8">
          مستشارك الذكي لأنظمة ولوائح هيئة السوق المالية السعودية
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-right">
          <SuggestionCard
            title="صناديق الاستثمار"
            question="ما هي متطلبات تأسيس صندوق استثمار خاص؟"
            onClick={onSuggestion}
          />
          <SuggestionCard
            title="مكافحة غسل الأموال"
            question="ما هي إجراءات العناية المهنية الواجبة للعملاء الجدد؟"
            onClick={onSuggestion}
          />
          <SuggestionCard
            title="مؤسسات السوق المالية"
            question="ما هي متطلبات تعيين مسؤول المطابقة والالتزام؟"
            onClick={onSuggestion}
          />
          <SuggestionCard
            title="Investment Funds"
            question="What are the CMA requirements for fund NAV reporting?"
            onClick={onSuggestion}
          />
        </div>

        <p className="text-[11px] text-slate-400 mt-8">
          يستند إلى اللوائح التنفيذية والتعاميم والأسئلة المتكررة الصادرة عن
          هيئة السوق المالية
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
      className="bg-white border border-slate-200 rounded-lg p-3 text-right hover:border-tam-light hover:shadow-sm transition-all group"
    >
      <div className="text-[10px] font-medium text-tam-gold mb-1">{title}</div>
      <div className="text-xs text-slate-600 group-hover:text-tam-primary transition-colors">
        {question}
      </div>
    </button>
  );
}
