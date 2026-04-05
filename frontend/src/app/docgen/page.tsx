"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  FilePlus,
  FileText,
  Copy,
  Printer,
  ArrowRight,
  Scale,
  Loader2,
  ChevronDown,
  Send,
  CheckCircle2,
  XCircle,
} from "lucide-react";
import { useRequireAuth } from "@/lib/useRequireAuth";
import { supabase } from "@/lib/supabase";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

interface TemplateField {
  name: string;
  label: string;
  label_en: string;
  type: "text" | "textarea" | "select";
  options?: string[];
}

interface Template {
  id: string;
  name: string;
  name_en: string;
  category: string;
  description: string;
  required_fields: TemplateField[];
}

interface GeneratedDocument {
  id: string;
  title: string;
  content: string;
  template_id: string;
  created_at: string;
}

const CATEGORY_COLORS: Record<string, string> = {
  aml_policy: "text-red-600 bg-red-50",
  compliance_report: "text-blue-600 bg-blue-50",
  board_notification: "text-amber-600 bg-amber-50",
  fund_prospectus: "text-emerald-600 bg-emerald-50",
  cma_form: "text-purple-600 bg-purple-50",
  risk_assessment: "text-orange-600 bg-orange-50",
};

const CATEGORY_LABELS: Record<string, string> = {
  aml_policy: "سياسة مكافحة غسل الأموال",
  compliance_report: "تقرير التزام",
  board_notification: "إخطار مجلس الإدارة",
  fund_prospectus: "نشرة إصدار صندوق",
  cma_form: "نموذج هيئة السوق المالية",
  risk_assessment: "تقييم المخاطر",
};

