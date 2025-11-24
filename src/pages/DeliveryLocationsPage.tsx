import { useState } from "react";
import MainLayout from "@/components/layout/MainLayout";
import { Card, CardContent } from "@/components/ui/card";
import DeliveryLocationDialog from "@/components/delivery/DeliveryLocationDialog";
import { HierarchicalLocations } from "@/components/delivery/HierarchicalLocations";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createGovernorate } from "@/services/supabase/deliveryService";
import { toast } from "sonner";

export default function DeliveryLocationsPage() {
  const [showAddLocationDialog, setShowAddLocationDialog] = useState(false);
  const queryClient = useQueryClient();

  const handleAddLocation = () => {
    setShowAddLocationDialog(true);
  };

  const handleAddGovernorate = useMutation({
    mutationFn: (data: { name: string; provider_id?: string }) => 
      createGovernorate(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["governorates"] });
      toast.success("تم إضافة المحافظة بنجاح");
    },
    onError: (error) => {
      console.error("Error creating governorate:", error);
      toast.error("حدث خطأ أثناء إضافة المحافظة");
    },
  });

  return (
    <MainLayout>
      <div className="container py-6" dir="rtl">
        <h1 className="text-2xl font-bold mb-6">
          إدارة مناطق التوصيل العامة
        </h1>
        
        <Card className="mb-6">
          <CardContent className="pt-6">
            <Button onClick={handleAddLocation} className="gap-2">
              <Plus size={16} />
              إضافة محافظة
            </Button>
          </CardContent>
        </Card>

        <HierarchicalLocations />

        <DeliveryLocationDialog
          open={showAddLocationDialog}
          onOpenChange={setShowAddLocationDialog}
          mode="governorate"
          onSuccess={() => {
            handleAddGovernorate.mutate({ name: "" });
            queryClient.invalidateQueries({ queryKey: ["governorates"] });
          }}
        />
      </div>
    </MainLayout>
  );
}
