
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
          .limit(1)
          .single();
          
        if (error && error.code !== 'PGRST116') {
          // PGRST116 means no results found, which is fine for a new store
          console.error("Supabase error:", error);
          throw error;
        }
        
        if (storeSettings) {
          console.log("Loaded settings from Supabase:", storeSettings);
          setSettingsData({
            storeName: storeSettings.name || "",
            storeAddress: storeSettings.address || "",
            storePhone: storeSettings.phone || "",
            storeEmail: storeSettings.email || "",
            logoUrl: storeSettings.logo_url || null,
          });
        } else {
          // If no settings found in DB, use the current siteConfig
          console.log("No settings found in Supabase, using siteConfig", siteConfig);
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
        
        // Fallback to localStorage or siteConfig
        try {
          const savedConfig = localStorage.getItem('siteConfig');
          if (savedConfig) {
            const parsedConfig = JSON.parse(savedConfig);
            setSettingsData({
              storeName: parsedConfig.name || "",
              storeAddress: parsedConfig.address || "",
              storePhone: parsedConfig.phone || "",
              storeEmail: parsedConfig.email || "",
              logoUrl: parsedConfig.logoUrl || null,
            });
            console.log("Loaded site config from localStorage:", parsedConfig);
          } else {
            // Use default siteConfig as last resort
            setSettingsData({
              storeName: siteConfig.name || "",
              storeAddress: siteConfig.address || "",
              storePhone: siteConfig.phone || "",
              storeEmail: siteConfig.email || "",
              logoUrl: siteConfig.logoUrl || null,
            });
          }
        } catch (localError) {
          console.error("Error loading from localStorage:", localError);
          toast.error("حدث خطأ أثناء تحميل إعدادات المتجر");
        }
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
      
      const updatedConfig = {
        name: settingsData.storeName,
        address: settingsData.storeAddress,
        phone: settingsData.storePhone,
        email: settingsData.storeEmail,
        logoUrl: settingsData.logoUrl,
        logo: settingsData.logoUrl, // Also update logo field for compatibility
      };
      
      // First update local site config
      await updateSiteConfig(updatedConfig);
      
      // Directly update or insert into Supabase
      const { data: existingSettings, error: fetchError } = await supabase
        .from('store_settings')
        .select('id')
        .limit(1);
        
      if (fetchError) {
        console.error("Error checking for existing settings:", fetchError);
      }
      
      let upsertError;
      if (existingSettings && existingSettings.length > 0) {
        // Update existing record
        const { error } = await supabase
          .from('store_settings')
          .update({
            name: settingsData.storeName,
            address: settingsData.storeAddress,
            phone: settingsData.storePhone,
            email: settingsData.storeEmail,
            logo_url: settingsData.logoUrl,
            updated_at: new Date().toISOString()
          })
          .eq('id', existingSettings[0].id);
          
        upsertError = error;
      } else {
        // Insert new record
        const { error } = await supabase
          .from('store_settings')
          .insert({
            name: settingsData.storeName,
            address: settingsData.storeAddress,
            phone: settingsData.storePhone,
            email: settingsData.storeEmail,
            logo_url: settingsData.logoUrl
          });
          
        upsertError = error;
      }
      
      if (upsertError) {
        console.error("Error saving to Supabase:", upsertError);
        throw upsertError;
      }
      
      localStorage.setItem('siteConfig', JSON.stringify({
        ...siteConfig,
        ...updatedConfig
      }));
      
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
