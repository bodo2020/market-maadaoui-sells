
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

    // Initialize storage bucket if needed
    const createStorageBucket = async () => {
      try {
        // First check if the bucket exists
        const { data: buckets, error: bucketsError } = await supabase.storage.listBuckets();
        
        if (bucketsError) {
          console.error("Error listing buckets:", bucketsError);
          return;
        }
        
        console.log("Existing buckets:", buckets);
        
        // If bucket doesn't exist, create it
        if (!buckets?.some(bucket => bucket.name === 'store')) {
          console.log("Creating store bucket...");
          const { error: createError } = await supabase.storage.createBucket('store', {
            public: true
          });
          
          if (createError) {
            console.error("Error creating store bucket:", createError);
          } else {
            console.log("Store bucket created successfully");
            
            // Call the edge function instead of RPC
            const { error: policyError } = await supabase.functions.invoke('create_storage_policy', {
              body: {
                bucket_name: 'store',
                policy_name: 'Public Access',
                definition: 'true',
                operation: 'SELECT'
              }
            });
            
            if (policyError) {
              console.error("Error creating bucket policy:", policyError);
            } else {
              console.log("Created public access policy for store bucket");
            }
          }
        } else {
          console.log("Store bucket already exists");
        }
      } catch (error) {
        console.error("Error setting up storage bucket:", error);
      }
    };

    // Run both operations
    fetchSettings();
    createStorageBucket();
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
