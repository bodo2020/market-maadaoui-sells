
import { useState, useEffect } from "react";
import MainLayout from "@/components/layout/MainLayout";
import { Button } from "@/components/ui/button";
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "sonner";
import { MapPin, Truck, Plus } from "lucide-react";
import { fetchShippingProviders, createShippingProvider } from "@/services/supabase/deliveryService";
import { ShippingProvider } from "@/types/shipping";
import HierarchicalLocations from "@/components/delivery/HierarchicalLocations";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";

export default function DeliveryLocationsPage() {
  const [providers, setProviders] = useState<ShippingProvider[]>([]);
  const [selectedProvider, setSelectedProvider] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [addProviderOpen, setAddProviderOpen] = useState(false);
  const [newProviderName, setNewProviderName] = useState("");

  const loadProviders = async () => {
    try {
      setLoading(true);
      const data = await fetchShippingProviders();
      setProviders(data);
      
      if (data.length > 0 && !selectedProvider) {
        setSelectedProvider(data[0].id);
      }
    } catch (error) {
      console.error("Error loading shipping providers:", error);
      toast.error("حدث خطأ أثناء تحميل شركات الشحن");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadProviders();
  }, []);

  const handleAddProvider = async () => {
    if (!newProviderName.trim()) {
      toast.error("الرجاء إدخال اسم شركة الشحن");
      return;
    }

    try {
      const newProvider = await createShippingProvider({
        name: newProviderName.trim(),
        active: true
      });
      
      toast.success("تمت إضافة شركة الشحن بنجاح");
      setAddProviderOpen(false);
      setNewProviderName("");
      
      // Reload providers and select the new one
      await loadProviders();
      setSelectedProvider(newProvider.id);
    } catch (error) {
      console.error("Error adding provider:", error);
      toast.error("حدث خطأ أثناء إضافة شركة الشحن");
    }
  };

  const selectedProviderName = selectedProvider 
    ? providers.find(p => p.id === selectedProvider)?.name 
    : undefined;

  return (
    <MainLayout>
      <div className="container py-6">
        <h1 className="text-2xl font-bold mb-6">إدارة مناطق التوصيل</h1>
        
        <div className="mb-6">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center flex-wrap gap-4">
                <div className="flex items-center">
                  <Truck className="mr-2 h-5 w-5 text-primary" />
                  <h2 className="text-lg font-semibold">شركات الشحن</h2>
                </div>
                
                <div className="flex flex-1 items-center gap-4">
                  <Select 
                    value={selectedProvider || ""} 
                    onValueChange={setSelectedProvider} 
                    disabled={loading || providers.length === 0}
                  >
                    <SelectTrigger className="w-[250px]">
                      <SelectValue placeholder="اختر شركة الشحن" />
                    </SelectTrigger>
                    <SelectContent>
                      {providers.map(provider => (
                        <SelectItem key={provider.id} value={provider.id}>
                          {provider.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  
                  <Button onClick={() => setAddProviderOpen(true)}>
                    <Plus className="mr-2 h-4 w-4" />
                    إضافة شركة شحن
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
        
        {selectedProvider ? (
          <HierarchicalLocations 
            providerId={selectedProvider} 
            providerName={selectedProviderName}
          />
        ) : (
          <div className="text-center py-12 border rounded-lg bg-muted/10">
            <MapPin className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-xl font-medium mb-2">لا توجد شركات شحن</h3>
            <p className="text-muted-foreground mb-4">
              قم بإضافة شركة شحن أولاً لإدارة مناطق التوصيل
            </p>
            <Button onClick={() => setAddProviderOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />
              إضافة شركة شحن
            </Button>
          </div>
        )}
      </div>
      
      {/* Add Provider Dialog */}
      <Dialog open={addProviderOpen} onOpenChange={setAddProviderOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>إضافة شركة شحن جديدة</DialogTitle>
            <DialogDescription>
              أدخل اسم شركة الشحن التي تريد إضافتها
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="providerName">اسم شركة الشحن</Label>
              <Input 
                id="providerName"
                value={newProviderName}
                onChange={(e) => setNewProviderName(e.target.value)}
                placeholder="مثال: شركة التوصيل السريع"
              />
            </div>
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddProviderOpen(false)}>
              إلغاء
            </Button>
            <Button onClick={handleAddProvider}>
              إضافة
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </MainLayout>
  );
}
