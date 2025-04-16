
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

export let siteConfig: SiteConfig = {
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
}

// Function to update site config
export function updateSiteConfig(newConfig: Partial<SiteConfig>) {
  siteConfig = { 
    ...siteConfig, 
    ...newConfig 
  };
  
  // Save to localStorage for persistence
  localStorage.setItem('siteConfig', JSON.stringify(siteConfig));
  
  return siteConfig;
}

// Load from localStorage on initial load
try {
  const savedConfig = localStorage.getItem('siteConfig');
  if (savedConfig) {
    siteConfig = { ...siteConfig, ...JSON.parse(savedConfig) };
  }
} catch (error) {
  console.error("Failed to load saved site config:", error);
}
