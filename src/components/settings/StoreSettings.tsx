
import { useState, useEffect } from "react";
import { siteConfig, updateSiteConfig, loadSiteConfig } from "@/config/site";
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
    const fetchSettings = async () => {
      setLoading(true);
      try {
        // Load site config from Supabase
        const config = await loadSiteConfig();
        
        setSettingsData({
          storeName: config.name || "",
          storeAddress: config.address || "",
          storePhone: config.phone || "",
          storeEmail: config.email || "",
          logoUrl: config.logoUrl || null,
        });
        
        console.log("Loaded settings:", config);
      } catch (error) {
        console.error("Error loading store settings:", error);
        toast.error("حدث خطأ أثناء تحميل إعدادات المتجر");
      } finally {
        setLoading(false);
      }
    };

    // Init storage bucket if needed
    const initStorageBucket = async () => {
      try {
        const { data: buckets } = await supabase.storage.listBuckets();
        if (!buckets?.some(bucket => bucket.name === 'store')) {
          const { error } = await supabase.storage.createBucket('store', {
            public: true
          });
          if (error) {
            console.error("Error creating bucket:", error);
          } else {
            console.log("Created store bucket successfully");
          }
        }
      } catch (error) {
        console.error("Error initializing storage bucket:", error);
      }
    };

    // Run both operations
    Promise.all([fetchSettings(), initStorageBucket()]);
  }, []);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setSettingsData({ ...settingsData, [name]: value });
  };

  const handleSaveSettings = async () => {
    try {
      setSaving(true);
      
      console.log("Saving settings:", settingsData);
      
      const updatedConfig = {
        name: settingsData.storeName,
        address: settingsData.storeAddress,
        phone: settingsData.storePhone,
        email: settingsData.storeEmail,
        logoUrl: settingsData.logoUrl,
        logo: settingsData.logoUrl, // Also update logo field for compatibility
      };
      
      // Update site config in Supabase and localStorage
      await updateSiteConfig(updatedConfig);
      
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
