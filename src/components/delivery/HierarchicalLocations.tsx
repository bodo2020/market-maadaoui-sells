import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { 
  MapPin, 
  Building, 
  Home, 
  Landmark,
  ChevronRight,
  Plus,
  Edit2,
  Trash2
} from "lucide-react";
import { 
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
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
import { DeliveryLocation } from "@/types/shipping";
import { deleteDeliveryLocation, fetchDeliveryTypePricing } from "@/services/supabase/deliveryService";

interface GroupedLocations {
  [governorate: string]: {
    [city: string]: {
      [area: string]: DeliveryLocation[];
    };
  };
}

interface HierarchicalLocationsProps {
  locations: DeliveryLocation[];
  onLocationUpdated?: () => void;
}

export default function HierarchicalLocations({ 
  locations,
  onLocationUpdated
}: HierarchicalLocationsProps) {
  const [locationToDelete, setLocationToDelete] = useState<string | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deliveryPricing, setDeliveryPricing] = useState<{[key: string]: any}>({});

  const groupLocationsByHierarchy = (locations: DeliveryLocation[]) => {
    const grouped: GroupedLocations = {};
    
    locations.forEach(location => {
      const governorate = location.governorate || "عام";
      const city = location.city || "عام";
      const area = location.area || "عام";
      
      if (!grouped[governorate]) {
        grouped[governorate] = {};
      }
      
      if (!grouped[governorate][city]) {
        grouped[governorate][city] = {};
      }
      
      if (!grouped[governorate][city][area]) {
        grouped[governorate][city][area] = [];
      }
      
      if (location.neighborhood) {
        grouped[governorate][city][area].push(location);
      }
    });
    
    return grouped;
  };

  const groupedLocations = groupLocationsByHierarchy(locations);

  useEffect(() => {
    const loadPricingForLocations = async () => {
      const pricingData: {[key: string]: any} = {};
      
      for (const location of locations) {
        try {
          const pricing = await fetchDeliveryTypePricing(location.id);
          pricingData[location.id] = pricing;
        } catch (error) {
          console.error(`Error loading pricing for location ${location.id}:`, error);
        }
      }
      
      setDeliveryPricing(pricingData);
    };
    
    if (locations.length > 0) {
      loadPricingForLocations();
    }
  }, [locations]);

  const handleDeleteLocation = async () => {
    if (!locationToDelete) return;
    
    try {
      await deleteDeliveryLocation(locationToDelete);
      toast.success("تم حذف منطقة التوصيل بنجاح");
      if (onLocationUpdated) {
        onLocationUpdated();
      }
    } catch (error) {
      console.error('Error deleting location:', error);
      toast.error("حدث خطأ أثناء حذف منطقة التوصيل");
    } finally {
      setDeleteDialogOpen(false);
      setLocationToDelete(null);
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center">
            <MapPin className="mr-2 h-5 w-5" />
            <span>مناطق التوصيل</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {Object.keys(groupedLocations).length === 0 ? (
            <div className="text-center p-8">
              <p className="text-muted-foreground">لا توجد مناطق توصيل</p>
            </div>
          ) : (
            <Accordion type="single" collapsible className="w-full">
              {Object.keys(groupedLocations).map(governorate => (
                <AccordionItem key={governorate} value={governorate}>
                  <AccordionTrigger className="hover:bg-gray-50 px-4 py-2 rounded-md text-right font-medium">
                    <div className="flex justify-between items-center w-full">
                      <div className="flex items-center">
                        <Landmark className="mr-2 h-4 w-4 text-primary" />
                        <span>{governorate}</span>
                      </div>
                      <Badge variant="outline">{Object.keys(groupedLocations[governorate]).length} مدينة</Badge>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent>
                    <div className="pl-4 space-y-2">
                      <Accordion type="single" collapsible className="w-full">
                        {Object.keys(groupedLocations[governorate]).map(city => (
                          <AccordionItem key={city} value={city}>
                            <AccordionTrigger className="hover:bg-gray-50 px-4 py-2 rounded-md text-right">
                              <div className="flex justify-between items-center w-full">
                                <div className="flex items-center">
                                  <Building className="mr-2 h-4 w-4 text-primary" />
                                  <span>{city}</span>
                                </div>
                                <Badge variant="outline">{Object.keys(groupedLocations[governorate][city]).length} منطقة</Badge>
                              </div>
                            </AccordionTrigger>
                            <AccordionContent>
                              <div className="pl-4 space-y-2">
                                {Object.keys(groupedLocations[governorate][city]).map(area => (
                                  <div key={area} className="border rounded-md p-3">
                                    <div className="font-medium text-right mb-2 flex items-center">
                                      <Home className="mr-2 h-4 w-4 text-primary" />
                                      <span>{area}</span>
                                    </div>
                                    <div className="space-y-2">
                                      {groupedLocations[governorate][city][area].map(location => (
                                        <div 
                                          key={location.id} 
                                          className="flex justify-between items-center bg-gray-50 p-2 rounded-md"
                                        >
                                          <div className="flex gap-2">
                                            <Button 
                                              variant="outline" 
                                              size="sm"
                                              onClick={() => {
                                                setLocationToDelete(location.id);
                                                setDeleteDialogOpen(true);
                                              }}
                                            >
                                              <Trash2 className="h-4 w-4 text-red-500 mr-1" />
                                              حذف
                                            </Button>
                                            <Button 
                                              variant="outline" 
                                              size="sm"
                                              onClick={() => toast.info("سيتم إضافة ميزة التعديل قريبًا")}
                                            >
                                              <Edit2 className="h-4 w-4 mr-1" />
                                              تعديل
                                            </Button>
                                          </div>
                                          <div className="text-right">
                                            {location.neighborhood && (
                                              <div className="text-sm font-medium">{location.neighborhood}</div>
                                            )}
                                            <div className="space-y-1">
                                              {deliveryPricing[location.id]?.map((pricing: any) => (
                                                <div key={pricing.delivery_type_id} className="flex justify-between items-center text-sm">
                                                  <span className="text-gray-600">{pricing.delivery_types.name}:</span>
                                                  <span className="font-medium text-primary">{pricing.price} ج.م</span>
                                                </div>
                                              ))}
                                            </div>
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
          )}
        </CardContent>
      </Card>

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
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
