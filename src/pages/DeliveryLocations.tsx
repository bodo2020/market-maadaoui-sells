
import { useState } from "react";
import { toast } from "sonner";
import MainLayout from "@/components/layout/MainLayout";
import { Button } from "@/components/ui/button";
import DeliveryLocationDialog from "@/components/delivery/DeliveryLocationDialog";
import DeliveryLocationsTable from "@/components/delivery/DeliveryLocationsTable";
import { MapPin } from "lucide-react";

export default function DeliveryLocations() {
  const [showAddDialog, setShowAddDialog] = useState(false);
  
  return (
    <MainLayout>
      <div className="container mx-auto p-6">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-bold">مناطق التوصيل والأسعار</h1>
          <Button onClick={() => setShowAddDialog(true)}>
            <MapPin className="h-4 w-4 ml-2" />
            إضافة منطقة جديدة
          </Button>
        </div>
        
        <DeliveryLocationsTable />
        
        <DeliveryLocationDialog
          open={showAddDialog}
          onOpenChange={setShowAddDialog}
        />
      </div>
    </MainLayout>
  );
}
