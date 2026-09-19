import { useQuery } from '@tanstack/react-query';
import { MapPinCheck, ShieldCheck, TriangleAlert, WalletCards } from 'lucide-react';
import { getCheckoutSnapshot } from '@/services/supabase/checkoutOrderService';
import { getOrderDeliveryProof, type OrderDeliveryProof } from '@/services/supabase/deliveryProofV1Service';

const formatDateTime = (value?: string | null) => {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('ar-EG', {
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date);
};

const locationMeta = (proof: OrderDeliveryProof) => {
  if (proof.location_status === 'verified') {
    return {
      label: 'الموقع متوافق مع نقطة التسليم',
      className: 'border-emerald-200 bg-emerald-50 text-emerald-900',
    };
  }
  if (proof.location_status === 'low_accuracy') {
    return {
      label: 'تم تسجيل الموقع لكن دقة GPS منخفضة',
      className: 'border-amber-200 bg-amber-50 text-amber-950',
    };
  }
  if (proof.location_status === 'far_from_dropoff') {
    return {
      label: 'موقع التسليم المسجل بعيد عن نقطة العميل',
      className: 'border-red-200 bg-red-50 text-red-950',
    };
  }
  return {
    label: 'لم يتم تسجيل موقع صالح وقت التسليم',
    className: 'border-slate-200 bg-slate-50 text-slate-800',
  };
};

export function OrderDeliverySnapshot({ orderId }: { orderId?: string }) {
  const snapshotQuery = useQuery({
    queryKey: ['order-delivery-snapshot', orderId],
    enabled: !!orderId,
    queryFn: () => getCheckoutSnapshot(orderId!),
  });

  const proofQuery = useQuery({
    queryKey: ['order-delivery-proof', orderId],
    enabled: !!orderId,
    queryFn: () => getOrderDeliveryProof(orderId!),
    retry: false,
  });

  if (!orderId) return null;
  if (snapshotQuery.isPending) return null;
  if (snapshotQuery.error) return <p role="alert">تعذّر تحميل بيانات التوصيل المحفوظة.</p>;

  const snapshot = snapshotQuery.data;
  const a = snapshot?.shipping_snapshot;
  const hasMap =
    a?.latitude != null &&
    a?.longitude != null &&
    Number.isFinite(Number(a.latitude)) &&
    Number.isFinite(Number(a.longitude));
  const proof = proofQuery.data;
  const proofLocation = proof ? locationMeta(proof) : null;
  const hasProofMap =
    proof?.latitude != null &&
    proof?.longitude != null &&
    Number.isFinite(Number(proof.latitude)) &&
    Number.isFinite(Number(proof.longitude));

  return (
    <div className="space-y-4" dir="rtl">
      {snapshot?.checkout_version === 1 && (
        <section className="space-y-2 rounded-lg border p-4">
          <h3 className="font-semibold">بيانات العميل وقت الطلب</h3>
          <p>{snapshot.customer_snapshot?.name}</p>
          <p dir="ltr" className="text-right">{snapshot.customer_snapshot?.phone}</p>
          <p>{[a?.governorate, a?.city, a?.area, a?.neighborhood, a?.address].filter(Boolean).join('، ')}</p>
          {hasMap && (
            <a
              className="text-primary underline"
              target="_blank"
              rel="noopener noreferrer"
              href={`https://www.google.com/maps/search/?api=1&query=${Number(a.latitude)},${Number(a.longitude)}`}
            >
              فتح موقع التوصيل على الخريطة
            </a>
          )}
        </section>
      )}

      {proofQuery.isLoading && (
        <section className="rounded-lg border p-4 text-sm text-muted-foreground">
          جاري تحميل إثبات التسليم…
        </section>
      )}

      {proofQuery.isError && (
        <section className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
          تعذّر تحميل إثبات التسليم لهذا الطلب.
        </section>
      )}

      {proof && (
        <section className="space-y-4 rounded-2xl border border-emerald-100 bg-white p-4 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2 font-black text-[#005931]">
                <ShieldCheck className="h-5 w-5" />
                إثبات تسليم محفوظ
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                سجل ثابت غير قابل للتعديل بعد إتمام التسليم.
              </p>
            </div>
            <span className={`rounded-full px-3 py-1 text-xs font-bold ${
              proof.pin_verified
                ? 'bg-emerald-100 text-emerald-900'
                : 'bg-amber-100 text-amber-950'
            }`}>
              {proof.pin_verified ? 'PIN مؤكد' : 'PIN غير مؤكد'}
            </span>
          </div>

          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-xl bg-slate-50 p-3">
              <p className="text-[11px] text-muted-foreground">وقت التسليم</p>
              <p className="mt-1 font-bold">{formatDateTime(proof.delivered_at)}</p>
            </div>
            <div className="rounded-xl bg-slate-50 p-3">
              <p className="text-[11px] text-muted-foreground">المندوب</p>
              <p className="mt-1 font-bold">{proof.driver_name || '—'}</p>
            </div>
            <div className="rounded-xl bg-slate-50 p-3">
              <p className="text-[11px] text-muted-foreground">طريقة التحقق</p>
              <p className="mt-1 font-bold">
                {proof.verification_method === 'group_lead_pin' ? 'PIN المجموعة' : 'PIN الطلب'}
              </p>
            </div>
            <div className="rounded-xl bg-slate-50 p-3">
              <p className="text-[11px] text-muted-foreground">التحصيل</p>
              <p className="mt-1 font-bold">
                {Number(proof.collected_amount || 0).toLocaleString('ar-EG', { maximumFractionDigits: 2 })} ج.م
              </p>
            </div>
          </div>

          {proofLocation && (
            <div className={`rounded-xl border p-3 ${proofLocation.className}`}>
              <div className="flex items-start gap-2">
                {proof.location_status === 'verified'
                  ? <MapPinCheck className="mt-0.5 h-4 w-4 shrink-0" />
                  : <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />}
                <div className="min-w-0">
                  <p className="text-sm font-black">{proofLocation.label}</p>
                  <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs">
                    {proof.accuracy_m != null && <span>دقة GPS ≈ {Math.round(Number(proof.accuracy_m))} م</span>}
                    {proof.distance_to_dropoff_m != null && (
                      <span>البعد عن نقطة العميل ≈ {Math.round(Number(proof.distance_to_dropoff_m))} م</span>
                    )}
                  </div>
                  {hasProofMap && (
                    <a
                      className="mt-2 inline-block text-xs font-bold underline"
                      target="_blank"
                      rel="noopener noreferrer"
                      href={`https://www.google.com/maps/search/?api=1&query=${Number(proof.latitude)},${Number(proof.longitude)}`}
                    >
                      فتح موقع التسليم المسجل
                    </a>
                  )}
                </div>
              </div>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-x-5 gap-y-2 rounded-xl bg-slate-50 p-3 text-xs">
            <span className="flex items-center gap-1.5 font-bold">
              <WalletCards className="h-4 w-4" />
              {proof.payment_method || '—'}
            </span>
            <span>حالة الدفع: {proof.payment_status || '—'}</span>
            {proof.order_total != null && (
              <span>قيمة الطلب: {Number(proof.order_total).toLocaleString('ar-EG', { maximumFractionDigits: 2 })} ج.م</span>
            )}
            {proof.payment_reference && <span>مرجع الدفع: {proof.payment_reference}</span>}
          </div>
        </section>
      )}
    </div>
  );
}
