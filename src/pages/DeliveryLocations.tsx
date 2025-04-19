
import { useState } from "react";
import { toast } from "sonner";
import MainLayout from "@/components/layout/MainLayout";
import { Button } from "@/components/ui/button";
import DeliveryLocationDialog from "@/components/delivery/DeliveryLocationDialog";
import DeliveryLocationsTable from "@/components/delivery/DeliveryLocationsTable";
import { MapPin } from "lucide-react";
import ShippingProviderDialog from "@/components/delivery/ShippingProviderDialog";

export default function DeliveryLocations() {
  const [selectedProvider, setSelectedProvider] = useState<string | null>(null);
  const [showAddProviderDialog, setShowAddProviderDialog] = useState(false);
  const [showAddLocationDialog, setShowAddLocationDialog] = useState(false);
  
  return (
    <MainLayout>
      <div className="container mx-auto p-6">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-bold">مناطق التوصيل والأسعار</h1>
          <Button onClick={() => setShowAddProviderDialog(true)}>
            <MapPin className="h-4 w-4 ml-2" />
            إضافة شركة شحن
          </Button>
        </div>
        
        <DeliveryLocationsTable
          onAddLocation={(providerId) => {
            setSelectedProvider(providerId);
            setShowAddLocationDialog(true);
          }}
        />
        
        <ShippingProviderDialog
          open={showAddProviderDialog}
          onOpenChange={setShowAddProviderDialog}
          onSuccess={() => toast.success("تم إضافة شركة الشحن بنجاح")}
        />
        
        {selectedProvider && (
          <DeliveryLocationDialog
            open={showAddLocationDialog}
            onOpenChange={setShowAddLocationDialog}
            mode="governorate"
            providerId={selectedProvider}
            onSuccess={() => {
              toast.success("تم إضافة منطقة التوصيل بنجاح");
              setShowAddLocationDialog(false);
            }}
          />
        )}
      </div>
    </MainLayout>
  );
}
