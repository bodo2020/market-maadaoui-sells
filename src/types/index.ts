
export interface Product {
  id: string;
  name: string;
  barcode?: string;
  description?: string;
  image_urls: string[];
  quantity: number;
  price: number;
  purchase_price: number; 
  offer_price?: number;
  is_offer: boolean;
  category_id?: string;
  // Add main_category_id and update other category-related fields
  main_category_id?: string;
  subcategory_id?: string;
  subsubcategory_id?: string;
  company_id?: string;
  barcode_type?: string;
  bulk_enabled: boolean;
  bulk_quantity?: number;
  bulk_price?: number;
  bulk_barcode?: string;
  created_at: Date | string;
  updated_at?: Date | string;
  manufacturer_name?: string;
  is_bulk: boolean;
  unit_of_measure?: string;
  is_weight_based?: boolean;
  calculated_weight?: number;
  calculated_price?: number;
  is_bulk_scan?: boolean;
  track_inventory?: boolean;
}
