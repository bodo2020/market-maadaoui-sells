
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
  shifts: Shift[];
  createdAt: Date;
  updatedAt: Date;
}

export interface Category {
  id: string;
  name: string;
  parentId?: string;
  children?: Category[];
  createdAt: Date;
  updatedAt: Date;
}

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
  date: Date;
  items: CartItem[];
  cashierId: string;
  subtotal: number;
  discount: number;
  total: number;
  profit: number;
  paymentMethod: 'cash' | 'card' | 'mixed';
  cardAmount?: number;
  cashAmount?: number;
  customerName?: string;
  customerPhone?: string;
  invoiceNumber: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface Expense {
  id: string;
  type: string;
  amount: number;
  description: string;
  date: Date;
  receiptUrl?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface Shift {
  id: string;
  employeeId: string;
  startTime: Date;
  endTime?: Date;
  totalHours?: number;
  createdAt: Date;
  updatedAt: Date;
}
