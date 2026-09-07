import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Customer } from "@/types";

const CUSTOMER_CACHE_MS = 30_000;
let customerCache: { rows: Customer[]; loadedAt: number } | null = null;
let customerRequest: Promise<Customer[]> | null = null;

export function invalidateCustomerCache() {
  customerCache = null;
}

export async function fetchCustomers(force = false) {
  if (!force && customerCache && Date.now() - customerCache.loadedAt < CUSTOMER_CACHE_MS) {
    return customerCache.rows;
  }
  if (!force && customerRequest) return customerRequest;

  customerRequest = (async () => {
    try {
      const { data, error } = await supabase
        .from("customers")
        .select("*")
        .order("name");

      if (error) {
        console.error("Error fetching customers:", error);
        toast.error("فشل في جلب العملاء");
        return customerCache?.rows || [];
      }

      const rows = (data || []) as Customer[];
      customerCache = { rows, loadedAt: Date.now() };
      return rows;
    } catch (error) {
      console.error("Unexpected error fetching customers:", error);
      toast.error("حدث خطأ غير متوقع");
      return customerCache?.rows || [];
    } finally {
      customerRequest = null;
    }
  })();

  return customerRequest;
}

export async function addCustomer(customer: Omit<Customer, "id" | "created_at" | "updated_at">) {
  try {
    if (customer.phone) {
      const { data: existingCustomer } = await supabase
        .from("customers")
        .select("*")
        .eq("phone", customer.phone)
        .single();

      if (existingCustomer) return existingCustomer as Customer;
    }

    const { data, error } = await supabase.from("customers").insert(customer).select().single();

    if (error) {
      console.error("Error adding customer:", error);
      toast.error("فشل في إضافة العميل");
      return null;
    }

    invalidateCustomerCache();
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

    invalidateCustomerCache();
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

    invalidateCustomerCache();
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

export async function findCustomerByPhone(phone: string) {
  try {
    const { data, error } = await supabase
      .from("customers")
      .select("*")
      .eq("phone", phone)
      .single();

    if (error && error.code !== 'PGRST116') {
      console.error("Error finding customer by phone:", error);
      return null;
    }

    return data as Customer || null;
  } catch (error) {
    console.error("Unexpected error finding customer by phone:", error);
    return null;
  }
}

export async function findOrCreateCustomer(customerInfo: { name: string; phone?: string }) {
  if (!customerInfo.name && !customerInfo.phone) return null;

  try {
    if (customerInfo.phone) {
      const existingCustomer = await findCustomerByPhone(customerInfo.phone);
      if (existingCustomer) {
        if (existingCustomer.name !== customerInfo.name && customerInfo.name) {
          return updateCustomer(existingCustomer.id, { name: customerInfo.name });
        }
        return existingCustomer;
      }
    }

    return addCustomer({
      name: customerInfo.name,
      phone: customerInfo.phone || null,
      email: null,
      address: null,
      notes: null
    });
  } catch (error) {
    console.error("Error in findOrCreateCustomer:", error);
    return null;
  }
}
