import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Purchase } from "@/types";

export async function fetchPurchases() {
  try {
    const { data, error } = await supabase
      .from("purchases")
      .select("*, suppliers(name)")
      .order("date", { ascending: false });

    if (error) {
      console.error("Error fetching purchases:", error);
      toast.error("فشل في جلب المشتريات");
      return [];
    }

    return data as (Purchase & { suppliers: { name: string } })[];
  } catch (error) {
    console.error("Unexpected error fetching purchases:", error);
    toast.error("حدث خطأ غير متوقع");
    return [];
  }
}

export async function createPurchase(purchaseData: any) {
  try {
    // Generate invoice number if not provided
    if (!purchaseData.invoice_number) {
      const date = new Date();
      const year = date.getFullYear();
      const month = (date.getMonth() + 1).toString().padStart(2, '0');
      const day = date.getDate().toString().padStart(2, '0');
      const randomPart = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
      purchaseData.invoice_number = `P-${year}${month}${day}-${randomPart}`;
    }

    // First, check if there's enough cash in the store register
    if (purchaseData.paid > 0) {
      const { data: deductionResult, error: deductionError } = await supabase.functions.invoke(
        'add-cash-transaction',
        {
          body: {
            amount: purchaseData.paid,
            transaction_type: 'withdrawal',
            register_type: 'store',
            notes: `دفع مستحقات المورد ${purchaseData.supplier_name || ''} - فاتورة رقم: ${purchaseData.invoice_number}`
          }
        }
      );

      if (deductionError) {
        console.error("Error deducting from cash register:", deductionError);
        toast.error("فشل في خصم المبلغ من الخزنة - تأكد من وجود رصيد كافي");
        return null;
      }
    }

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

    // Then add items to the purchase_items table if they were provided
    if (purchaseData.items && purchaseData.items.length > 0) {
      const purchaseItems = purchaseData.items.map((item: any) => ({
        purchase_id: purchase.id,
        product_id: item.product_id,
        quantity: item.quantity,
        price: item.price,
        total: item.total,
        batch_number: item.batch_number || null,
        expiry_date: item.expiry_date || null,
        shelf_location: item.shelf_location || null,
        notes: item.notes || null
      }));

      const { error: itemsError } = await supabase
        .from("purchase_items")
        .insert(purchaseItems);

      if (itemsError) {
        console.error("Error adding purchase items:", itemsError);
        // We don't return early here - we'll still update the product quantities even if
        // storing the line items fails
      }

      // Update product quantities and purchase prices
      for (const item of purchaseData.items) {
        // Get current product
        const { data: product, error: productError } = await supabase
          .from("products")
          .select("quantity, purchase_price")
          .eq("id", item.product_id)
          .single();

        if (productError) {
          console.error(`Error fetching product ${item.product_id}:`, productError);
          continue;
        }

        // Update product quantity and purchase price
        const newQuantity = (product.quantity || 0) + item.quantity;
        const updateData: any = { quantity: newQuantity };
        
        // Update purchase price if it's different from current price
        if (item.price !== product.purchase_price) {
          updateData.purchase_price = item.price;
        }
        
        const { error: updateError } = await supabase
          .from("products")
          .update(updateData)
          .eq("id", item.product_id);

        if (updateError) {
          console.error(`Error updating product ${item.product_id}:`, updateError);
        }
      }
    }

    // Update supplier balance
    if (purchase) {
      const remainingAmount = purchaseData.total - purchaseData.paid;
      if (remainingAmount !== 0) {
        // Get current supplier balance
        const { data: supplier, error: supplierError } = await supabase
          .from("suppliers")
          .select("balance")
          .eq("id", purchaseData.supplier_id)
          .single();

        if (!supplierError && supplier) {
          // Update supplier balance
          // Negative balance means the supplier owes the business money
          // Positive balance means the business owes money to the supplier
          const currentBalance = supplier.balance || 0;
          const newBalance = currentBalance + remainingAmount;
          
          const { error: updateError } = await supabase
            .from("suppliers")
            .update({ balance: newBalance })
            .eq("id", purchaseData.supplier_id);

          if (updateError) {
            console.error("Error updating supplier balance:", updateError);
          }
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
    // Get purchase details to update supplier balance
    const { data: purchase, error: purchaseError } = await supabase
      .from("purchases")
      .select("*")
      .eq("id", id)
      .single();

    if (purchaseError) {
      console.error("Error fetching purchase for deletion:", purchaseError);
      toast.error("فشل في حذف فاتورة الشراء");
      return false;
    }

    // Update supplier balance
    const remainingAmount = purchase.total - purchase.paid;
    if (remainingAmount !== 0) {
      // Get current supplier balance
      const { data: supplier, error: supplierError } = await supabase
        .from("suppliers")
        .select("balance")
        .eq("id", purchase.supplier_id)
        .single();

      if (!supplierError && supplier) {
        // Update supplier balance
        // We're reversing the effect of the purchase
        const currentBalance = supplier.balance || 0;
        const newBalance = currentBalance - remainingAmount;
        
        const { error: updateError } = await supabase
          .from("suppliers")
          .update({ balance: newBalance })
          .eq("id", purchase.supplier_id);

        if (updateError) {
          console.error("Error updating supplier balance during deletion:", updateError);
        }
      }
    }

    // Note: We don't need to manually delete purchase items because of the ON DELETE CASCADE constraint
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

export async function getPurchaseWithItems(id: string) {
  try {
    // First get the purchase
    const { data: purchase, error: purchaseError } = await supabase
      .from("purchases")
      .select("*, suppliers(name)")
      .eq("id", id)
      .single();

    if (purchaseError) {
      console.error("Error fetching purchase:", purchaseError);
      toast.error("فشل في جلب بيانات فاتورة الشراء");
      return null;
    }

    // Then get the purchase items with batch information
    const { data: items, error: itemsError } = await supabase
      .from("purchase_items")
      .select("*, products(name, track_expiry)")
      .eq("purchase_id", id);

    if (itemsError) {
      console.error("Error fetching purchase items:", itemsError);
      toast.error("فشل في جلب عناصر فاتورة الشراء");
      return null;
    }

    return {
      ...purchase,
      items: items
    };
  } catch (error) {
    console.error("Unexpected error fetching purchase with items:", error);
    toast.error("حدث خطأ غير متوقع");
    return null;
  }
}
