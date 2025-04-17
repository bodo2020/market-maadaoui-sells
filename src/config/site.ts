
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
  // Invoice template settings
  invoice: {
    footer: "شكراً لزيارتكم!",
    website: "",
    fontSize: "normal", // small, normal, large
    showVat: true,
    template: "default", // default, compact, detailed
    notes: "",
    paymentInstructions: "",
    logoChoice: "store", // store, none, custom
    customLogoUrl: null,
  }
};

// Initialize with default config
export let siteConfig: SiteConfig = { ...defaultSiteConfig };

// Function to update site config
export function updateSiteConfig(newConfig: Partial<SiteConfig>) {
  // First update the current runtime instance
  siteConfig = { 
    ...siteConfig, 
    ...newConfig 
  };
  
  // Then save to localStorage for persistence
  try {
    localStorage.setItem('siteConfig', JSON.stringify(siteConfig));
    console.log("Site config saved to localStorage:", siteConfig);
  } catch (error) {
    console.error("Failed to save site config to localStorage:", error);
  }
  
  return siteConfig;
}

// Load from localStorage on initial load
try {
  const savedConfig = localStorage.getItem('siteConfig');
  if (savedConfig) {
    const parsedConfig = JSON.parse(savedConfig);
    console.log("Loaded site config from localStorage:", parsedConfig);
    siteConfig = { ...defaultSiteConfig, ...parsedConfig };
  }
} catch (error) {
  console.error("Failed to load saved site config:", error);
}
