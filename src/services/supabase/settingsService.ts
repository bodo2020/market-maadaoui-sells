
import { supabase } from "@/integrations/supabase/client";

export interface StoreSettings {
  storeName: string;
  storeAddress: string;
  storePhone: string;
  storeEmail: string;
  logoUrl: string | null;
}

// Since we don't have a store_settings table yet, we'll use localStorage
export async function getStoreSettings(): Promise<StoreSettings> {
  try {
    const storedSettings = localStorage.getItem("store_settings");
    
    // Return default settings if no settings found
    if (!storedSettings) {
      return {
        storeName: "My Store",
        storeAddress: "",
        storePhone: "",
        storeEmail: "",
        logoUrl: null
      };
    }

    return JSON.parse(storedSettings) as StoreSettings;
  } catch (error) {
    console.error("Error in getStoreSettings:", error);
    return {
      storeName: "My Store",
      storeAddress: "",
      storePhone: "",
      storeEmail: "",
      logoUrl: null
    };
  }
}

export async function updateStoreSettings(settings: Partial<StoreSettings>): Promise<StoreSettings> {
  try {
    // Get current settings
    const currentSettings = await getStoreSettings();
    
    // Merge with new settings
    const updatedSettings: StoreSettings = {
      ...currentSettings,
      ...settings
    };
    
    // Save to localStorage
    localStorage.setItem("store_settings", JSON.stringify(updatedSettings));
    
    return updatedSettings;
  } catch (error) {
    console.error("Error in updateStoreSettings:", error);
    throw error;
  }
}

export async function uploadLogo(file: File): Promise<string> {
  try {
    const fileExt = file.name.split('.').pop();
    const fileName = `logo_${Date.now()}.${fileExt}`;
    const filePath = `${fileName}`;
    
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
    
    if (!data) {
      throw new Error("Failed to get public URL for uploaded file");
    }
    
    return data.publicUrl;
  } catch (error) {
    console.error("Error uploading logo:", error);
    throw error;
  }
}
