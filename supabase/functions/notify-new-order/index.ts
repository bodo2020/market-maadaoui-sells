import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { Resend } from "npm:resend@2.0.0";

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface OrderNotification {
  orderId: string;
  orderNumber: string;
  customerName: string;
  total: number;
  items: any[];
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { orderId, orderNumber, customerName, total, items }: OrderNotification = await req.json();

    console.log("Sending order notification:", { orderId, orderNumber });

    // تنسيق قائمة المنتجات
    const itemsList = items
      .map((item: any) => `<li>${item.product.name} - الكمية: ${item.quantity} - السعر: ${item.price} ج.م</li>`)
      .join("");

    const emailResponse = await resend.emails.send({
      from: "المضاوي ماركت <onboarding@resend.dev>",
      to: ["elmadawymarket@gmail.com"],
      subject: `طلب إلكتروني جديد #${orderNumber}`,
      html: `
        <div style="font-family: Arial, sans-serif; direction: rtl; text-align: right;">
          <h1 style="color: #2563eb;">طلب إلكتروني جديد!</h1>
          <div style="background-color: #f3f4f6; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <h2>تفاصيل الطلب</h2>
            <p><strong>رقم الطلب:</strong> ${orderNumber}</p>
            <p><strong>اسم العميل:</strong> ${customerName}</p>
            <p><strong>الإجمالي:</strong> ${total.toFixed(2)} ج.م</p>
          </div>
          <div style="margin: 20px 0;">
            <h3>المنتجات:</h3>
            <ul>${itemsList}</ul>
          </div>
          <p style="color: #6b7280; font-size: 14px; margin-top: 30px;">
            يرجى معالجة هذا الطلب في أقرب وقت ممكن.
          </p>
        </div>
      `,
    });

    console.log("Email sent successfully:", emailResponse);

    return new Response(
      JSON.stringify({ success: true, emailResponse }),
      {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  } catch (error: any) {
    console.error("Error sending order notification:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  }
};

serve(handler);
