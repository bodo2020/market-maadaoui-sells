
import { useState, useEffect } from "react";
import MainLayout from "@/components/layout/MainLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "sonner";
import { MapPin, Plus } from "lucide-react";
import { fetchDeliveryLocations, fetchShippingProviders } from "@/services/supabase/deliveryService";
import { DeliveryLocation, ShippingProvider } from "@/types/shipping";
import HierarchicalLocations from "@/components/delivery/HierarchicalLocations";
import DeliveryLocationDialog from "@/components/delivery/DeliveryLocationDialog";

export default function DeliveryLocationsPage() {
  const [locations, setLocations] = useState<DeliveryLocation[]>([]);
  const [providers, setProviders] = useState<ShippingProvider[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddLocationDialog, setShowAddLocationDialog] = useState(false);
  const [selectedProviderId, setSelectedProviderId] = useState<string | null>(null);

  const loadLocations = async () => {
    try {
      setLoading(true);
      const data = await fetchDeliveryLocations();
      setLocations(data);
    } catch (error) {
      console.error("Error loading delivery locations:", error);
      toast.error("حدث خطأ أثناء تحميل مناطق التوصيل");
    } finally {
      setLoading(false);
    }
  };

  const loadProviders = async () => {
    try {
      const providersData = await fetchShippingProviders();
      setProviders(providersData);
      if (providersData.length > 0 && !selectedProviderId) {
        setSelectedProviderId(providersData[0].id);
      }
    } catch (error) {
      console.error("Error loading shipping providers:", error);
      toast.error("حدث خطأ أثناء تحميل شركات الشحن");
    }
  };

  useEffect(() => {
    loadLocations();
    loadProviders();
  }, []);

  const handleAddLocation = () => {
    if (!selectedProviderId) {
      toast.error("الرجاء اختيار شركة شحن أولاً");
      return;
    }
    setShowAddLocationDialog(true);
  };

  return (
    <MainLayout>
      <div className="container py-6">
        <h1 className="text-2xl font-bold mb-6">إدارة مناطق التوصيل</h1>
        
        <div className="mb-6">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between flex-wrap gap-4">
                <div className="flex items-center">
                  <MapPin className="mr-2 h-5 w-5 text-primary" />
                  <h2 className="text-lg font-semibold">مناطق التوصيل</h2>
                </div>
                
                <Button onClick={handleAddLocation}>
                  <Plus className="mr-2 h-4 w-4" />
                  إضافة منطقة توصيل
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
        
        {loading ? (
          <div className="text-center py-12 border rounded-lg bg-muted/10">
            <p className="text-muted-foreground">جاري تحميل مناطق التوصيل...</p>
          </div>
        ) : locations.length === 0 ? (
          <div className="text-center py-12 border rounded-lg bg-muted/10">
            <MapPin className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-xl font-medium mb-2">لا توجد مناطق توصيل</h3>
            <p className="text-muted-foreground mb-4">
              قم بإضافة مناطق التوصيل لتسهيل إدارة الطلبات والشحن
            </p>
            <Button onClick={handleAddLocation}>
              <Plus className="mr-2 h-4 w-4" />
              إضافة منطقة توصيل
            </Button>
          </div>
        ) : (
          <HierarchicalLocations locations={locations} onLocationUpdated={loadLocations} />
        )}

        {selectedProviderId && (
          <DeliveryLocationDialog 
            open={showAddLocationDialog}
            onOpenChange={setShowAddLocationDialog}
            providerId={selectedProviderId}
            onSuccess={loadLocations}
          />
        )}
      </div>
    </MainLayout>
  );
}
