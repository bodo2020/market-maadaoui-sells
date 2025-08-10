import MainLayout from "@/components/layout/MainLayout";
import InventoryTransferDialog from "@/components/superadmin/InventoryTransferDialog";
import { useState } from "react";

export default function InventoryTransfers() {
  const [open, setOpen] = useState(true);
  return (
    <MainLayout>
      <div className="p-4">
        <h1 className="text-xl font-bold mb-4">تحويلات المخزون بين الفروع</h1>
        <InventoryTransferDialog open={open} onOpenChange={setOpen} />
      </div>
    </MainLayout>
  );
}
