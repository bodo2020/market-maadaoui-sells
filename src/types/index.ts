export enum UserRole {
  ADMIN = "admin",
  CASHIER = "cashier",
  EMPLOYEE = "employee",
  DELIVERY = "delivery"
}

export interface User {
  id: string;
  name: string;
  role: UserRole;
  phone: string;
  password: string;
  shifts?: Shift[];
  created_at: Date | string;
  updated_at?: Date | string;
  email?: string;
  username: string;
  active?: boolean;
}

export interface Category {
  id: string;
  name: string;
  parent_id?: string;
  children?: Category[];
  created_at: Date | string;
  updated_at?: Date | string;
}

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
  subcategory_id?: string;
  subsubcategory_id?: string;
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
  // Properties for scale products calculation
  is_weight_based?: boolean;
  calculated_weight?: number;
  calculated_price?: number;
  // Property to indicate if the product was scanned with its bulk barcode
  is_bulk_scan?: boolean;
}

export interface CartItem {
  product: Product;
  quantity: number;
  price: number;
  discount: number;
  total: number;
  weight?: number | null;
  isBulk?: boolean;
}

export interface Sale {
  id: string;
  date: Date | string;
  items: CartItem[];
  cashier_id?: string;
  subtotal: number;
  discount: number;
  total: number;
  profit: number;
  payment_method: 'cash' | 'card' | 'mixed';
  card_amount?: number;
  cash_amount?: number;
  customer_name?: string;
  customer_phone?: string;
  invoice_number: string;
  created_at: Date | string;
  updated_at?: Date | string;
}

export interface Expense {
  id: string;
  type: string;
  amount: number;
  description: string;
  date: Date | string;
  receipt_url?: string;
  created_at: Date | string;
  updated_at?: Date | string;
}

export interface Shift {
  id: string;
  employee_id?: string;
  start_time: Date | string;
  end_time?: Date | string;
  total_hours?: number;
  created_at: Date | string;
  updated_at?: Date | string;
}

export interface Supplier {
  id: string;
  name: string;
  contact_person?: string;
  phone?: string;
  email?: string;
  address?: string;
  notes?: string;
  created_at: Date | string;
  updated_at?: Date | string;
}

export interface Customer {
  id: string;
  name: string;
  phone?: string;
  email?: string;
  address?: string;
  notes?: string;
  created_at: Date | string;
  updated_at?: Date | string;
}
