"use client";

import { useCallback, useEffect, useState } from "react";
import { KeyRound, Layers, Activity, Boxes, RefreshCcw, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import {
  StatCard,
  LogStatusBadge,
  KeyStatusBadge,
  SectionCard,
  EmptyState,
} from "@/components/gateway/shared";
import { api, formatDateTime, formatNumber } from "@/lib/client-utils";
import type { LogRow, Stats, KeyUsageRow, ModelRow } from "@/lib/types";

export function DashboardView({ onOpenProvider }: { onOpenProvider: (id: string) => void }) {
  const [stats, setStats] = useState<Stats | null>(null);
  const [keyUsage, setKeyUsage] = useState<KeyUsageRow[]>([]);
  const [logs, setLogs] = useState<LogRow[]>([]);
  const [models, setModels] = useState<ModelRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [s, l, m] = await Promise.all([
        api<{ stats: Stats; key_usage: KeyUsageRow[] }>("/api/stats"),
        api<{ logs: LogRow[] }>("/api/logs?limit=10"),
        api<{ models: ModelRow[] }>("/api/models"),
      ]);
      setStats(s.stats);
      setKeyUsage(s.key_usage);
      setLogs(l.logs);
      setModels(m.models);
    } catch {
      /* toast handled by caller-level state */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 15000);
    return () => clearInterval(t);
  }, [load]);

  const maxUsage = Math.max(1, ...keyUsage.map((k) => k.usage_count));
  const successRate = stats && stats.total_requests > 0 ? Math.round((stats.success_requests / stats.total_requests) * 100) : null;

  if (loading && !stats) {
    return (
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="h-28 rounded-xl" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-extrabold">الرئيسية</h2>
          <p className="text-sm text-muted-foreground">نظرة عامة على السجلات والموديلات المسجلة والمفاتيح</p>
        </div>
        <Button variant="outline" size="sm" className="gap-2 border-stone-200 bg-white shadow-sm hover:bg-stone-50" onClick={load}>
          <RefreshCcw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          تحديث
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          icon={<Boxes className="h-5 w-5" />}
          title="المزودون"
          value={formatNumber(stats?.providers ?? 0)}
          sub={`${stats?.enabled_providers ?? 0} مفعل من إجمالي ${stats?.providers ?? 0}`}
          accent="text-teal-700"
        />
        <StatCard
          icon={<KeyRound className="h-5 w-5" />}
          title="مفاتيح API"
          value={formatNumber(stats?.active_keys ?? 0)}
          sub={`نشط من ${stats?.total_keys ?? 0} — منتهي ${stats?.exhausted_keys ?? 0} / معطل ${stats?.disabled_keys ?? 0}`}
          accent="text-teal-700"
        />
        <StatCard
          icon={<Layers className="h-5 w-5" />}
          title="الموديلات المتاحة"
          value={formatNumber(stats?.selected_models ?? 0)}
          sub={`محدد من إجمالي ${stats?.total_models ?? 0} موديل مسجل`}
          accent="text-teal-700"
        />
        <StatCard
          icon={<Activity className="h-5 w-5" />}
          title="الطلبات"
          value={formatNumber(stats?.total_requests ?? 0)}
          sub={
            successRate !== null
              ? `نسبة النجاح ${successRate}% — آخر 24 ساعة: ${stats?.requests_24h ?? 0}`
              : `آخر 24 ساعة: ${stats?.requests_24h ?? 0}`
          }
          accent="text-teal-700"
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <SectionCard
          title="استخدام المفاتيح"
          action={<Badge variant="outline" className="border-stone-200 bg-stone-50 text-stone-600">إجمالي الاستخدام: {formatNumber(stats?.total_key_usage ?? 0)}</Badge>}
        >
          {keyUsage.length === 0 ? (
            <EmptyState title="لا توجد مفاتيح بعد" hint="أضف مزودًا ثم أضف مفاتيح API داخل صفحته" />
          ) : (
            <div className="max-h-96 space-y-3 overflow-y-auto pl-1">
              {keyUsage.map((k) => (
                <div key={k.id} className="space-y-1.5">
                  <div className="flex items-center justify-between gap-2 text-sm">
                    <button
                      className="flex min-w-0 items-center gap-2 text-start hover:text-teal-700"
                      onClick={() => onOpenProvider(k.provider_id)}
                      title="فتح صفحة المزود"
                    >
                      <span className="truncate font-semibold">{k.label || "مفتاح"}</span>
                      <span className="shrink-0 rounded-md bg-stone-100 px-1.5 py-0.5 text-xs text-stone-500">{k.provider_name}</span>
                    </button>
                    <div className="flex shrink-0 items-center gap-2">
                      <KeyStatusBadge status={k.status} />
                      <span className="tabular-nums font-bold text-teal-700">{formatNumber(k.usage_count)}</span>
                    </div>
                  </div>
                  <Progress value={(k.usage_count / maxUsage) * 100} className="h-1.5" />
                </div>
              ))}
            </div>
          )}
        </SectionCard>

        <SectionCard
          title="آخر السجلات"
          action={
            <div className="flex items-center gap-2">
              {(stats?.failover_saves ?? 0) > 0 && (
                <Badge variant="outline" className="gap-1 border-amber-200 bg-amber-50 text-amber-700">
                  <Zap className="h-3 w-3" />
                  أنقذها التدوير {stats?.failover_saves} مرة
                </Badge>
              )}
            </div>
          }
        >
          {logs.length === 0 ? (
            <EmptyState title="لا توجد طلبات بعد" hint="اربط تطبيقك برابط الجيت واي وستظهر الطلبات هنا فورًا" />
          ) : (
            <div className="max-h-96 space-y-2 overflow-y-auto pl-1">
              {logs.map((l) => (
                <div key={l.id} className="rounded-lg border border-stone-100 bg-stone-50/60 px-3 py-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-2">
                      <LogStatusBadge status={l.status} />
                      <span className="code-inline truncate text-sm font-semibold">{l.model}</span>
                    </div>
                    <span className="shrink-0 text-xs text-muted-foreground">{formatDateTime(l.created_at)}</span>
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                    <span>{l.provider_name || "—"}</span>
                    {l.attempts > 1 && (
                      <span className="text-amber-600">تدوير ×{l.attempts}</span>
                    )}
                    {l.latency_ms !== null && <span>{formatNumber(l.latency_ms)} مللي ثانية</span>}
                    {l.stream === 1 && <span>بث</span>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </SectionCard>
      </div>

      <SectionCard
        title="الموديلات المسجلة"
        action={<Badge variant="outline" className="border-stone-200 bg-stone-50 text-stone-600">المتاح: {formatNumber(stats?.selected_models ?? 0)} / {formatNumber(stats?.total_models ?? 0)}</Badge>}
      >
        {models.length === 0 ? (
          <EmptyState title="لم يتم تسجيل موديلات بعد" hint="افتح صفحة أي مزود واضغط «جلب الموديلات» لتسجيلها" />
        ) : (
          <div className="max-h-96 space-y-4 overflow-y-auto pl-1">
            {Object.entries(
              models.reduce<Record<string, ModelRow[]>>((acc, m) => {
                const key = m.provider_name ?? "—";
                (acc[key] ??= []).push(m);
                return acc;
              }, {})
            ).map(([providerName, rows]) => (
              <div key={providerName} className="space-y-2">
                <p className="text-sm font-bold text-teal-700">{providerName}</p>
                <div className="flex flex-wrap gap-1.5">
                  {rows.map((m) => (
                    <Badge
                      key={m.id}
                      variant="outline"
                      className={`code-inline border font-medium ${
                        m.selected === 1
                          ? "border-teal-200 bg-teal-50 text-teal-800"
                          : "border-stone-200 bg-stone-50 text-stone-500"
                      }`}
                    >
                      {m.model_id}
                    </Badge>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </SectionCard>
    </div>
  );
}
