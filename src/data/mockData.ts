import { User, UserRole, Product, Category, Sale, Expense, Shift } from "@/types";
import { siteConfig } from "@/config/site";

// Categories
export const categories: Category[] = [
  {
    id: "1",
    name: "بقالة",
    createdAt: new Date(),
    updatedAt: new Date(),
    children: [
      {
        id: "101",
        name: "زيوت وسمن",
        parentId: "1",
        createdAt: new Date(),
        updatedAt: new Date()
      },
      {
        id: "102",
        name: "أرز وسكر",
        parentId: "1",
        createdAt: new Date(),
        updatedAt: new Date()
      },
      {
        id: "103",
        name: "معلبات",
        parentId: "1",
        createdAt: new Date(),
        updatedAt: new Date()
      }
    ]
  },
  {
    id: "2",
    name: "مشروبات",
    createdAt: new Date(),
    updatedAt: new Date(),
    children: [
      {
        id: "201",
        name: "شاي وقهوة",
        parentId: "2",
        createdAt: new Date(),
        updatedAt: new Date()
      },
      {
        id: "202",
        name: "عصائر",
        parentId: "2",
        createdAt: new Date(),
        updatedAt: new Date()
      }
    ]
  },
  {
    id: "3",
    name: "منظفات",
    createdAt: new Date(),
    updatedAt: new Date()
  }
];

// Products
export const products: Product[] = [
  {
    id: "1",
    name: "سكر 1 كيلو",
    barcode: "6221031954818",
    imageUrls: ["/placeholder.svg"],
    quantity: 100,
    price: 45,
    purchasePrice: 40,
    isOffer: false,
    categoryId: "102",
    isBulk: false,
    barcode_type: "normal",
    bulk_enabled: false,
    created_at: new Date(),
    updated_at: new Date()
  },
  {
    id: "2",
    name: "زيت عباد الشمس 1 لتر",
    barcode: "6221031951255",
    imageUrls: ["/placeholder.svg"],
    quantity: 50,
    price: 60,
    purchasePrice: 52,
    isOffer: true,
    offerPrice: 55,
    categoryId: "101",
    isBulk: false,
    barcode_type: "normal",
    bulk_enabled: false,
    created_at: new Date(),
    updated_at: new Date()
  },
  {
    id: "3",
    name: "أرز مصري 5 كيلو",
    barcode: "6221031953392",
    imageUrls: ["/placeholder.svg"],
    quantity: 30,
    price: 180,
    purchasePrice: 160,
    isOffer: false,
    categoryId: "102",
    isBulk: true,
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
    imageUrls: ["/placeholder.svg"],
    quantity: 45,
    price: 120,
    purchasePrice: 110,
    isOffer: true,
    offerPrice: 115,
    categoryId: "201",
    isBulk: false,
    barcode_type: "normal",
    bulk_enabled: false,
    created_at: new Date(),
    updated_at: new Date()
  },
  {
    id: "5",
    name: "دقيق فاخر 1 كيلو",
    barcode: "6221031959124",
    imageUrls: ["/placeholder.svg"],
    quantity: 80,
    price: 35,
    purchasePrice: 30,
    isOffer: false,
    categoryId: "102",
    isBulk: false,
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
    createdAt: new Date(),
    updatedAt: new Date()
  },
  {
    id: "2",
    name: "محمد علي",
    role: UserRole.CASHIER,
    phone: "01023456789",
    password: "cashier123",
    shifts: [],
    createdAt: new Date(),
    updatedAt: new Date()
  },
  {
    id: "3",
    name: "سارة أحمد",
    role: UserRole.EMPLOYEE,
    phone: "01034567890",
    password: "employee123",
    shifts: [],
    createdAt: new Date(),
    updatedAt: new Date()
  },
  {
    id: "4",
    name: "يوسف محمود",
    role: UserRole.DELIVERY,
    phone: "01045678901",
    password: "delivery123",
    shifts: [],
    createdAt: new Date(),
    updatedAt: new Date()
  }
];

// Sales
export const sales: Sale[] = [
  {
    id: "1",
    date: new Date(),
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
    cashierId: "2",
    subtotal: products[0].price * 2 + products[2].price,
    discount: 0,
    total: products[0].price * 2 + products[2].price,
    profit: (products[0].price - products[0].purchasePrice) * 2 + (products[2].price - products[2].purchasePrice),
    paymentMethod: 'cash',
    invoiceNumber: "INV-001",
    createdAt: new Date(),
    updatedAt: new Date()
  },
  {
    id: "2",
    date: new Date(),
    items: [
      {
        product: products[1],
        quantity: 3,
        price: products[1].offerPrice || products[1].price,
        discount: products[1].offerPrice ? (products[1].price - products[1].offerPrice) * 3 : 0,
        total: (products[1].offerPrice || products[1].price) * 3
      }
    ],
    cashierId: "2",
    subtotal: (products[1].offerPrice || products[1].price) * 3,
    discount: products[1].offerPrice ? (products[1].price - products[1].offerPrice) * 3 : 0,
    total: (products[1].offerPrice || products[1].price) * 3,
    profit: ((products[1].offerPrice || products[1].price) - products[1].purchasePrice) * 3,
    paymentMethod: 'card',
    invoiceNumber: "INV-002",
    createdAt: new Date(),
    updatedAt: new Date()
  }
];

// Expenses
export const expenses: Expense[] = [
  {
    id: "1",
    type: "إيجار",
    amount: 3000,
    description: "إيجار المحل لشهر ابريل",
    date: new Date(),
    createdAt: new Date(),
    updatedAt: new Date()
  },
  {
    id: "2",
    type: "كهرباء",
    amount: 750,
    description: "فاتورة كهرباء شهر ابريل",
    date: new Date(),
    createdAt: new Date(),
    updatedAt: new Date()
  },
  {
    id: "3",
    type: "مرتبات",
    amount: 5000,
    description: "مرتبات الموظفين لشهر ابريل",
    date: new Date(),
    createdAt: new Date(),
    updatedAt: new Date()
  }
];

// Function to format currency
export const formatCurrency = (amount: number) => {
  return `${amount.toFixed(2)} ${siteConfig.currency}`;
};
