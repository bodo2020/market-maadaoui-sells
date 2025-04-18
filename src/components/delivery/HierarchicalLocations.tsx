import { useState, useEffect } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Plus, Edit, Trash2, ChevronDown, ChevronRight, MapPin } from "lucide-react";
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { 
  fetchDeliveryLocations, 
  fetchGovernorates,
  fetchCities,
  fetchAreas,
  fetchNeighborhoods,
  createGovernorate,
  createCity,
  createArea,
  createNeighborhood,
  deleteDeliveryLocation
} from "@/services/supabase/deliveryService";
import { DeliveryLocation, ShippingProvider, DeliveryGovernorate, DeliveryCity, DeliveryArea, DeliveryNeighborhood } from "@/types/shipping";
import { siteConfig } from "@/config/site"; // Import siteConfig

interface HierarchicalLocationsProps {
  providerId: string;
  providerName?: string;
}

export default function HierarchicalLocations({ providerId, providerName }: HierarchicalLocationsProps) {
  const [governorates, setGovernorates] = useState<DeliveryGovernorate[]>([]);
  const [loading, setLoading] = useState(true);
  const [openDeleteDialog, setOpenDeleteDialog] = useState(false);
  const [itemToDelete, setItemToDelete] = useState<{ id: string; type: string; name: string } | null>(null);
  
  // Dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogType, setDialogType] = useState<'governorate' | 'city' | 'area' | 'neighborhood'>('governorate');
  const [dialogParent, setDialogParent] = useState<{ governorate?: string; city?: string; area?: string }>({});
  const [dialogData, setDialogData] = useState<{ name: string; price?: number; estimated_time?: string }>({ 
    name: '',
    price: 0,
    estimated_time: ''
  });

  // Load hierarchical data
  const loadData = async () => {
    try {
      setLoading(true);
      
      // First fetch all governorates
      const govData = await fetchGovernorates(providerId);
      const tempGovernorates: DeliveryGovernorate[] = [];
      
      // For each governorate, get cities
      for (const gov of govData) {
        const cities: DeliveryCity[] = [];
        const cityData = await fetchCities(providerId, gov.governorate);
        
        // For each city, get areas
        for (const city of cityData) {
          const areas: DeliveryArea[] = [];
          const areaData = await fetchAreas(providerId, gov.governorate, city.city);
          
          // For each area, get neighborhoods
          for (const area of areaData) {
            const neighborhoodData = await fetchNeighborhoods(providerId, gov.governorate, city.city, area.area);
            
            areas.push({
              name: area.area,
              neighborhoods: neighborhoodData.map(n => ({
                id: n.id,
                name: n.neighborhood,
                price: n.price,
                estimated_time: n.estimated_time
              }))
            });
          }
          
          cities.push({
            name: city.city,
            areas: areas
          });
        }
        
        tempGovernorates.push({
          name: gov.governorate,
          cities: cities
        });
      }
      
      setGovernorates(tempGovernorates);
    } catch (error) {
      console.error("Error loading delivery locations:", error);
      toast.error("حدث خطأ أثناء تحميل مناطق التوصيل");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (providerId) {
      loadData();
    }
  }, [providerId]);

  const handleOpenAddDialog = (type: 'governorate' | 'city' | 'area' | 'neighborhood', parent?: { governorate?: string; city?: string; area?: string }) => {
    setDialogType(type);
    setDialogParent(parent || {});
    setDialogData({ name: '', price: 0, estimated_time: '' });
    setDialogOpen(true);
  };

  const handleAddItem = async () => {
    try {
      if (!dialogData.name) {
        toast.error("الرجاء إدخال الاسم");
        return;
      }

      if (dialogType === 'neighborhood' && (dialogData.price === undefined || dialogData.price < 0)) {
        toast.error("الرجاء إدخال سعر توصيل صحيح");
        return;
      }

      switch (dialogType) {
        case 'governorate':
          await createGovernorate({
            provider_id: providerId,
            governorate: dialogData.name
          });
          toast.success("تمت إضافة المحافظة بنجاح");
          break;
          
        case 'city':
          if (!dialogParent.governorate) {
            toast.error("خطأ في البيانات المرسلة");
            return;
          }
          await createCity({
            provider_id: providerId,
            governorate: dialogParent.governorate,
            city: dialogData.name
          });
          toast.success("تمت إضافة المدينة بنجاح");
          break;
          
        case 'area':
          if (!dialogParent.governorate || !dialogParent.city) {
            toast.error("خطأ في البيانات المرسلة");
            return;
          }
          await createArea({
            provider_id: providerId,
            governorate: dialogParent.governorate,
            city: dialogParent.city,
            area: dialogData.name
          });
          toast.success("تمت إضافة المنطقة بنجاح");
          break;
          
        case 'neighborhood':
          if (!dialogParent.governorate || !dialogParent.city || !dialogParent.area) {
            toast.error("خطأ في البيانات المرسلة");
            return;
          }
          await createNeighborhood({
            provider_id: providerId,
            governorate: dialogParent.governorate,
            city: dialogParent.city,
            area: dialogParent.area,
            neighborhood: dialogData.name,
            price: dialogData.price || 0,
            estimated_time: dialogData.estimated_time
          });
          toast.success("تمت إضافة الحي بنجاح");
          break;
      }

      setDialogOpen(false);
      loadData();
    } catch (error) {
      console.error(`Error adding ${dialogType}:`, error);
      toast.error(`حدث خطأ أثناء إضافة ${dialogType === 'governorate' ? 'المحافظة' : 
                                         dialogType === 'city' ? 'المدينة' : 
                                         dialogType === 'area' ? 'المنطقة' : 'الحي'}`);
    }
  };

  const handleDeleteConfirm = (id: string, type: string, name: string) => {
    setItemToDelete({ id, type, name });
    setOpenDeleteDialog(true);
  };

  const handleDelete = async () => {
    if (!itemToDelete) return;
    
    try {
      await deleteDeliveryLocation(itemToDelete.id);
      toast.success(`تم حذف ${itemToDelete.type} بنجاح`);
      loadData();
    } catch (error) {
      console.error(`Error deleting ${itemToDelete.type}:`, error);
      toast.error(`حدث خطأ أثناء حذف ${itemToDelete.type}`);
    } finally {
      setOpenDeleteDialog(false);
      setItemToDelete(null);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-32">
        <p className="text-muted-foreground">جاري تحميل مناطق التوصيل...</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-lg font-semibold">
          {providerName ? `مناطق التوصيل - ${providerName}` : 'مناطق التوصيل'}
        </h3>
        <Button onClick={() => handleOpenAddDialog('governorate')}>
          <Plus className="mr-2 h-4 w-4" />
          إضافة محافظة
        </Button>
      </div>

      {governorates.length === 0 ? (
        <Card>
          <CardContent className="pt-6 text-center">
            <MapPin className="mx-auto h-8 w-8 text-muted-foreground mb-2 opacity-50" />
            <p className="text-muted-foreground">لا توجد مناطق توصيل مضافة بعد</p>
            <Button variant="outline" className="mt-4" onClick={() => handleOpenAddDialog('governorate')}>
              <Plus className="mr-2 h-4 w-4" />
              إضافة محافظة جديدة
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Accordion type="multiple" className="w-full space-y-2">
          {governorates.map((governorate) => (
            <AccordionItem 
              key={governorate.name} 
              value={governorate.name} 
              className="border rounded-lg overflow-hidden"
            >
              <AccordionTrigger className="px-4 py-3 hover:bg-muted/50">
                <div className="flex justify-between items-center w-full">
                  <div className="flex items-center">
                    <MapPin className="mr-2 h-4 w-4 text-primary" />
                    <span className="font-semibold">{governorate.name}</span>
                  </div>
                  <Badge>{governorate.cities.length} مدينة</Badge>
                </div>
              </AccordionTrigger>
              <AccordionContent className="px-4 pt-2 pb-4">
                <div className="flex justify-end mb-2">
                  <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={(e) => {
                      e.stopPropagation();
                      handleOpenAddDialog('city', { governorate: governorate.name });
                    }}
                  >
                    <Plus className="mr-2 h-3 w-3" />
                    إضافة مدينة
                  </Button>
                </div>
                
                {governorate.cities.length === 0 ? (
                  <p className="text-center text-muted-foreground text-sm py-2">لا توجد مدن مضافة</p>
                ) : (
                  <Accordion type="multiple" className="w-full space-y-2">
                    {governorate.cities.map((city) => (
                      <AccordionItem 
                        key={city.name} 
                        value={`${governorate.name}-${city.name}`} 
                        className="border rounded-lg overflow-hidden"
                      >
                        <AccordionTrigger className="px-4 py-2 hover:bg-muted/30">
                          <div className="flex justify-between items-center w-full">
                            <span className="font-medium">{city.name}</span>
                            <Badge variant="outline">{city.areas.length} منطقة</Badge>
                          </div>
                        </AccordionTrigger>
                        <AccordionContent className="px-4 pt-2 pb-3">
                          <div className="flex justify-end mb-2">
                            <Button 
                              variant="outline" 
                              size="sm" 
                              onClick={(e) => {
                                e.stopPropagation();
                                handleOpenAddDialog('area', { 
                                  governorate: governorate.name,
                                  city: city.name 
                                });
                              }}
                            >
                              <Plus className="mr-2 h-3 w-3" />
                              إضافة منطقة
                            </Button>
                          </div>
                          
                          {city.areas.length === 0 ? (
                            <p className="text-center text-muted-foreground text-sm py-2">لا توجد مناطق مضافة</p>
                          ) : (
                            <Accordion type="multiple" className="w-full space-y-2">
                              {city.areas.map((area) => (
                                <AccordionItem 
                                  key={area.name} 
                                  value={`${governorate.name}-${city.name}-${area.name}`} 
                                  className="border rounded-lg overflow-hidden"
                                >
                                  <AccordionTrigger className="px-3 py-2 hover:bg-muted/20">
                                    <div className="flex justify-between items-center w-full">
                                      <span>{area.name}</span>
                                      <Badge variant="secondary">{area.neighborhoods.length} حي</Badge>
                                    </div>
                                  </AccordionTrigger>
                                  <AccordionContent className="px-3 pt-2 pb-3">
                                    <div className="flex justify-end mb-2">
                                      <Button 
                                        variant="outline" 
                                        size="sm" 
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          handleOpenAddDialog('neighborhood', { 
                                            governorate: governorate.name,
                                            city: city.name,
                                            area: area.name
                                          });
                                        }}
                                      >
                                        <Plus className="mr-2 h-3 w-3" />
                                        إضافة حي
                                      </Button>
                                    </div>
                                    
                                    {area.neighborhoods.length === 0 ? (
                                      <p className="text-center text-muted-foreground text-sm py-2">لا توجد أحياء مضافة</p>
                                    ) : (
                                      <div className="space-y-2">
                                        {area.neighborhoods.map((neighborhood) => (
                                          <div 
                                            key={neighborhood.id} 
                                            className="flex justify-between items-center p-2 border rounded-md bg-background"
                                          >
                                            <div>
                                              <div className="font-medium">{neighborhood.name}</div>
                                              <div className="text-sm text-muted-foreground">
                                                سعر التوصيل: {neighborhood.price} {siteConfig?.currency || 'ج.م'}
                                                {neighborhood.estimated_time && (
                                                  <span className="mr-2">
                                                    • {neighborhood.estimated_time}
                                                  </span>
                                                )}
                                              </div>
                                            </div>
                                            <div className="flex gap-1">
                                              <Button 
                                                variant="ghost" 
                                                size="icon"
                                                onClick={() => handleDeleteConfirm(
                                                  neighborhood.id, 
                                                  'الحي', 
                                                  neighborhood.name
                                                )}
                                              >
                                                <Trash2 className="h-4 w-4 text-red-500" />
                                              </Button>
                                            </div>
                                          </div>
                                        ))}
                                      </div>
                                    )}
                                  </AccordionContent>
                                </AccordionItem>
                              ))}
                            </Accordion>
                          )}
                        </AccordionContent>
                      </AccordionItem>
                    ))}
                  </Accordion>
                )}
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      )}

      {/* Add dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {dialogType === 'governorate' ? 'إضافة محافظة' : 
               dialogType === 'city' ? 'إضافة مدينة' : 
               dialogType === 'area' ? 'إضافة منطقة' : 'إضافة حي'}
            </DialogTitle>
            <DialogDescription>
              {dialogType === 'governorate' ? 'أدخل اسم المحافظة الجديدة' : 
               dialogType === 'city' ? `أدخل اسم المدينة الجديدة في محافظة ${dialogParent.governorate}` : 
               dialogType === 'area' ? `أدخل اسم المنطقة الجديدة في مدينة ${dialogParent.city}` : 
              `أدخل اسم الحي الجديد في منطقة ${dialogParent.area} وسعر التوصيل`}
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">
                {dialogType === 'governorate' ? 'اسم المحافظة' : 
                 dialogType === 'city' ? 'اسم المدينة' : 
                 dialogType === 'area' ? 'اسم المنطقة' : 'اسم الحي'}
              </Label>
              <Input
                id="name"
                value={dialogData.name}
                onChange={(e) => setDialogData({ ...dialogData, name: e.target.value })}
                placeholder={
                  dialogType === 'governorate' ? 'مثال: القاهرة' : 
                  dialogType === 'city' ? 'مثال: مدينة نصر' : 
                  dialogType === 'area' ? 'مثال: الحي السابع' : 'مثال: زهراء'
                }
              />
            </div>
            
            {dialogType === 'neighborhood' && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="price">سعر التوصيل</Label>
                  <Input
                    id="price"
                    type="number"
                    value={dialogData.price}
                    onChange={(e) => setDialogData({ ...dialogData, price: parseFloat(e.target.value) })}
                  />
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="estimated_time">وقت التوصيل المتوقع (اختياري)</Label>
                  <Input
                    id="estimated_time"
                    value={dialogData.estimated_time}
                    onChange={(e) => setDialogData({ ...dialogData, estimated_time: e.target.value })}
                    placeholder="مثال: 30-45 دقيقة"
                  />
                </div>
              </>
            )}
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>إلغاء</Button>
            <Button onClick={handleAddItem}>إضافة</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation dialog */}
      <AlertDialog open={openDeleteDialog} onOpenChange={setOpenDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>تأكيد الحذف</AlertDialogTitle>
            <AlertDialogDescription>
              {itemToDelete && `هل أنت متأكد من حذف ${itemToDelete.type} "${itemToDelete.name}"؟`}
              <br />
              لا يمكن التراجع عن هذا الإجراء.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>إلغاء</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-red-500 hover:bg-red-600">
              حذف
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
