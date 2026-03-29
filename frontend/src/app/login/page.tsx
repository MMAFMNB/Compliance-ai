"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Scale, Loader2, Eye, EyeOff } from "lucide-react";
import { useAuth } from "@/lib/AuthContext";

type Mode = "signin" | "signup";

export default function LoginPage() {
  const router = useRouter();
  const { signIn, signUp } = useAuth();

  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [organization, setOrganization] = useState("TAM Capital");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setIsLoading(true);

    try {
      if (mode === "signin") {
        await signIn(email, password);
        router.push("/");
      } else {
        await signUp(email, password, name, organization);
        setIsSuccess(true);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "\u062d\u062f\u062b \u062e\u0637\u0623 \u063a\u064a\u0631 \u0645\u062a\u0648\u0642\u0639");
    } finally {
      setIsLoading(false);
    }
  };

  if (isSuccess) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="w-full max-w-sm bg-white rounded-xl shadow-sm border border-slate-200 p-8 text-center">
          <div className="w-12 h-12 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <Scale size={24} className="text-emerald-600" />
          </div>
          <h2 className="text-lg font-bold text-tam-primary mb-2">
            \u062a\u0645 \u0625\u0646\u0634\u0627\u0621 \u0627\u0644\u062d\u0633\u0627\u0628
          </h2>
          <p className="text-sm text-slate-500 mb-6">
            \u062a\u0645 \u0625\u0631\u0633\u0627\u0644 \u0631\u0627\u0628\u0637 \u0627\u0644\u062a\u0623\u0643\u064a\u062f \u0625\u0644\u0649 \u0628\u0631\u064a\u062f\u0643 \u0627\u0644\u0625\u0644\u0643\u062a\u0631\u0648\u0646\u064a. \u064a\u0631\u062c\u0649 \u062a\u0623\u0643\u064a\u062f \u062d\u0633\u0627\u0628\u0643 \u062b\u0645
            \u062a\u0633\u062c\u064a\u0644 \u0627\u0644\u062f\u062e\u0648\u0644.
          </p>
          <button
            onClick={() => {
              setMode("signin");
              setIsSuccess(false);
            }}
            className="w-full py-2.5 bg-tam-primary text-white rounded-lg text-sm font-medium hover:bg-tam-secondary transition-colors"
          >
            \u062a\u0633\u062c\u064a\u0644 \u0627\u0644\u062f\u062e\u0648\u0644
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="w-14 h-14 bg-gradient-to-br from-tam-accent to-tam-light rounded-2xl flex items-center justify-center mx-auto mb-4">
            <Scale size={28} className="text-white" />
          </div>
          <h1 className="text-xl font-bold text-tam-primary">
            \u062a\u0627\u0645 \u0644\u0644\u0627\u0645\u062a\u062b\u0627\u0644 \u0627\u0644\u062a\u0646\u0638\u064a\u0645\u064a
          </h1>
          <p className="text-xs text-slate-500 mt-1">TAM Compliance AI</p>
        </div>

        {/* Card */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
          {/* Tabs */}
          <div className="flex gap-1 bg-slate-100 rounded-lg p-1 mb-6">
            <button
              onClick={() => setMode("signin")}
              className={`flex-1 py-2 text-sm rounded-md font-medium transition-colors ${
                mode === "signin"
                  ? "bg-white text-tam-primary shadow-sm"
                  : "text-slate-500"
              }`}
            >
              \u062a\u0633\u062c\u064a\u0644 \u0627\u0644\u062f\u062e\u0648\u0644
            </button>
            <button
              onClick={() => setMode("signup")}
              className={`flex-1 py-2 text-sm rounded-md font-medium transition-colors ${
                mode === "signup"
                  ? "bg-white text-tam-primary shadow-sm"
                  : "text-slate-500"
              }`}
            >
              \u062d\u0633\u0627\u0628 \u062c\u062f\u064a\u062f
            </button>
          </div>

          {error && (
            <div className="bg-red-50 text-red-700 text-xs rounded-lg p-3 mb-4">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === "signup" && (
              <>
                <div>
                  <label
                    htmlFor="name"
                    className="block text-xs font-medium text-slate-600 mb-1"
                  >
                    \u0627\u0644\u0627\u0633\u0645
                  </label>
                  <input
                    id="name"
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                    className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-tam-light focus:ring-1 focus:ring-tam-light"
                    placeholder="\u0645\u062d\u0645\u062f \u0623\u062d\u0645\u062f"
                  />
                </div>
                <div>
                  <label
                    htmlFor="organization"
                    className="block text-xs font-medium text-slate-600 mb-1"
                  >
                    \u0627\u0644\u0645\u0646\u0634\u0623\u0629
                  </label>
                  <input
                    id="organization"
                    type="text"
                    value={organization}
                    onChange={(e) => setOrganization(e.target.value)}
                    required
                    className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-tam-light focus:ring-1 focus:ring-tam-light"
                  />
                </div>
              </>
            )}

            <div>
              <label
                htmlFor="email"
                className="block text-xs font-medium text-slate-600 mb-1"
              >
                \u0627\u0644\u0628\u0631\u064a\u062f \u0627\u0644\u0625\u0644\u0643\u062a\u0631\u0648\u0646\u064a
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                dir="ltr"
                className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-tam-light focus:ring-1 focus:ring-tam-light"
                placeholder="you@company.com"
              />
            </div>

            <div>
              <label
                htmlFor="password"
                className="block text-xs font-medium text-slate-600 mb-1"
              >
                \u0643\u0644\u0645\u0629 \u0627\u0644\u0645\u0631\u0648\u0631
              </label>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={6}
                  dir="ltr"
                  className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-tam-light focus:ring-1 focus:ring-tam-light pe-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-2.5 bg-tam-primary text-white rounded-lg text-sm font-medium hover:bg-tam-secondary disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
            >
              {isLoading && <Loader2 size={16} className="animate-spin" />}
              {mode === "signin" ? "\u062a\u0633\u062c\u064a\u0644 \u0627\u0644\u062f\u062e\u0648\u0644" : "\u0625\u0646\u0634\u0627\u0621 \u0627\u0644\u062d\u0633\u0627\u0628"}
            </button>
          </form>
        </div>

        <p className="text-[10px] text-slate-400 text-center mt-6">
          &copy; 2026 \u062a\u0627\u0645 \u0627\u0644\u0645\u0627\u0644\u064a\u0629 | TAM Capital
        </p>
      </div>
    </div>
  );
}
