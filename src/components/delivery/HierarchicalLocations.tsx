
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Plus } from "lucide-react";
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
  fetchNeighborhoods
} from "@/services/supabase/deliveryService";
import DeliveryLocationDialog from "./DeliveryLocationDialog";

export default function HierarchicalLocations() {
  const [governorates, setGovernorates] = useState<{ governorate: string }[]>([]);
  const [citiesByGovernorate, setCitiesByGovernorate] = useState<{ [key: string]: { city: string }[] }>({});
  const [areasByCity, setAreasByCity] = useState<{ [key: string]: { area: string }[] }>({});
  const [neighborhoodsByArea, setNeighborhoodsByArea] = useState<{ [key: string]: { id: string; neighborhood: string, price: number }[] }>({});
  
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

  return (
    <div className="space-y-4">
      <Accordion type="multiple" className="w-full">
        {governorates.map(({ governorate }) => (
          <AccordionItem key={governorate} value={governorate}>
            <AccordionTrigger
              onClick={() => {
                if (!citiesByGovernorate[governorate]) {
                  loadCities(governorate);
                }
              }}
              className="text-right"
            >
              {governorate}
            </AccordionTrigger>
            <AccordionContent>
              <div className="pr-4 space-y-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleAddClick('city', { governorate })}
                >
                  <Plus className="h-4 w-4 ml-2" />
                  إضافة مدينة
                </Button>
                
                {citiesByGovernorate[governorate]?.map(({ city }) => (
                  <AccordionItem key={city} value={`${governorate}-${city}`}>
                    <AccordionTrigger
                      onClick={() => {
                        if (!areasByCity[`${governorate}-${city}`]) {
                          loadAreas(governorate, city);
                        }
                      }}
                      className="text-right"
                    >
                      {city}
                    </AccordionTrigger>
                    <AccordionContent>
                      <div className="pr-4 space-y-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleAddClick('area', { governorate, city })}
                        >
                          <Plus className="h-4 w-4 ml-2" />
                          إضافة منطقة
                        </Button>

                        {areasByCity[`${governorate}-${city}`]?.map(({ area }) => (
                          <AccordionItem key={area} value={`${governorate}-${city}-${area}`}>
                            <AccordionTrigger
                              onClick={() => {
                                if (!neighborhoodsByArea[`${governorate}-${city}-${area}`]) {
                                  loadNeighborhoods(governorate, city, area);
                                }
                              }}
                              className="text-right"
                            >
                              {area}
                            </AccordionTrigger>
                            <AccordionContent>
                              <div className="pr-4 space-y-2">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => handleAddClick('neighborhood', { governorate, city, area })}
                                >
                                  <Plus className="h-4 w-4 ml-2" />
                                  إضافة حي
                                </Button>

                                {neighborhoodsByArea[`${governorate}-${city}-${area}`]?.map((neighborhood) => (
                                  <div
                                    key={neighborhood.id}
                                    className="p-2 border rounded-lg mb-2 text-right"
                                  >
                                    <div className="font-medium">{neighborhood.neighborhood}</div>
                                    <div className="text-sm text-muted-foreground">
                                      السعر: {neighborhood.price} ج.م
                                    </div>
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
