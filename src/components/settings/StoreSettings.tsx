
import { useState, useEffect } from "react";
import { siteConfig, updateSiteConfig } from "@/config/site";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import LogoUpload from "./store/LogoUpload";
import StoreInfoForm from "./store/StoreInfoForm";

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
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadSettings = async () => {
      setLoading(true);
      try {
        const { data: storeSettings, error } = await supabase
          .from('store_settings')
          .select('*')
          .limit(1);
          
        if (error) throw error;
        
        if (storeSettings && storeSettings.length > 0) {
          const settings = storeSettings[0];
          setSettingsData({
            storeName: settings.name || "",
            storeAddress: settings.address || "",
            storePhone: settings.phone || "",
            storeEmail: settings.email || "",
            logoUrl: settings.logo_url || null,
          });
        } else {
          setSettingsData({
            storeName: siteConfig.name || "",
            storeAddress: siteConfig.address || "",
            storePhone: siteConfig.phone || "",
            storeEmail: siteConfig.email || "",
            logoUrl: siteConfig.logoUrl || null,
          });
        }
      } catch (error) {
        console.error("Error loading store settings:", error);
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

  const handleSaveSettings = async () => {
    try {
      setSaving(true);
      
      await updateSiteConfig({
        name: settingsData.storeName,
        address: settingsData.storeAddress,
        phone: settingsData.storePhone,
        email: settingsData.storeEmail,
        logoUrl: settingsData.logoUrl,
        logo: settingsData.logoUrl,
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
        <StoreInfoForm
          storeData={settingsData}
          onChange={handleInputChange}
          onSave={handleSaveSettings}
          saving={saving}
        />
        
        <LogoUpload
          logoUrl={settingsData.logoUrl}
          onLogoChange={(url) => setSettingsData(prev => ({ ...prev, logoUrl: url }))}
        />
      </div>
    </div>
  );
}
