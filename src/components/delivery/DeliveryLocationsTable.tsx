
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Pencil, Trash2, ChevronDown, Plus } from "lucide-react";
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
import { fetchDeliveryLocations, deleteDeliveryLocation } from "@/services/supabase/deliveryService";
import DeliveryLocationDialog from "./DeliveryLocationDialog";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";

interface DeliveryLocation {
  id: string;
  governorate?: string;
  city?: string;
  area?: string;
  neighborhood?: string;
  name: string;
  price: number;
  estimated_time?: string;
  active: boolean;
  notes?: string;
}

interface GroupedLocations {
  [governorate: string]: {
    [city: string]: {
      [area: string]: DeliveryLocation[];
    };
  };
}

export default function DeliveryLocationsTable() {
  const [locations, setLocations] = useState<DeliveryLocation[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [locationToDelete, setLocationToDelete] = useState<string | null>(null);
  const [editLocation, setEditLocation] = useState<DeliveryLocation | null>(null);

  useEffect(() => {
    loadLocations();
  }, []);

  const loadLocations = async () => {
    try {
      setLoading(true);
      const data = await fetchDeliveryLocations();
      setLocations(data);
    } catch (error) {
      console.error('Error loading delivery locations:', error);
      toast.error("حدث خطأ أثناء تحميل مناطق التوصيل");
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteDeliveryLocation(id);
      toast.success("تم حذف منطقة التوصيل بنجاح");
      await loadLocations();
    } catch (error) {
      console.error('Error deleting delivery location:', error);
      toast.error("حدث خطأ أثناء حذف منطقة التوصيل");
    }
  };

  const groupLocations = (locations: DeliveryLocation[]): GroupedLocations => {
    return locations.reduce((acc, location) => {
      const governorate = location.governorate || "أخرى";
      const city = location.city || "عام";
      const area = location.area || "عام";

      if (!acc[governorate]) {
        acc[governorate] = {};
      }
      if (!acc[governorate][city]) {
        acc[governorate][city] = {};
      }
      if (!acc[governorate][city][area]) {
        acc[governorate][city][area] = [];
      }
      acc[governorate][city][area].push(location);
      return acc;
    }, {} as GroupedLocations);
  };

  if (loading) {
    return <div className="text-center p-4">جاري التحميل...</div>;
  }

  const groupedLocations = groupLocations(locations);

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-xl font-bold">إعدادات الشحن المتقدمة</h2>
        <Button onClick={() => setEditLocation({} as DeliveryLocation)}>
          <Plus className="h-4 w-4 ml-2" />
          أضف/احذف مدن
        </Button>
      </div>
      
      <div className="bg-white rounded-lg shadow">
        <div className="p-4">
          <Switch className="ml-2" /> نشط
          <p className="text-sm text-gray-500 mt-2">
            يسمح لك هذا الخيار بالتعمق أكثر في إعدادات الشحن الخاصة بك وتخصيصها والتحكم فيها بشكل أدق
          </p>
        </div>

        <Accordion type="multiple" className="border-t">
          {Object.entries(groupedLocations).map(([governorate, cities]) => (
            <AccordionItem value={governorate} key={governorate}>
              <AccordionTrigger className="px-4 hover:no-underline">
                <div className="flex items-center justify-between w-full">
                  <span>{governorate}</span>
                  <Badge variant="outline" className="ml-2">
                    {Object.keys(cities).length} مدن
                  </Badge>
                </div>
              </AccordionTrigger>
              <AccordionContent>
                <div className="px-4 pb-2">
                  {Object.entries(cities).map(([city, areas]) => (
                    <Accordion type="multiple" key={city} className="border-0">
                      <AccordionItem value={city}>
                        <AccordionTrigger className="hover:no-underline py-2">
                          <div className="flex items-center justify-between w-full">
                            <span>{city}</span>
                            <Badge variant="outline" className="ml-2">
                              {Object.keys(areas).length} مناطق
                            </Badge>
                          </div>
                        </AccordionTrigger>
                        <AccordionContent>
                          {Object.entries(areas).map(([area, locations]) => (
                            <div key={area} className="py-2">
                              <div className="flex items-center justify-between mb-2">
                                <span className="font-medium">{area}</span>
                              </div>
                              <div className="space-y-2">
                                {locations.map((location) => (
                                  <div
                                    key={location.id}
                                    className="flex items-center justify-between bg-gray-50 p-2 rounded"
                                  >
                                    <div className="flex items-center gap-4">
                                      <Switch
                                        checked={location.active}
                                        onCheckedChange={() => {}}
                                      />
                                      <div>
                                        <div className="font-medium">
                                          {location.neighborhood || area}
                                        </div>
                                        <div className="text-sm text-gray-500">
                                          {location.estimated_time}
                                        </div>
                                      </div>
                                    </div>
                                    <div className="flex items-center gap-4">
                                      <div className="flex items-center">
                                        <Input
                                          type="number"
                                          value={location.price}
                                          className="w-20 text-center"
                                          readOnly
                                        />
                                        <span className="mx-2">ج.م</span>
                                      </div>
                                      <div className="flex gap-2">
                                        <Button
                                          variant="ghost"
                                          size="icon"
                                          onClick={() => setEditLocation(location)}
                                        >
                                          <Pencil className="h-4 w-4" />
                                        </Button>
                                        <Button
                                          variant="ghost"
                                          size="icon"
                                          onClick={() => {
                                            setLocationToDelete(location.id);
                                            setDeleteConfirmOpen(true);
                                          }}
                                        >
                                          <Trash2 className="h-4 w-4 text-destructive" />
                                        </Button>
                                      </div>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          ))}
                        </AccordionContent>
                      </AccordionItem>
                    </Accordion>
                  ))}
                </div>
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </div>

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
                  handleDelete(locationToDelete);
                  setDeleteConfirmOpen(false);
                }
              }}
            >
              حذف
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <DeliveryLocationDialog
        open={editLocation !== null}
        onOpenChange={(open) => !open && setEditLocation(null)}
        location={editLocation || undefined}
      />
    </div>
  );
}
