"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Plus,
  Globe,
  KeyRound,
  Layers,
  ChevronLeft,
  Trash2,
  Power,
  Pencil,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { EmptyState } from "@/components/gateway/shared";
import { api, toastError, formatNumber } from "@/lib/client-utils";
import { useToast } from "@/hooks/use-toast";
import type { Provider } from "@/lib/types";

export function ProvidersView({ onOpenProvider }: { onOpenProvider: (id: string) => void }) {
  const { toast } = useToast();
  const [providers, setProviders] = useState<Provider[]>([]);
  const [loading, setLoading] = useState(true);

  const [addOpen, setAddOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Provider | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Provider | null>(null);
  const [form, setForm] = useState({ name: "", base_url: "" });
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api<{ providers: Provider[] }>("/api/providers");
      setProviders(data.providers);
    } catch (e) {
      toastError(e, "فشل تحميل المزودين");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function addProvider() {
    setSaving(true);
    try {
      const created = await api<{ id: string }>("/api/providers", {
        method: "POST",
        body: JSON.stringify(form),
      });
      toast({ title: "تم إنشاء المزود", description: "افتح صفحته لأضف المفاتيح وتجلب الموديلات" });
      setAddOpen(false);
      setForm({ name: "", base_url: "" });
      onOpenProvider(created.id);
    } catch (e) {
      toastError(e, "تعذر إنشاء المزود");
    } finally {
      setSaving(false);
    }
  }

  async function saveEdit() {
    if (!editTarget) return;
    setSaving(true);
    try {
      await api(`/api/providers/${editTarget.id}`, {
        method: "PATCH",
        body: JSON.stringify({ name: editTarget.name, base_url: editTarget.base_url }),
      });
      toast({ title: "تم حفظ التعديلات" });
      setEditTarget(null);
      await load();
    } catch (e) {
      toastError(e, "تعذر الحفظ");
    } finally {
      setSaving(false);
    }
  }

  async function toggleEnabled(p: Provider, enabled: boolean) {
    setProviders((prev) => prev.map((x) => (x.id === p.id ? { ...x, enabled: enabled ? 1 : 0 } : x)));
    try {
      await api(`/api/providers/${p.id}`, { method: "PATCH", body: JSON.stringify({ enabled }) });
      toast({
        title: enabled ? "تم تفعيل المزود" : "تم تعطيل المزود",
        description: enabled ? undefined : "لن يستخدمه الجيت واي في التدوير حتى يُعاد تفعيله",
      });
    } catch (e) {
      toastError(e);
      await load();
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    setSaving(true);
    try {
      await api(`/api/providers/${deleteTarget.id}`, { method: "DELETE" });
      toast({ title: "تم حذف المزود", description: "مع كل مفاتيحه وموديلاته" });
      setDeleteTarget(null);
      await load();
    } catch (e) {
      toastError(e, "تعذر الحذف");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-extrabold">المزودون</h2>
          <p className="text-sm text-muted-foreground">أضف مزودًا بالاسم ورابط البيز، ثم افتح صفحته للمفاتيح والموديلات</p>
        </div>
        <Button className="gap-2 bg-teal-600 text-white hover:bg-teal-700" onClick={() => setAddOpen(true)}>
          <Plus className="h-4 w-4" />
          إضافة مزود
        </Button>
      </div>

      {loading ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-44 rounded-xl" />
          ))}
        </div>
      ) : providers.length === 0 ? (
        <EmptyState
          title="لا يوجد مزودون بعد"
          hint="ابدأ بإضافة مزود مثل OpenAI أو OpenRouter — اكتب الاسم ورابط البيز (مثل https://api.openai.com/v1)"
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {providers.map((p) => (
            <div
              key={p.id}
              role="button"
              tabIndex={0}
              className="group cursor-pointer rounded-xl border border-stone-200 bg-white p-5 text-start shadow-sm transition-all hover:border-teal-300 hover:shadow-md focus-visible:outline-2 focus-visible:outline-teal-600"
              onClick={() => onOpenProvider(p.id)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onOpenProvider(p.id);
                }
              }}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 items-center gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-teal-50 font-extrabold text-lg text-teal-700">
                    {p.name.slice(0, 2)}
                  </div>
                  <div className="min-w-0">
                    <p className="truncate font-bold group-hover:text-teal-700">{p.name}</p>
                    <p className="code-inline truncate text-xs text-muted-foreground">{p.base_url}</p>
                  </div>
                </div>
                <ChevronLeft className="h-4 w-4 shrink-0 text-stone-400 transition-transform group-hover:-translate-x-0.5 group-hover:text-teal-700" />
              </div>

              <div className="mt-4 flex flex-wrap gap-1.5">
                <Badge variant="outline" className="gap-1 border-stone-200 bg-stone-50 text-xs text-stone-600">
                  <KeyRound className="h-3 w-3" /> {p.active_keys}/{p.keys_count} مفاتيح نشطة
                </Badge>
                <Badge variant="outline" className="gap-1 border-stone-200 bg-stone-50 text-xs text-stone-600">
                  <Layers className="h-3 w-3" /> {p.selected_models}/{p.models_count} موديلات متاحة
                </Badge>
                <Badge variant="outline" className="border-teal-200 bg-teal-50 text-xs text-teal-700">
                  {formatNumber(p.total_usage)} استخدام
                </Badge>
              </div>

              <div className="mt-4 flex items-center justify-between border-t border-stone-100 pt-3" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center gap-2">
                  <Switch checked={p.enabled === 1} onCheckedChange={(v) => toggleEnabled(p, v)} aria-label="تفعيل المزود" />
                  <span className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Power className="h-3 w-3" />
                    {p.enabled === 1 ? "مفعل" : "معطل"}
                  </span>
                </div>
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-stone-400 hover:text-stone-700"
                    aria-label="تعديل"
                    onClick={() => {
                      setEditTarget(p);
                      setForm({ name: p.name, base_url: p.base_url });
                    }}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-stone-400 hover:text-red-600"
                    aria-label="حذف"
                    onClick={() => setDeleteTarget(p)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add dialog */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>إضافة مزود جديد</DialogTitle>
            <DialogDescription>بعد الإنشاء تفتح صفحة المزود لتضيف مفاتيح API وتجلب الموديلات</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="p-name">اسم المزود</Label>
              <Input
                id="p-name"
                placeholder="مثال: OpenRouter"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="p-base">رابط البيز (Base URL)</Label>
              <Input
                id="p-base"
                dir="ltr"
                className="code-inline text-left"
                placeholder="https://openrouter.ai/api/v1"
                value={form.base_url}
                onChange={(e) => setForm((f) => ({ ...f, base_url: e.target.value }))}
              />
              <p className="text-xs text-muted-foreground">يُكمل /v1 تلقائيًا لو مش موجودة</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>إلغاء</Button>
            <Button
              className="bg-teal-600 text-white hover:bg-teal-700"
              disabled={saving || !form.name.trim() || !form.base_url.trim()}
              onClick={addProvider}
            >
              {saving ? "جارٍ الإنشاء…" : "إنشاء وفتح الصفحة"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit dialog */}
      <Dialog open={!!editTarget} onOpenChange={(o) => !o && setEditTarget(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>تعديل المزود</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="e-name">اسم المزود</Label>
              <Input
                id="e-name"
                value={editTarget?.name ?? ""}
                onChange={(e) => setEditTarget((t) => (t ? { ...t, name: e.target.value } : t))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="e-base">رابط البيز</Label>
              <Input
                id="e-base"
                dir="ltr"
                className="code-inline text-left"
                value={editTarget?.base_url ?? ""}
                onChange={(e) => setEditTarget((t) => (t ? { ...t, base_url: e.target.value } : t))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditTarget(null)}>إلغاء</Button>
            <Button className="bg-teal-600 text-white hover:bg-teal-700" disabled={saving} onClick={saveEdit}>
              {saving ? "جارٍ الحفظ…" : "حفظ"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>حذف المزود «{deleteTarget?.name}»؟</AlertDialogTitle>
            <AlertDialogDescription>
              سيتم حذف {deleteTarget?.keys_count} مفتاح و{deleteTarget?.models_count} موديل مسجل الخاصين به. لا يمكن التراجع.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>إلغاء</AlertDialogCancel>
            <AlertDialogAction className="bg-red-600 text-white hover:bg-red-500" onClick={confirmDelete}>
              حذف نهائي
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
