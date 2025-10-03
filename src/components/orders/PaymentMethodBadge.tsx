import { Badge } from "@/components/ui/badge";
import { Wallet, CreditCard, Smartphone, Building2, HelpCircle } from "lucide-react";

interface PaymentMethodBadgeProps {
  paymentMethod: string | null | undefined;
}

const paymentMethodConfig: Record<string, { icon: any; color: string; label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  'cash': { 
    icon: Wallet, 
    color: 'text-green-600', 
    label: 'الدفع عند الاستلام',
    variant: 'default'
  },
  'card': { 
    icon: CreditCard, 
    color: 'text-blue-600', 
    label: 'بطاقة ائتمانية',
    variant: 'default'
  },
  'e-wallet': { 
    icon: Smartphone, 
    color: 'text-purple-600', 
    label: 'محفظة إلكترونية',
    variant: 'default'
  },
  'bank_transfer': { 
    icon: Building2, 
    color: 'text-orange-600', 
    label: 'تحويل بنكي',
    variant: 'default'
  },
};

export function PaymentMethodBadge({ paymentMethod }: PaymentMethodBadgeProps) {
  const method = paymentMethod?.toLowerCase() || 'cash';
  const config = paymentMethodConfig[method] || {
    icon: HelpCircle,
    color: 'text-muted-foreground',
    label: paymentMethod || 'غير محدد',
    variant: 'outline' as const
  };

  const Icon = config.icon;

  return (
    <Badge variant={config.variant} className="gap-2 px-3 py-1.5">
      <Icon className={`h-4 w-4 ${config.color}`} />
      <span className="font-medium">{config.label}</span>
    </Badge>
  );
}
