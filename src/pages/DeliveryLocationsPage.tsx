
import { useState } from "react";
import { toast } from "sonner";
import MainLayout from "@/components/layout/MainLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { MapPin, Plus } from "lucide-react";
import HierarchicalLocations from "@/components/delivery/HierarchicalLocations";
import DeliveryLocationDialog from "@/components/delivery/DeliveryLocationDialog";
import { createGovernorate } from "@/services/supabase/deliveryService";
import { useQueryClient } from "@tanstack/react-query";

export default function DeliveryLocationsPage() {
  const [showAddLocationDialog, setShowAddLocationDialog] = useState(false);
  const [selectedProviderId, setSelectedProviderId] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const handleAddLocation = () => {
    setShowAddLocationDialog(true);
  };

  const handleAddGovernorate = async (data: any) => {
    try {
      await createGovernorate({
        governorate: data.name,
        name: data.name,
        provider_id: selectedProviderId || undefined
      });
      
      queryClient.invalidateQueries({ queryKey: ["governorates"] });
      toast.success("تم إضافة المحافظة بنجاح");
      setShowAddLocationDialog(false);
    } catch (error) {
      console.error("Error creating governorate:", error);
      toast.error("حدث خطأ أثناء إضافة المحافظة");
    }
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
          onSuccess={handleAddGovernorate}
        />
      </div>
    </MainLayout>
  );
}
