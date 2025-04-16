import { User, UserRole, Product, Category, Sale, Expense, Shift } from "@/types";
import { siteConfig } from "@/config/site";

// Categories
export const categories: Category[] = [
  {
    id: "1",
    name: "بقالة",
    created_at: new Date(),
    updated_at: new Date(),
    children: [
      {
        id: "101",
        name: "زيوت وسمن",
        parent_id: "1",
        created_at: new Date(),
        updated_at: new Date()
      },
      {
        id: "102",
        name: "أرز وسكر",
        parent_id: "1",
        created_at: new Date(),
        updated_at: new Date()
      },
      {
        id: "103",
        name: "معلبات",
        parent_id: "1",
        created_at: new Date(),
        updated_at: new Date()
      }
    ]
  },
  {
    id: "2",
    name: "مشروبات",
    created_at: new Date(),
    updated_at: new Date(),
    children: [
      {
        id: "201",
        name: "شاي وقهوة",
        parent_id: "2",
        created_at: new Date(),
        updated_at: new Date()
      },
      {
        id: "202",
        name: "عصائر",
        parent_id: "2",
        created_at: new Date(),
        updated_at: new Date()
      }
    ]
  },
  {
    id: "3",
    name: "منظفات",
    created_at: new Date(),
    updated_at: new Date()
  }
];

// Products
export const products: Product[] = [
  {
    id: "1",
    name: "سكر 1 كيلو",
    barcode: "6221031954818",
    image_urls: ["/placeholder.svg"],
    quantity: 100,
    price: 45,
    purchase_price: 40,
    is_offer: false,
    category_id: "102",
    is_bulk: false,
    barcode_type: "normal",
    bulk_enabled: false,
    created_at: new Date(),
    updated_at: new Date()
  },
  {
    id: "2",
    name: "زيت عباد الشمس 1 لتر",
    barcode: "6221031951255",
    image_urls: ["/placeholder.svg"],
    quantity: 50,
    price: 60,
    purchase_price: 52,
    is_offer: true,
    offer_price: 55,
    category_id: "101",
    is_bulk: false,
    barcode_type: "normal",
    bulk_enabled: false,
    created_at: new Date(),
    updated_at: new Date()
  },
  {
    id: "3",
    name: "أرز مصري 5 كيلو",
    barcode: "6221031953392",
    image_urls: ["/placeholder.svg"],
    quantity: 30,
    price: 180,
    purchase_price: 160,
    is_offer: false,
    category_id: "102",
    is_bulk: true,
    barcode_type: "normal",
    bulk_enabled: true,
    bulk_quantity: 5,
    bulk_price: 150,
    created_at: new Date(),
    updated_at: new Date()
  },
  {
    id: "4",
    name: "شاي ليبتون 100 كيس",
    barcode: "6221031958762",
    image_urls: ["/placeholder.svg"],
    quantity: 45,
    price: 120,
    purchase_price: 110,
    is_offer: true,
    offer_price: 115,
    category_id: "201",
    is_bulk: false,
    barcode_type: "normal",
    bulk_enabled: false,
    created_at: new Date(),
    updated_at: new Date()
  },
  {
    id: "5",
    name: "دقيق فاخر 1 كيلو",
    barcode: "6221031959124",
    image_urls: ["/placeholder.svg"],
    quantity: 80,
    price: 35,
    purchase_price: 30,
    is_offer: false,
    category_id: "102",
    is_bulk: false,
    barcode_type: "normal",
    bulk_enabled: false,
    created_at: new Date(),
    updated_at: new Date()
  }
];

// Users
export const users: User[] = [
  {
    id: "1",
    name: "أحمد المعداوي",
    role: UserRole.ADMIN,
    phone: "01012345678",
    password: "admin123",
    shifts: [],
    created_at: new Date(),
    updated_at: new Date(),
    username: "admin"
  },
  {
    id: "2",
    name: "محمد علي",
    role: UserRole.CASHIER,
    phone: "01023456789",
    password: "cashier123",
    shifts: [],
    created_at: new Date(),
    updated_at: new Date(),
    username: "cashier"
  },
  {
    id: "3",
    name: "سارة أحمد",
    role: UserRole.EMPLOYEE,
    phone: "01034567890",
    password: "employee123",
    shifts: [],
    created_at: new Date(),
    updated_at: new Date(),
    username: "employee"
  },
  {
    id: "4",
    name: "يوسف محمود",
    role: UserRole.DELIVERY,
    phone: "01045678901",
    password: "delivery123",
    shifts: [],
    created_at: new Date(),
    updated_at: new Date(),
    username: "delivery"
  }
];

// Sales
export const sales: Sale[] = [
  {
    id: "1",
    date: new Date().toISOString(),
    items: [
      {
        product: products[0],
        quantity: 2,
        price: products[0].price,
        discount: 0,
        total: products[0].price * 2
      },
      {
        product: products[2],
        quantity: 1,
        price: products[2].price,
        discount: 0,
        total: products[2].price
      }
    ],
    cashier_id: "2",
    subtotal: products[0].price * 2 + products[2].price,
    discount: 0,
    total: products[0].price * 2 + products[2].price,
    profit: (products[0].price - products[0].purchase_price) * 2 + (products[2].price - products[2].purchase_price),
    payment_method: 'cash',
    invoice_number: "INV-001",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  },
  {
    id: "2",
    date: new Date().toISOString(),
    items: [
      {
        product: products[1],
        quantity: 3,
        price: products[1].offer_price || products[1].price,
        discount: products[1].offer_price ? (products[1].price - products[1].offer_price) * 3 : 0,
        total: (products[1].offer_price || products[1].price) * 3
      }
    ],
    cashier_id: "2",
    subtotal: (products[1].offer_price || products[1].price) * 3,
    discount: products[1].offer_price ? (products[1].price - products[1].offer_price) * 3 : 0,
    total: (products[1].offer_price || products[1].price) * 3,
    profit: ((products[1].offer_price || products[1].price) - products[1].purchase_price) * 3,
    payment_method: 'card',
    invoice_number: "INV-002",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  }
];

// Expenses
export const expenses: Expense[] = [
  {
    id: "1",
    type: "إيجار",
    amount: 3000,
    description: "إيجار المحل لشهر ابريل",
    date: new Date().toISOString(),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  },
  {
    id: "2",
    type: "كهرباء",
    amount: 750,
    description: "فاتورة كهرباء شهر ابريل",
    date: new Date().toISOString(),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  },
  {
    id: "3",
    type: "مرتبات",
    amount: 5000,
    description: "مرتبات الموظفين لشهر ابريل",
    date: new Date().toISOString(),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  }
];

// Function to format currency
export const formatCurrency = (amount: number) => {
  return `${amount.toFixed(2)} ${siteConfig.currency}`;
};
