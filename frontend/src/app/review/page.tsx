"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  FileSearch,
  Upload,
  Loader2,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  ArrowRight,
  Scale,
  FileText,
} from "lucide-react";
import { useRequireAuth } from "@/lib/useRequireAuth";
import { supabase } from "@/lib/supabase";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

interface ReviewFinding {
  clause: string;
  regulation: string;
  status: "compliant" | "non_compliant" | "needs_review" | "not_applicable";
  recommendation: string;
  citations: string[];
}

interface ReviewResult {
  filename: string;
  language: string;
  total_findings: number;
  compliant: number;
  non_compliant: number;
  needs_review: number;
  findings: ReviewFinding[];
  latency_ms: number;
}

const STATUS_CONFIG = {
  compliant: {
    icon: CheckCircle2,
    label: "متوافق",
    labelEn: "Compliant",
    color: "text-emerald-600",
    bg: "bg-emerald-50",
    border: "border-emerald-200",
  },
  non_compliant: {
    icon: XCircle,
    label: "غير متوافق",
    labelEn: "Non-Compliant",
    color: "text-red-600",
    bg: "bg-red-50",
    border: "border-red-200",
  },
  needs_review: {
    icon: AlertTriangle,
    label: "يحتاج مراجعة",
    labelEn: "Needs Review",
    color: "text-amber-600",
    bg: "bg-amber-50",
    border: "border-amber-200",
  },
  not_applicable: {
    icon: FileText,
    label: "لا ينطبق",
    labelEn: "N/A",
    color: "text-slate-400",
    bg: "bg-slate-50",
    border: "border-slate-200",
  },
};

export default function ReviewPage() {
  const router = useRouter();
  const { user, isLoading: isAuthLoading } = useRequireAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isReviewing, setIsReviewing] = useState(false);
  const [result, setResult] = useState<ReviewResult | null>(null);
  const [error, setError] = useState("");

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (!file.name.toLowerCase().endsWith(".pdf")) {
        setError("يرجى اختيار ملف PDF فقط");
        return;
      }
      setSelectedFile(file);
      setError("");
      setResult(null);
    }
  };

  const handleReview = async () => {
    if (!selectedFile) return;

    setIsReviewing(true);
    setError("");

    try {
      const { data: { session } } = await supabase.auth.getSession();

      const formData = new FormData();
      formData.append("file", selectedFile);

      const res = await fetch(`${API_URL}/api/review`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session?.access_token}`,
        },
        body: formData,
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => null);
        throw new Error(errData?.detail || `Review failed: ${res.status}`);
      }

      const data: ReviewResult = await res.json();
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "حدث خطأ غير متوقع");
    } finally {
      setIsReviewing(false);
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
      <header className="bg-white border-b border-slate-200 px-6 py-4">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button onClick={() => router.push("/")} className="text-slate-400 hover:text-tam-primary transition-colors" aria-label="Back to chat">
              <ArrowRight size={20} />
            </button>
            <div>
              <h1 className="text-sm font-semibold text-tam-primary">فحص المستندات</h1>
              <p className="text-[11px] text-slate-400">Document Review</p>
            </div>
          </div>
          <div className="w-8 h-8 bg-gradient-to-br from-tam-accent to-tam-light rounded-lg flex items-center justify-center">
            <Scale size={16} className="text-white" />
          </div>
        </div>
      </header>

      <div className="max-w-4xl mx-auto p-6">
        {!result && (
          <div className="mb-8">
            <div onClick={() => fileInputRef.current?.click()} className="border-2 border-dashed border-slate-300 rounded-xl p-12 text-center cursor-pointer hover:border-tam-light hover:bg-white transition-all">
              <input ref={fileInputRef} type="file" accept=".pdf" onChange={handleFileSelect} className="hidden" />
              <Upload size={32} className="mx-auto mb-4 text-slate-400" />
              <p className="text-sm text-slate-600 mb-1">{selectedFile ? selectedFile.name : "اسحب ملف PDF هنا أو انقر للاختيار"}</p>
              <p className="text-xs text-slate-400">{selectedFile ? `${(selectedFile.size / 1024 / 1024).toFixed(1)} MB` : "PDF files only — سياسات، نشرات إصدار، عقود"}</p>
            </div>
            {error && <div className="mt-4 bg-red-50 text-red-700 text-xs rounded-lg p-3">{error}</div>}
            {selectedFile && (
              <button onClick={handleReview} disabled={isReviewing} className="mt-4 w-full py-3 bg-tam-primary text-white rounded-xl text-sm font-medium hover:bg-tam-secondary disabled:opacity-50 transition-colors flex items-center justify-center gap-2">
                {isReviewing ? (<><Loader2 size={16} className="animate-spin" />جاري فحص المستند...</>) : (<><FileSearch size={16} />فحص المستند</>)}
              </button>
            )}
          </div>
        )}

        {result && (
          <div>
            <div className="bg-white border border-slate-200 rounded-xl p-6 mb-6">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-sm font-semibold text-tam-primary">نتائج الفحص — {result.filename}</h2>
                  <p className="text-[11px] text-slate-400 mt-0.5">{result.total_findings} نتيجة &middot; {(result.latency_ms / 1000).toFixed(1)}s</p>
                </div>
                <button onClick={() => { setResult(null); setSelectedFile(null); }} className="text-xs text-tam-light hover:text-tam-primary transition-colors">فحص مستند آخر</button>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div className="bg-emerald-50 rounded-lg p-3 text-center"><p className="text-2xl font-bold text-emerald-600">{result.compliant}</p><p className="text-[10px] text-emerald-600">متوافق</p></div>
                <div className="bg-red-50 rounded-lg p-3 text-center"><p className="text-2xl font-bold text-red-600">{result.non_compliant}</p><p className="text-[10px] text-red-600">غير متوافق</p></div>
                <div className="bg-amber-50 rounded-lg p-3 text-center"><p className="text-2xl font-bold text-amber-600">{result.needs_review}</p><p className="text-[10px] text-amber-600">يحتاج مراجعة</p></div>
              </div>
            </div>

            <div className="space-y-3">
              {result.findings.map((finding, i) => {
                const config = STATUS_CONFIG[finding.status];
                const Icon = config.icon;
                return (
                  <div key={i} className={`bg-white border ${config.border} rounded-xl p-5`}>
                    <div className="flex items-start gap-3">
                      <div className={`${config.bg} rounded-lg p-1.5 mt-0.5`}><Icon size={14} className={config.color} /></div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className={`text-[10px] font-medium ${config.color}`}>{config.label}</span>
                          <span className="text-[10px] text-slate-400">{finding.regulation}</span>
                        </div>
                        <p dir="auto" className="text-sm text-slate-700 mb-2 leading-7">{finding.clause}</p>
                        <p dir="auto" className="text-xs text-slate-500 leading-6">{finding.recommendation}</p>
                        {finding.citations.length > 0 && (
                          <div className="mt-2 flex flex-wrap gap-1">
                            {finding.citations.map((citation, j) => (<span key={j} className="text-[10px] bg-blue-50 text-blue-700 px-2 py-0.5 rounded" dir="auto">{citation}</span>))}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
