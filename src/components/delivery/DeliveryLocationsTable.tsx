
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Pencil, Trash2, Plus } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  fetchShippingProviders,
  fetchDeliveryLocations,
  deleteDeliveryLocation
} from "@/services/supabase/deliveryService";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ShippingProvider, DeliveryLocation } from "@/types/shipping";
import DeliveryLocationDialog from "./DeliveryLocationDialog";
import ShippingProviderDialog from "./ShippingProviderDialog";

interface GroupedLocations {
  [governorate: string]: {
    [city: string]: {
      [area: string]: DeliveryLocation[];
    };
  };
}

export default function DeliveryLocationsTable() {
  const [providers, setProviders] = useState<ShippingProvider[]>([]);
  const [selectedProvider, setSelectedProvider] = useState<string | null>(null);
  const [locations, setLocations] = useState<DeliveryLocation[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [locationToDelete, setLocationToDelete] = useState<string | null>(null);
  const [showProviderDialog, setShowProviderDialog] = useState(false);
  const [showLocationDialog, setShowLocationDialog] = useState(false);

  useEffect(() => {
    loadProviders();
  }, []);

  useEffect(() => {
    if (selectedProvider) {
      loadLocations(selectedProvider);
    }
  }, [selectedProvider]);

  const loadProviders = async () => {
    try {
      const data = await fetchShippingProviders();
      setProviders(data);
      if (data.length > 0 && !selectedProvider) {
        setSelectedProvider(data[0].id);
      }
    } catch (error) {
      console.error('Error loading shipping providers:', error);
      toast.error("حدث خطأ أثناء تحميل شركات الشحن");
    }
  };

  const loadLocations = async (providerId: string) => {
    try {
      setLoading(true);
      const data = await fetchDeliveryLocations(providerId);
      setLocations(data);
    } catch (error) {
      console.error('Error loading delivery locations:', error);
      toast.error("حدث خطأ أثناء تحميل مناطق التوصيل");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-xl font-bold">إعدادات الشحن المتقدمة</h2>
        <div className="flex gap-2">
          <Button onClick={() => setShowProviderDialog(true)}>
            <Plus className="h-4 w-4 ml-2" />
            إضافة شركة شحن
          </Button>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow p-4">
        <div className="flex items-center gap-4 mb-4">
          <Select
            value={selectedProvider || ""}
            onValueChange={(value) => setSelectedProvider(value)}
          >
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="اختر شركة الشحن" />
            </SelectTrigger>
            <SelectContent>
              {providers.map((provider) => (
                <SelectItem key={provider.id} value={provider.id}>
                  {provider.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {selectedProvider && (
            <Button onClick={() => setShowLocationDialog(true)}>
              <Plus className="h-4 w-4 ml-2" />
              إضافة منطقة جديدة
            </Button>
          )}
        </div>

        {loading ? (
          <div className="text-center p-4">جاري التحميل...</div>
        ) : !selectedProvider ? (
          <div className="text-center p-4">الرجاء اختيار شركة شحن</div>
        ) : locations.length === 0 ? (
          <div className="text-center p-4">لا توجد مناطق توصيل مضافة</div>
        ) : (
          <div className="space-y-4">
            {/* Here we'll add the nested structure for locations */}
          </div>
        )}
      </div>

      <ShippingProviderDialog
        open={showProviderDialog}
        onOpenChange={setShowProviderDialog}
        onSuccess={loadProviders}
      />

      <DeliveryLocationDialog
        open={showLocationDialog}
        onOpenChange={setShowLocationDialog}
        providerId={selectedProvider || ""}
        onSuccess={() => loadLocations(selectedProvider!)}
      />

      <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>هل أنت متأكد من حذف منطقة التوصيل؟</AlertDialogTitle>
            <AlertDialogDescription>
              لا يمكن التراجع عن هذا الإجراء بعد تنفيذه.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>إلغاء</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (locationToDelete) {
                  deleteDeliveryLocation(locationToDelete);
                  loadLocations(selectedProvider!);
                  setDeleteConfirmOpen(false);
                }
              }}
            >
              حذف
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
