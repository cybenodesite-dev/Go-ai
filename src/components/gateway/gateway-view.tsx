"use client";

import { useCallback, useEffect, useState } from "react";
import { Plus, Trash2, Link2, ShieldCheck, Terminal, Zap, RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { CopyButton, EmptyState, SectionCard } from "@/components/gateway/shared";
import { api, toastError, formatDateTime, formatNumber, maskKey } from "@/lib/client-utils";
import { useToast } from "@/hooks/use-toast";
import type { GatewayKey } from "@/lib/types";

export function GatewayView() {
  const { toast } = useToast();
  const [keys, setKeys] = useState<GatewayKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<GatewayKey | null>(null);
  const [baseUrl, setBaseUrl] = useState("");

  useEffect(() => {
    setBaseUrl(`${window.location.origin}/v1`);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api<{ keys: GatewayKey[] }>("/api/gateway-keys");
      setKeys(data.keys);
    } catch (e) {
      toastError(e, "فشل تحميل مفاتيح الجيت واي");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function addKey() {
    setSaving(true);
    try {
      const res = await api<{ key_value: string }>("/api/gateway-keys", {
        method: "POST",
        body: JSON.stringify({ name: newName }),
      });
      toast({ title: "تم إنشاء المفتاح", description: "انسخه الآن واستخدمه في تطبيقاتك" });
      setAddOpen(false);
      setNewName("");
      await load();
      await copyKeyIfPossible(res.key_value);
    } catch (e) {
      toastError(e, "تعذر إنشاء المفتاح");
    } finally {
      setSaving(false);
    }
  }

  async function copyKeyIfPossible(key: string) {
    try {
      await navigator.clipboard.writeText(key);
    } catch {
      /* ignore */
    }
  }

  async function toggleKey(k: GatewayKey, enabled: boolean) {
    setKeys((prev) => prev.map((x) => (x.id === k.id ? { ...x, enabled: enabled ? 1 : 0 } : x)));
    try {
      await api(`/api/gateway-keys/${k.id}`, { method: "PATCH", body: JSON.stringify({ enabled }) });
    } catch (e) {
      toastError(e);
      await load();
    }
  }

  async function resetUsage(k: GatewayKey) {
    try {
      await api(`/api/gateway-keys/${k.id}`, { method: "PATCH", body: JSON.stringify({ reset_usage: true }) });
      toast({ title: "تم تصفير العدّاد" });
      await load();
    } catch (e) {
      toastError(e);
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    try {
      await api(`/api/gateway-keys/${deleteTarget.id}`, { method: "DELETE" });
      toast({ title: "تم حذف المفتاح" });
      setDeleteTarget(null);
      await load();
    } catch (e) {
      toastError(e, "تعذر الحذف");
    }
  }

  const firstKey = keys.find((k) => k.enabled === 1)?.key_value ?? keys[0]?.key_value ?? "gw-xxx";

  const curlExample = `curl ${baseUrl || "https://YOUR-DOMAIN/v1"}/chat/completions \\
  -H "Authorization: Bearer ${firstKey}" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "gpt-4o-mini",
    "messages": [{"role": "user", "content": "مرحبا"}],
    "stream": false
  }'`;

  const pythonExample = `from openai import OpenAI

client = OpenAI(
    base_url="${baseUrl || "https://YOUR-DOMAIN/v1"}",
    api_key="${firstKey}",
)

# جلب الموديلات المتاحة فقط (المحددة من المزودين)
models = client.models.list()
print([m.id for m in models.data])

# دردشة — مع تدوير تلقائي للمفاتيح عند الخطأ أو النفاد
resp = client.chat.completions.create(
    model="gpt-4o-mini",
    messages=[{"role": "user", "content": "مرحبا"}],
)
print(resp.choices[0].message.content)`;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-extrabold">الجيت واي الموحد</h2>
          <p className="text-sm text-muted-foreground">رابط بيز واحد ومفتاح واحد للوصول لكل الموديلات المحددة مع تدوير تلقائي</p>
        </div>
        <Button className="gap-2 bg-teal-600 text-white hover:bg-teal-700" onClick={() => setAddOpen(true)}>
          <Plus className="h-4 w-4" /> مفتاح وصول جديد
        </Button>
      </div>

      {/* Connection info */}
      <div className="rounded-xl border border-teal-200 bg-gradient-to-bl from-teal-50/80 via-white to-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-teal-100 text-teal-700">
              <Link2 className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">رابط البيز الموحد (OpenAI-Compatible)</p>
              {baseUrl ? (
                <p className="code-inline mt-0.5 font-bold text-teal-700">{baseUrl}</p>
              ) : (
                <p className="mt-0.5 text-sm text-muted-foreground">جارٍ التحميل…</p>
              )}
            </div>
          </div>
          {baseUrl && <CopyButton value={baseUrl} label="نسخ الرابط" size="sm" />}
        </div>
        <div className="mt-4 grid gap-2 text-sm text-muted-foreground sm:grid-cols-3">
          <div className="flex items-center gap-2 rounded-lg border border-stone-200 bg-stone-50 px-3 py-2">
            <ShieldCheck className="h-4 w-4 shrink-0 text-teal-600" />
            جلب <span className="code-inline">/v1/models</span> يعرض الموديلات المحددة فقط
          </div>
          <div className="flex items-center gap-2 rounded-lg border border-stone-200 bg-stone-50 px-3 py-2">
            <Zap className="h-4 w-4 shrink-0 text-teal-600" />
            عند نفاد مفتاح أو خطأ يتدور تلقائيًا للتالي
          </div>
          <div className="flex items-center gap-2 rounded-lg border border-stone-200 bg-stone-50 px-3 py-2">
            <RotateCw className="h-4 w-4 shrink-0 text-teal-600" />
            يوزع الحمل على أقل المفاتيح استخدامًا
          </div>
        </div>
      </div>

      <SectionCard title={`مفاتيح الوصول للجيت واي (${keys.length})`}>
        {loading ? (
          <Skeleton className="h-24 rounded-lg" />
        ) : keys.length === 0 ? (
          <EmptyState title="لا توجد مفاتيح وصول" hint="أنشئ مفتاحًا و استخدمه كـ api_key مع رابط البيز الموحد" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="text-xs text-muted-foreground">
                  <th className="pb-2 text-start font-semibold">الاسم</th>
                  <th className="pb-2 text-start font-semibold">المفتاح</th>
                  <th className="pb-2 text-start font-semibold">مفعل</th>
                  <th className="pb-2 text-start font-semibold">الاستخدام</th>
                  <th className="pb-2 text-start font-semibold">آخر استخدام</th>
                  <th className="pb-2 text-start font-semibold"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {keys.map((k) => (
                  <tr key={k.id}>
                    <td className="py-2.5 pe-3 font-semibold">{k.name || "مفتاح"}</td>
                    <td className="py-2.5 pe-3">
                      <div className="flex items-center gap-1">
                        <span className="code-inline text-xs text-muted-foreground">{maskKey(k.key_value)}</span>
                        <CopyButton value={k.key_value} />
                      </div>
                    </td>
                    <td className="py-2.5 pe-3">
                      <Switch checked={k.enabled === 1} onCheckedChange={(v) => toggleKey(k, v)} aria-label="تفعيل" />
                    </td>
                    <td className="py-2.5 pe-3 tabular-nums font-bold text-teal-700">{formatNumber(k.usage_count)}</td>
                    <td className="py-2.5 pe-3 text-xs text-muted-foreground">{formatDateTime(k.last_used_at)}</td>
                    <td className="py-2.5">
                      <div className="flex items-center justify-end gap-1">
                        <Button variant="ghost" size="sm" className="h-7 px-2 text-xs text-muted-foreground" onClick={() => resetUsage(k)}>
                          تصفير
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-stone-400 hover:text-red-600"
                          aria-label="حذف"
                          onClick={() => setDeleteTarget(k)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>

      {/* Usage examples */}
      <div className="grid gap-6 lg:grid-cols-2">
        <SectionCard
          title="مثال cURL"
          action={<CopyButton value={curlExample} label="نسخ الكود" size="sm" />}
        >
          <pre className="code-inline max-h-80 overflow-auto rounded-lg border border-stone-200 bg-stone-50 p-4 text-xs leading-relaxed text-stone-800">
            {curlExample}
          </pre>
        </SectionCard>
        <SectionCard
          title="مثال Python (openai SDK)"
          action={<CopyButton value={pythonExample} label="نسخ الكود" size="sm" />}
        >
          <pre className="code-inline max-h-80 overflow-auto rounded-lg border border-stone-200 bg-stone-50 p-4 text-xs leading-relaxed text-stone-800">
            {pythonExample}
          </pre>
        </SectionCard>
      </div>

      {/* Add dialog */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>مفتاح وصول جديد</DialogTitle>
            <DialogDescription>يعمل كـ api_key مع رابط البيز الموحد لكل التطبيقات</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="gk-name">اسم المفتاح</Label>
            <Input id="gk-name" placeholder="مثال: تطبيق الجوال" value={newName} onChange={(e) => setNewName(e.target.value)} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>إلغاء</Button>
            <Button className="bg-teal-600 text-white hover:bg-teal-700" disabled={saving} onClick={addKey}>
              {saving ? "جارٍ الإنشاء…" : "إنشاء"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>حذف المفتاح «{deleteTarget?.name}»؟</AlertDialogTitle>
            <AlertDialogDescription>كل التطبيقات التي تستخدمه سيتوقف وصولها للجيت واي.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>إلغاء</AlertDialogCancel>
            <AlertDialogAction className="bg-red-500 text-white hover:bg-red-400" onClick={confirmDelete}>حذف</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
