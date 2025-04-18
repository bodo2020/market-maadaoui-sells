
export interface ShippingProvider {
  id: string;
  name: string;
  active: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface DeliveryLocation {
  id: string;
  provider_id: string;
  name: string; // This field is required by the database
  governorate: string;
  city: string;
  area?: string;
  neighborhood?: string;
  price: number;
  estimated_time?: string;
  active: boolean;
  notes?: string;
  created_at?: string;
  updated_at?: string;
}
