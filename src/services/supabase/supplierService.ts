import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Supplier } from "@/types";

type RpcError = { message?: string; details?: string } | null;
const rpc = supabase.rpc.bind(supabase) as unknown as (
  name: string,
  args?: Record<string, unknown>,
) => Promise<{ data: unknown; error: RpcError }>;

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
    const currentBranchId = localStorage.getItem("currentBranchId");
    if (!currentBranchId || currentBranchId === "null") {
      toast.error("يجب اختيار فرع أولاً");
      return [];
    }

    const { data, error } = await rpc("get_supplier_ledger_v1", {
      p_supplier_id: supplierId,
      p_branch_id: currentBranchId,
      p_limit: 300,
    });

    if (error) {
      console.error("Error fetching supplier ledger:", error);
      toast.error("فشل في جلب معاملات المورد");
      return [];
    }

    const workspace = (data || {}) as {
      entries?: Array<{
        id: string;
        created_at: string;
        description?: string | null;
        signed_amount: number | string;
        invoice_number?: string | null;
      }>;
    };

    return (workspace.entries || []).map(entry => {
      const signedAmount = Number(entry.signed_amount || 0);
      return {
        id: entry.id,
        date: entry.created_at,
        description: entry.description || (entry.invoice_number ? `فاتورة رقم ${entry.invoice_number}` : "حركة على حساب المورد"),
        amount: Math.abs(signedAmount),
        type: signedAmount > 0 ? "debt" : "credit",
      };
    });
  } catch (error) {
    console.error("Unexpected error fetching supplier transactions:", error);
    toast.error("حدث خطأ غير متوقع");
    return [];
  }
}
