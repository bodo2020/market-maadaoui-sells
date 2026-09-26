import { supabase } from "@/integrations/supabase/client";

export type ManualDeliveryMethod = "staff" | "partner" | "external" | "customer_pickup";

export type ManualDeliveryWorkspace = {
  order_status: string;
  payment_status: string;
  payment_method: string;
  combined_order: boolean;
  assigned_driver: boolean;
  proof: null | {
    method: ManualDeliveryMethod;
    handler_name: string;
    recipient_name: string;
    confirmation_reference: string;
    delivered_at: string;
  };
};

const rpc = supabase.rpc.bind(supabase) as unknown as (
  fn: string,
  params: Record<string, unknown>,
) => Promise<{ data: unknown; error: { message: string } | null }>;

export async function getManualOrderDelivery(orderId: string): Promise<ManualDeliveryWorkspace> {
  const { data, error } = await rpc("get_manual_order_delivery_v1", { p_order_id: orderId });
  if (error) throw new Error(error.message);
  return data as ManualDeliveryWorkspace;
}

export async function completeOrderWithoutDriver(input: {
  orderId: string;
  method: ManualDeliveryMethod;
  handlerName: string;
  recipientName: string;
  confirmationReference: string;
  note: string;
}) {
  const { data, error } = await rpc("complete_order_without_driver_v1", {
    p_order_id: input.orderId,
    p_delivery_method: input.method,
    p_handler_name: input.handlerName.trim(),
    p_recipient_name: input.recipientName.trim(),
    p_confirmation_reference: input.confirmationReference.trim(),
    p_note: input.note.trim() || null,
  });
  if (error) {
    const messages: Record<string, string> = {
      permission_denied: "ليس لديك صلاحية إنهاء توصيل هذا الطلب.",
      order_not_shipped: "الطلب لم يصل إلى مرحلة خرج للتوصيل، أو تغيرت حالته. حدّثه أولًا.",
      combined_order_requires_route: "الطلب يضم عدة متاجر، ويحتاج إغلاق رحلة المجموعة من مركز العمليات.",
      driver_already_assigned: "يوجد مندوب مكلف بهذا الطلب. غيّر التعيين من شاشة التوصيل أولًا.",
      payment_reconciliation_required: "يلزم إتمام مسار تحصيل وتسوية النقدية أولًا. هذا الإجراء متاح حاليًا للطلبات المدفوعة بغير النقد.",
      invalid_delivery_proof: "أكمل بيانات منفذ التسليم والمستلم ومرجع التأكيد.",
    };
    throw new Error(messages[error.message] || error.message);
  }
  return data as { order_id: string; idempotent: boolean };
}
