import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Supplier } from "@/types";

export async function fetchSuppliers() {
  try {
    console.log("Fetching suppliers...");
    const { data, error } = await supabase
      .from("suppliers")
      .select("*")
      .order("name");

    if (error) {
      console.error("Error fetching suppliers:", error);
      toast.error("فشل في جلب الموردين");
      return [];
    }

    console.log("Successfully fetched suppliers:", data?.length || 0);
    return data as Supplier[];
  } catch (error) {
    console.error("Unexpected error fetching suppliers:", error);
    toast.error("حدث خطأ غير متوقع");
    return [];
  }
}

export async function addSupplier(supplier: Omit<Supplier, "id" | "created_at" | "updated_at">) {
  try {
    const { data, error } = await supabase.from("suppliers").insert(supplier).select().single();

    if (error) {
      console.error("Error adding supplier:", error);
      toast.error("فشل في إضافة المورد");
      return null;
    }

    toast.success("تمت إضافة المورد بنجاح");
    return data as Supplier;
  } catch (error) {
    console.error("Unexpected error adding supplier:", error);
    toast.error("حدث خطأ غير متوقع");
    return null;
  }
}

export async function updateSupplier(id: string, updates: Partial<Omit<Supplier, "created_at" | "updated_at">>) {
  try {
    const { data, error } = await supabase
      .from("suppliers")
      .update(updates)
      .eq("id", id)
      .select()
      .single();

    if (error) {
      console.error("Error updating supplier:", error);
      toast.error("فشل في تحديث المورد");
      return null;
    }

    toast.success("تم تحديث المورد بنجاح");
    return data as Supplier;
  } catch (error) {
    console.error("Unexpected error updating supplier:", error);
    toast.error("حدث خطأ غير متوقع");
    return null;
  }
}

export async function deleteSupplier(id: string) {
  try {
    const { error } = await supabase.from("suppliers").delete().eq("id", id);

    if (error) {
      console.error("Error deleting supplier:", error);
      toast.error("فشل في حذف المورد");
      return false;
    }

    toast.success("تم حذف المورد بنجاح");
    return true;
  } catch (error) {
    console.error("Unexpected error deleting supplier:", error);
    toast.error("حدث خطأ غير متوقع");
    return false;
  }
}

export async function getSupplierById(id: string) {
  try {
    const { data, error } = await supabase
      .from("suppliers")
      .select("*")
      .eq("id", id)
      .single();

    if (error) {
      console.error("Error fetching supplier:", error);
      toast.error("فشل في جلب بيانات المورد");
      return null;
    }

    return data as Supplier;
  } catch (error) {
    console.error("Unexpected error fetching supplier:", error);
    toast.error("حدث خطأ غير متوقع");
    return null;
  }
}

export async function fetchSupplierTransactions(supplierId: string) {
  try {
    const { data, error } = await supabase
      .from("purchases")
      .select("id, date, total, paid, invoice_number, description")
      .eq("supplier_id", supplierId)
      .order("date", { ascending: false });

    if (error) {
      console.error("Error fetching supplier transactions:", error);
      toast.error("فشل في جلب معاملات المورد");
      return [];
    }

    const transactions = data.map(purchase => {
      const remaining = purchase.total - purchase.paid;
      return {
        id: purchase.id,
        date: purchase.date,
        description: purchase.description || `فاتورة رقم ${purchase.invoice_number}`,
        amount: Math.abs(remaining),
        // If remaining > 0, we owe the supplier money (debt)
        // If remaining < 0, the supplier owes us money (credit)
        type: remaining > 0 ? "debt" : "credit"
      };
    });

    return transactions;
  } catch (error) {
    console.error("Unexpected error fetching supplier transactions:", error);
    toast.error("حدث خطأ غير متوقع");
    return [];
  }
}
