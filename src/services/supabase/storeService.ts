import { supabase } from "@/integrations/supabase/client";

export interface StoreSettings {
  id: string;
  name: string;
  address?: string;
  phone?: string;
  email?: string;
  logo_url?: string;
  vat_number?: string;
  currency: string;
  description?: string;
  primary_color?: string;
  rtl: boolean;
  created_at: string;
  updated_at: string;
}

export async function fetchStoreSettings(): Promise<StoreSettings | null> {
  try {
    const { data, error } = await supabase
      .from("store_settings")
      .select("*")
      .limit(1)
      .single();

    if (error) {
      console.error("Error fetching store settings:", error);
      return null;
    }

    return data as StoreSettings;
  } catch (error) {
    console.error("Error in fetchStoreSettings:", error);
    return null;
  }
}