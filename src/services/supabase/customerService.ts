import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Customer } from "@/types";

export async function fetchCustomers() {
  try {
    const { data, error } = await supabase
      .from("customers")
      .select("*")
      .order("name");

    if (error) {
      console.error("Error fetching customers:", error);
      toast.error("فشل في جلب العملاء");
      return [];
    }

    return data as Customer[];
  } catch (error) {
    console.error("Unexpected error fetching customers:", error);
    toast.error("حدث خطأ غير متوقع");
    return [];
  }
}

export async function addCustomer(customer: Omit<Customer, "id" | "created_at" | "updated_at">) {
  try {
    const { data, error } = await supabase.from("customers").insert(customer).select().single();

    if (error) {
      console.error("Error adding customer:", error);
      toast.error("فشل في إضافة العميل");
      return null;
    }

    toast.success("تمت إضافة العميل بنجاح");
    return data as Customer;
  } catch (error) {
    console.error("Unexpected error adding customer:", error);
    toast.error("حدث خطأ غير متوقع");
    return null;
  }
}

export async function updateCustomer(id: string, updates: Partial<Omit<Customer, "created_at" | "updated_at">>) {
  try {
    const { data, error } = await supabase
      .from("customers")
      .update(updates)
      .eq("id", id)
      .select()
      .single();

    if (error) {
      console.error("Error updating customer:", error);
      toast.error("فشل في تحديث العميل");
      return null;
    }

    toast.success("تم تحديث العميل بنجاح");
    return data as Customer;
  } catch (error) {
    console.error("Unexpected error updating customer:", error);
    toast.error("حدث خطأ غير متوقع");
    return null;
  }
}

export async function deleteCustomer(id: string) {
  try {
    const { error } = await supabase.from("customers").delete().eq("id", id);

    if (error) {
      console.error("Error deleting customer:", error);
      toast.error("فشل في حذف العميل");
      return false;
    }

    toast.success("تم حذف العميل بنجاح");
    return true;
  } catch (error) {
    console.error("Unexpected error deleting customer:", error);
    toast.error("حدث خطأ غير متوقع");
    return false;
  }
}

export async function getCustomerById(id: string) {
  try {
    const { data, error } = await supabase
      .from("customers")
      .select("*")
      .eq("id", id)
      .single();

    if (error) {
      console.error("Error fetching customer:", error);
      toast.error("فشل في جلب بيانات العميل");
      return null;
    }

    return data as Customer;
  } catch (error) {
    console.error("Unexpected error fetching customer:", error);
    toast.error("حدث خطأ غير متوقع");
    return null;
  }
}
