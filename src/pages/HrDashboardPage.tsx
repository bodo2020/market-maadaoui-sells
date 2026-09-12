import { Link } from "react-router-dom";
import { CalendarDays, CheckCircle2, Clock3, FileText, Landmark, Network, ShieldCheck, UserRound, UsersRound, WalletCards } from "lucide-react";
import MainLayout from "@/components/layout/MainLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/contexts/AuthContext";

const modules = [
  { href: "/employees", title: "الموظفون", description: "إدارة الموظفين وملف Employee 360 والأجهزة", icon: UsersRound },
  { href: "/organization", title: "الهيكل التنظيمي", description: "الفروع والأقسام والفرق والمناصب والمدير المباشر", icon: Network },
  { href: "/attendance", title: "الحضور والانصراف", description: "الحضور والتأخير والغياب وتصحيحات الحضور", icon: Clock3 },
  { href: "/hr/shifts", title: "جدولة الشيفتات", description: "خطط العمل وتوزيع الموظفين والشيفتات", icon: CalendarDays },
  { href: "/hr/leave-calendar", title: "الإجازات", description: "تقويم الإجازات والطلبات والأرصدة", icon: FileText },
  { href: "/hr/payroll", title: "الرواتب", description: "الراتب والبدلات والخصومات ودورات Payroll", icon: WalletCards },
  { href: "/tasks", title: "المهام", description: "مهام الموظفين والمتابعة والتنفيذ", icon: CheckCircle2 },
  { href: "/approvals", title: "الموافقات", description: "طلبات HR وسلاسل الموافقة والتصعيد", icon: ShieldCheck },
];

export default function HrDashboardPage() {
  const { user } = useAuth();
  return (
    <MainLayout>
      <div dir="rtl" className="mx-auto w-full max-w-7xl space-y-6 py-5">
        <section className="relative overflow-hidden rounded-3xl bg-[#005931] p-6 text-white shadow-lg md:p-8">
          <div className="absolute inset-0 opacity-20 [background-image:radial-gradient(circle_at_15%_10%,white_0,transparent_28%),radial-gradient(circle_at_85%_90%,#86efac_0,transparent_24%)]" />
          <div className="relative z-10 flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
            <div>
              <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-bold ring-1 ring-white/15"><Landmark className="h-3.5 w-3.5" />المعداوي HR</div>
              <h1 className="text-3xl font-black md:text-4xl">مركز الموارد البشرية</h1>
              <p className="mt-3 max-w-2xl text-sm leading-7 text-emerald-50 md:text-base">منظومة مستقلة لإدارة الموظفين والحضور والشيفتات والإجازات والرواتب والمهام والموافقات، مع الاحتفاظ بنفس بيانات وصلاحيات منظومة المعداوي.</p>
            </div>
            <Link to="/my-hr" className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl bg-white px-5 font-black text-[#005931] shadow-sm transition hover:bg-emerald-50"><UserRound className="h-5 w-5" />ملفي الوظيفي</Link>
          </div>
        </section>

        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {modules.map((item) => {
            const Icon = item.icon;
            return (
              <Link key={item.href} to={item.href} className="group block">
                <Card className="h-full rounded-2xl border-slate-200/80 transition duration-200 hover:-translate-y-0.5 hover:border-emerald-200 hover:shadow-lg hover:shadow-emerald-950/5">
                  <CardHeader className="pb-3">
                    <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-50 text-[#005931] transition group-hover:bg-[#005931] group-hover:text-white"><Icon className="h-5 w-5" /></div>
                    <CardTitle className="text-base font-black">{item.title}</CardTitle>
                  </CardHeader>
                  <CardContent className="pt-0"><p className="text-sm leading-6 text-slate-500">{item.description}</p></CardContent>
                </Card>
              </Link>
            );
          })}
        </section>

        <section className="grid gap-4 lg:grid-cols-2">
          <Card className="rounded-2xl">
            <CardHeader><CardTitle className="text-base font-black">الجلسة الحالية</CardTitle></CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex items-center justify-between rounded-xl bg-slate-50 px-4 py-3"><span className="text-slate-500">الموظف</span><span className="font-black text-slate-900">{user?.name || user?.username || "—"}</span></div>
              <div className="flex items-center justify-between rounded-xl bg-slate-50 px-4 py-3"><span className="text-slate-500">الدور</span><span className="font-black text-[#005931]">{user?.role || "—"}</span></div>
            </CardContent>
          </Card>
          <Card className="rounded-2xl border-emerald-100 bg-emerald-50/50">
            <CardHeader><CardTitle className="text-base font-black text-emerald-950">الفصل عن POS</CardTitle></CardHeader>
            <CardContent><p className="text-sm leading-7 text-emerald-900">هذه النسخة لا تعرض نقطة البيع أو المخزون أو المنتجات أو المالية التشغيلية. الـPOS يستمر كنظام مستقل، والـHR مسؤول فقط عن دورة حياة الموظف وبياناته الوظيفية.</p></CardContent>
          </Card>
        </section>
      </div>
    </MainLayout>
  );
}
