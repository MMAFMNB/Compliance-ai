"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Search, Loader2, FileText, ArrowRight, Scale } from "lucide-react";
import { useAuth } from "@/lib/AuthContext";
import { supabase } from "@/lib/supabase";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

interface SearchResult {
  chunk_id: string;
  content: string;
  article_number: string | null;
  part: string | null;
  chapter: string | null;
  document_id: string;
  document_title: string | null;
  relevance_score: number;
}

export default function SearchPage() {
  const router = useRouter();
  const { user, isLoading: isAuthLoading } = useAuth();

  const [query, setQuery] = useState("");
  const [docType, setDocType] = useState<string>("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);

  useEffect(() => {
    if (!isAuthLoading && !user) {
      router.push("/login");
    }
  }, [user, isAuthLoading, router]);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;

    setIsSearching(true);
    setHasSearched(true);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const params = new URLSearchParams({ q: query });
      if (docType) params.set("doc_type", docType);

      const res = await fetch(`${API_URL}/api/search?${params}`, {
        headers: {
          Authorization: `Bearer ${session?.access_token}`,
        },
      });

      if (!res.ok) throw new Error(`Search failed: ${res.status}`);

      const data = await res.json();
      setResults(data.results);
    } catch (err) {
      console.error("Search error:", err);
      setResults([]);
    } finally {
      setIsSearching(false);
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
      {/* Header */}
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
                البحث في الأنظمة
              </h1>
              <p className="text-[11px] text-slate-400">
                Regulation Search
              </p>
            </div>
          </div>
          <div className="w-8 h-8 bg-gradient-to-br from-tam-accent to-tam-light rounded-lg flex items-center justify-center">
            <Scale size={16} className="text-white" />
          </div>
        </div>
      </header>

      <div className="max-w-4xl mx-auto p-6">
        {/* Search Form */}
        <form onSubmit={handleSearch} className="mb-8">
          <div className="flex gap-3">
            <div className="flex-1 relative">
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="ابحث في أنظمة هيئة السوق المالية... / Search CMA regulations..."
                dir="auto"
                className="w-full px-4 py-3 pe-10 border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-tam-light focus:ring-1 focus:ring-tam-light bg-white"
              />
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            </div>
            <select
              value={docType}
              onChange={(e) => setDocType(e.target.value)}
              className="px-3 py-3 border border-slate-200 rounded-xl text-sm bg-white focus:outline-none focus:border-tam-light"
              aria-label="Document type filter"
            >
              <option value="">جميع الأنواع</option>
              <option value="regulation">لوائح</option>
              <option value="circular">تعاميم</option>
              <option value="faq">أسئلة متكررة</option>
              <option value="guidance">أدلة</option>
            </select>
            <button
              type="submit"
              disabled={isSearching || !query.trim()}
              className="px-6 py-3 bg-tam-primary text-white rounded-xl text-sm font-medium hover:bg-tam-secondary disabled:opacity-50 transition-colors flex items-center gap-2"
            >
              {isSearching ? (
                <Loader2 size={16} className="animate-spin" />
              ) : (
                <Search size={16} />
              )}
              بحث
            </button>
          </div>
        </form>

        {/* Results */}
        {isSearching && (
          <div className="text-center py-12">
            <Loader2 size={24} className="animate-spin text-tam-light mx-auto mb-3" />
            <p className="text-sm text-slate-500">جاري البحث...</p>
          </div>
        )}

        {!isSearching && hasSearched && results.length === 0 && (
          <div className="text-center py-12">
            <Search size={32} className="text-slate-300 mx-auto mb-3" />
            <p className="text-sm text-slate-500">لم يتم العثور على نتائج</p>
            <p className="text-xs text-slate-400 mt-1">
              No results found. Try a different query.
            </p>
          </div>
        )}

        {!isSearching && results.length > 0 && (
          <div className="space-y-4">
            <p className="text-xs text-slate-500">
              {results.length} نتيجة
            </p>
            {results.map((result) => (
              <div
                key={result.chunk_id}
                className="bg-white border border-slate-200 rounded-xl p-5 hover:shadow-sm transition-shadow"
              >
                <div className="flex items-start gap-3">
                  <FileText size={16} className="text-tam-light mt-0.5 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    {/* Metadata */}
                    <div className="flex flex-wrap gap-2 mb-2">
                      {result.document_title && (
                        <span className="text-[10px] bg-tam-light/10 text-tam-light px-2 py-0.5 rounded-full">
                          {result.document_title}
                        </span>
                      )}
                      {result.article_number && (
                        <span className="text-[10px] bg-tam-gold/10 text-tam-gold px-2 py-0.5 rounded-full">
                          المادة {result.article_number}
                        </span>
                      )}
                      {result.part && (
                        <span className="text-[10px] bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full">
                          {result.part}
                        </span>
                      )}
                      <span className="text-[10px] text-slate-400">
                        {(result.relevance_score * 100).toFixed(0)}% match
                      </span>
                    </div>
                    {/* Content */}
                    <p
                      dir="auto"
                      className="text-sm text-slate-700 leading-7 line-clamp-4"
                    >
                      {result.content}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
