import {
  LayoutDashboard,
  ListChecks,
  ShoppingCart,
  Settings,
  Users,
  BarChart,
  ReceiptText
} from "lucide-react"

import { UserRole } from "@/types"

import { MainNavItem } from "@/types"

interface SidebarProps {
  items: MainNavItem[]
}

export function Sidebar({ items }: SidebarProps) {
  return (
    <div className="w-60 border-r flex-col space-y-4 bg-white p-4">
      <div className="px-3 py-2">
        <h2 className="mb-2 px-4 text-lg font-semibold tracking-tight">
          المتجر
        </h2>
        <div className="space-y-1">
          {items.map((item) => (
            item.href ? (
              <a
                key={item.title}
                href={item.href}
                className="group flex w-full items-center rounded-md border border-transparent px-3 py-2 text-sm font-medium hover:bg-secondary hover:text-foreground focus:outline-none"
              >
                <item.icon className="mr-2 h-4 w-4" />
                <span>{item.title}</span>
              </a>
            ) : null
          ))}
        </div>
      </div>
    </div>
  )
}

export const defaultItems: MainNavItem[] = [
  {
    title: "لوحة التحكم",
    href: "/dashboard",
    icon: LayoutDashboard,
    role: [UserRole.ADMIN, UserRole.CASHIER, UserRole.EMPLOYEE],
  },
  {
    title: "المبيعات",
    href: "/pos",
    icon: ShoppingCart,
    role: [UserRole.ADMIN, UserRole.CASHIER],
  },
  {
    title: "المنتجات",
    href: "/products",
    icon: ListChecks,
    role: [UserRole.ADMIN, UserRole.EMPLOYEE],
  },
  {
    title: "المستخدمين",
    href: "/users",
    icon: Users,
    role: [UserRole.ADMIN],
  },
  {
    title: "المصروفات",
    href: "/expenses",
    icon: BarChart,
    role: [UserRole.ADMIN],
  },
  {
    title: "الفواتير",
    href: "/invoices",
    icon: ReceiptText,
    role: [UserRole.ADMIN, UserRole.CASHIER],
  },
  {
    title: "الإعدادات",
    href: "/settings",
    icon: Settings,
    role: [UserRole.ADMIN],
  },
]
