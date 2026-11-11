"use client";

import { useState } from "react";
import { Boxes, Building2, KeySquare, ScrollText, Database } from "lucide-react";
import { DashboardView } from "@/components/gateway/dashboard-view";
import { ProvidersView } from "@/components/gateway/providers-view";
import { ProviderDetail } from "@/components/gateway/provider-detail";
import { GatewayView } from "@/components/gateway/gateway-view";
import { LogsView } from "@/components/gateway/logs-view";

type View = "dashboard" | "providers" | "gateway" | "logs";

const NAV: Array<{ id: View; label: string; icon: typeof Boxes }> = [
  { id: "dashboard", label: "الرئيسية", icon: Boxes },
  { id: "providers", label: "المزودون", icon: Building2 },
  { id: "gateway", label: "الجيت واي", icon: KeySquare },
  { id: "logs", label: "السجلات", icon: ScrollText },
];

export default function Home() {
  const [view, setView] = useState<View>("dashboard");
  const [activeProviderId, setActiveProviderId] = useState<string | null>(null);

  function openProvider(id: string) {
    setActiveProviderId(id);
    setView("providers");
  }

  return (
    <div className="hero-glow flex min-h-screen flex-col bg-background">
      {/* Header */}
      <header className="sticky top-0 z-40 border-b border-stone-200/80 bg-white/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-teal-500 to-teal-700 text-white shadow-lg shadow-teal-500/25">
              <Boxes className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-lg font-extrabold leading-tight">بوابة المزودين</h1>
              <p className="text-xs text-muted-foreground">إدارة مفاتيح API وموديلات الذكاء الاصطناعي مع تدوير تلقائي</p>
            </div>
          </div>
          <nav className="flex items-center gap-1 rounded-full border border-stone-200 bg-stone-100/70 p-1" aria-label="التنقل الرئيسي">
            {NAV.map((item) => {
              const Icon = item.icon;
              const isActive = view === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => {
                    setView(item.id);
                    if (item.id !== "providers") setActiveProviderId(null);
                  }}
                  className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-semibold transition-colors ${
                    isActive
                      ? "bg-teal-600 text-white shadow shadow-teal-500/30"
                      : "text-muted-foreground hover:text-teal-700"
                  }`}
                  aria-current={isActive ? "page" : undefined}
                >
                  <Icon className="h-4 w-4" />
                  <span className="hidden sm:inline">{item.label}</span>
                </button>
              );
            })}
          </nav>
        </div>
      </header>

      {/* Content */}
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6">
        {view === "dashboard" && <DashboardView onOpenProvider={openProvider} />}
        {view === "providers" &&
          (activeProviderId ? (
            <ProviderDetail
              providerId={activeProviderId}
              onBack={() => setActiveProviderId(null)}
            />
          ) : (
            <ProvidersView onOpenProvider={openProvider} />
          ))}
        {view === "gateway" && <GatewayView />}
        {view === "logs" && <LogsView />}
      </main>

      {/* Sticky footer */}
      <footer className="mt-auto border-t border-stone-200 bg-white/70">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2 px-4 py-4 text-xs text-muted-foreground sm:px-6">
          <p className="flex items-center gap-1.5">
            <Database className="h-3.5 w-3.5" />
            البيانات محفوظة على Turso Cloud (libSQL) — الجداول تُنشأ تلقائيًا
          </p>
          <p className="code-inline">OpenAI-Compatible Gateway · /v1/models · /v1/chat/completions</p>
        </div>
      </footer>
    </div>
  );
}
