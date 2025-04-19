export interface ShippingProvider {
  id: string;
  name: string;
  active?: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface DeliveryLocation {
  id: string;
  name: string;
  provider_id: string;
  governorate: string;
  city?: string;
  area?: string;
  neighborhood?: string;
  price: number;
  notes?: string;
  estimated_time?: string;
  active?: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface DeliveryType {
  id: string;
  name: string;
  description?: string;
  active?: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface DeliveryTypePrice {
  id: string;
  delivery_location_id: string;
  delivery_type_id: string;
  price: number;
  estimated_time?: string;
  created_at?: string;
  updated_at?: string;
}

export type DeliveryGovernorate = {
  name: string;
  cities: DeliveryCity[];
};

export type DeliveryCity = {
  name: string;
  areas: DeliveryArea[];
};

export type DeliveryArea = {
  name: string;
  neighborhoods: DeliveryNeighborhood[];
};

export type DeliveryNeighborhood = {
  id: string;
  name: string;
  price: number;
  estimated_time?: string;
};
