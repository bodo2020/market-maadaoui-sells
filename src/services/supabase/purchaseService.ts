import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Purchase } from "@/types";

export async function fetchPurchases(branchId?: string) {
  try {
    const currentBranchId = branchId || localStorage.getItem('currentBranchId');

    let query = supabase
      .from("purchases")
      .select("*, suppliers(name)");

    if (currentBranchId) {
      query = query.eq('branch_id', currentBranchId);
    }

    const { data, error } = await query.order("date", { ascending: false });

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
    const currentBranchId = purchaseData.branch_id || localStorage.getItem('currentBranchId');
    if (!currentBranchId || currentBranchId === 'null') {
      toast.error("يجب اختيار فرع أولاً");
      return null;
    }

    if (!purchaseData.invoice_number) {
      const date = new Date();
      const year = date.getFullYear();
      const month = (date.getMonth() + 1).toString().padStart(2, '0');
      const day = date.getDate().toString().padStart(2, '0');
      const randomPart = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
      purchaseData.invoice_number = `P-${year}${month}${day}-${randomPart}`;
    }

    if (purchaseData.paid > 0) {
      const { error: deductionError } = await supabase.functions.invoke(
        'add-cash-transaction',
        {
          body: {
            amount: purchaseData.paid,
            transaction_type: 'withdrawal',
            register_type: 'online',
            notes: `دفع مستحقات المورد ${purchaseData.supplier_name || ''} - فاتورة رقم: ${purchaseData.invoice_number}`,
            branch_id: currentBranchId,
          }
        }
      );

      if (deductionError) {
        console.error("Error deducting from cash register:", deductionError);
        toast.error("فشل في خصم المبلغ من الخزنة - تأكد من وجود رصيد كافي");
        return null;
      }
    }

    const { data: purchase, error: purchaseError } = await supabase
      .from("purchases")
      .insert({
        supplier_id: purchaseData.supplier_id,
        invoice_number: purchaseData.invoice_number,
        date: purchaseData.date,
        total: purchaseData.total,
        paid: purchaseData.paid,
        description: purchaseData.description,
        branch_id: currentBranchId
      })
      .select()
      .single();

    if (purchaseError) {
      console.error("Error creating purchase:", purchaseError);
      toast.error("فشل في إنشاء فاتورة الشراء");
      return null;
    }

    if (purchaseData.items && purchaseData.items.length > 0) {
      console.log("Purchase items to insert:", purchaseData.items);

      const purchaseItems = purchaseData.items.map((item: any) => ({
        purchase_id: purchase.id,
        product_id: item.product_id,
        quantity: item.quantity,
        price: item.price,
        total: item.total,
        batch_number: item.batch_number || null,
        expiry_date: item.expiry_date || null,
        shelf_location: item.shelf_location || null,
        notes: item.notes || null,
        branch_id: currentBranchId
      }));

      console.log("Formatted purchase items:", purchaseItems);

      const { data: insertedItems, error: itemsError } = await supabase
        .from("purchase_items")
        .insert(purchaseItems)
        .select();

      if (itemsError) {
        console.error("Error adding purchase items:", itemsError);
        toast.error("فشل في إضافة عناصر الفاتورة");
      } else {
        console.log("Successfully inserted purchase items:", insertedItems);
      }

      for (const item of purchaseData.items) {
        const { data: product, error: productError } = await supabase
          .from("products")
          .select("purchase_price, price")
          .eq("id", item.product_id)
          .single();

        if (productError) {
          console.error(`Error fetching product ${item.product_id}:`, productError);
          continue;
        }

        const productUpdateData: any = {};

        if (item.price !== product.purchase_price) {
          productUpdateData.purchase_price = item.price;
        }

        if (item.sale_price && item.sale_price !== product.price) {
          productUpdateData.price = item.sale_price;
        }

        if (Object.keys(productUpdateData).length > 0) {
          const { error: productUpdateError } = await supabase
            .from("products")
            .update(productUpdateData)
            .eq("id", item.product_id);

          if (productUpdateError) {
            console.error(`Error updating product ${item.product_id}:`, productUpdateError);
          }
        }

        const { data: inventoryData, error: fetchInventoryError } = await supabase
          .from('inventory')
          .select('quantity')
          .eq('product_id', item.product_id)
          .eq('branch_id', currentBranchId)
          .single();

        if (fetchInventoryError) {
          console.error(`Error fetching inventory for product ${item.product_id}:`, fetchInventoryError);
          continue;
        }

        const newQuantity = (inventoryData?.quantity || 0) + item.quantity;

        const { error: inventoryError } = await supabase
          .from('inventory')
          .update({ quantity: newQuantity })
          .eq('product_id', item.product_id)
          .eq('branch_id', currentBranchId);

        if (inventoryError) {
          console.error(`Error updating inventory for product ${item.product_id}:`, inventoryError);
        }
      }
    }

    if (purchase) {
      const remainingAmount = purchaseData.total - purchaseData.paid;
      if (remainingAmount !== 0) {
        const { data: supplier, error: supplierError } = await supabase
          .from("suppliers")
          .select("balance")
          .eq("id", purchaseData.supplier_id)
          .single();

        if (!supplierError && supplier) {
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

    const remainingAmount = purchase.total - purchase.paid;
    if (remainingAmount !== 0) {
      const { data: supplier, error: supplierError } = await supabase
        .from("suppliers")
        .select("balance")
        .eq("id", purchase.supplier_id)
        .single();

      if (!supplierError && supplier) {
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

    const { data: items, error: itemsError } = await supabase
      .from("purchase_items")
      .select("*, products(name, track_expiry)")
      .eq("purchase_id", id);

    if (itemsError) {
      console.error("Error fetching purchase items:", itemsError);
      toast.error("فشل في جلب عناصر فاتورة الشراء");
      return null;
    }

    console.log(`Found ${items?.length || 0} items for purchase ${id}:`, items);

    return {
      ...purchase,
      items: items || []
    };
  } catch (error) {
    console.error("Unexpected error fetching purchase with items:", error);
    toast.error("حدث خطأ غير متوقع");
    return null;
  }
}
