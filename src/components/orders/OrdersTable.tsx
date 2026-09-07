import { Order } from '@/types';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { OrderActionsMenu } from './OrderActionsMenu';
import { PackageSearch, ArrowUpLeft } from 'lucide-react';
import './orders-workspace.css';

interface OrdersTableProps {
  orders: Order[];
  onShowCustomer: (order: Order) => void;
  onArchive: (order: Order) => void;
  onCancel: (order: Order) => void;
  onProcess: (order: Order) => void;
  onComplete: (order: Order) => void;
  onPaymentConfirm: (order: Order) => void;
  onAssignDelivery: (order: Order) => void;
  onOrderUpdate?: () => void;
  onReturn?: (order: Order) => void;
  onPrintInvoice?: (order: Order) => void;
  selectedOrders?: string[];
  onSelectOrder?: (orderId: string) => void;
  onSelectAll?: () => void;
}


const states: Record<string,string> = {pending:'طلب جديد',confirmed:'تم التأكيد',preparing:'قيد التجهيز',ready:'جاهز',shipped:'في الطريق',delivered:'تم التسليم',cancelled:'ملغي'};
const payments: Record<string,string> = {pending:'غير مدفوع',paid:'مدفوع',failed:'تعذّر الدفع',refunded:'تم رد المبلغ'};
const number = (order: Order) => order.tracking_number || order.id.slice(0,8);
const date = (value: string) => new Date(value).toLocaleString('ar-EG',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'});
export function OrdersTable(props: OrdersTableProps) {
  const {orders,selectedOrders=[],onSelectAll,onSelectOrder,onShowCustomer,onProcess} = props;
  const selectable = orders.filter(o => !['shipped','delivered','cancelled'].includes(o.status));
  const selected = selectable.filter(o => selectedOrders.includes(o.id)).length;
  const selection = (order: Order) => <Checkbox disabled={['shipped','delivered','cancelled'].includes(order.status)} checked={selectedOrders.includes(order.id)} onCheckedChange={() => onSelectOrder?.(order.id)} aria-label={`تحديد الطلب ${number(order)}`} />;
  const status = (order: Order) => <span className={`pos-order-status state-${order.status}`}>{states[order.status] || order.status}</span>;
  const payment = (order: Order) => <span className={`pos-order-payment payment-${order.payment_status}`}>{payments[order.payment_status] || order.payment_status}</span>;
  const actions = (order: Order) => <OrderActionsMenu order={order} onShowCustomer={() => onShowCustomer(order)} onArchive={() => props.onArchive(order)} onCancel={() => props.onCancel(order)} onProcess={() => onProcess(order)} onComplete={() => props.onComplete(order)} onPaymentConfirm={() => props.onPaymentConfirm(order)} onAssignDelivery={() => props.onAssignDelivery(order)} onReturn={props.onReturn ? () => props.onReturn!(order) : undefined} onPrintInvoice={props.onPrintInvoice ? () => props.onPrintInvoice!(order) : undefined} />;
  if (!orders.length) return <div className="pos-orders-empty"><PackageSearch size={40} /><h2>مفيش طلبات بالاختيار ده</h2><p>جرّب حالة تانية أو غيّر كلمة البحث.</p></div>;
  return <>
    <div className="pos-orders-desktop"><table className="pos-orders-table"><thead><tr><th><Checkbox checked={selected > 0 && selected < selectable.length ? 'indeterminate' : selected > 0 && selected === selectable.length} disabled={!selectable.length} onCheckedChange={onSelectAll} aria-label="تحديد الطلبات القابلة للإلغاء" /></th><th>الطلب</th><th>العميل والتوصيل</th><th>الإجمالي</th><th>الدفع</th><th>الحالة</th><th><span className="sr-only">الإجراءات</span></th></tr></thead><tbody>{orders.map(order => <tr key={order.id} data-selected={selectedOrders.includes(order.id)}><td>{selection(order)}</td><td><button className="pos-order-number" onClick={() => onProcess(order)} dir="ltr">#{number(order)}</button><time dateTime={order.created_at}>{date(order.created_at)}</time></td><td><button className="pos-order-customer" onClick={() => onShowCustomer(order)}>{order.customer_name || 'الاسم غير مسجّل'}</button><p className="pos-order-address">{order.shipping_address || [order.area,order.neighborhood].filter(Boolean).join('، ') || 'العنوان غير مسجّل'}</p></td><td className="pos-order-amount">{Number(order.total).toFixed(2)} <small>ج.م</small></td><td>{payment(order)}</td><td>{status(order)}</td><td><div className="pos-order-row-actions"><Button variant="outline" onClick={() => onProcess(order)}>فتح الطلب<ArrowUpLeft size={16} /></Button>{actions(order)}</div></td></tr>)}</tbody></table></div>
    <div className="pos-orders-cards">{orders.map(order => <article key={order.id} className="pos-order-card" data-selected={selectedOrders.includes(order.id)}><header><div className="flex items-center gap-3">{selection(order)}<button className="pos-order-number" onClick={() => onProcess(order)} dir="ltr">#{number(order)}</button></div>{actions(order)}</header><div className="flex flex-wrap gap-2">{status(order)}{payment(order)}</div><button className="pos-order-customer" onClick={() => onShowCustomer(order)}>{order.customer_name || 'الاسم غير مسجّل'}</button><p className="pos-order-address">{order.shipping_address || 'العنوان غير مسجّل'}</p><div className="pos-order-card-meta"><span>{order.items?.length || 0} أصناف</span><time dateTime={order.created_at}>{date(order.created_at)}</time></div><footer><strong>{Number(order.total).toFixed(2)} <small>ج.م</small></strong><Button onClick={() => onProcess(order)}>فتح الطلب<ArrowUpLeft size={16} /></Button></footer></article>)}</div>
  </>;
}
