
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Purchase } from "@/types";

export async function fetchPurchases() {
  try {
    const { data, error } = await supabase
      .from("purchases")
      .select("*")
      .order("date", { ascending: false });

    if (error) {
      console.error("Error fetching purchases:", error);
      toast.error("فشل في جلب المشتريات");
      return [];
    }

    return data as Purchase[];
  } catch (error) {
    console.error("Unexpected error fetching purchases:", error);
    toast.error("حدث خطأ غير متوقع");
    return [];
  }
}

export async function createPurchase(purchaseData: any) {
  try {
    // First, create the purchase record
    const { data: purchase, error: purchaseError } = await supabase
      .from("purchases")
      .insert({
        supplier_id: purchaseData.supplier_id,
        invoice_number: purchaseData.invoice_number,
        date: purchaseData.date,
        total: purchaseData.total,
        paid: purchaseData.paid,
        description: purchaseData.description
      })
      .select()
      .single();

    if (purchaseError) {
      console.error("Error creating purchase:", purchaseError);
      toast.error("فشل في إنشاء فاتورة الشراء");
      return null;
    }

    // Then update product quantities if items were provided
    if (purchaseData.items && purchaseData.items.length > 0) {
      for (const item of purchaseData.items) {
        // Get current product
        const { data: product, error: productError } = await supabase
          .from("products")
          .select("quantity")
          .eq("id", item.product_id)
          .single();

        if (productError) {
          console.error(`Error fetching product ${item.product_id}:`, productError);
          continue;
        }

        // Update product quantity
        const newQuantity = (product.quantity || 0) + item.quantity;
        const { error: updateError } = await supabase
          .from("products")
          .update({ quantity: newQuantity })
          .eq("id", item.product_id);

        if (updateError) {
          console.error(`Error updating product ${item.product_id}:`, updateError);
        }
      }
    }

    toast.success("تم إنشاء فاتورة الشراء بنجاح");
    return purchase as Purchase;
  } catch (error) {
    console.error("Unexpected error creating purchase:", error);
    toast.error("حدث خطأ غير متوقع");
    return null;
  }
}

export async function deletePurchase(id: string) {
  try {
    const { error } = await supabase.from("purchases").delete().eq("id", id);

    if (error) {
      console.error("Error deleting purchase:", error);
      toast.error("فشل في حذف فاتورة الشراء");
      return false;
    }

    toast.success("تم حذف فاتورة الشراء بنجاح");
    return true;
  } catch (error) {
    console.error("Unexpected error deleting purchase:", error);
    toast.error("حدث خطأ غير متوقع");
    return false;
  }
}

export async function getPurchaseById(id: string) {
  try {
    const { data, error } = await supabase
      .from("purchases")
      .select("*")
      .eq("id", id)
      .single();

    if (error) {
      console.error("Error fetching purchase:", error);
      toast.error("فشل في جلب بيانات فاتورة الشراء");
      return null;
    }

    return data as Purchase;
  } catch (error) {
    console.error("Unexpected error fetching purchase:", error);
    toast.error("حدث خطأ غير متوقع");
    return null;
  }
}
