
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
import ShippingProviderDialog from "./ShippingProviderDialog";
import { 
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

interface GroupedLocations {
  [governorate: string]: {
    [city: string]: {
      [area: string]: DeliveryLocation[];
    };
  };
}

interface DeliveryLocationsTableProps {
  onAddLocation?: (providerId: string) => void;
}

export default function DeliveryLocationsTable({ onAddLocation }: DeliveryLocationsTableProps) {
  const [providers, setProviders] = useState<ShippingProvider[]>([]);
  const [selectedProvider, setSelectedProvider] = useState<string | null>(null);
  const [locations, setLocations] = useState<DeliveryLocation[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [locationToDelete, setLocationToDelete] = useState<string | null>(null);
  const [showProviderDialog, setShowProviderDialog] = useState(false);

  useEffect(() => {
    loadProviders();
  }, []);

  useEffect(() => {
    if (selectedProvider) {
      loadLocations();
    }
  }, [selectedProvider]);

  const loadProviders = async () => {
    try {
      const data = await fetchShippingProviders();
      // Ensure data conforms to ShippingProvider type
      const typedProviders = (data || []).map(provider => ({
        id: provider.id,
        name: provider.name,
        active: true,
        created_at: provider.created_at,
        updated_at: provider.updated_at,
      }));

      setProviders(typedProviders);
      if (typedProviders.length > 0 && !selectedProvider) {
        setSelectedProvider(typedProviders[0].id);
      }
    } catch (error) {
      console.error('Error loading shipping providers:', error);
      toast.error("حدث خطأ أثناء تحميل شركات الشحن");
    }
  };

  const loadLocations = async () => {
    try {
      setLoading(true);
      const data = await fetchDeliveryLocations();
      const filteredData = selectedProvider
        ? data.filter(loc => loc.provider_id === selectedProvider)
        : data;
      setLocations(filteredData);
    } catch (error) {
      console.error('Error loading delivery locations:', error);
      toast.error("حدث خطأ أثناء تحميل مناطق التوصيل");
    } finally {
      setLoading(false);
    }
  };

  const groupLocationsByHierarchy = (locations: DeliveryLocation[]) => {
    const grouped: GroupedLocations = {};
    
    locations.forEach(location => {
      if (!grouped[location.governorate]) {
        grouped[location.governorate] = {};
      }
      
      if (!grouped[location.governorate][location.city || 'عام']) {
        grouped[location.governorate][location.city || 'عام'] = {};
      }
      
      const area = location.area || 'عام';
      
      if (!grouped[location.governorate][location.city || 'عام'][area]) {
        grouped[location.governorate][location.city || 'عام'][area] = [];
      }
      
      grouped[location.governorate][location.city || 'عام'][area].push(location);
    });
    
    return grouped;
  };

  const handleDeleteConfirm = (id: string) => {
    setLocationToDelete(id);
    setDeleteConfirmOpen(true);
  };

  const handleDeleteLocation = async () => {
    if (!locationToDelete) return;
    
    try {
      await deleteDeliveryLocation(locationToDelete);
      toast.success("تم حذف منطقة التوصيل بنجاح");
      loadLocations();
    } catch (error) {
      console.error('Error deleting location:', error);
      toast.error("حدث خطأ أثناء حذف منطقة التوصيل");
    } finally {
      setDeleteConfirmOpen(false);
      setLocationToDelete(null);
    }
  };

  const groupedLocations = groupLocationsByHierarchy(locations);

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
            <Button onClick={() => onAddLocation && onAddLocation(selectedProvider)}>
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
            <Accordion type="single" collapsible className="w-full">
              {Object.keys(groupedLocations).map(governorate => (
                <AccordionItem key={governorate} value={governorate}>
                  <AccordionTrigger className="hover:bg-gray-50 px-4 py-2 rounded-md text-right font-medium">
                    <div className="flex justify-between items-center w-full">
                      <span>{governorate}</span>
                      <Badge>{Object.keys(groupedLocations[governorate]).length} مدينة</Badge>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent>
                    <div className="pl-4 space-y-2">
                      <Accordion type="single" collapsible className="w-full">
                        {Object.keys(groupedLocations[governorate]).map(city => (
                          <AccordionItem key={city} value={city}>
                            <AccordionTrigger className="hover:bg-gray-50 px-4 py-2 rounded-md text-right">
                              <div className="flex justify-between items-center w-full">
                                <span>{city}</span>
                                <Badge>{Object.keys(groupedLocations[governorate][city]).length} منطقة</Badge>
                              </div>
                            </AccordionTrigger>
                            <AccordionContent>
                              <div className="pl-4 space-y-2">
                                {Object.keys(groupedLocations[governorate][city]).map(area => (
                                  <div key={area} className="border rounded-md p-3">
                                    <div className="font-medium text-right mb-2">{area}</div>
                                    <div className="space-y-2">
                                      {groupedLocations[governorate][city][area].map(location => (
                                        <div 
                                          key={location.id} 
                                          className="flex justify-between items-center bg-gray-50 p-2 rounded-md"
                                        >
                                          <div className="flex gap-2">
                                            <Button 
                                              variant="outline" 
                                              size="icon"
                                              onClick={() => handleDeleteConfirm(location.id)}
                                            >
                                              <Trash2 className="h-4 w-4 text-red-500" />
                                            </Button>
                                            <Button variant="outline" size="icon">
                                              <Pencil className="h-4 w-4" />
                                            </Button>
                                          </div>
                                          <div className="text-right">
                                            {location.neighborhood && (
                                              <div className="text-sm text-gray-600">{location.neighborhood}</div>
                                            )}
                                            <div className="font-medium">{location.price} ج.م</div>
                                            {location.estimated_time && (
                                              <div className="text-sm text-gray-600">{location.estimated_time}</div>
                                            )}
                                          </div>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </AccordionContent>
                          </AccordionItem>
                        ))}
                      </Accordion>
                    </div>
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </div>
        )}
      </div>

      <ShippingProviderDialog
        open={showProviderDialog}
        onOpenChange={setShowProviderDialog}
        onSuccess={loadProviders}
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
            <AlertDialogAction onClick={handleDeleteLocation}>
              حذف
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
