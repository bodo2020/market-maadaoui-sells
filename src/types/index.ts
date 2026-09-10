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
  // ملاحظة: salary و salary_type تم نقلها إلى جدول salaries منفصل
}

export interface MainCategory {
  id: string;
  name: string;
  description?: string | null;
  image_url?: string | null;
  position?: number;
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
  position?: number;
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
  barcode?: string | null;
  description?: string | null;
  image_urls: string[];
  /** Effective inventory quantity for the resolved inventory source branch. */
  quantity: number;
  price: number;
  purchase_price: number;
  offer_price?: number | null;
  is_offer: boolean;
  category_id?: string | null;
  main_category_id?: string | null;
  subcategory_id?: string | null;
  company_id?: string | null;
  branch_id?: string | null;
  barcode_type?: string | null;
  default_weight_grams?: number | null;

  /** Legacy bulk fields kept temporarily for backward compatibility. */
  bulk_enabled: boolean;
  bulk_quantity?: number | null;
  bulk_price?: number | null;
  bulk_barcode?: string | null;

  created_at: Date | string;
  updated_at?: Date | string | null;
  manufacturer_name?: string | null;
  is_bulk: boolean;
  unit_of_measure?: string | null;
  base_unit?: string | null;
  has_variants?: boolean;
  is_variant?: boolean;

  /** Linked sale unit / product_variants fields returned by branch catalog RPCs. */
  is_linked_sale_unit?: boolean;
  variant_id?: string | null;
  parent_product_id?: string | null;
  conversion_factor?: number | null;
  variant_type?: string | null;
  variant_price?: number | null;
  variant_purchase_price?: number | null;
  variant_image_url?: string | null;
  base_quantity?: number | null;

  /** Branch source context returned by authoritative catalog RPCs. */
  operational_branch_id?: string | null;
  inventory_branch_id?: string | null;
  pricing_branch_id?: string | null;
  has_custom_pricing?: boolean;

  is_weight_based?: boolean;
  calculated_weight?: number;
  calculated_price?: number;
  is_bulk_scan?: boolean;
  track_inventory?: boolean;
  min_stock_level?: number;
  max_stock_level?: number | null;
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
  purchase_price?: number;
  branch_id?: string;
  created_at: string;
  updated_at: string;
  products?: {
    name: string;
    purchase_price?: number;
    shelf_location?: string;
    barcode?: string;
    price?: number;
  };
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
  customer_id?: string | null;
  customer_name?: string;
  customer_phone?: string;
  source_channel?: 'store' | 'online' | string;
  loyalty_points_earned?: number;
  loyalty_voucher_id?: string | null;
  loyalty_voucher_amount?: number;
  voucher_remaining_egp?: number | null;
  amount_due?: number;
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
  branch_id?: string;
  source_channel?: 'online' | string;
  loyalty_points_earned?: number;
  loyalty_voucher_id?: string | null;
  loyalty_voucher_amount?: number;
}

export type OrderStatus = 'pending' | 'confirmed' | 'preparing' | 'ready' | 'shipped' | 'delivered' | 'cancelled';
export type OrderPaymentStatus = 'pending' | 'paid' | 'failed' | 'refunded';

export interface OrderItem {
  product_id: string;
  product_name: string;
  quantity: number;
  price: number;
  total?: number;
  image_url?: string | null;
  barcode?: string | null;
  shelf_location?: string | null;
  is_bulk?: boolean;
  is_weight_based?: boolean;
  bulk_quantity?: number | null;
}

export interface Order {
  id: string;
  created_at: string;
  updated_at?: string;
  total: number;
  status: OrderStatus;
  payment_status: OrderPaymentStatus;
  payment_method?: string | null;
  shipping_address?: string | null;
  shipping_cost?: number | null;
  items: OrderItem[];
  customer_id?: string | null;
  customer_name?: string | null;
  customer_email?: string | null;
  customer_phone?: string | null;
  customer_phone_verified?: boolean;
  notes?: string | null;
  tracking_number?: string | null;
  delivery_person?: string | null;
  governorate?: string | null;
  city?: string | null;
  area?: string | null;
  neighborhood?: string | null;
  branch_id?: string | null;
  cashier_id?: string | null;
  return_status?: 'none' | 'partial' | 'full';
}

export interface POSTab {
  id: string;
  tabName: string;
  cartItems: CartItem[];
  selectedCustomer: string;
  customerName: string;
  customerPhone: string;
  customerMembershipNumber?: string;
  customerBarcode?: string;
  customerPoints?: number;
  customerCredit?: number;
  search: string;
  searchResults: Product[];
  createdAt: Date | string;
}

export interface PurchaseItem {
  id?: string;
  purchase_id?: string;
  product_id?: string | null;
  product_name?: string | null;
  quantity: number;
  price?: number;
  purchase_price?: number;
  total?: number;
  batch_number?: string | null;
  expiry_date?: string | null;
  shelf_location?: string | null;
  notes?: string | null;
  products?: { name?: string | null; track_expiry?: boolean | null } | null;
}

export interface Purchase {
  id: string;
  supplier_id: string;
  invoice_number: string;
  date: string;
  total: number;
  paid: number;
  description?: string | null;
  invoice_file_url?: string | null;
  items?: PurchaseItem[];
  branch_id?: string | null;
  created_at?: string;
  updated_at?: string;
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
