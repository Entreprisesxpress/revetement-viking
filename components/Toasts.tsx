"use client";

import { createContext, useContext, useState, useCallback, type ReactNode } from "react";

type ToastType = "success" | "error" | "info" | "warning";
interface Toast { id: number; type: ToastType; msg: string; }

const Ctx = createContext<{ toast: (msg: string, type?: ToastType) => void } | null>(null);

export function ToastsProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const toast = useCallback((msg: string, type: ToastType = "info") => {
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev, { id, msg, type }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), type === "error" ? 6000 : 3500);
  }, []);

  return (
    <Ctx.Provider value={{ toast }}>
      {children}
      <div className="fixed top-20 right-4 z-50 space-y-2 max-w-sm pointer-events-none">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`px-4 py-3 rounded-lg shadow-lg border-l-4 text-sm font-medium pointer-events-auto animate-in slide-in-from-right ${
              t.type === "success" ? "bg-emerald-50 border-emerald-500 text-emerald-900" :
              t.type === "error" ? "bg-red-50 border-red-500 text-red-900" :
              t.type === "warning" ? "bg-amber-50 border-amber-500 text-amber-900" :
              "bg-blue-50 border-blue-500 text-blue-900"
            }`}
          >
            <div className="flex items-start gap-2">
              <span className="text-lg leading-none">
                {t.type === "success" ? "✅" : t.type === "error" ? "❌" : t.type === "warning" ? "⚠️" : "ℹ️"}
              </span>
              <span className="flex-1 whitespace-pre-wrap">{t.msg}</span>
            </div>
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}

export function useToast() {
  const ctx = useContext(Ctx);
  if (!ctx) {
    // Fallback : retombe sur alert si pas dans le provider
    return { toast: (msg: string) => alert(msg) };
  }
  return ctx;
}
