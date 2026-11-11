"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  CloudDownload,
  Plus,
  Trash2,
  RotateCcw,
  KeyRound,
  Search,
  RefreshCcw,
  CheckCheck,
  XCircle,
  Globe,
  Layers,
  PlugZap,
  AlertTriangle,
  CheckCircle2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { KeyStatusBadge, CopyButton, EmptyState, SectionCard } from "@/components/gateway/shared";
import { api, toastError, maskKey, formatDateTime, formatNumber, copyText } from "@/lib/client-utils";
import { useToast } from "@/hooks/use-toast";
import type { ApiKey, ModelRow, ProviderTestResponse } from "@/lib/types";

type ProviderData = {
  id: string;
  name: string;
  base_url: string;
  enabled: number;
  auto_version: number;
  created_at: string;
};

type Detail = { provider: ProviderData; keys: ApiKey[]; models: ModelRow[] };

export function ProviderDetail({ providerId, onBack }: { providerId: string; onBack: () => void }) {
  const { toast } = useToast();
  const [detail, setDetail] = useState<Detail | null>(null);
  const [loading, setLoading] = useState(true);

  // keys form
  const [keyOpen, setKeyOpen] = useState(false);
  const [keyForm, setKeyForm] = useState({ label: "", key_value: "" });
  const [savingKey, setSavingKey] = useState(false);

  // models
  const [fetching, setFetching] = useState(false);
  const [search, setSearch] = useState("");
  const [modelFilter, setModelFilter] = useState<"all" | "selected" | "unselected">("all");
  const [manualModel, setManualModel] = useState("");
  const [deleteKeyTarget, setDeleteKeyTarget] = useState<ApiKey | null>(null);
  const [deleteModelTarget, setDeleteModelTarget] = useState<ModelRow | null>(null);

  // connection test
  const [testing, setTesting] = useState(false);
  const [testOpen, setTestOpen] = useState(false);
  const [testResult, setTestResult] = useState<ProviderTestResponse | null>(null);
  const [togglingAutoV, setTogglingAutoV] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api<Detail>(`/api/providers/${providerId}`);
      setDetail(data);
    } catch (e) {
      toastError(e, "فشل تحميل صفحة المزود");
    } finally {
      setLoading(false);
    }
  }, [providerId]);

  useEffect(() => {
    load();
  }, [load]);

  const p = detail?.provider;

  const filteredModels = useMemo(() => {
    const models = detail?.models ?? [];
    return models
      .filter((m) => (modelFilter === "selected" ? m.selected === 1 : modelFilter === "unselected" ? m.selected === 0 : true))
      .filter((m) => (search ? m.model_id.toLowerCase().includes(search.toLowerCase()) : true));
  }, [detail, modelFilter, search]);

  const activeKeys = detail?.keys.filter((k) => k.status === "active").length ?? 0;
  const selectedCount = detail?.models.filter((m) => m.selected === 1).length ?? 0;
  const maxUsage = Math.max(1, ...(detail?.keys.map((k) => k.usage_count) ?? [1]));
  const autoVersion = (p?.auto_version ?? 1) === 1;
  const modelsUrlPreview = useMemo(() => {
    if (!p) return "";
    const b = p.base_url.trim().replace(/\/+$/, "");
    const hasVersion = /(\/v\d+(beta|preview)?)(\/)?$/i.test(b);
    return `${b}${!hasVersion && autoVersion ? "/v1" : ""}/models`;
  }, [p, autoVersion]);

  async function toggleAutoVersion(on: boolean) {
    if (!p || togglingAutoV) return;
    setTogglingAutoV(true);
    setDetail((d) => (d ? { ...d, provider: { ...d.provider, auto_version: on ? 1 : 0 } } : d));
    try {
      await api(`/api/providers/${p.id}`, { method: "PATCH", body: JSON.stringify({ auto_version: on }) });
      toast({
        title: on ? "سيتم إضافة /v1 تلقائيًا للمسار" : "لن يتم إضافة /v1 — مناسب للبروكسيات التي تضيفه بنفسها",
      });
    } catch (e) {
      toastError(e);
      await load();
    } finally {
      setTogglingAutoV(false);
    }
  }

  async function runTest() {
    if (!p || testing) return;
    setTesting(true);
    setTestResult(null);
    setTestOpen(true);
    try {
      const res = await api<ProviderTestResponse>(`/api/providers/${p.id}/test`, { method: "POST" });
      setTestResult(res);
      await load();
    } catch (e) {
      toastError(e, "فشل اختبار الاتصال");
      setTestOpen(false);
    } finally {
      setTesting(false);
    }
  }

  async function addKeys() {
    if (!p) return;
    setSavingKey(true);
    try {
      const res = await api<{ added: number }>(`/api/providers/${p.id}/keys`, {
        method: "POST",
        body: JSON.stringify(keyForm),
      });
      toast({ title: "تم إضافة المفاتيح", description: `${res.added} مفتاح جاهز للاستخدام والتدوير` });
      setKeyOpen(false);
      setKeyForm({ label: "", key_value: "" });
      await load();
    } catch (e) {
      toastError(e, "تعذر إضافة المفاتيح");
    } finally {
      setSavingKey(false);
    }
  }

  async function fetchModels() {
    if (!p) return;
    setFetching(true);
    try {
      const res = await api<{ fetched: number; added: number }>(`/api/providers/${p.id}/fetch-models`, {
        method: "POST",
      });
      toast({
        title: `تم جلب ${res.fetched} موديل`,
        description: res.added > 0 ? `${res.added} موديل جديد — حدد الموديلات المتاحة من القائمة` : "بدون موديلات جديدة",
      });
      await load();
    } catch (e) {
      toastError(e, "فشل جلب الموديلات");
    } finally {
      setFetching(false);
    }
  }

  async function toggleModel(m: ModelRow, selected: boolean) {
    setDetail((d) =>
      d ? { ...d, models: d.models.map((x) => (x.id === m.id ? { ...x, selected: selected ? 1 : 0 } : x)) } : d
    );
    try {
      await api(`/api/models/${m.id}`, { method: "PATCH", body: JSON.stringify({ selected }) });
    } catch (e) {
      toastError(e);
      await load();
    }
  }

  async function bulkSelect(selected: boolean) {
    const ids = detail?.models.map((m) => m.id) ?? [];
    if (!ids.length) return;
    try {
      await api("/api/models/bulk", { method: "PATCH", body: JSON.stringify({ ids, selected }) });
      toast({ title: selected ? "تم تحديد كل الموديلات" : "تم إلغاء تحديد الكل" });
      await load();
    } catch (e) {
      toastError(e);
    }
  }

  async function addManualModel() {
    if (!p || !manualModel.trim()) return;
    try {
      await api("/api/models", {
        method: "POST",
        body: JSON.stringify({ provider_id: p.id, model_id: manualModel.trim() }),
      });
      toast({ title: "تم تسجيل الموديل وتحديده كم متاح" });
      setManualModel("");
      await load();
    } catch (e) {
      toastError(e, "تعذر إضافة الموديل");
    }
  }

  async function setKeyStatus(k: ApiKey, status: string) {
    setDetail((d) => (d ? { ...d, keys: d.keys.map((x) => (x.id === k.id ? { ...x, status } : x)) } : d));
    try {
      await api(`/api/keys/${k.id}`, { method: "PATCH", body: JSON.stringify({ status }) });
      toast({ title: status === "active" ? "تم تفعيل المفتاح" : status === "disabled" ? "تم تعطيل المفتاح" : "تم وسم المفتاح كمنتهي" });
    } catch (e) {
      toastError(e);
      await load();
    }
  }

  async function resetKeyUsage(k: ApiKey) {
    try {
      await api(`/api/keys/${k.id}`, { method: "PATCH", body: JSON.stringify({ reset_usage: true }) });
      toast({ title: "تم تصفير عدّاد الاستخدام", description: "وأعيد المفتاح للنشط" });
      await load();
    } catch (e) {
      toastError(e);
    }
  }

  async function confirmDeleteKey() {
    if (!deleteKeyTarget) return;
    try {
      await api(`/api/keys/${deleteKeyTarget.id}`, { method: "DELETE" });
      toast({ title: "تم حذف المفتاح" });
      setDeleteKeyTarget(null);
      await load();
    } catch (e) {
      toastError(e, "تعذر الحذف");
    }
  }

  async function confirmDeleteModel() {
    if (!deleteModelTarget) return;
    try {
      await api(`/api/models/${deleteModelTarget.id}`, { method: "DELETE" });
      toast({ title: "تم حذف الموديل" });
      setDeleteModelTarget(null);
      await load();
    } catch (e) {
      toastError(e, "تعذر الحذف");
    }
  }

  if (loading && !detail) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-28 rounded-xl" />
        <Skeleton className="h-96 rounded-xl" />
      </div>
    );
  }

  if (!p) return <EmptyState title="المزود غير موجود" />;

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <Button variant="outline" size="icon" className="h-9 w-9 border-stone-200 bg-white shadow-sm hover:bg-stone-50" onClick={onBack} aria-label="رجوع">
            <ArrowRight className="h-4 w-4" />
          </Button>
          <div>
            <h2 className="text-xl font-extrabold leading-tight">{p.name}</h2>
            <div className="mt-0.5 flex items-center gap-2">
              <Globe className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="code-inline text-xs text-muted-foreground">{p.base_url}</span>
              <CopyButton value={p.base_url} />
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <Switch
                id="auto-version"
                checked={autoVersion}
                disabled={togglingAutoV}
                onCheckedChange={(v) => toggleAutoVersion(v)}
              />
              <Label htmlFor="auto-version" className="cursor-pointer text-xs text-muted-foreground">
                إضافة <span className="code-inline">/v1</span> تلقائيًا لمسار المزود
              </Label>
              <span className="code-inline rounded bg-stone-100 px-1.5 py-0.5 text-[11px] text-stone-500" dir="ltr">
                {modelsUrlPreview}
              </span>
            </div>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            className="gap-1.5 border-stone-200 bg-white shadow-sm hover:bg-stone-50"
            disabled={testing || detail.keys.length === 0}
            onClick={runTest}
            title={detail.keys.length === 0 ? "أضف مفتاحًا أولًا" : "يختبر كل مفتاح مع المزود فعليًا ويعيد تفعيل السليم منها"}
          >
            <PlugZap className={`h-4 w-4 ${testing ? "animate-pulse text-amber-500" : ""}`} />
            {testing ? "جارٍ الاختبار…" : "تجربة الاتصال"}
          </Button>
          <Badge variant="outline" className="border-stone-200 bg-stone-50 text-stone-600">
            {activeKeys} مفتاح نشط
          </Badge>
          <Badge variant="outline" className="border-teal-200 bg-teal-50 text-teal-700">
            {selectedCount} موديل متاح
          </Badge>
          <Badge
            variant="outline"
            className={
              p.enabled === 1
                ? "border-stone-200 bg-stone-50 text-stone-600"
                : "border-amber-200 bg-amber-50 text-amber-700"
            }
          >
            {p.enabled === 1 ? "مفعل" : "معطل — لن يستخدم في التدوير"}
          </Badge>
        </div>
      </div>

      {/* API Keys */}
      <SectionCard
        title={`مفاتيح API (${detail.keys.length})`}
        action={
          <Button size="sm" className="gap-1.5 bg-teal-600 text-white hover:bg-teal-700" onClick={() => setKeyOpen(true)}>
            <Plus className="h-4 w-4" /> إضافة مفتاح
          </Button>
        }
      >
        {detail.keys.length === 0 ? (
          <EmptyState
            title="لا توجد مفاتيح"
            hint="أضف مفتاح API الخاص بالمزود — يمكنك لصق عدة مفاتيح كل واحد في سطر ليتم التدوير بينهم تلقائيًا"
            icon={<KeyRound className="h-8 w-8" />}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="text-start text-xs text-stone-500">
                  <th className="pb-2 text-start font-semibold">الاسم</th>
                  <th className="pb-2 text-start font-semibold">المفتاح</th>
                  <th className="pb-2 text-start font-semibold">الحالة</th>
                  <th className="pb-2 text-start font-semibold w-36">عدّاد الاستخدام</th>
                  <th className="pb-2 text-start font-semibold">آخر استخدام</th>
                  <th className="pb-2 text-start font-semibold"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {detail.keys.map((k) => (
                  <tr key={k.id} className="align-middle">
                    <td className="py-2.5 pe-3 font-semibold">{k.label || "مفتاح"}</td>
                    <td className="py-2.5 pe-3">
                      <div className="flex items-center gap-1">
                        <span className="code-inline text-xs text-muted-foreground">{maskKey(k.key_value)}</span>
                        <CopyButton value={k.key_value} />
                      </div>
                    </td>
                    <td className="py-2.5 pe-3">
                      <KeyStatusBadge status={k.status} />
                      {k.last_error && (
                        <p className="mt-1 max-w-[230px] truncate text-[11px] leading-4 text-red-500" title={k.last_error}>
                          {k.last_error}
                        </p>
                      )}
                    </td>
                    <td className="py-2.5 pe-3">
                      <div className="flex items-center gap-2">
                        <span className="w-8 tabular-nums font-bold text-teal-700">{formatNumber(k.usage_count)}</span>
                        <Progress value={(k.usage_count / maxUsage) * 100} className="h-1.5 w-16" />
                        {k.error_count > 0 && (
                          <span className="text-xs text-red-600" title={k.last_error ?? ""}>
                            {formatNumber(k.error_count)} خطأ
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="py-2.5 pe-3 text-xs text-muted-foreground">{formatDateTime(k.last_used_at)}</td>
                    <td className="py-2.5">
                      <div className="flex items-center justify-end gap-1">
                        {k.status !== "active" && (
                          <Button variant="outline" size="sm" className="h-7 gap-1 border-stone-200 bg-white text-xs shadow-sm hover:bg-stone-50" onClick={() => setKeyStatus(k, "active")}>
                            <RotateCcw className="h-3 w-3" /> إعادة تفعيل
                          </Button>
                        )}
                        {k.status === "active" && (
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="sm" className="h-7 px-2 text-xs text-muted-foreground">
                                إجراءات
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => setKeyStatus(k, "disabled")}>تعطيل المفتاح</DropdownMenuItem>
                              <DropdownMenuItem onClick={() => setKeyStatus(k, "exhausted")}>وسم كمنتهي</DropdownMenuItem>
                              <DropdownMenuItem onClick={() => resetKeyUsage(k)}>تصفير العدّاد</DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        )}
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-stone-400 hover:text-red-600"
                          aria-label="حذف المفتاح"
                          onClick={() => setDeleteKeyTarget(k)}
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

      {/* Models */}
      <SectionCard
        title={`الموديلات (${detail.models.length}) — المتاح ${selectedCount}`}
        action={
          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              className="gap-1.5 bg-teal-600 text-white hover:bg-teal-700"
              disabled={fetching || detail.keys.length === 0}
              onClick={fetchModels}
              title={detail.keys.length === 0 ? "أضف مفتاحًا أولًا" : undefined}
            >
              <CloudDownload className={`h-4 w-4 ${fetching ? "animate-bounce" : ""}`} />
              {fetching ? "جارٍ الجلب…" : "جلب الموديلات"}
            </Button>
            <Button size="sm" variant="outline" className="gap-1.5 border-stone-200 bg-white shadow-sm hover:bg-stone-50" onClick={() => bulkSelect(true)}>
              <CheckCheck className="h-4 w-4" /> تحديد الكل
            </Button>
            <Button size="sm" variant="outline" className="gap-1.5 border-stone-200 bg-white shadow-sm hover:bg-stone-50" onClick={() => bulkSelect(false)}>
              <XCircle className="h-4 w-4" /> إلغاء الكل
            </Button>
          </div>
        }
      >
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <div className="relative min-w-52 flex-1">
            <Search className="absolute start-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="ابحث في الموديلات…"
              className="ps-8"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <Select value={modelFilter} onValueChange={(v) => setModelFilter(v as typeof modelFilter)}>
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">الكل</SelectItem>
              <SelectItem value="selected">المتاح فقط</SelectItem>
              <SelectItem value="unselected">غير المحدد فقط</SelectItem>
            </SelectContent>
          </Select>
          <div className="flex items-center gap-1.5">
            <Input
              dir="ltr"
              className="code-inline w-56 text-left"
              placeholder="إضافة يدوية: model-id"
              value={manualModel}
              onChange={(e) => setManualModel(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addManualModel()}
            />
            <Button size="sm" variant="outline" className="gap-1 border-stone-200 bg-white shadow-sm hover:bg-stone-50" onClick={addManualModel} disabled={!manualModel.trim()}>
              <Plus className="h-3.5 w-3.5" /> إضافة
            </Button>
          </div>
        </div>

        {detail.models.length === 0 ? (
          <EmptyState
            title="لم يتم جلب الموديلات بعد"
            hint={detail.keys.length === 0 ? "أضف مفتاح API أولًا ثم اضغط «جلب الموديلات»" : "اضغط «جلب الموديلات» ليجلبها الأداة من المزود ويظهر لك اختر منها المتاح"}
            icon={<Layers />}
          />
        ) : (
          <div className="max-h-[420px] space-y-1.5 overflow-y-auto rounded-lg border border-stone-200 bg-stone-50/50 p-2">
            {filteredModels.map((m) => (
              <div
                key={m.id}
                className={`flex items-center gap-3 rounded-lg border px-3 py-2 transition-colors ${
                  m.selected === 1 ? "border-teal-200 bg-teal-50/80" : "border-transparent bg-white hover:bg-stone-100/70"
                }`}
              >
                <Checkbox
                  checked={m.selected === 1}
                  onCheckedChange={(v) => toggleModel(m, v === true)}
                  aria-label={`تحديد ${m.model_id}`}
                />
                <span className={`code-inline min-w-0 flex-1 truncate text-sm ${m.selected === 1 ? "font-semibold text-teal-900" : "text-stone-500"}`}>
                  {m.model_id}
                </span>
                {m.selected === 1 && (
                  <Badge variant="outline" className="shrink-0 border-teal-200 bg-teal-100/70 text-xs text-teal-800">
                    متاح
                  </Badge>
                )}
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 shrink-0 text-stone-400 hover:text-red-600"
                  aria-label="حذف الموديل"
                  onClick={() => setDeleteModelTarget(m)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
            {filteredModels.length === 0 && (
              <p className="py-6 text-center text-sm text-muted-foreground">لا نتائج مطابقة للبحث/الفلتر</p>
            )}
          </div>
        )}
        <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
          <RefreshCcw className="h-3.5 w-3.5" />
          الموديلات المحددة هي فقط ما سيظهر عبر رابط الجيت واي في <span className="code-inline">/v1/models</span> وما سيقبل الجيت واي استخدامه
        </div>
      </SectionCard>

      {/* Add keys dialog */}
      <Dialog open={keyOpen} onOpenChange={setKeyOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>إضافة مفتاح API — {p.name}</DialogTitle>
            <DialogDescription>يمكنك لصق عدة مفاتيح، كل مفتاح في سطر منفصل — سيتم التدوير بينهم تلقائيًا عند النفاد</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="k-label">اسم تعريفي (اختياري)</Label>
              <Input id="k-label" placeholder="مثال: حساب رئيسي" value={keyForm.label} onChange={(e) => setKeyForm((f) => ({ ...f, label: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="k-value">المفاتيح (سطر لكل مفتاح)</Label>
              <textarea
                id="k-value"
                dir="ltr"
                rows={5}
                className="code-inline w-full rounded-md border border-input bg-background/60 px-3 py-2 text-left text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                placeholder={"sk-aaa...\nsk-bbb...\nsk-ccc..."}
                value={keyForm.key_value}
                onChange={(e) => setKeyForm((f) => ({ ...f, key_value: e.target.value }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setKeyOpen(false)}>إلغاء</Button>
            <Button className="bg-teal-600 text-white hover:bg-teal-700" disabled={savingKey || !keyForm.key_value.trim()} onClick={addKeys}>
              {savingKey ? "جارٍ الإضافة…" : "إضافة"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteKeyTarget} onOpenChange={(o) => !o && setDeleteKeyTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>حذف المفتاح «{deleteKeyTarget?.label || "مفتاح"}»؟</AlertDialogTitle>
            <AlertDialogDescription>لن يستخدم في التدوير بعد الحذف. لا يمكن التراجع.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>إلغاء</AlertDialogCancel>
            <AlertDialogAction className="bg-red-600 text-white hover:bg-red-500" onClick={confirmDeleteKey}>حذف</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!deleteModelTarget} onOpenChange={(o) => !o && setDeleteModelTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>حذف الموديل «{deleteModelTarget?.model_id}»؟</AlertDialogTitle>
            <AlertDialogDescription>سيختفي من قائمة الجيت واي. يمكنك جلبه مرة أخرى لاحقًا.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>إلغاء</AlertDialogCancel>
            <AlertDialogAction className="bg-red-600 text-white hover:bg-red-500" onClick={confirmDeleteModel}>حذف</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Connection test results */}
      <Dialog open={testOpen} onOpenChange={setTestOpen}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <PlugZap className="h-5 w-5 text-amber-500" /> تجربة الاتصال — {p.name}
            </DialogTitle>
            <DialogDescription>
              اختبار حقيقي لكل مفتاح مع المزود. المفاتيح التي تنجح يُعاد تفعيلها تلقائيًا.
            </DialogDescription>
          </DialogHeader>

          {!testResult ? (
            <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
              <PlugZap className="h-4 w-4 animate-pulse" /> جارٍ اختبار المفاتيح مع المزود…
            </div>
          ) : (
            <div className="space-y-4">
              {testResult.all_geo_blocked && (
                <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-800">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>
                    كل المفاتيح سليمة لكن المزود يحجب منطقة خروج السيرفر الحالية (حظر جغرافي). الطلبات ستظل تُرفض من
                    هنا — انشر البوابة على Vercel في منطقة مدعومة (مثل الولايات المتحدة) وستعمل فورًا.
                  </span>
                </div>
              )}

              <div className="space-y-2">
                {testResult.results.map((r, i) => (
                  <div key={i} className="rounded-lg border border-stone-200 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        {r.ok ? (
                          <CheckCircle2 className="h-4 w-4 text-teal-600" />
                        ) : (
                          <XCircle className="h-4 w-4 text-red-500" />
                        )}
                        <span className="text-sm font-bold">{r.label || "مفتاح"}</span>
                        {r.status_before !== "active" && r.ok && r.reactivated && (
                          <Badge variant="outline" className="border-teal-200 bg-teal-50 text-[10px] text-teal-700">
                            أُعيد تفعيله تلقائيًا
                          </Badge>
                        )}
                      </div>
                      <span className="code-inline text-[11px] text-muted-foreground" dir="ltr">
                        {r.http_status ? `HTTP ${r.http_status}` : "network"}
                      </span>
                    </div>
                    <p className={`mt-1.5 text-xs leading-5 ${r.geo ? "text-amber-700" : r.ok ? "text-stone-500" : "text-red-600"}`}>
                      {r.reason}
                    </p>
                  </div>
                ))}
              </div>

              <div className="rounded-lg border border-stone-200 bg-stone-50/60 p-3">
                <p className="mb-1.5 text-xs font-bold text-stone-600">اختبار الطلب الفعلي (chat completion)</p>
                {!testResult.chat ? (
                  <p className="text-xs text-muted-foreground">
                    لم يُختبر الطلب الفعلي — {testResult.results.every((r) => !r.ok) ? "لا يوجد مفتاح يعمل" : "لا يوجد موديل محدد لهذا المزود (اختر موديلًا أولًا)"}
                  </p>
                ) : (
                  <div>
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        {testResult.chat.ok ? (
                          <CheckCircle2 className="h-4 w-4 text-teal-600" />
                        ) : (
                          <XCircle className="h-4 w-4 text-red-500" />
                        )}
                        <span className="code-inline text-xs font-bold">{testResult.chat.model}</span>
                        <span className="text-[11px] text-muted-foreground">{testResult.chat.latency_ms}ms</span>
                      </div>
                      <span className="code-inline text-[11px] text-muted-foreground" dir="ltr">
                        {testResult.chat.http_status ? `HTTP ${testResult.chat.http_status}` : "network"}
                      </span>
                    </div>
                    <p className={`mt-1.5 text-xs leading-5 ${testResult.chat.geo ? "text-amber-700" : testResult.chat.ok ? "text-stone-500" : "text-red-600"}`}>
                      {testResult.chat.reason}
                    </p>
                  </div>
                )}
                <p className="mt-2 border-t border-stone-200 pt-2 text-[11px] text-muted-foreground" dir="ltr">
                  {testResult.models_url}
                </p>
              </div>

              {testResult.reactivated > 0 && (
                <p className="text-xs text-teal-700">تمت إعادة تفعيل {testResult.reactivated} مفتاح تلقائيًا.</p>
              )}
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setTestOpen(false)}>إغلاق</Button>
            <Button className="bg-teal-600 text-white hover:bg-teal-700" disabled={testing} onClick={runTest}>
              <RefreshCcw className="h-4 w-4" /> إعادة الاختبار
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
