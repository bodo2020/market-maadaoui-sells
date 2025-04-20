
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
  neighborhood_id: string;
  delivery_type_id: string;
  price: number;
  estimated_time?: string;
  created_at?: string;
  updated_at?: string;
  delivery_types?: DeliveryType;
}

export type DeliveryGovernorate = {
  id: string;
  name: string;
  provider_id?: string;
  active?: boolean;
  created_at?: string;
  updated_at?: string;
};

export type DeliveryCity = {
  id: string;
  name: string;
  governorate_id: string;
  active?: boolean;
  created_at?: string;
  updated_at?: string;
};

export type DeliveryArea = {
  id: string;
  name: string;
  city_id: string;
  active?: boolean;
  created_at?: string;
  updated_at?: string;
};

export type DeliveryNeighborhood = {
  id: string;
  name: string;
  area_id: string;
  price: number;
  estimated_time?: string;
  active?: boolean;
  created_at?: string;
  updated_at?: string;
};
