
export enum UserRole {
  ADMIN = 'admin',
  EMPLOYEE = 'employee',
  CASHIER = 'cashier',
  DELIVERY = 'delivery',
}

export interface User {
  id: string;
  email: string;
  role: UserRole;
  created_at: string;
  updated_at: string;
  name: string;
  phone?: string;
  username: string;
  active?: boolean;
  password?: string;
  shifts?: Shift[];
}

export interface Shift {
  id: string;
  employee_id: string;
  start_time: string;
  end_time?: string;
  total_hours?: number;
  created_at: string;
  updated_at: string;
}

export interface Product {
  id: string;
  name: string;
  description?: string;
  price: number;
  purchase_price: number;
  quantity?: number;
  notify_quantity?: number;  // Added this field to support low stock notifications
  category_id?: string;
  subcategory_id?: string;
  subsubcategory_id?: string;
  main_category_id?: string;
  company_id?: string;
  barcode?: string;
  barcode_type?: string;
  bulk_barcode?: string;
  image_urls?: string[];
  created_at?: string;
  updated_at?: string;
  is_offer?: boolean;
  offer_price?: number;
  is_bulk?: boolean;
  bulk_enabled?: boolean;
  bulk_quantity?: number;
  bulk_price?: number;
  manufacturer_name?: string;
  unit_of_measure?: string;
  calculated_weight?: number;
  is_bulk_scan?: boolean;
}

export interface Category {
  id: string;
  name: string;
  description?: string;
  image_url?: string;
  created_at?: string;
  updated_at?: string;
}

export interface Subcategory {
  id: string;
  name: string;
  category_id: string;
  description?: string;
  image_url?: string;
  created_at?: string;
  updated_at?: string;
}

export interface Subsubcategory {
  id: string;
  name: string;
  subcategory_id: string;
  description?: string;
  image_url?: string;
  created_at?: string;
  updated_at?: string;
}

export interface MainCategory {
  id: string;
  name: string;
  description?: string;
  image_url?: string;
  created_at?: string;
  updated_at?: string;
  product_count?: number;
}

export interface Company {
  id: string;
  name: string;
  description?: string;
  image_url?: string;
  created_at?: string;
  updated_at?: string;
}

export interface Customer {
  id: string;
  name: string;
  phone?: string;
  email?: string;
  address?: string;
  notes?: string;
  created_at?: string;
  updated_at?: string;
}

export interface Supplier {
  id: string;
  name: string;
  phone?: string;
  address?: string;
  email?: string;
  contact_person?: string;
  notes?: string;
  balance?: number;
  created_at?: string;
  updated_at?: string;
}

export interface Sale {
  id: string;
  date: string;
  items: CartItem[];
  subtotal: number;
  discount: number;
  total: number;
  profit: number;
  payment_method: 'cash' | 'card' | 'mixed';
  cash_amount?: number;
  card_amount?: number;
  customer_name?: string;
  customer_phone?: string;
  invoice_number: string;
  created_at: string;
  updated_at: string;
}

export interface CartItem {
  product: Product;
  quantity: number;
  price: number;
  discount: number;
  total: number;
  weight: number | null;
  isBulk?: boolean;
}

export interface Purchase {
  id: string;
  date: string;
  supplier_id: string;
  items: PurchaseItem[];
  subtotal: number;
  discount: number;
  total: number;
  payment_method: 'cash' | 'card' | 'mixed';
  cash_amount?: number;
  card_amount?: number;
  created_at: string;
  updated_at: string;
}

export interface PurchaseItem {
  product: Product;
  quantity: number;
  price: number;
  total: number;
}

export interface Expense {
  id: string;
  date: string;
  description: string;
  amount: number;
  category: string;
  type: string;
  receipt_url?: string;
  created_at: string;
  updated_at: string;
}

export interface Employee {
  id: string;
  name: string;
  email: string;
  phone?: string;
  address?: string;
  role: UserRole;
  salary: number;
  created_at: string;
  updated_at: string;
}

export interface CashTransaction {
  id: string;
  date: string;
  description: string;
  amount: number;
  type: 'income' | 'expense';
  created_at: string;
  updated_at: string;
}

export interface Banner {
  id: string;
  title: string;
  description?: string;
  image_url: string;
  link?: string;
  start_date?: string;
  end_date?: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Order {
  id: string;
  customer_id?: string;
  customer_name: string;
  customer_phone?: string;
  customer_email?: string;
  date: string;
  items: any[];
  subtotal: number;
  discount: number;
  total: number;
  payment_method: 'cash' | 'card' | 'online';
  payment_status: 'pending' | 'paid' | 'failed' | 'refunded';
  shipping_address?: string;
  status: 'pending' | 'processing' | 'shipped' | 'delivered' | 'cancelled';
  notes?: string;
  created_at: string;
  updated_at: string;
}

export interface OnlineOrder {
  id: string;
  customer_id: string;
  date: string;
  items: CartItem[];
  subtotal: number;
  discount: number;
  total: number;
  payment_method: 'cash' | 'card' | 'online';
  shipping_address: string;
  status: 'pending' | 'processing' | 'shipped' | 'delivered' | 'cancelled';
  created_at: string;
  updated_at: string;
}

export interface DeliveryLocation {
  id: string;
  name: string;
  city_id: string;
  area_id: string;
  address: string;
  delivery_fee: number;
  created_at: string;
  updated_at: string;
}
