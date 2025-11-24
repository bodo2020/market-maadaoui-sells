export interface DeliveryZone {
  id: string;
  branch_id: string;
  zone_name: string;
  polygon_coordinates: {
    type: 'Polygon';
    coordinates: number[][][]; // GeoJSON format
  };
  delivery_price: number;
  estimated_time?: string;
  priority: number;
  color: string;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface VerifyLocationResult {
  isInZone: boolean;
  zone?: {
    zone_id: string;
    zone_name: string;
    branch_id: string;
    branch_name: string;
    delivery_price: number;
    estimated_time?: string;
    priority: number;
  };
}
