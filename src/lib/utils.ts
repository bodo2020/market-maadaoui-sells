
import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export const formatDate = (dateString: string) => {
  const date = new Date(dateString);
  return new Intl.DateTimeFormat('ar-EG', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  }).format(date);
};

export const formatCompactDate = (dateString: string) => {
  const date = new Date(dateString);
  return new Intl.DateTimeFormat('ar-EG', {
    year: '2-digit',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  }).format(date);
};

export const getOrderStatusText = (status: string): string => {
  switch(status) {
    case 'pending': return 'قيد الانتظار';
    case 'processing': return 'قيد المعالجة';
    case 'shipped': return 'تم الشحن';
    case 'delivered': return 'تم التسليم';
    case 'cancelled': return 'ملغي';
    default: return 'غير معروف';
  }
};

export const getPaymentStatusText = (status: string): string => {
  switch(status) {
    case 'pending': return 'بانتظار الدفع';
    case 'paid': return 'مدفوع';
    case 'failed': return 'فشل الدفع';
    case 'refunded': return 'تم الاسترجاع';
    default: return 'غير معروف';
  }
};
