import { Order } from '@/types';
export const orderFilters = [
  ['all','كل الطلبات'],['pending','جديدة'],['preparing','قيد التجهيز'],['ready','جاهزة'],['shipped','في الطريق'],['delivered','مكتملة'],['cancelled','ملغاة'],['unpaid','غير مدفوعة'],
] as const;
export function matchesOrderFilter(order: Order, filter: string) {
  if (filter === 'all') return true;
  if (filter === 'unpaid') return order.payment_status === 'pending' && order.status !== 'cancelled';
  if (filter === 'preparing') return order.status === 'confirmed' || order.status === 'preparing';
  return order.status === filter;
}
export function OrderStats({ orders, activeTab, onTabChange }: { orders: Order[]; activeTab: string; onTabChange: (tab: string) => void }) {
  return <nav className="pos-order-filters" aria-label="تصفية الطلبات حسب الحالة">{orderFilters.map(([key,label]) => <button type="button" key={key} aria-pressed={activeTab === key} onClick={() => onTabChange(key)}><span>{label}</span><span className="pos-order-count">{orders.filter(order => matchesOrderFilter(order,key)).length}</span></button>)}</nav>;
}
