"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import ChatMessage from "@/components/ChatMessage";
import ChatInput from "@/components/ChatInput";
import Sidebar from "@/components/Sidebar";
import { streamMessage, getConversation, Message } from "@/lib/api";
import { useAuth } from "@/lib/AuthContext";
import { Scale, Loader2 } from "lucide-react";

export default function Home() {
  const router = useRouter();
  const { user, isLoading: isAuthLoading } = useAuth();

  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [conversationId, setConversationId] = useState<string | undefined>();
  const [streamingContent, setStreamingContent] = useState("");
  const [conversationRefreshKey, setConversationRefreshKey] = useState(0);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Redirect to login if not authenticated
  useEffect(() => {
    if (!isAuthLoading && !user) {
      router.push("/login");
    }
  }, [user, isAuthLoading, router]);

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
            content: `\u062d\u062f\u062b \u062e\u0637\u0623 \u0641\u064a \u0627\u0644\u0627\u062a\u0635\u0627\u0644. \u064a\u0631\u062c\u0649 \u0627\u0644\u0645\u062d\u0627\u0648\u0644\u0629 \u0645\u0631\u0629 \u0623\u062e\u0631\u0649.\n\nError: ${error}`,
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
        content: `\u0644\u0645 \u064a\u062a\u0645 \u0627\u0644\u0627\u062a\u0635\u0627\u0644 \u0628\u0627\u0644\u062e\u0627\u062f\u0645. \u064a\u0631\u062c\u0649 \u0627\u0644\u0645\u062d\u0627\u0648\u0644\u0629 \u0645\u0631\u0629 \u0623\u062e\u0631\u0649.\n\nCould not connect to the server: ${detail}`,
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
              \u0627\u0644\u0627\u0633\u062a\u0634\u0627\u0631\u0627\u062a \u0627\u0644\u062a\u0646\u0638\u064a\u0645\u064a\u0629
            </h2>
            <p className="text-[11px] text-slate-400">
              \u0645\u0633\u062a\u0634\u0627\u0631 \u0627\u0644\u0627\u0645\u062a\u062b\u0627\u0644 \u0644\u0623\u0646\u0638\u0645\u0629 \u0647\u064a\u0626\u0629 \u0627\u0644\u0633\u0648\u0642 \u0627\u0644\u0645\u0627\u0644\u064a\u0629
            </p>
          </div>
          <div className="flex items-center gap-2 text-[11px] text-slate-400">
            <div className="w-2 h-2 rounded-full bg-emerald-400" />
            \u0645\u062a\u0635\u0644
          </div>
        </header>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto">
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
          \u062a\u0627\u0645 \u0644\u0644\u0627\u0645\u062a\u062b\u0627\u0644 \u0627\u0644\u062a\u0646\u0638\u064a\u0645\u064a
        </h1>
        <p className="text-sm text-slate-500 mb-8">
          \u0645\u0633\u062a\u0634\u0627\u0631\u0643 \u0627\u0644\u0630\u0643\u064a \u0644\u0623\u0646\u0638\u0645\u0629 \u0648\u0644\u0648\u0627\u0626\u062d \u0647\u064a\u0626\u0629 \u0627\u0644\u0633\u0648\u0642 \u0627\u0644\u0645\u0627\u0644\u064a\u0629 \u0627\u0644\u0633\u0639\u0648\u062f\u064a\u0629
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-right">
          <SuggestionCard
            title="\u0635\u0646\u0627\u062f\u064a\u0642 \u0627\u0644\u0627\u0633\u062a\u062b\u0645\u0627\u0631"
            question="\u0645\u0627 \u0647\u064a \u0645\u062a\u0637\u0644\u0628\u0627\u062a \u062a\u0623\u0633\u064a\u0633 \u0635\u0646\u062f\u0648\u0642 \u0627\u0633\u062a\u062b\u0645\u0627\u0631 \u062e\u0627\u0635\u061f"
            onClick={onSuggestion}
          />
          <SuggestionCard
            title="\u0645\u0643\u0627\u0641\u062d\u0629 \u063a\u0633\u0644 \u0627\u0644\u0623\u0645\u0648\u0627\u0644"
            question="\u0645\u0627 \u0647\u064a \u0625\u062c\u0631\u0627\u0621\u0627\u062a \u0627\u0644\u0639\u0646\u0627\u064a\u0629 \u0627\u0644\u0645\u0647\u0646\u064a\u0629 \u0627\u0644\u0648\u0627\u062c\u0628\u0629 \u0644\u0644\u0639\u0645\u0644\u0627\u0621 \u0627\u0644\u062c\u062f\u062f\u061f"
            onClick={onSuggestion}
          />
          <SuggestionCard
            title="\u0645\u0624\u0633\u0633\u0627\u062a \u0627\u0644\u0633\u0648\u0642 \u0627\u0644\u0645\u0627\u0644\u064a\u0629"
            question="\u0645\u0627 \u0647\u064a \u0645\u062a\u0637\u0644\u0628\u0627\u062a \u062a\u0639\u064a\u064a\u0646 \u0645\u0633\u0624\u0648\u0644 \u0627\u0644\u0645\u0637\u0627\u0628\u0642\u0629 \u0648\u0627\u0644\u0627\u0644\u062a\u0632\u0627\u0645\u061f"
            onClick={onSuggestion}
          />
          <SuggestionCard
            title="Investment Funds"
            question="What are the CMA requirements for fund NAV reporting?"
            onClick={onSuggestion}
          />
        </div>

        <p className="text-[11px] text-slate-400 mt-8">
          \u064a\u0633\u062a\u0646\u062f \u0625\u0644\u0649 \u0627\u0644\u0644\u0648\u0627\u0626\u062d \u0627\u0644\u062a\u0646\u0641\u064a\u0630\u064a\u0629 \u0648\u0627\u0644\u062a\u0639\u0627\u0645\u064a\u0645 \u0648\u0627\u0644\u0623\u0633\u0626\u0644\u0629 \u0627\u0644\u0645\u062a\u0643\u0631\u0631\u0629 \u0627\u0644\u0635\u0627\u062f\u0631\u0629 \u0639\u0646
          \u0647\u064a\u0626\u0629 \u0627\u0644\u0633\u0648\u0642 \u0627\u0644\u0645\u0627\u0644\u064a\u0629
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
