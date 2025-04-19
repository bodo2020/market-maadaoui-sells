
import { useState } from "react";
import { toast } from "sonner";
import MainLayout from "@/components/layout/MainLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { MapPin, Plus } from "lucide-react";
import HierarchicalLocations from "@/components/delivery/HierarchicalLocations";
import DeliveryLocationDialog from "@/components/delivery/DeliveryLocationDialog";

export default function DeliveryLocationsPage() {
  const [showAddLocationDialog, setShowAddLocationDialog] = useState(false);
  const [selectedProviderId, setSelectedProviderId] = useState<string | null>(null);

  const handleAddLocation = () => {
    setShowAddLocationDialog(true);
  };

  return (
    <MainLayout>
      <div className="container py-6" dir="rtl">
        <h1 className="text-2xl font-bold mb-6">إدارة مناطق التوصيل</h1>
        
        <div className="mb-6">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between flex-wrap gap-4">
                <div className="flex items-center">
                  <MapPin className="ml-2 h-5 w-5 text-primary" />
                  <h2 className="text-lg font-semibold">المحافظات والمناطق</h2>
                </div>
                
                <Button onClick={handleAddLocation}>
                  <Plus className="ml-2 h-4 w-4" />
                  إضافة محافظة
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>

        <HierarchicalLocations />

        <DeliveryLocationDialog
          open={showAddLocationDialog}
          onOpenChange={setShowAddLocationDialog}
          mode="governorate"
          providerId={selectedProviderId}
          onSuccess={() => {
            toast.success("تم إضافة المحافظة بنجاح");
            setShowAddLocationDialog(false);
          }}
        />
      </div>
    </MainLayout>
  );
}
