import { useState } from "react";
import MainLayout from "@/components/layout/MainLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useQuery } from "@tanstack/react-query";
import { fetchBranches } from "@/services/supabase/deliveryService";
import { fetchBranchDeliveryZones } from "@/services/supabase/deliveryZoneService";
import { BranchNeighborhoodManager } from "@/components/delivery/BranchNeighborhoodManager";
import { BranchDeliveryZoneMapper } from "@/components/delivery/BranchDeliveryZoneMapper";
import { DeliveryZonesList } from "@/components/delivery/DeliveryZonesList";
import { CustomerLocationVerifier } from "@/components/delivery/CustomerLocationVerifier";
import { MapIcon, List } from "lucide-react";

export default function BranchDeliveryZones() {
  const [selectedBranchId, setSelectedBranchId] = useState<string | null>(null);

  const { data: branches, isLoading } = useQuery({
    queryKey: ["branches"],
    queryFn: fetchBranches,
  });

  const { data: deliveryZones = [] } = useQuery({
    queryKey: ["branch-delivery-zones", selectedBranchId],
    queryFn: () => fetchBranchDeliveryZones(selectedBranchId!),
    enabled: !!selectedBranchId,
  });

  return (
    <MainLayout>
      <div className="container py-6" dir="rtl">
        <h1 className="text-2xl font-bold mb-6">
          مناطق التوصيل الخاصة بالفروع
        </h1>
        
        <Card className="mb-6">
          <CardContent className="pt-6">
            <div className="space-y-2">
              <Label>اختر الفرع</Label>
              <Select 
                value={selectedBranchId || ""} 
                onValueChange={(value) => setSelectedBranchId(value || null)}
                disabled={isLoading}
              >
                <SelectTrigger>
                  <SelectValue placeholder="اختر فرعاً..." />
                </SelectTrigger>
                <SelectContent>
                  {branches?.map((branch) => (
                    <SelectItem key={branch.id} value={branch.id}>
                      {branch.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>
        
        {selectedBranchId && (
          <Tabs defaultValue="map" className="space-y-6">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="map" className="flex items-center gap-2">
                <MapIcon className="h-4 w-4" />
                رسم الخريطة (جديد)
              </TabsTrigger>
              <TabsTrigger value="list" className="flex items-center gap-2">
                <List className="h-4 w-4" />
                قائمة المناطق
              </TabsTrigger>
              <TabsTrigger value="old">النظام القديم</TabsTrigger>
            </TabsList>

            <TabsContent value="map" className="space-y-6">
              <BranchDeliveryZoneMapper
                branchId={selectedBranchId}
                zones={deliveryZones}
              />
              
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <CustomerLocationVerifier />
              </div>
            </TabsContent>

            <TabsContent value="list">
              <DeliveryZonesList zones={deliveryZones} />
            </TabsContent>

            <TabsContent value="old">
              <BranchNeighborhoodManager branchId={selectedBranchId} />
            </TabsContent>
          </Tabs>
        )}
      </div>
    </MainLayout>
  );
}
