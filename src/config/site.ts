
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
    // Update the store settings in Supabase
    const { error } = await supabase
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
      })
      .eq('id', (await supabase.from('store_settings').select('id').single()).data?.id);

    if (error) throw error;
    
    // Save to localStorage as backup
    localStorage.setItem('siteConfig', JSON.stringify(siteConfig));
    console.log("Site config saved:", siteConfig);
  } catch (error) {
    console.error("Failed to save site config:", error);
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
      .single();

    if (error) throw error;

    if (settings) {
      siteConfig = {
        ...defaultSiteConfig,
        name: settings.name,
        address: settings.address || '',
        phone: settings.phone || '',
        email: settings.email || '',
        logoUrl: settings.logo_url,
        vatNumber: settings.vat_number || '',
        currency: settings.currency,
        description: settings.description || '',
        primaryColor: settings.primary_color,
        rtl: settings.rtl,
        logo: settings.logo_url, // Set logo to match logoUrl for invoice compatibility
      };
      console.log("Loaded site config from Supabase:", siteConfig);
    }
  } catch (error) {
    console.error("Failed to load from Supabase, falling back to localStorage:", error);
    
    // Fall back to localStorage if Supabase fails
    try {
      const savedConfig = localStorage.getItem('siteConfig');
      if (savedConfig) {
        const parsedConfig = JSON.parse(savedConfig);
        siteConfig = { ...defaultSiteConfig, ...parsedConfig };
        console.log("Loaded site config from localStorage:", siteConfig);
      }
    } catch (error) {
      console.error("Failed to load saved site config:", error);
    }
  }
})();