export default function DocGenPage() {
  const router = useRouter();
  const { user, isLoading: isAuthLoading } = useRequireAuth();

  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<Template | null>(null);
  const [formData, setFormData] = useState<Record<string, string>>({});
  const [isLoadingTemplates, setIsLoadingTemplates] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedDoc, setGeneratedDoc] = useState<GeneratedDocument | null>(null);
  const [history, setHistory] = useState<GeneratedDocument[]>([]);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (user) {
      fetchTemplates();
      fetchHistory();
    }
  }, [user]);

  const getAuthHeader = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    return { Authorization: `Bearer ${session?.access_token}` };
  };

  const fetchTemplates = async () => {
    try {
      const headers = await getAuthHeader();
      const res = await fetch(`${API_URL}/api/documents/templates`, { headers });
      if (!res.ok) throw new Error(`${res.status}`);
      const data = await res.json();
      setTemplates(data);
    } catch (err) {
      console.error("Failed to fetch templates:", err);
    } finally {
      setIsLoadingTemplates(false);
    }
  };

  const fetchHistory = async () => {
    try {
      const headers = await getAuthHeader();
      const res = await fetch(`${API_URL}/api/documents/generated`, { headers });
      if (!res.ok) throw new Error(`${res.status}`);
      const data = await res.json();
      setHistory(data);
    } catch (err) {
      console.error("Failed to fetch history:", err);
    }
  };

  const handleSelectTemplate = (template: Template) => {
    setSelectedTemplate(template);
    setFormData({});
    setError("");
    setStep(2);
  };

  const handleGenerate = async () => {
    if (!selectedTemplate) return;
    setIsGenerating(true);
    setError("");

    try {
      const headers = await getAuthHeader();
      const res = await fetch(`${API_URL}/api/documents/generate`, {
        method: "POST",
        headers: {
          ...headers,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          template_id: selectedTemplate.id,
          input_data: formData,
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => null);
        throw new Error(errData?.detail || `Generation failed: ${res.status}`);
      }

      const data: GeneratedDocument = await res.json();
      setGeneratedDoc(data);
      setStep(3);
      fetchHistory();
    } catch (err) {
      setError(err instanceof Error ? err.message : "حدث خطأ غير متوقع");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleCopy = async () => {
    if (!generatedDoc) return;
    try {
      await navigator.clipboard.writeText(generatedDoc.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy:", err);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  const handleGenerateAnother = () => {
    setStep(1);
    setSelectedTemplate(null);
    setFormData({});
    setGeneratedDoc(null);
    setError("");
  };

  const handleViewHistoryDoc = (doc: GeneratedDocument) => {
    setGeneratedDoc(doc);
    setStep(3);
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
            <button
              onClick={() => router.push("/")}
              className="text-slate-400 hover:text-tam-primary transition-colors"
              aria-label="Back to chat"
            >
              <ArrowRight size={20} />
            </button>
            <div>
              <h1 className="text-sm font-semibold text-tam-primary">
                إعداد المستندات
              </h1>
              <p className="text-[11px] text-slate-400">
                Document Generator
              </p>
            </div>
          </div>
          <div className="w-8 h-8 bg-gradient-to-br from-tam-accent to-tam-light rounded-lg flex items-center justify-center">
            <Scale size={16} className="text-white" />
          </div>
        </div>
      </header>

      <div className="max-w-4xl mx-auto p-6">
        {/* Step indicator */}
        <div className="flex items-center gap-2 mb-6">
          {[1, 2, 3].map((s) => (
            <div key={s} className="flex items-center gap-2">
              <div
                className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-medium transition-colors ${
                  step >= s
                    ? "bg-tam-primary text-white"
                    : "bg-slate-200 text-slate-400"
                }`}
              >
                {s}
              </div>
              {s < 3 && (
                <div
                  className={`w-8 h-0.5 transition-colors ${
                    step > s ? "bg-tam-primary" : "bg-slate-200"
                  }`}
                />
              )}
            </div>
          ))}
          <span className="text-[11px] text-slate-400 mr-3">
            {step === 1 && "اختر القالب"}
            {step === 2 && "تعبئة البيانات"}
            {step === 3 && "معاينة وتصدير"}
          </span>
        </div>

        {/* Step 1: Select Template */}
        {step === 1 && (
          <div>
            {isLoadingTemplates ? (
              <div className="text-center py-12">
                <Loader2 size={24} className="animate-spin text-tam-light mx-auto mb-3" />
                <p className="text-sm text-slate-500">جاري تحميل القوالب...</p>
              </div>
            ) : templates.length === 0 ? (
              <div className="text-center py-12">
                <FilePlus size={32} className="text-slate-300 mx-auto mb-3" />
                <p className="text-sm text-slate-500">لا توجد قوالب متاحة حالياً</p>
                <p className="text-xs text-slate-400 mt-1">No templates available yet.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {templates.map((template) => {
                  const catColor = CATEGORY_COLORS[template.category] || "text-slate-500 bg-slate-100";
                  const catLabel = CATEGORY_LABELS[template.category] || template.category;
                  return (
                    <button
                      key={template.id}
                      onClick={() => handleSelectTemplate(template)}
                      className="bg-white border border-slate-200 rounded-xl p-5 text-right hover:border-tam-light hover:shadow-sm transition-all"
                    >
                      <div className="flex items-center gap-2 mb-2">
                        <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${catColor}`}>
                          {catLabel}
                        </span>
                      </div>
                      <p className="text-sm font-semibold text-slate-800 leading-6">
                        {template.name}
                      </p>
                      <p className="text-xs text-slate-400 mt-0.5">
                        {template.name_en}
                      </p>
                      <p dir="auto" className="text-xs text-slate-500 mt-2 leading-5">
                        {template.description}
                      </p>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Step 2: Fill Form */}
        {step === 2 && selectedTemplate && (
          <div>
            <div className="bg-white border border-slate-200 rounded-xl p-6">
              <div className="mb-5">
                <h2 className="text-sm font-semibold text-tam-primary">
                  {selectedTemplate.name}
                </h2>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  {selectedTemplate.name_en}
                </p>
              </div>

              <div className="space-y-5">
                {selectedTemplate.required_fields.map((field) => (
                  <div key={field.name}>
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      {field.label}
                    </label>
                    <p className="text-[11px] text-slate-400 mb-2">{field.label_en}</p>

                    {field.type === "text" && (
                      <input
                        type="text"
                        value={formData[field.name] || ""}
                        onChange={(e) =>
                          setFormData((prev) => ({ ...prev, [field.name]: e.target.value }))
                        }
                        className="w-full border border-slate-300 rounded-lg px-4 py-2.5 text-sm text-slate-700 focus:outline-none focus:border-tam-light focus:ring-1 focus:ring-tam-light transition-colors"
                        dir="auto"
                      />
                    )}

                    {field.type === "textarea" && (
                      <textarea
                        value={formData[field.name] || ""}
                        onChange={(e) =>
                          setFormData((prev) => ({ ...prev, [field.name]: e.target.value }))
                        }
                        rows={4}
                        className="w-full border border-slate-300 rounded-lg px-4 py-2.5 text-sm text-slate-700 focus:outline-none focus:border-tam-light focus:ring-1 focus:ring-tam-light transition-colors resize-none"
                        dir="auto"
                      />
                    )}

                    {field.type === "select" && field.options && (
                      <select
                        value={formData[field.name] || ""}
                        onChange={(e) =>
                          setFormData((prev) => ({ ...prev, [field.name]: e.target.value }))
                        }
                        className="w-full border border-slate-300 rounded-lg px-4 py-2.5 text-sm text-slate-700 focus:outline-none focus:border-tam-light focus:ring-1 focus:ring-tam-light transition-colors bg-white"
                      >
                        <option value="">اختر...</option>
                        {field.options.map((opt) => (
                          <option key={opt} value={opt}>
                            {opt}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>
                ))}
              </div>

              {error && (
                <div className="mt-4 bg-red-50 text-red-700 text-xs rounded-lg p-3">
                  {error}
                </div>
              )}

              <div className="flex items-center gap-3 mt-6">
                <button
                  onClick={() => setStep(1)}
                  className="px-5 py-2.5 border border-slate-300 text-slate-600 rounded-xl text-sm hover:bg-slate-50 transition-colors"
                >
                  رجوع
                </button>
                <button
                  onClick={handleGenerate}
                  disabled={isGenerating}
                  className="flex-1 py-2.5 bg-tam-primary text-white rounded-xl text-sm font-medium hover:bg-tam-secondary disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
                >
                  {isGenerating ? (
                    <>
                      <Loader2 size={16} className="animate-spin" />
                      جاري إعداد المستند...
                    </>
                  ) : (
                    <>
                      <FilePlus size={16} />
                      إنشاء المستند
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Step 3: Preview & Export */}
        {step === 3 && generatedDoc && (
          <div>
            <div className="flex items-center gap-3 mb-4">
              <button
                onClick={handleCopy}
                className="flex items-center gap-1.5 px-4 py-2 border border-slate-300 rounded-lg text-xs text-slate-600 hover:bg-slate-50 transition-colors"
              >
                <Copy size={14} />
                {copied ? "تم النسخ!" : "نسخ"}
              </button>
              <button
                onClick={handlePrint}
                className="flex items-center gap-1.5 px-4 py-2 border border-slate-300 rounded-lg text-xs text-slate-600 hover:bg-slate-50 transition-colors"
              >
                <Printer size={14} />
                طباعة / تصدير PDF
              </button>
              <button
                onClick={handleGenerateAnother}
                className="flex items-center gap-1.5 px-4 py-2 bg-tam-primary text-white rounded-lg text-xs hover:bg-tam-secondary transition-colors"
              >
                <FilePlus size={14} />
                إنشاء مستند آخر
              </button>
              <button
                onClick={async () => {
                  try {
                    const { data: { session } } = await supabase.auth.getSession();
                    await fetch(`${API_URL}/api/documents/generated/${generatedDoc.id}/submit-review`, {
                      method: "POST",
                      headers: {
                        Authorization: `Bearer ${session?.access_token}`,
                        "Content-Type": "application/json",
                      },
                      body: JSON.stringify({}),
                    });
                    setError("");
                  } catch {}
                }}
                className="flex items-center gap-1.5 px-4 py-2 bg-amber-50 text-amber-700 border border-amber-200 rounded-lg text-xs hover:bg-amber-100 transition-colors"
              >
                <Send size={14} />
                إرسال للمراجعة — Submit Review
              </button>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl max-w-3xl mx-auto p-8">
              <h2 className="text-sm font-semibold text-tam-primary mb-1">
                {generatedDoc.title}
              </h2>
              <p className="text-[10px] text-slate-400 mb-4">
                {new Date(generatedDoc.created_at).toLocaleDateString("ar-SA", {
                  year: "numeric",
                  month: "long",
                  day: "numeric",
                })}
              </p>
              <div
                dir="auto"
                className="text-sm text-slate-700 leading-8 whitespace-pre-line"
              >
                {generatedDoc.content}
              </div>
            </div>
          </div>
        )}

        {/* History Section */}
        <div className="mt-8">
          <button
            onClick={() => setIsHistoryOpen(!isHistoryOpen)}
            className="flex items-center gap-2 text-sm text-slate-500 hover:text-slate-700 transition-colors"
          >
            <ChevronDown
              size={16}
              className={`transition-transform ${isHistoryOpen ? "rotate-180" : ""}`}
            />
            <FileText size={14} />
            المستندات السابقة — Previous Documents
          </button>

          {isHistoryOpen && (
            <div className="mt-3 space-y-2">
              {history.length === 0 ? (
                <p className="text-xs text-slate-400 py-4">
                  لا توجد مستندات سابقة — No previous documents
                </p>
              ) : (
                history.map((doc) => (
                  <button
                    key={doc.id}
                    onClick={() => handleViewHistoryDoc(doc)}
                    className="w-full bg-white border border-slate-200 rounded-lg p-4 text-right hover:border-tam-light transition-colors"
                  >
                    <p className="text-sm text-slate-700">{doc.title}</p>
                    <p className="text-[10px] text-slate-400 mt-1">
                      {new Date(doc.created_at).toLocaleDateString("ar-SA", {
                        year: "numeric",
                        month: "long",
                        day: "numeric",
                      })}
                    </p>
                  </button>
                ))
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
