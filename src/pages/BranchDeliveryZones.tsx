import { useState } from "react";
import MainLayout from "@/components/layout/MainLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useQuery } from "@tanstack/react-query";
import { fetchBranches } from "@/services/supabase/deliveryService";
import { BranchNeighborhoodManager } from "@/components/delivery/BranchNeighborhoodManager";

export default function BranchDeliveryZones() {
  const [selectedBranchId, setSelectedBranchId] = useState<string | null>(null);

  const { data: branches, isLoading } = useQuery({
    queryKey: ["branches"],
    queryFn: fetchBranches,
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
          <BranchNeighborhoodManager branchId={selectedBranchId} />
        )}
      </div>
    </MainLayout>
  );
}
