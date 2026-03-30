"use client";

import { useState } from "react";
import { ThumbsUp, ThumbsDown, MessageSquare, Loader2, Check } from "lucide-react";
import { supabase } from "@/lib/supabase";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

interface FeedbackButtonsProps {
  feature: string;
  resourceId?: string;
  originalOutput?: string;
}

export default function FeedbackButtons({
  feature,
  resourceId,
  originalOutput,
}: FeedbackButtonsProps) {
  const [submitted, setSubmitted] = useState<string | null>(null);
  const [showComment, setShowComment] = useState(false);
  const [comment, setComment] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const submitFeedback = async (rating: string, comments?: string) => {
    setIsSubmitting(true);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      await fetch(`${API_URL}/api/feedback/`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({
          feature,
          resource_id: resourceId,
          rating,
          original_output: originalOutput?.slice(0, 2000),
          comments: comments || undefined,
        }),
      });
      setSubmitted(rating);
      setShowComment(false);
    } catch {
      // Silent fail — feedback is non-critical
    } finally {
      setIsSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <div className="flex items-center gap-1.5 text-[10px] text-emerald-600">
        <Check size={12} />
        <span>شكراً لتقييمك — Thanks!</span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1">
      <button
        onClick={() => submitFeedback("approved")}
        disabled={isSubmitting}
        className="p-1.5 text-slate-300 hover:text-emerald-500 transition-colors rounded-lg hover:bg-emerald-50"
        title="مفيد — Helpful"
      >
        <ThumbsUp size={14} />
      </button>
      <button
        onClick={() => setShowComment(true)}
        disabled={isSubmitting}
        className="p-1.5 text-slate-300 hover:text-amber-500 transition-colors rounded-lg hover:bg-amber-50"
        title="يحتاج تعديل — Needs edit"
      >
        <MessageSquare size={14} />
      </button>
      <button
        onClick={() => submitFeedback("rejected")}
        disabled={isSubmitting}
        className="p-1.5 text-slate-300 hover:text-red-500 transition-colors rounded-lg hover:bg-red-50"
        title="غير مفيد — Not helpful"
      >
        <ThumbsDown size={14} />
      </button>

      {showComment && (
        <div className="flex items-center gap-1.5 mr-1">
          <input
            type="text"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="ملاحظة..."
            dir="auto"
            className="text-[10px] border border-slate-200 rounded-lg px-2 py-1 w-40 focus:outline-none focus:border-tam-light"
          />
          <button
            onClick={() => submitFeedback("needs_edit", comment)}
            disabled={isSubmitting}
            className="text-[10px] px-2 py-1 bg-amber-50 text-amber-700 rounded-lg hover:bg-amber-100"
          >
            {isSubmitting ? <Loader2 size={10} className="animate-spin" /> : "إرسال"}
          </button>
        </div>
      )}
    </div>
  );
}
