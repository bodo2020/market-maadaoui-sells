import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { 
  fetchAvailableNeighborhoods, 
  assignNeighborhoodToBranch 
} from "@/services/supabase/deliveryService";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { toast } from "sonner";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { List, Map as MapIcon } from "lucide-react";
import { NeighborhoodMapSelector } from "./NeighborhoodMapSelector";

interface Props {
  branchId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface NeighborhoodSelection {
  id: string;
  name: string;
  price: number;
  estimated_time: string;
  priority: number;
  is_primary: boolean;
  governorate?: string;
  city?: string;
  area?: string;
}

export function SelectNeighborhoodsDialog({ branchId, open, onOpenChange }: Props) {
  const [selectedNeighborhoods, setSelectedNeighborhoods] = useState<Map<string, NeighborhoodSelection>>(new Map());
  const queryClient = useQueryClient();

  const { data: availableNeighborhoods = [], isLoading } = useQuery({
    queryKey: ["available-neighborhoods", branchId],
    queryFn: () => fetchAvailableNeighborhoods(branchId),
    enabled: !!branchId && open,
  });

  const assignMutation = useMutation({
    mutationFn: async () => {
      const promises = Array.from(selectedNeighborhoods.entries()).map(([id, data]) =>
        assignNeighborhoodToBranch({
          branch_id: branchId,
          neighborhood_id: id,
          price: data.price,
          estimated_time: data.estimated_time,
          priority: data.priority,
          is_primary: data.is_primary,
        })
      );
      await Promise.all(promises);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["branch-neighborhoods", branchId] });
      queryClient.invalidateQueries({ queryKey: ["available-neighborhoods", branchId] });
      toast.success("تم إضافة الأحياء بنجاح");
      setSelectedNeighborhoods(new Map());
      onOpenChange(false);
    },
    onError: (error) => {
      console.error("Error assigning neighborhoods:", error);
      toast.error("حدث خطأ أثناء إضافة الأحياء");
    },
  });

  // Group neighborhoods by governorate > city > area
  const groupedNeighborhoods = availableNeighborhoods.reduce((acc: any, neighborhood: any) => {
    const gov = neighborhood.areas?.cities?.governorates;
    const city = neighborhood.areas?.cities;
    const area = neighborhood.areas;
    
    if (!gov || !city || !area) return acc;
    
    if (!acc[gov.id]) {
      acc[gov.id] = { ...gov, cities: {} };
    }
    
    if (!acc[gov.id].cities[city.id]) {
      acc[gov.id].cities[city.id] = { ...city, areas: {} };
    }
    
    if (!acc[gov.id].cities[city.id].areas[area.id]) {
      acc[gov.id].cities[city.id].areas[area.id] = { ...area, neighborhoods: [] };
    }
    
    acc[gov.id].cities[city.id].areas[area.id].neighborhoods.push(neighborhood);
    
    return acc;
  }, {});

  const handleNeighborhoodToggle = (neighborhood: any, checked: boolean) => {
    const neighborhoodId = typeof neighborhood === 'string' ? neighborhood : neighborhood.id;
    const neighborhoodName = typeof neighborhood === 'string' 
      ? availableNeighborhoods.find(n => n.id === neighborhood)?.name || ''
      : neighborhood.name;
    const neighborhoodData = typeof neighborhood === 'string'
      ? availableNeighborhoods.find(n => n.id === neighborhood)
      : neighborhood;

    if (checked) {
      setSelectedNeighborhoods(prev => new Map(prev).set(neighborhoodId, {
        id: neighborhoodId,
        name: neighborhoodName,
        price: 0,
        estimated_time: "30-45 دقيقة",
        priority: 1,
        is_primary: false,
        governorate: neighborhoodData?.areas?.cities?.governorates?.name,
        city: neighborhoodData?.areas?.cities?.name,
        area: neighborhoodData?.areas?.name,
      }));
    } else {
      setSelectedNeighborhoods(prev => {
        const newMap = new Map(prev);
        newMap.delete(neighborhoodId);
        return newMap;
      });
    }
  };

  const updateNeighborhoodData = (neighborhoodId: string, field: keyof NeighborhoodSelection, value: any) => {
    setSelectedNeighborhoods(prev => {
      const newMap = new Map(prev);
      const current = newMap.get(neighborhoodId);
      if (current) {
        newMap.set(neighborhoodId, { ...current, [field]: value });
      }
      return newMap;
    });
  };

  useEffect(() => {
    if (!open) {
      setSelectedNeighborhoods(new Map());
    }
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[95vw] max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>اختر الأحياء للتوصيل</DialogTitle>
        </DialogHeader>
        
        <Tabs defaultValue="list" className="flex-1 flex flex-col overflow-hidden">
          <TabsList className="grid w-full grid-cols-2 mb-4">
            <TabsTrigger value="list" className="gap-2">
              <List className="w-4 h-4" />
              عرض القائمة
            </TabsTrigger>
            <TabsTrigger value="map" className="gap-2">
              <MapIcon className="w-4 h-4" />
              عرض الخريطة
            </TabsTrigger>
          </TabsList>

          <TabsContent value="list" className="flex-1 overflow-hidden">
            <ScrollArea className="h-full">
          {isLoading ? (
            <p className="text-center py-8">جاري التحميل...</p>
          ) : Object.keys(groupedNeighborhoods).length === 0 ? (
            <p className="text-center py-8 text-muted-foreground">
              جميع الأحياء مرتبطة بالفعل بهذا الفرع
            </p>
          ) : (
            <Accordion type="multiple" className="w-full">
              {Object.values(groupedNeighborhoods).map((gov: any) => (
                <AccordionItem key={gov.id} value={gov.id}>
                  <AccordionTrigger>{gov.name}</AccordionTrigger>
                  <AccordionContent>
                    <Accordion type="multiple" className="pr-4">
                      {Object.values(gov.cities).map((city: any) => (
                        <AccordionItem key={city.id} value={city.id}>
                          <AccordionTrigger>{city.name}</AccordionTrigger>
                          <AccordionContent>
                            <Accordion type="multiple" className="pr-4">
                              {Object.values(city.areas).map((area: any) => (
                                <AccordionItem key={area.id} value={area.id}>
                                  <AccordionTrigger>{area.name}</AccordionTrigger>
                                  <AccordionContent className="space-y-4">
                                    {area.neighborhoods.map((neighborhood: any) => {
                                      const isSelected = selectedNeighborhoods.has(neighborhood.id);
                                      const data = selectedNeighborhoods.get(neighborhood.id);
                                      
                                      return (
                                        <div key={neighborhood.id} className="space-y-3 border rounded-lg p-4">
                                          <div className="flex items-center gap-2">
                                             <Checkbox
                                               id={`neighborhood-${neighborhood.id}`}
                                               checked={isSelected}
                                               onCheckedChange={(checked) => 
                                                 handleNeighborhoodToggle(neighborhood, checked as boolean)
                                               }
                                             />
                                            <label
                                              htmlFor={`neighborhood-${neighborhood.id}`}
                                              className="text-sm font-medium cursor-pointer"
                                            >
                                              {neighborhood.name}
                                            </label>
                                          </div>
                                          
                                          {isSelected && data && (
                                            <div className="mr-6 space-y-3 bg-muted/30 p-3 rounded">
                                              <div className="grid grid-cols-2 gap-3">
                                                <div>
                                                  <Label className="text-xs">السعر (ج.م)</Label>
                                                  <Input
                                                    type="number"
                                                    value={data.price}
                                                    onChange={(e) => 
                                                      updateNeighborhoodData(
                                                        neighborhood.id, 
                                                        'price', 
                                                        parseFloat(e.target.value) || 0
                                                      )
                                                    }
                                                    className="h-8"
                                                  />
                                                </div>
                                                
                                                <div>
                                                  <Label className="text-xs">الوقت المتوقع</Label>
                                                  <Input
                                                    type="text"
                                                    placeholder="مثال: 30-45 دقيقة"
                                                    value={data.estimated_time}
                                                    onChange={(e) => 
                                                      updateNeighborhoodData(
                                                        neighborhood.id, 
                                                        'estimated_time', 
                                                        e.target.value
                                                      )
                                                    }
                                                    className="h-8"
                                                  />
                                                </div>
                                              </div>
                                              
                                              <div className="grid grid-cols-2 gap-3">
                                                <div>
                                                  <Label className="text-xs">الأولوية</Label>
                                                  <Input
                                                    type="number"
                                                    value={data.priority}
                                                    onChange={(e) => 
                                                      updateNeighborhoodData(
                                                        neighborhood.id, 
                                                        'priority', 
                                                        parseInt(e.target.value) || 1
                                                      )
                                                    }
                                                    className="h-8"
                                                  />
                                                </div>
                                                
                                                <div className="flex items-center gap-2 pt-5">
                                                  <Checkbox
                                                    id={`primary-${neighborhood.id}`}
                                                    checked={data.is_primary}
                                                    onCheckedChange={(checked) => 
                                                      updateNeighborhoodData(
                                                        neighborhood.id, 
                                                        'is_primary', 
                                                        checked as boolean
                                                      )
                                                    }
                                                  />
                                                  <label
                                                    htmlFor={`primary-${neighborhood.id}`}
                                                    className="text-xs cursor-pointer"
                                                  >
                                                    فرع رئيسي
                                                  </label>
                                                </div>
                                              </div>
                                            </div>
                                          )}
                                        </div>
                                      );
                                    })}
                                  </AccordionContent>
                                </AccordionItem>
                              ))}
                            </Accordion>
                          </AccordionContent>
                        </AccordionItem>
                      ))}
                    </Accordion>
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          )}
            </ScrollArea>
          </TabsContent>

          <TabsContent value="map" className="flex-1 overflow-hidden">
            <NeighborhoodMapSelector
              availableNeighborhoods={availableNeighborhoods}
              selectedNeighborhoods={selectedNeighborhoods}
              onNeighborhoodToggle={handleNeighborhoodToggle}
              onNeighborhoodUpdate={updateNeighborhoodData}
            />
          </TabsContent>
        </Tabs>
        
        <DialogFooter className="mt-4">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            إلغاء
          </Button>
          <Button 
            onClick={() => assignMutation.mutate()}
            disabled={selectedNeighborhoods.size === 0 || assignMutation.isPending}
          >
            {assignMutation.isPending ? "جاري الحفظ..." : `حفظ ${selectedNeighborhoods.size} حي`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
