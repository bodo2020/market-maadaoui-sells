import { useQuery } from '@tanstack/react-query';
import { getCheckoutSnapshot } from '@/services/supabase/checkoutOrderService';
export function OrderDeliverySnapshot({ orderId }: { orderId?: string }) {
  const query = useQuery({ queryKey: ['order-delivery-snapshot', orderId], enabled: !!orderId, queryFn: () => getCheckoutSnapshot(orderId!) });
  if (query.isPending || !orderId) return null;
  if (query.error) return <p role="alert">تعذّر تحميل بيانات التوصيل المحفوظة.</p>;
  if (query.data?.checkout_version !== 1) return null;
  const a = query.data.shipping_snapshot;
  const hasMap = a?.latitude != null && a?.longitude != null && Number.isFinite(Number(a.latitude)) && Number.isFinite(Number(a.longitude));
  return <section className="rounded-lg border p-4 space-y-2" dir="rtl">
    <h3 className="font-semibold">بيانات العميل وقت الطلب</h3>
    <p>{query.data.customer_snapshot?.name}</p><p dir="ltr">{query.data.customer_snapshot?.phone}</p>
    <p>{[a?.governorate,a?.city,a?.area,a?.neighborhood,a?.address].filter(Boolean).join('، ')}</p>
    {hasMap && <a className="text-primary underline" target="_blank" rel="noopener noreferrer" href={`https://www.google.com/maps/search/?api=1&query=${Number(a.latitude)},${Number(a.longitude)}`}>فتح موقع التوصيل على الخريطة</a>}
  </section>;
}
