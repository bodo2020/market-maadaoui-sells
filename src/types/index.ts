export enum UserRole {
  SUPER_ADMIN = "super_admin",
  ADMIN = "admin",
  CASHIER = "cashier",
  EMPLOYEE = "employee",
  DELIVERY = "delivery"
}

export interface User {
  id: string;
  name: string;
  username: string;
  role: UserRole;
  phone?: string;
  email?: string;
  password?: string;
  created_at: string;
  active?: boolean;
  shifts?: Shift[];
  salary?: number;
  salary_type?: string;
}

export interface MainCategory {
  id: string;
  name: string;
  description?: string | null;
  image_url?: string | null;
  created_at?: string;
  updated_at?: string;
  product_count?: number;
}

export interface Subcategory {
  id: string;
  name: string;
  description?: string | null;
  image_url?: string | null;
  category_id: string;
  created_at?: string;
  updated_at?: string;
}

export interface Category {
  id: string;
  name: string;
  description?: string | null;
  image_url?: string | null;
  created_at?: string;
  updated_at?: string;
  level?: 'category' | 'subcategory';
  parent_id?: string | null;
}

export interface Company {
  id: string;
  name: string;
  logo_url?: string | null;
  description?: string | null;
  address?: string | null;
  contact_email?: string | null;
  contact_phone?: string | null;
  created_at?: Date | string;
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
  main_category_id?: string;
  subcategory_id?: string;
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
  min_stock_level?: number;
  expiry_date?: string | null;
  shelf_location?: string | null;
  track_expiry?: boolean;
}

export interface ProductBatch {
  id: string;
  product_id: string;
  batch_number: string;
  expiry_date: string;
  quantity: number;
  shelf_location?: string | null;
  purchase_date?: string | null;
  supplier_id?: string | null;
  notes?: string | null;
  created_at: string;
  updated_at: string;
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
  invoice_number: string;
  date: string;
  customer_name?: string;
  customer_phone?: string;
  payment_method: 'cash' | 'card' | 'mixed';
  total: number;
  subtotal: number;
  discount: number;
  items: CartItem[];
  cashier_id?: string;
  cashier_name?: string;
  branch_id?: string;
  created_at: string;
  updated_at: string;
  cash_amount?: number;
  card_amount?: number;
  profit: number;
}

export interface OnlineOrder {
  id: string;
  created_at: string;
  customer_id?: string;
  total: number;
  status: 'pending' | 'confirmed' | 'preparing' | 'ready' | 'shipped' | 'delivered' | 'cancelled';
  payment_status: 'pending' | 'paid' | 'failed' | 'refunded';
  items: CartItem[];
  payment_method?: string;
  delivery_location_id?: string;
  notes?: string;
  updated_at: string;
}

export interface Expense {
  id: string;
  type: string;
  amount: number;
  description: string;
  date: string;
  receipt_url?: string;
  created_at: string;
  updated_at?: string;
}

export interface Shift {
  id: string;
  employee_id?: string;
  start_time: string;
  end_time?: string;
  total_hours?: number;
  created_at: string;
  updated_at?: string;
}

export interface Supplier {
  id: string;
  name: string;
  contact_person?: string;
  phone?: string;
  email?: string;
  address?: string;
  notes?: string;
  created_at: string;
  updated_at?: string;
  balance?: number;
}

export interface Customer {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  user_id?: string | null;
  phone_verified?: boolean;
}

export interface Purchase {
  id: string;
  supplier_id: string;
  invoice_number: string;
  date: string;
  total: number;
  paid: number;
  description?: string;
  invoice_file_url?: string;
  created_at: string;
  updated_at?: string;
  suppliers?: { name: string };
  items?: PurchaseItem[];
}

export interface PurchaseItem {
  id: string;
  purchase_id: string;
  product_id: string;
  quantity: number;
  price: number;
  total: number;
  products?: { name: string };
}

export interface OrderItem {
  product_id: string;
  product_name: string;
  quantity: number;
  price: number;
  total: number;
  image_url?: string;
  barcode?: string;
  is_bulk?: boolean;
  is_weight_based?: boolean;
  bulk_quantity?: number;
  shelf_location?: string;
}

export interface Order {
  id: string;
  created_at: string;
  total: number;
  status: 'pending' | 'confirmed' | 'preparing' | 'ready' | 'shipped' | 'delivered' | 'cancelled';
  payment_status: 'pending' | 'paid' | 'failed' | 'refunded';
  payment_method: string;
  shipping_address?: string;
  shipping_cost?: number;
  items: OrderItem[];
  customer_id?: string;
  customer_name?: string;
  customer_email?: string;
  customer_phone?: string;
  customer_phone_verified?: boolean;
  notes?: string;
  tracking_number?: string | null;
  delivery_person?: string | null;
  return_status?: 'none' | 'partial' | 'full';
  // Location data
  governorate?: string;
  city?: string;
  area?: string;
  neighborhood?: string;
}
