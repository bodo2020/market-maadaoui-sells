
import { supabase } from "@/integrations/supabase/client";

export type SiteConfig = {
  name: string;
  currency: string;
  description: string;
  primaryColor: string;
  rtl: boolean;
  address: string;
  phone: string;
  email: string;
  logoUrl: string | null;
  vatNumber: string;
  logo: string | null;
  // Invoice template settings
  invoice: {
    footer: string;
    website: string;
    fontSize: string;
    showVat: boolean;
    template: string;
    notes: string;
    paymentInstructions: string;
    logoChoice: string;
    customLogoUrl: string | null;
  }
}

// Default site configuration
const defaultSiteConfig: SiteConfig = {
  name: "ماركت المعداوي",
  currency: "ج.م",
  description: "نظام نقاط البيع لماركت المعداوي",
  primaryColor: "#005931",
  rtl: true,
  address: "",
  phone: "",
  email: "",
  logoUrl: null,
  vatNumber: "", 
  logo: null,
  invoice: {
    footer: "شكراً لزيارتكم!",
    website: "",
    fontSize: "normal",
    showVat: true,
    template: "default",
    notes: "",
    paymentInstructions: "",
    logoChoice: "store",
    customLogoUrl: null,
  }
};

// Initialize with default config
export let siteConfig: SiteConfig = { ...defaultSiteConfig };

// Function to update site config
export async function updateSiteConfig(newConfig: Partial<SiteConfig>) {
  // First update the current runtime instance
  siteConfig = { 
    ...siteConfig, 
    ...newConfig 
  };
  
  try {
    // Check if store_settings table has any records
    const { data: existingSettings, error: fetchError } = await supabase
      .from('store_settings')
      .select('id')
      .limit(1);
      
    if (fetchError) throw fetchError;
    
    let updateOperation;
    
    if (existingSettings && existingSettings.length > 0) {
      // Update existing record
      updateOperation = supabase
        .from('store_settings')
        .update({
          name: siteConfig.name,
          address: siteConfig.address,
          phone: siteConfig.phone,
          email: siteConfig.email,
          logo_url: siteConfig.logoUrl,
          vat_number: siteConfig.vatNumber,
          currency: siteConfig.currency,
          description: siteConfig.description,
          primary_color: siteConfig.primaryColor,
          rtl: siteConfig.rtl,
          updated_at: new Date().toISOString()
        })
        .eq('id', existingSettings[0].id);
    } else {
      // Insert new record if none exists
      updateOperation = supabase
        .from('store_settings')
        .insert({
          name: siteConfig.name,
          address: siteConfig.address,
          phone: siteConfig.phone,
          email: siteConfig.email,
          logo_url: siteConfig.logoUrl,
          vat_number: siteConfig.vatNumber,
          currency: siteConfig.currency,
          description: siteConfig.description,
          primary_color: siteConfig.primaryColor,
          rtl: siteConfig.rtl
        });
    }
    
    const { error } = await updateOperation;
    
    if (error) throw error;
    
    // Save to localStorage as backup
    localStorage.setItem('siteConfig', JSON.stringify(siteConfig));
    console.log("Site config saved successfully:", siteConfig);
  } catch (error) {
    console.error("Failed to save site config to Supabase:", error);
    // Still save to localStorage even if Supabase fails
    localStorage.setItem('siteConfig', JSON.stringify(siteConfig));
    throw error;
  }
  
  return siteConfig;
}

// Load settings on initial load
(async () => {
  try {
    // Try to load from Supabase first
    const { data: settings, error } = await supabase
      .from('store_settings')
      .select('*')
      .limit(1);

    if (error) throw error;

    if (settings && settings.length > 0) {
      const storeSettings = settings[0];
      
      siteConfig = {
        ...defaultSiteConfig,
        name: storeSettings.name,
        address: storeSettings.address || '',
        phone: storeSettings.phone || '',
        email: storeSettings.email || '',
        logoUrl: storeSettings.logo_url,
        vatNumber: storeSettings.vat_number || '',
        currency: storeSettings.currency,
        description: storeSettings.description || '',
        primaryColor: storeSettings.primary_color,
        rtl: storeSettings.rtl,
        logo: storeSettings.logo_url, // Set logo to match logoUrl for invoice compatibility
      };
      console.log("Loaded site config from Supabase:", siteConfig);
    } else {
      console.log("No settings found in Supabase, using defaults or localStorage");
      // Fall back to localStorage if no Supabase settings found
      try {
        const savedConfig = localStorage.getItem('siteConfig');
        if (savedConfig) {
          const parsedConfig = JSON.parse(savedConfig);
          siteConfig = { ...defaultSiteConfig, ...parsedConfig };
          console.log("Loaded site config from localStorage:", siteConfig);
          
          // Since we found settings in localStorage but not in Supabase,
          // let's save them to Supabase for future use
          await updateSiteConfig(siteConfig);
        }
      } catch (localError) {
        console.error("Failed to load saved site config from localStorage:", localError);
      }
    }
  } catch (supabaseError) {
    console.error("Failed to load from Supabase, falling back to localStorage:", supabaseError);
    
    // Fall back to localStorage if Supabase fails
    try {
      const savedConfig = localStorage.getItem('siteConfig');
      if (savedConfig) {
        const parsedConfig = JSON.parse(savedConfig);
        siteConfig = { ...defaultSiteConfig, ...parsedConfig };
        console.log("Loaded site config from localStorage:", siteConfig);
      }
    } catch (localError) {
      console.error("Failed to load saved site config from localStorage:", localError);
    }
  }
})();
