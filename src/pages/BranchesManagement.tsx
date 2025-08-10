import MainLayout from "@/components/layout/MainLayout";
import BranchesManagementDialog from "@/components/superadmin/BranchesManagementDialog";
import { useState } from "react";

export default function BranchesManagement() {
  // نستخدم نفس المحتوى لكن كصفحة: نعرض مكون الحوار مفتوح دائمًا بدون الحاجة إلى زر
  const [open, setOpen] = useState(true);
  return (
    <MainLayout>
      <div className="p-4">
        <h1 className="text-xl font-bold mb-4">إدارة الفروع</h1>
        <BranchesManagementDialog open={open} onOpenChange={setOpen} />
      </div>
    </MainLayout>
  );
}
