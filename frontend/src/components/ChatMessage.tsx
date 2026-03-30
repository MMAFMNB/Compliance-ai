"use client";

import ReactMarkdown from "react-markdown";
import { Scale, User } from "lucide-react";
import FeedbackButtons from "./FeedbackButtons";

interface ChatMessageProps {
  role: "user" | "assistant";
  content: string;
  isStreaming?: boolean;
}

/**
 * Detect if text is predominantly Arabic.
 */
function isArabic(text: string): boolean {
  const arabicChars = text.match(/[؀-ۿ]/g);
  if (!arabicChars) return false;
  return arabicChars.length / text.length > 0.3;
}

export default function ChatMessage({
  role,
  content,
  isStreaming,
}: ChatMessageProps) {
  const isUser = role === "user";
  const textDir = isArabic(content) ? "rtl" : "ltr";

  return (
    <div
      className={`flex gap-3 py-5 px-4 ${
        isUser ? "bg-white" : "bg-slate-50"
      }`}
    >
      {/* Avatar */}
      <div
        className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${
          isUser
            ? "bg-tam-primary text-white"
            : "bg-gradient-to-br from-tam-accent to-tam-light text-white"
        }`}
      >
        {isUser ? <User size={16} /> : <Scale size={16} />}
      </div>

      {/* Message content */}
      <div className="flex-1 min-w-0 overflow-hidden">
        <div className="text-xs font-medium text-slate-500 mb-1">
          {isUser ? "أنت" : "تام للامتثال التنظيمي"}
        </div>
        <div
          dir={textDir}
          className={`message-content text-sm leading-relaxed text-slate-800 ${
            isStreaming ? "streaming-cursor" : ""
          }`}
        >
          {isUser ? (
            <p className="whitespace-pre-wrap">{content}</p>
          ) : (
            <ReactMarkdown
              components={{
                // Style citations that appear in brackets
                p: ({ children }) => (
                  <p className="mb-3 leading-7">{children}</p>
                ),
                strong: ({ children }) => (
                  <strong className="font-semibold text-tam-primary">
                    {children}
                  </strong>
                ),
                h1: ({ children }) => (
                  <h1 className="text-lg font-bold text-tam-primary mt-4 mb-2">
                    {children}
                  </h1>
                ),
                h2: ({ children }) => (
                  <h2 className="text-base font-bold text-tam-primary mt-3 mb-2">
                    {children}
                  </h2>
                ),
                h3: ({ children }) => (
                  <h3 className="text-sm font-bold text-tam-secondary mt-3 mb-1">
                    {children}
                  </h3>
                ),
                li: ({ children }) => (
                  <li className="mb-1 leading-7">{children}</li>
                ),
                table: ({ children }) => (
                  <div className="overflow-x-auto my-3">
                    <table className="min-w-full border border-slate-200 text-sm">
                      {children}
                    </table>
                  </div>
                ),
                th: ({ children }) => (
                  <th className="border border-slate-200 bg-slate-100 px-3 py-2 font-semibold">
                    {children}
                  </th>
                ),
                td: ({ children }) => (
                  <td className="border border-slate-200 px-3 py-2">
                    {children}
                  </td>
                ),
              }}
            >
              {content}
            </ReactMarkdown>
          )}
        </div>
        {!isUser && !isStreaming && content.length > 0 && (
          <div className="mt-2">
            <FeedbackButtons feature="chat" originalOutput={content} />
          </div>
        )}
      </div>
    </div>
  );
}
