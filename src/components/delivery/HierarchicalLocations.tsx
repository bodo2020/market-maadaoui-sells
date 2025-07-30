
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Plus, Trash2, ChevronDown } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { 
  fetchGovernorates, 
  fetchCities, 
  fetchAreas, 
  fetchNeighborhoods,
  createCity,
  createArea,
  createNeighborhood,
  deleteGovernorate,
  deleteCity,
  deleteArea,
  deleteNeighborhood
} from "@/services/supabase/deliveryService";
import DeliveryLocationDialog from "./DeliveryLocationDialog";
import DeliveryTypePricing from "./DeliveryTypePricing";
import { useBranch } from "@/contexts/BranchContext";
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

export default function HierarchicalLocations() {
  const queryClient = useQueryClient();
  const { currentBranch } = useBranch();
  const [selectedGovernorate, setSelectedGovernorate] = useState<string | null>(null);
  const [selectedCity, setSelectedCity] = useState<string | null>(null);
  const [selectedArea, setSelectedArea] = useState<string | null>(null);
  const [openDialog, setOpenDialog] = useState(false);
  const [dialogMode, setDialogMode] = useState<'city' | 'area' | 'neighborhood'>('city');
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [locationToDelete, setLocationToDelete] = useState<{id: string, type: string} | null>(null);

  // Fetch governorates
  const { data: governorates = [], isLoading: governoratesLoading } = useQuery({
    queryKey: ["governorates"],
    queryFn: fetchGovernorates
  });

  // Fetch cities for selected governorate
  const { data: cities = [], isLoading: citiesLoading } = useQuery({
    queryKey: ["cities", selectedGovernorate],
    queryFn: () => selectedGovernorate ? fetchCities(selectedGovernorate) : Promise.resolve([]),
    enabled: !!selectedGovernorate
  });

  // Fetch areas for selected city
  const { data: areas = [], isLoading: areasLoading } = useQuery({
    queryKey: ["areas", selectedCity],
    queryFn: () => selectedCity ? fetchAreas(selectedCity) : Promise.resolve([]),
    enabled: !!selectedCity
  });

  // Fetch neighborhoods for selected area
  const { data: neighborhoods = [], isLoading: neighborhoodsLoading } = useQuery({
    queryKey: ["neighborhoods", selectedArea],
    queryFn: () => selectedArea ? fetchNeighborhoods(selectedArea) : Promise.resolve([]),
    enabled: !!selectedArea
  });

  // Create location mutation
  const createLocationMutation = useMutation({
    mutationFn: async (data: any) => {
      if (dialogMode === 'city') {
        return createCity({
          name: data.name,
          governorate_id: selectedGovernorate!
        });
      } else if (dialogMode === 'area') {
        return createArea({
          name: data.name,
          city_id: selectedCity!
        });
      } else {
        return createNeighborhood({
          name: data.name,
          area_id: selectedArea!,
          price: data.price || 0,
          estimated_time: data.estimated_time,
          branch_id: currentBranch?.id || ''
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["governorates"] });
      
      if (dialogMode === 'city') {
        queryClient.invalidateQueries({ queryKey: ["cities", selectedGovernorate] });
      } else if (dialogMode === 'area') {
        queryClient.invalidateQueries({ queryKey: ["areas", selectedCity] });
      } else {
        queryClient.invalidateQueries({ 
          queryKey: ["neighborhoods", selectedArea] 
        });
      }
      
      toast.success(`تم إضافة ${dialogMode === 'city' ? 'المدينة' : dialogMode === 'area' ? 'المنطقة' : 'الحي'} بنجاح`);
      setOpenDialog(false);
    },
    onError: (error) => {
      console.error("Error creating location:", error);
      toast.error(`حدث خطأ أثناء إضافة ${dialogMode === 'city' ? 'المدينة' : dialogMode === 'area' ? 'المنطقة' : 'الحي'}`);
    }
  });

  // Delete location mutation
  const deleteLocationMutation = useMutation({
    mutationFn: (params: {id: string, type: string}) => {
      const { id, type } = params;
      if (type === 'governorate') {
        return deleteGovernorate(id);
      } else if (type === 'city') {
        return deleteCity(id);
      } else if (type === 'area') {
        return deleteArea(id);
      } else {
        return deleteNeighborhood(id);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["governorates"] });
      
      if (locationToDelete?.type === 'governorate') {
        setSelectedGovernorate(null);
      } else if (locationToDelete?.type === 'city') {
        queryClient.invalidateQueries({ queryKey: ["cities", selectedGovernorate] });
        setSelectedCity(null);
      } else if (locationToDelete?.type === 'area') {
        queryClient.invalidateQueries({ queryKey: ["areas", selectedCity] });
        setSelectedArea(null);
      } else if (locationToDelete?.type === 'neighborhood') {
        queryClient.invalidateQueries({ 
          queryKey: ["neighborhoods", selectedArea] 
        });
      }
      
      toast.success("تم حذف المنطقة بنجاح");
      setLocationToDelete(null);
    },
    onError: (error) => {
      console.error("Error deleting location:", error);
      toast.error("حدث خطأ أثناء حذف المنطقة");
    }
  });

  const handleOpenDialog = (mode: 'city' | 'area' | 'neighborhood') => {
    setDialogMode(mode);
    setOpenDialog(true);
  };

  const handleDeleteLocation = (id: string, type: string) => {
    setLocationToDelete({ id, type });
    setDeleteConfirmOpen(true);
  };

  const confirmDelete = () => {
    if (locationToDelete) {
      deleteLocationMutation.mutate(locationToDelete);
    }
    setDeleteConfirmOpen(false);
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="p-4">
          <Accordion 
            type="single" 
            collapsible 
            className="w-full" 
            dir="rtl"
          >
            {governoratesLoading ? (
              <div className="text-center py-4">جارٍ التحميل...</div>
            ) : governorates.length === 0 ? (
              <div className="text-center py-4">لا توجد محافظات. قم بإضافة محافظة جديدة.</div>
            ) : (
              governorates.map((gov: any) => (
                <AccordionItem key={gov.id} value={gov.id}>
                  <AccordionTrigger 
                    onClick={() => setSelectedGovernorate(gov.id)}
                    className="py-3 hover:bg-muted/50 px-4 rounded-md"
                  >
                    <div className="flex items-center justify-between w-full pl-4">
                      <div className="flex items-center gap-2">
                        <Badge className="bg-primary/20 text-primary border border-primary/20">محافظة</Badge>
                        <span>{gov.name}</span>
                      </div>
                      <div className="flex items-center">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="ml-2 h-8 w-8 text-destructive"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteLocation(gov.id, 'governorate');
                          }}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent className="pl-6">
                    <div className="flex justify-between mb-2 pt-2">
                      <h3 className="text-sm font-medium">المدن</h3>
                      <Button 
                        variant="outline" 
                        size="sm" 
                        onClick={() => handleOpenDialog('city')}
                        className="text-xs h-7"
                      >
                        <Plus className="ml-1 h-3 w-3" />
                        إضافة مدينة
                      </Button>
                    </div>
                    
                    {citiesLoading ? (
                      <div className="text-center py-2">جارٍ التحميل...</div>
                    ) : cities.length === 0 ? (
                      <div className="text-center py-2 text-muted-foreground text-sm">
                        لا توجد مدن. قم بإضافة مدينة جديدة.
                      </div>
                    ) : (
                      <div className="space-y-1 mr-4">
                        {cities.map((city: any) => (
                          <div key={city.id} className="border-r pr-4 mb-4 border-r-primary/20">
                            <div 
                              className="cursor-pointer hover:bg-muted/50 p-2 rounded flex justify-between items-center"
                              onClick={() => {
                                setSelectedCity(city.id);
                                setSelectedArea(null);
                              }}
                            >
                              <div className="flex items-center gap-2">
                                <Badge variant="outline">مدينة</Badge>
                                <span className="text-sm">{city.name}</span>
                              </div>
                              <div className="flex items-center">
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="ml-1 h-7 w-7 text-destructive"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleDeleteLocation(city.id, 'city');
                                  }}
                                >
                                  <Trash2 className="h-3 w-3" />
                                </Button>
                                <ChevronDown 
                                  className={`h-4 w-4 transition-transform mr-1 ${
                                    selectedCity === city.id ? 'transform rotate-180' : ''
                                  }`} 
                                />
                              </div>
                            </div>
                            
                            {selectedCity === city.id && (
                              <div className="mr-6 mt-2">
                                <div className="flex justify-between mb-2">
                                  <h4 className="text-sm font-medium">المناطق</h4>
                                  <Button 
                                    variant="outline" 
                                    size="sm" 
                                    onClick={() => handleOpenDialog('area')}
                                    className="text-xs h-7"
                                  >
                                    <Plus className="ml-1 h-3 w-3" />
                                    إضافة منطقة
                                  </Button>
                                </div>
                                
                                {areasLoading ? (
                                  <div className="text-center py-2">جارٍ التحميل...</div>
                                ) : areas.length === 0 ? (
                                  <div className="text-center py-2 text-muted-foreground text-sm">
                                    لا توجد مناطق. قم بإضافة منطقة جديدة.
                                  </div>
                                ) : (
                                  <div className="space-y-1 border-r pr-4 border-r-primary/10">
                                    {areas.map((area: any) => (
                                      <div key={area.id} className="mb-4">
                                        <div 
                                          className="cursor-pointer hover:bg-muted/50 p-2 rounded flex justify-between items-center"
                                          onClick={() => setSelectedArea(area.id)}
                                        >
                                          <div className="flex items-center gap-2">
                                            <Badge variant="secondary">منطقة</Badge>
                                            <span className="text-sm">{area.name}</span>
                                          </div>
                                          <div className="flex items-center">
                                            <Button
                                              variant="ghost"
                                              size="icon"
                                              className="ml-1 h-7 w-7 text-destructive"
                                              onClick={(e) => {
                                                e.stopPropagation();
                                                handleDeleteLocation(area.id, 'area');
                                              }}
                                            >
                                              <Trash2 className="h-3 w-3" />
                                            </Button>
                                            <ChevronDown 
                                              className={`h-4 w-4 transition-transform mr-1 ${
                                                selectedArea === area.id ? 'transform rotate-180' : ''
                                              }`} 
                                            />
                                          </div>
                                        </div>
                                        
                                        {selectedArea === area.id && (
                                          <div className="mr-6 mt-2">
                                            <div className="flex justify-between mb-2">
                                              <h5 className="text-sm font-medium">الأحياء</h5>
                                              <Button 
                                                variant="outline" 
                                                size="sm" 
                                                onClick={() => handleOpenDialog('neighborhood')}
                                                className="text-xs h-7"
                                              >
                                                <Plus className="ml-1 h-3 w-3" />
                                                إضافة حي
                                              </Button>
                                            </div>
                                            
                                            {neighborhoodsLoading ? (
                                              <div className="text-center py-2">جارٍ التحميل...</div>
                                            ) : neighborhoods.length === 0 ? (
                                              <div className="text-center py-2 text-muted-foreground text-sm">
                                                لا توجد أحياء. قم بإضافة حي جديد.
                                              </div>
                                            ) : (
                                              <div className="space-y-1 border-r pr-4 border-r-primary/10">
                                                {neighborhoods.map((neighborhood: any) => (
                                                  <div 
                                                    key={neighborhood.id} 
                                                    className="hover:bg-muted/50 p-2 rounded mb-1"
                                                  >
                                                    <div className="flex justify-between items-center">
                                                      <div className="flex items-center gap-2">
                                                        <Badge variant="secondary" className="bg-primary/10">حي</Badge>
                                                        <span className="text-sm">{neighborhood.name}</span>
                                                      </div>
                                                      <div className="flex items-center gap-2">
                                                        <span className="text-xs text-muted-foreground">
                                                          {neighborhood.price} ج.م
                                                        </span>
                                                        <Button
                                                          variant="ghost"
                                                          size="icon"
                                                          className="h-7 w-7 text-destructive"
                                                          onClick={() => handleDeleteLocation(neighborhood.id, 'neighborhood')}
                                                        >
                                                          <Trash2 className="h-3 w-3" />
                                                        </Button>
                                                      </div>
                                                    </div>
                                                    
                                                    {/* Delivery Type Pricing */}
                                                    <div className="mt-2">
                                                      <DeliveryTypePricing locationId={neighborhood.id} />
                                                    </div>
                                                  </div>
                                                ))}
                                              </div>
                                            )}
                                          </div>
                                        )}
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </AccordionContent>
                </AccordionItem>
              ))
            )}
          </Accordion>
        </CardContent>
      </Card>

      {/* Location Dialog */}
      {openDialog && (
        <DeliveryLocationDialog
          open={openDialog}
          onOpenChange={setOpenDialog}
          mode={dialogMode}
          parentId={
            dialogMode === 'city' 
              ? selectedGovernorate!
              : dialogMode === 'area'
                ? selectedCity!
                : selectedArea!
          }
          onSuccess={(data) => createLocationMutation.mutate(data)}
        />
      )}

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>تأكيد الحذف</AlertDialogTitle>
            <AlertDialogDescription>
              هل أنت متأكد من رغبتك في حذف هذه المنطقة؟ هذا الإجراء لا يمكن التراجع عنه.
              {(locationToDelete?.type === 'governorate' || locationToDelete?.type === 'city' || locationToDelete?.type === 'area') && (
                <p className="mt-2 text-destructive font-semibold">
                  تحذير: سيتم حذف جميع المناطق التابعة لها أيضاً!
                </p>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-row-reverse gap-2">
            <AlertDialogCancel>إلغاء</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              حذف
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
