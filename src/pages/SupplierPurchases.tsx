import MainLayout from "@/components/layout/MainLayout";
import SupplierPurchasesCenterV2 from "@/components/suppliers/SupplierPurchasesCenterV2";

export default function SupplierPurchases() {
  return (
    <MainLayout>
      <div className="mx-auto max-w-[1600px] p-3 pb-10 md:p-6">
        <SupplierPurchasesCenterV2 initialTab="overview" />
      </div>
    </MainLayout>
  );
}
