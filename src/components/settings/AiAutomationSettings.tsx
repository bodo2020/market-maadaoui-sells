import { useEffect, useState } from "react";
import { Bot, Save, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { AiRuntimeSettings, fetchAiRuntimeSettings, saveAiRuntimeSettings } from "@/services/supabase/aiGatewayService";

const defaults: AiRuntimeSettings = {
  enabled: false,
  primary_provider: "gemini",
  primary_model: "gemini-2.5-flash",
  fallback_provider: "groq",
  fallback_model: "openai/gpt-oss-120b",
  timeout_ms: 20000,
  max_output_tokens: 800,
  auto_reply_enabled: false,
};

export default function AiAutomationSettings() {
  const [settings, setSettings] = useState(defaults);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchAiRuntimeSettings().then(setSettings).catch((error) => toast.error(error.message)).finally(() => setLoading(false));
  }, []);

  const save = async () => {
    setSaving(true);
    try {
      await saveAiRuntimeSettings(settings);
      toast.success("تم حفظ إعدادات AI");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "تعذر الحفظ");
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="py-12 text-center text-muted-foreground">جاري تحميل إعدادات AI...</div>;

  return (
    <div className="space-y-4" dir="rtl">
      <Alert className="border-amber-200 bg-amber-50 text-amber-950">
        <ShieldAlert className="h-4 w-4" />
        <AlertDescription>مفاتيح Gemini وGroq محفوظة كـSupabase Secrets فقط ولا تظهر في المتصفح أو قاعدة البيانات.</AlertDescription>
      </Alert>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Bot className="h-5 w-5 text-[#005931]" />Elmadawy AI Gateway</CardTitle>
          <CardDescription>تحكم مركزي في المزود الأساسي والاحتياطي وحدود الرد.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-5 md:grid-cols-2">
          <div className="flex items-center justify-between rounded-xl border p-4 md:col-span-2">
            <div><Label>تشغيل بوابة AI</Label><p className="mt-1 text-xs text-muted-foreground">مفتاح إيقاف طوارئ لكل الطلبات.</p></div>
            <Switch checked={settings.enabled} onCheckedChange={(enabled) => setSettings((s) => ({ ...s, enabled }))} />
          </div>

          <div className="space-y-2"><Label>المزود الأساسي</Label><Select value={settings.primary_provider} onValueChange={(value: "gemini" | "groq") => setSettings((s) => ({ ...s, primary_provider: value }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="gemini">Gemini</SelectItem><SelectItem value="groq">Groq</SelectItem></SelectContent></Select></div>
          <div className="space-y-2"><Label>الموديل الأساسي</Label><Input dir="ltr" value={settings.primary_model} onChange={(event) => setSettings((s) => ({ ...s, primary_model: event.target.value }))} /></div>
          <div className="space-y-2"><Label>المزود الاحتياطي</Label><Select value={settings.fallback_provider || "none"} onValueChange={(value) => setSettings((s) => ({ ...s, fallback_provider: value === "none" ? null : value as "gemini" | "groq" }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="groq">Groq</SelectItem><SelectItem value="gemini">Gemini</SelectItem><SelectItem value="none">بدون احتياطي</SelectItem></SelectContent></Select></div>
          <div className="space-y-2"><Label>الموديل الاحتياطي</Label><Input dir="ltr" disabled={!settings.fallback_provider} value={settings.fallback_model || ""} onChange={(event) => setSettings((s) => ({ ...s, fallback_model: event.target.value || null }))} /></div>
          <div className="space-y-2"><Label>Timeout بالمللي ثانية</Label><Input type="number" min={5000} max={60000} value={settings.timeout_ms} onChange={(event) => setSettings((s) => ({ ...s, timeout_ms: Number(event.target.value) }))} /></div>
          <div className="space-y-2"><Label>أقصى عدد Tokens للرد</Label><Input type="number" min={128} max={4096} value={settings.max_output_tokens} onChange={(event) => setSettings((s) => ({ ...s, max_output_tokens: Number(event.target.value) }))} /></div>
          <div className="flex items-center justify-between rounded-xl border p-4 md:col-span-2"><div><Label>الرد التلقائي الخارجي</Label><p className="mt-1 text-xs text-muted-foreground">يظل مغلقًا في Milestone 1 حتى اجتياز الاختبارات وربط Human Handoff.</p></div><Switch checked={settings.auto_reply_enabled} disabled onCheckedChange={() => undefined} /></div>
          <Button className="md:col-span-2" onClick={save} disabled={saving}><Save className="ml-2 h-4 w-4" />{saving ? "جاري الحفظ..." : "حفظ الإعدادات"}</Button>
        </CardContent>
      </Card>
    </div>
  );
}
