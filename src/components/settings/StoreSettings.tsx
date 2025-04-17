import { useState, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Upload, Image as ImageIcon } from "lucide-react";
import { siteConfig, updateSiteConfig } from "@/config/site";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface SettingsData {
  storeName: string;
  storeAddress: string;
  storePhone: string;
  storeEmail: string;
  logoUrl: string | null;
}

export default function StoreSettings() {
  const [settingsData, setSettingsData] = useState<SettingsData>({
    storeName: "",
    storeAddress: "",
    storePhone: "",
    storeEmail: "",
    logoUrl: null,
  });
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  // Load settings from siteConfig on mount
  useEffect(() => {
    const loadSettings = async () => {
      setLoading(true);
      try {
        // Force refresh from Supabase first
        const { data: storeSettings, error } = await supabase
          .from('store_settings')
          .select('*')
          .limit(1);
          
        if (error) throw error;
        
        // If we have settings from Supabase, use those
        if (storeSettings && storeSettings.length > 0) {
          const settings = storeSettings[0];
          
          setSettingsData({
            storeName: settings.name || "",
            storeAddress: settings.address || "",
            storePhone: settings.phone || "",
            storeEmail: settings.email || "",
            logoUrl: settings.logo_url || null,
          });
          
          console.log("Loaded store settings from Supabase:", settings);
        } else {
          // Otherwise fallback to current siteConfig
          setSettingsData({
            storeName: siteConfig.name || "",
            storeAddress: siteConfig.address || "",
            storePhone: siteConfig.phone || "",
            storeEmail: siteConfig.email || "",
            logoUrl: siteConfig.logoUrl || null,
          });
          
          console.log("No settings found in Supabase, using siteConfig:", siteConfig);
        }
      } catch (error) {
        console.error("Error loading store settings:", error);
        
        // Fallback to siteConfig
        setSettingsData({
          storeName: siteConfig.name || "",
          storeAddress: siteConfig.address || "",
          storePhone: siteConfig.phone || "",
          storeEmail: siteConfig.email || "",
          logoUrl: siteConfig.logoUrl || null,
        });
        
        toast.error("حدث خطأ أثناء تحميل إعدادات المتجر");
      } finally {
        setLoading(false);
      }
    };

    loadSettings();
  }, []);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setSettingsData({ ...settingsData, [name]: value });
  };

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    try {
      setUploading(true);
      
      if (!e.target.files || e.target.files.length === 0) {
        return;
      }
      
      const file = e.target.files[0];
      const fileExt = file.name.split('.').pop();
      const fileName = `logo_${Date.now()}.${fileExt}`;
      const filePath = `${fileName}`;
      
      // Create 'store' bucket if it doesn't exist
      const { data: buckets } = await supabase.storage.listBuckets();
      if (!buckets?.find(bucket => bucket.name === 'store')) {
        const { error: bucketError } = await supabase.storage.createBucket('store', {
          public: true
        });
        if (bucketError) {
          console.error("Error creating bucket:", bucketError);
          throw bucketError;
        }
      }
      
      // Upload the file
      const { error: uploadError } = await supabase.storage
        .from('store')
        .upload(filePath, file, {
          cacheControl: '3600',
          upsert: true
        });
        
      if (uploadError) {
        console.error("Upload error:", uploadError);
        throw uploadError;
      }
      
      // Get the public URL
      const { data } = supabase.storage.from('store').getPublicUrl(filePath);
      
      if (data) {
        setSettingsData({ ...settingsData, logoUrl: data.publicUrl });
        toast.success("تم رفع الشعار بنجاح");
      }
    } catch (error) {
      console.error("Error uploading logo:", error);
      toast.error("حدث خطأ أثناء رفع الشعار");
    } finally {
      setUploading(false);
    }
  };

  const handleSaveSettings = async () => {
    try {
      setSaving(true);
      
      console.log("Saving settings:", settingsData);
      
      // Update both siteConfig and Supabase
      await updateSiteConfig({
        name: settingsData.storeName,
        address: settingsData.storeAddress,
        phone: settingsData.storePhone,
        email: settingsData.storeEmail,
        logoUrl: settingsData.logoUrl,
        logo: settingsData.logoUrl, // Update logo as well for invoice compatibility
      });
      
      toast.success("تم حفظ الإعدادات بنجاح");
    } catch (error) {
      console.error("Error saving settings:", error);
      toast.error("حدث خطأ أثناء حفظ الإعدادات");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center p-12">
        <div className="animate-pulse">جاري تحميل إعدادات المتجر...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">إعدادات المتجر</h2>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardContent className="pt-6">
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="storeName">اسم المتجر</Label>
                <Input
                  id="storeName"
                  name="storeName"
                  value={settingsData.storeName}
                  onChange={handleInputChange}
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="storeAddress">عنوان المتجر</Label>
                <Input
                  id="storeAddress"
                  name="storeAddress"
                  value={settingsData.storeAddress}
                  onChange={handleInputChange}
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="storePhone">رقم الهاتف</Label>
                <Input
                  id="storePhone"
                  name="storePhone"
                  value={settingsData.storePhone}
                  onChange={handleInputChange}
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="storeEmail">البريد الإلكتروني</Label>
                <Input
                  id="storeEmail"
                  name="storeEmail"
                  type="email"
                  value={settingsData.storeEmail}
                  onChange={handleInputChange}
                />
              </div>
              
              <Button 
                onClick={handleSaveSettings} 
                className="w-full"
                disabled={saving}
              >
                {saving ? 'جاري الحفظ...' : 'حفظ الإعدادات'}
              </Button>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="pt-6">
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>شعار المتجر</Label>
                
                <div className="flex flex-col items-center justify-center border-2 border-dashed border-gray-300 rounded-lg p-6 h-48">
                  {settingsData.logoUrl ? (
                    <div className="relative w-full h-full">
                      <img
                        src={settingsData.logoUrl}
                        alt="شعار المتجر"
                        className="w-full h-full object-contain"
                      />
                      <Button
                        variant="outline"
                        size="sm"
                        className="absolute top-0 right-0 m-2"
                        onClick={() => setSettingsData({ ...settingsData, logoUrl: null })}
                      >
                        إزالة
                      </Button>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center text-muted-foreground">
                      <ImageIcon className="w-16 h-16 mb-4" />
                      <p className="text-sm text-center mb-2">اسحب الشعار هنا أو انقر للتحميل</p>
                      <p className="text-xs text-center">PNG, JPG أو WEBP (الحد الأقصى: 5MB)</p>
                    </div>
                  )}
                  
                  <Input
                    id="logo-upload"
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handleLogoUpload}
                    disabled={uploading}
                  />
                </div>
                
                <Button
                  variant="outline"
                  className="w-full mt-2"
                  onClick={() => document.getElementById('logo-upload')?.click()}
                  disabled={uploading}
                >
                  {uploading ? (
                    <span className="flex items-center">
                      <span className="animate-spin mr-2">⏳</span> جاري الرفع...
                    </span>
                  ) : (
                    <span className="flex items-center">
                      <Upload className="ml-2 h-4 w-4" /> تحميل شعار جديد
                    </span>
                  )}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
