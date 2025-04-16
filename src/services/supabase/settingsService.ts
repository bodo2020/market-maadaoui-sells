
import { supabase } from "@/integrations/supabase/client";

export interface StoreSettings {
  storeName: string;
  storeAddress: string;
  storePhone: string;
  storeEmail: string;
  logoUrl: string | null;
}

export async function getStoreSettings(): Promise<StoreSettings> {
  const { data, error } = await supabase
    .from("store_settings")
    .select("*")
    .maybeSingle();

  if (error) {
    console.error("Error fetching store settings:", error);
    throw error;
  }

  // Return default settings if no settings found
  if (!data) {
    return {
      storeName: "My Store",
      storeAddress: "",
      storePhone: "",
      storeEmail: "",
      logoUrl: null
    };
  }

  return data as StoreSettings;
}

export async function updateStoreSettings(settings: Partial<StoreSettings>): Promise<StoreSettings> {
  // First check if settings record exists
  const { data: existingSettings } = await supabase
    .from("store_settings")
    .select("*")
    .maybeSingle();

  let result;
  
  if (!existingSettings) {
    // If no record exists, create a new one
    const { data, error } = await supabase
      .from("store_settings")
      .insert({
        id: 1, // Using a constant ID since we only need one store settings record
        ...settings
      })
      .select()
      .single();
      
    if (error) {
      console.error("Error creating store settings:", error);
      throw error;
    }
    
    result = data;
  } else {
    // If record exists, update it
    const { data, error } = await supabase
      .from("store_settings")
      .update(settings)
      .eq("id", existingSettings.id)
      .select()
      .single();
      
    if (error) {
      console.error("Error updating store settings:", error);
      throw error;
    }
    
    result = data;
  }
  
  return result as StoreSettings;
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
