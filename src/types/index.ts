
export interface Product {
  id: string;
  name: string;
  barcode: string;
  description?: string;
  imageUrls: string[];
  quantity: number;
  price: number;
  purchasePrice: number;
  offerPrice?: number;
  isOffer: boolean;
  categoryId: string;
  subcategoryId?: string;
  subsubcategoryId?: string;
  // Add new fields for barcode and bulk selling
  barcode_type: "normal" | "scale";
  bulk_enabled: boolean;
  bulk_quantity?: number;
  bulk_price?: number;
  bulk_barcode?: string;
  created_at: Date;
  updated_at: Date;
  manufacturerName?: string;
  isBulk: boolean;
  unitOfMeasure?: string;
}
