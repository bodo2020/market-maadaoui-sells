import { NavLink } from "react-router-dom";
import { BarChart3, Boxes, Clock, PackageSearch, ReceiptText, RotateCcw, ShoppingCart, TrendingUp, Users, WalletCards, Wallet } from "lucide-react";
import { cn } from "@/lib/utils";

const items = [
  { href: "/reports", label: "النظرة العامة", icon: BarChart3, end: true },
  { href: "/reports/sales", label: "المبيعات", icon: ReceiptText },
  { href: "/reports/profitability", label: "الربحية", icon: TrendingUp },
  { href: "/reports/payments", label: "وسائل الدفع", icon: WalletCards },
  { href: "/reports/returns", label: "المرتجعات", icon: RotateCcw },
  { href: "/reports/products", label: "المنتجات", icon: PackageSearch },
  { href: "/reports/inventory", label: "المخزون", icon: Boxes },
  { href: "/reports/shifts", label: "الكاشير والورديات", icon: Clock },
  { href: "/reports/online", label: "الأونلاين", icon: ShoppingCart },
  { href: "/reports/customers", label: "العملاء", icon: Users },
  { href: "/reports/costs", label: "المصروفات والموردون", icon: Wallet },
];

export default function ReportsSectionNav() {
  return (
    <nav aria-label="أقسام التقارير" className="flex w-full gap-2 overflow-x-auto rounded-2xl border bg-background/80 p-1.5 shadow-sm">
      {items.map((item) => {
        const Icon = item.icon;
        return (
          <NavLink key={item.href} to={item.href} end={item.end} className={({ isActive }) => cn("flex min-w-max items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition-colors", isActive ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:bg-muted hover:text-foreground")}>
            <Icon className="h-4 w-4" />{item.label}
          </NavLink>
        );
      })}
    </nav>
  );
}
