
import { useState } from "react";
import { toast } from "sonner";
import MainLayout from "@/components/layout/MainLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { MapPin, Plus } from "lucide-react";
import HierarchicalLocations from "@/components/delivery/HierarchicalLocations";
import DeliveryLocationDialog from "@/components/delivery/DeliveryLocationDialog";
import { createGovernorate, fetchBranches } from "@/services/supabase/deliveryService";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";

export default function DeliveryLocationsPage() {
  const [showAddLocationDialog, setShowAddLocationDialog] = useState(false);
  const [selectedProviderId, setSelectedProviderId] = useState<string | null>(null);
  const [selectedBranchId, setSelectedBranchId] = useState<string | null>(null);
  const queryClient = useQueryClient();

  // Fetch branches
  const { data: branches = [] } = useQuery({
    queryKey: ["branches"],
    queryFn: fetchBranches
  });

  const handleAddLocation = () => {
    setShowAddLocationDialog(true);
  };

  const handleAddGovernorate = async (data: any) => {
    try {
      await createGovernorate({
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
        
        <div className="mb-6 space-y-4">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between flex-wrap gap-4">
                <div className="flex items-center gap-4 flex-1">
                  <MapPin className="ml-2 h-5 w-5 text-primary" />
                  <h2 className="text-lg font-semibold">المحافظات والمناطق</h2>
                  
                  <div className="mr-auto w-64">
                    <Label className="mb-2">اختر الفرع</Label>
                    <Select value={selectedBranchId || ""} onValueChange={setSelectedBranchId}>
                      <SelectTrigger>
                        <SelectValue placeholder="جميع الفروع" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">جميع الفروع</SelectItem>
                        {branches.map((branch: any) => (
                          <SelectItem key={branch.id} value={branch.id}>
                            {branch.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                
                <Button onClick={handleAddLocation}>
                  <Plus className="ml-2 h-4 w-4" />
                  إضافة محافظة
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>

        <HierarchicalLocations branchId={selectedBranchId === "all" ? null : selectedBranchId} />

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
