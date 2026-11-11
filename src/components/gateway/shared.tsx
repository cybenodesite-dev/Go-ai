"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Copy, Inbox } from "lucide-react";
import { copyText, KEY_STATUS } from "@/lib/client-utils";
import type { ReactNode } from "react";

export function KeyStatusBadge({ status }: { status: string }) {
  const s = KEY_STATUS[status] ?? { label: status, dot: "bg-stone-400", text: "text-stone-600", wrap: "border-stone-200 bg-stone-50" };
  return (
    <Badge variant="outline" className={`gap-1.5 font-semibold ${s.wrap}`}>
      <span className={`inline-block h-2 w-2 rounded-full ${s.dot}`} />
      <span className={s.text}>{s.label}</span>
    </Badge>
  );
}

export function LogStatusBadge({ status }: { status: string }) {
  const ok = status === "success";
  return (
    <Badge
      variant="outline"
      className={`gap-1.5 font-semibold ${
        ok ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-red-200 bg-red-50 text-red-700"
      }`}
    >
      <span className={`inline-block h-2 w-2 rounded-full ${ok ? "bg-emerald-500" : "bg-red-500"}`} />
      {ok ? "ناجح" : "فشل"}
    </Badge>
  );
}

export function StatCard({
  icon,
  title,
  value,
  sub,
  accent = "text-teal-700",
}: {
  icon: ReactNode;
  title: string;
  value: string;
  sub?: string;
  accent?: string;
}) {
  return (
    <div className="rounded-xl border border-stone-200 bg-white p-5 shadow-sm transition-all hover:border-teal-300 hover:shadow-md">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm text-muted-foreground">{title}</p>
          <p className={`mt-1 text-3xl font-extrabold tabular-nums ${accent}`}>{value}</p>
          {sub ? <p className="mt-1 truncate text-xs text-muted-foreground">{sub}</p> : null}
        </div>
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-teal-50 text-teal-600">
          {icon}
        </div>
      </div>
    </div>
  );
}

export function CopyButton({ value, label = "نسخ", size = "icon" }: { value: string; label?: string; size?: "icon" | "sm" }) {
  if (size === "sm") {
    return (
      <Button variant="outline" size="sm" className="h-8 gap-1.5 border-stone-200 bg-white shadow-sm hover:bg-stone-50" onClick={() => copyText(value)}>
        <Copy className="h-3.5 w-3.5" />
        {label}
      </Button>
    );
  }
  return (
    <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-foreground" aria-label="نسخ" onClick={() => copyText(value)}>
      <Copy className="h-3.5 w-3.5" />
    </Button>
  );
}

export function EmptyState({ title, hint, icon }: { title: string; hint?: string; icon?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-stone-300 bg-white/50 py-10 text-center">
      <div className="text-muted-foreground">{icon ?? <Inbox className="h-8 w-8" />}</div>
      <p className="font-semibold">{title}</p>
      {hint ? <p className="max-w-sm text-sm text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

export function SectionCard({ title, action, children, className = "" }: { title: string; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-xl border border-stone-200 bg-white shadow-sm ${className}`}>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-stone-100 px-5 py-3.5">
        <h3 className="font-bold">{title}</h3>
        {action}
      </div>
      <div className="p-5">{children}</div>
    </div>
  );
}
