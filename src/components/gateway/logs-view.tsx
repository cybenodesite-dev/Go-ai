"use client";

import { useCallback, useEffect, useState } from "react";
import { RefreshCcw, TerminalSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { LogStatusBadge, EmptyState } from "@/components/gateway/shared";
import { api, toastError, formatDateTime, formatNumber } from "@/lib/client-utils";
import type { LogRow } from "@/lib/types";

export function LogsView() {
  const [logs, setLogs] = useState<LogRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "success" | "error">("all");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api<{ logs: LogRow[] }>(`/api/logs?limit=150&status=${filter === "all" ? "" : filter}`);
      setLogs(data.logs);
    } catch (e) {
      toastError(e, "فشل تحميل السجلات");
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    load();
    const t = setInterval(load, 10000);
    return () => clearInterval(t);
  }, [load]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-extrabold">السجلات</h2>
          <p className="text-sm text-muted-foreground">كل طلب يمر عبر الجيت واي — بالمزود والمفتاح المستخدم ونتيجة التدوير</p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={filter} onValueChange={(v) => setFilter(v as typeof filter)}>
            <SelectTrigger className="w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">الكل</SelectItem>
              <SelectItem value="success">الناجح فقط</SelectItem>
              <SelectItem value="error">الفاشل فقط</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" className="gap-2 border-stone-200 bg-white shadow-sm hover:bg-stone-50" onClick={load}>
            <RefreshCcw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            تحديث
          </Button>
        </div>
      </div>

      {loading && logs.length === 0 ? (
        <Skeleton className="h-72 rounded-xl" />
      ) : logs.length === 0 ? (
        <EmptyState
          title="لا توجد سجلات بعد"
          hint="أرسل أول طلب عبر رابط الجيت واي وسيظهر هنا مع تفاصيل المزود والمفتاح وزمن الاستجابة"
          icon={<TerminalSquare className="h-8 w-8" />}
        />
      ) : (
        <div className="rounded-xl border border-stone-200 bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] text-sm">
              <thead>
                <tr className="border-b border-stone-200 text-xs text-stone-500">
                  <th className="px-4 py-3 text-start font-semibold">الوقت</th>
                  <th className="px-4 py-3 text-start font-semibold">الموديل</th>
                  <th className="px-4 py-3 text-start font-semibold">المزود</th>
                  <th className="px-4 py-3 text-start font-semibold">المفتاح المستخدم</th>
                  <th className="px-4 py-3 text-start font-semibold">النتيجة</th>
                  <th className="px-4 py-3 text-start font-semibold">التدوير</th>
                  <th className="px-4 py-3 text-start font-semibold">الزمن</th>
                  <th className="px-4 py-3 text-start font-semibold">مفتاح الجيت واي</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {logs.map((l) => (
                  <tr key={l.id} className="hover:bg-stone-50">
                    <td className="whitespace-nowrap px-4 py-2.5 text-xs text-muted-foreground">{formatDateTime(l.created_at)}</td>
                    <td className="px-4 py-2.5">
                      <span className="code-inline text-xs font-semibold">{l.model}</span>
                      {l.stream === 1 && (
                        <Badge variant="outline" className="ms-2 border-stone-200 bg-stone-50 text-[10px] text-stone-600">
                          بث
                        </Badge>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-xs">{l.provider_name || "—"}</td>
                    <td className="px-4 py-2.5 text-xs">{l.api_key_label || "—"}</td>
                    <td className="px-4 py-2.5">
                      <LogStatusBadge status={l.status} />
                    </td>
                    <td className="px-4 py-2.5">
                      {l.attempts > 1 ? (
                        <Badge variant="outline" className="border-amber-200 bg-amber-50 text-xs text-amber-700">
                          ×{l.attempts} مفاتيح
                        </Badge>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-xs tabular-nums text-muted-foreground">
                      {l.latency_ms !== null ? `${formatNumber(l.latency_ms)} ms` : "—"}
                    </td>
                    <td className="px-4 py-2.5 text-xs text-muted-foreground">{l.gateway_key_name || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
