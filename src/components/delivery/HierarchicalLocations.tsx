
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  fetchGovernorates,
  fetchCities,
  fetchAreas,
  fetchNeighborhoods,
  deleteDeliveryLocation
} from "@/services/supabase/deliveryService";
import DeliveryLocationDialog from "./DeliveryLocationDialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";

export default function HierarchicalLocations() {
  const [governorates, setGovernorates] = useState<{ id: string; governorate: string }[]>([]);
  const [citiesByGovernorate, setCitiesByGovernorate] = useState<{ [key: string]: { id: string; city: string }[] }>({});
  const [areasByCity, setAreasByCity] = useState<{ [key: string]: { id: string; area: string }[] }>({});
  const [neighborhoodsByArea, setNeighborhoodsByArea] = useState<{ [key: string]: { id: string; neighborhood: string, price: number, estimated_time?: string }[] }>({});
  
  const [showDialog, setShowDialog] = useState(false);
  const [dialogMode, setDialogMode] = useState<'governorate' | 'city' | 'area' | 'neighborhood'>('governorate');
  const [selectedParent, setSelectedParent] = useState<{
    governorate?: string;
    city?: string;
    area?: string;
  }>({});

  useEffect(() => {
    loadGovernorates();
  }, []);

  const loadGovernorates = async () => {
    try {
      const data = await fetchGovernorates();
      setGovernorates(data);
    } catch (error) {
      console.error('Error loading governorates:', error);
      toast.error("حدث خطأ أثناء تحميل المحافظات");
    }
  };

  const loadCities = async (governorate: string) => {
    try {
      const data = await fetchCities(governorate);
      setCitiesByGovernorate(prev => ({ ...prev, [governorate]: data }));
    } catch (error) {
      console.error('Error loading cities:', error);
      toast.error("حدث خطأ أثناء تحميل المدن");
    }
  };

  const loadAreas = async (governorate: string, city: string) => {
    try {
      const data = await fetchAreas(governorate, city);
      setAreasByCity(prev => ({ ...prev, [`${governorate}-${city}`]: data }));
    } catch (error) {
      console.error('Error loading areas:', error);
      toast.error("حدث خطأ أثناء تحميل المناطق");
    }
  };

  const loadNeighborhoods = async (governorate: string, city: string, area: string) => {
    try {
      const data = await fetchNeighborhoods(governorate, city, area);
      setNeighborhoodsByArea(prev => ({ ...prev, [`${governorate}-${city}-${area}`]: data }));
    } catch (error) {
      console.error('Error loading neighborhoods:', error);
      toast.error("حدث خطأ أثناء تحميل الأحياء");
    }
  };

  const handleAddClick = (mode: 'governorate' | 'city' | 'area' | 'neighborhood', parentData?: {
    governorate?: string;
    city?: string;
    area?: string;
  }) => {
    setDialogMode(mode);
    setSelectedParent(parentData || {});
    setShowDialog(true);
  };

  const handleSuccess = () => {
    setShowDialog(false);
    loadGovernorates();
    if (selectedParent.governorate) {
      loadCities(selectedParent.governorate);
      if (selectedParent.city) {
        loadAreas(selectedParent.governorate, selectedParent.city);
        if (selectedParent.area) {
          loadNeighborhoods(selectedParent.governorate, selectedParent.city, selectedParent.area);
        }
      }
    }
  };

  const handleDelete = async (id: string, level: string, parentInfo?: {
    governorate?: string;
    city?: string;
    area?: string;
  }) => {
    try {
      await deleteDeliveryLocation(id);
      toast.success("تم حذف المنطقة بنجاح");
      
      // Reload the appropriate level based on what was deleted
      if (level === 'governorate') {
        loadGovernorates();
      } else if (level === 'city' && parentInfo?.governorate) {
        loadCities(parentInfo.governorate);
      } else if (level === 'area' && parentInfo?.governorate && parentInfo?.city) {
        loadAreas(parentInfo.governorate, parentInfo.city);
      } else if (level === 'neighborhood' && parentInfo?.governorate && parentInfo?.city && parentInfo?.area) {
        loadNeighborhoods(parentInfo.governorate, parentInfo.city, parentInfo.area);
      }
    } catch (error) {
      console.error('Error deleting location:', error);
      toast.error("حدث خطأ أثناء حذف المنطقة");
    }
  };

  return (
    <div className="space-y-4" dir="rtl">
      <div className="flex justify-end mb-4">
        <Button onClick={() => handleAddClick('governorate')}>
          <Plus className="ml-2 h-4 w-4" />
          إضافة محافظة
        </Button>
      </div>
      
      <Accordion type="multiple" className="w-full">
        {governorates.map(({ id, governorate }) => (
          <AccordionItem key={id} value={governorate}>
            <AccordionTrigger
              onClick={() => {
                if (!citiesByGovernorate[governorate]) {
                  loadCities(governorate);
                }
              }}
              className="text-right"
            >
              <div className="flex items-center justify-between w-full">
                <span>{governorate}</span>
                <div className="flex items-center gap-2">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleAddClick('city', { governorate });
                    }}
                  >
                    <Plus className="h-4 w-4" />
                  </Button>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-red-500"
                        onClick={(e) => {
                          e.stopPropagation();
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>تأكيد الحذف</AlertDialogTitle>
                        <AlertDialogDescription>
                          هل أنت متأكد من حذف المحافظة "{governorate}"؟
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>إلغاء</AlertDialogCancel>
                        <AlertDialogAction 
                          onClick={() => handleDelete(id, 'governorate')}
                          className="bg-red-500 hover:bg-red-600"
                        >
                          حذف
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </div>
            </AccordionTrigger>
            <AccordionContent>
              <div className="pr-4 space-y-2">
                {citiesByGovernorate[governorate]?.map(({ id: cityId, city }) => (
                  <AccordionItem key={cityId} value={`${governorate}-${city}`}>
                    <AccordionTrigger
                      onClick={() => {
                        if (!areasByCity[`${governorate}-${city}`]) {
                          loadAreas(governorate, city);
                        }
                      }}
                      className="text-right"
                    >
                      <div className="flex items-center justify-between w-full">
                        <span>{city}</span>
                        <div className="flex items-center gap-2">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleAddClick('area', { governorate, city });
                            }}
                          >
                            <Plus className="h-4 w-4" />
                          </Button>
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-red-500"
                                onClick={(e) => {
                                  e.stopPropagation();
                                }}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>تأكيد الحذف</AlertDialogTitle>
                                <AlertDialogDescription>
                                  هل أنت متأكد من حذف المدينة "{city}"؟
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>إلغاء</AlertDialogCancel>
                                <AlertDialogAction 
                                  onClick={() => handleDelete(cityId, 'city', { governorate })}
                                  className="bg-red-500 hover:bg-red-600"
                                >
                                  حذف
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </div>
                      </div>
                    </AccordionTrigger>
                    <AccordionContent>
                      <div className="pr-4 space-y-2">
                        {areasByCity[`${governorate}-${city}`]?.map(({ id: areaId, area }) => (
                          <AccordionItem key={areaId} value={`${governorate}-${city}-${area}`}>
                            <AccordionTrigger
                              onClick={() => {
                                if (!neighborhoodsByArea[`${governorate}-${city}-${area}`]) {
                                  loadNeighborhoods(governorate, city, area);
                                }
                              }}
                              className="text-right"
                            >
                              <div className="flex items-center justify-between w-full">
                                <span>{area}</span>
                                <div className="flex items-center gap-2">
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleAddClick('neighborhood', { governorate, city, area });
                                    }}
                                  >
                                    <Plus className="h-4 w-4" />
                                  </Button>
                                  <AlertDialog>
                                    <AlertDialogTrigger asChild>
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-8 w-8 text-red-500"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                        }}
                                      >
                                        <Trash2 className="h-4 w-4" />
                                      </Button>
                                    </AlertDialogTrigger>
                                    <AlertDialogContent>
                                      <AlertDialogHeader>
                                        <AlertDialogTitle>تأكيد الحذف</AlertDialogTitle>
                                        <AlertDialogDescription>
                                          هل أنت متأكد من حذف المنطقة "{area}"؟
                                        </AlertDialogDescription>
                                      </AlertDialogHeader>
                                      <AlertDialogFooter>
                                        <AlertDialogCancel>إلغاء</AlertDialogCancel>
                                        <AlertDialogAction 
                                          onClick={() => handleDelete(areaId, 'area', { governorate, city })}
                                          className="bg-red-500 hover:bg-red-600"
                                        >
                                          حذف
                                        </AlertDialogAction>
                                      </AlertDialogFooter>
                                    </AlertDialogContent>
                                  </AlertDialog>
                                </div>
                              </div>
                            </AccordionTrigger>
                            <AccordionContent>
                              <div className="pr-4 space-y-2">
                                {neighborhoodsByArea[`${governorate}-${city}-${area}`]?.map((neighborhood) => (
                                  <div
                                    key={neighborhood.id}
                                    className="flex items-center justify-between p-2 border rounded-lg"
                                  >
                                    <div className="text-right">
                                      <div className="font-medium">{neighborhood.neighborhood}</div>
                                      <div className="text-sm text-muted-foreground">
                                        السعر: {neighborhood.price} ج.م
                                      </div>
                                      {neighborhood.estimated_time && (
                                        <div className="text-sm text-muted-foreground">
                                          الوقت المقدر: {neighborhood.estimated_time}
                                        </div>
                                      )}
                                    </div>
                                    <AlertDialog>
                                      <AlertDialogTrigger asChild>
                                        <Button
                                          variant="ghost"
                                          size="icon"
                                          className="h-8 w-8 text-red-500"
                                        >
                                          <Trash2 className="h-4 w-4" />
                                        </Button>
                                      </AlertDialogTrigger>
                                      <AlertDialogContent>
                                        <AlertDialogHeader>
                                          <AlertDialogTitle>تأكيد الحذف</AlertDialogTitle>
                                          <AlertDialogDescription>
                                            هل أنت متأكد من حذف الحي "{neighborhood.neighborhood}"؟
                                          </AlertDialogDescription>
                                        </AlertDialogHeader>
                                        <AlertDialogFooter>
                                          <AlertDialogCancel>إلغاء</AlertDialogCancel>
                                          <AlertDialogAction 
                                            onClick={() => handleDelete(neighborhood.id, 'neighborhood', { governorate, city, area })}
                                            className="bg-red-500 hover:bg-red-600"
                                          >
                                            حذف
                                          </AlertDialogAction>
                                        </AlertDialogFooter>
                                      </AlertDialogContent>
                                    </AlertDialog>
                                  </div>
                                ))}
                              </div>
                            </AccordionContent>
                          </AccordionItem>
                        ))}
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                ))}
              </div>
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>

      <DeliveryLocationDialog
        open={showDialog}
        onOpenChange={setShowDialog}
        mode={dialogMode}
        parentData={selectedParent}
        onSuccess={handleSuccess}
      />
    </div>
  );
}
