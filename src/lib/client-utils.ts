"use client";

import { toast } from "@/hooks/use-toast";

/** Fetch wrapper: throws readable Arabic errors, returns parsed JSON. */
export async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = (data as { error?: string })?.error ?? `فشل الطلب (${res.status})`;
    throw new Error(msg);
  }
  return data as T;
}

export function toastError(e: unknown, title = "حدث خطأ") {
  toast({
    title,
    description: e instanceof Error ? e.message : String(e),
    variant: "destructive",
  });
}

export function maskKey(key: string): string {
  if (key.length <= 16) return key.slice(0, 4) + "••••" + key.slice(-4);
  return key.slice(0, 10) + "••••••••" + key.slice(-6);
}

const dtf = new Intl.DateTimeFormat("ar-EG-u-nu-latn", {
  dateStyle: "short",
  timeStyle: "medium",
  numberingSystem: "latn",
});

export function formatDateTime(s?: string | null): string {
  if (!s) return "—";
  const d = new Date(s.includes("T") ? s : s.replace(" ", "T") + "Z");
  if (isNaN(d.getTime())) return s;
  return dtf.format(d);
}

export function formatNumber(n: number): string {
  return n.toLocaleString("en-US");
}

export async function copyText(text: string, label = "تم النسخ") {
  try {
    await navigator.clipboard.writeText(text);
    toast({ title: label, description: text.length > 60 ? text.slice(0, 60) + "…" : text });
  } catch {
    toast({ title: "تعذر النسخ", variant: "destructive" });
  }
}

export const KEY_STATUS: Record<string, { label: string; dot: string; text: string; wrap: string }> = {
  active: { label: "نشط", dot: "bg-emerald-500", text: "text-emerald-700", wrap: "border-emerald-200 bg-emerald-50" },
  exhausted: { label: "منتهي", dot: "bg-amber-500", text: "text-amber-700", wrap: "border-amber-200 bg-amber-50" },
  disabled: { label: "معطل", dot: "bg-red-500", text: "text-red-700", wrap: "border-red-200 bg-red-50" },
};
