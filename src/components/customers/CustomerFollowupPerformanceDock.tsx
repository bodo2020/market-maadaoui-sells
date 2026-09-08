import { useState } from "react";
import { useParams } from "react-router-dom";
import { Target } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import CustomerFollowupPerformanceCard from "@/components/customers/CustomerFollowupPerformanceCard";
import CustomerStructuredFollowupControl from "@/components/customers/CustomerStructuredFollowupControl";

export default function CustomerFollowupPerformanceDock() {
  const { customerId } = useParams();
  const [open, setOpen] = useState(false);
  if (!customerId) return null;

  return (
    <>
      <Button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed bottom-36 left-5 z-[68] h-12 rounded-full bg-white px-5 text-slate-950 shadow-[0_14px_35px_rgba(15,23,42,.18)] ring-1 ring-slate-200 hover:bg-slate-50"
      >
        <Target className="ml-2 h-5 w-5 text-[#005931]" />
        متابعة ونتائج
      </Button>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="left" dir="rtl" className="w-full overflow-y-auto sm:max-w-2xl">
          <SheetHeader className="text-right">
            <SheetTitle className="flex items-center gap-2"><Target className="h-5 w-5 text-[#005931]" />متابعة ونتائج العميل</SheetTitle>
            <SheetDescription>سجل نتيجة المتابعة بشكل منظم واعرف هل العميل رجع واشترى بعدها وقيمة المبيعات الناتجة.</SheetDescription>
          </SheetHeader>
          <div className="mt-5 space-y-4">
            <CustomerStructuredFollowupControl customerId={customerId} />
            <CustomerFollowupPerformanceCard customerId={customerId} />
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
