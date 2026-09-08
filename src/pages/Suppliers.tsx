import MainLayout from "@/components/layout/MainLayout";
import SuppliersList from "@/components/suppliers/SuppliersList";
import { Card, CardContent } from "@/components/ui/card";
import { Truck } from "lucide-react";

export default function Suppliers() {
  return (
    <MainLayout>
      <div dir="rtl" className="mx-auto max-w-7xl space-y-5 p-3 pb-10 md:p-6">
        <section className="rounded-3xl bg-[#005931] p-5 text-white shadow-[0_16px_45px_rgba(0,89,49,.18)] md:p-7">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/10"><Truck className="h-6 w-6" /></div>
            <div>
              <h1 className="text-2xl font-black">الموردون</h1>
              <p className="mt-1 text-sm text-emerald-100">إدارة الموردين وبيانات التواصل والمشتريات بعيدًا عن قسم العملاء.</p>
            </div>
          </div>
        </section>
        <Card className="border-0 shadow-sm ring-1 ring-slate-200"><CardContent className="p-3 md:p-5"><SuppliersList /></CardContent></Card>
      </div>
    </MainLayout>
  );
}
