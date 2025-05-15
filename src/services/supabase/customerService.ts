
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
    // Check if customer with same name or phone already exists
    if (customer.phone) {
      const { data: existingCustomer } = await supabase
        .from("customers")
        .select("*")
        .eq("phone", customer.phone)
        .single();
      
      if (existingCustomer) {
        return existingCustomer as Customer;
      }
    }
    
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

export async function findCustomerByPhone(phone: string) {
  try {
    const { data, error } = await supabase
      .from("customers")
      .select("*")
      .eq("phone", phone)
      .single();

    if (error && error.code !== 'PGRST116') { // Not found error
      console.error("Error finding customer by phone:", error);
      return null;
    }

    return data as Customer || null;
  } catch (error) {
    console.error("Unexpected error finding customer by phone:", error);
    return null;
  }
}

export async function findOrCreateCustomer(customerInfo: { 
  name: string; 
  phone?: string;
  governorate?: string;
  city?: string;
  area?: string;
  neighborhood?: string;
}) {
  if (!customerInfo.name && !customerInfo.phone) {
    return null;
  }
  
  try {
    // First check if customer exists by phone
    if (customerInfo.phone) {
      const existingCustomer = await findCustomerByPhone(customerInfo.phone);
      if (existingCustomer) {
        // If customer exists but location data is different, update it
        const updates: Record<string, any> = {};
        if (existingCustomer.name !== customerInfo.name && customerInfo.name) {
          updates.name = customerInfo.name;
        }
        
        // Update location data if provided
        if (customerInfo.governorate) updates.governorate_id = customerInfo.governorate;
        if (customerInfo.city) updates.city_id = customerInfo.city;
        if (customerInfo.area) updates.area_id = customerInfo.area;
        if (customerInfo.neighborhood) updates.neighborhood_id = customerInfo.neighborhood;
        
        // Only update if there are changes
        if (Object.keys(updates).length > 0) {
          return updateCustomer(existingCustomer.id, updates);
        }
        
        return existingCustomer;
      }
    }
    
    // If no match by phone, create a new customer
    return addCustomer({
      name: customerInfo.name,
      phone: customerInfo.phone || null,
      email: null,
      address: null,
      notes: null,
      governorate_id: customerInfo.governorate || null,
      city_id: customerInfo.city || null,
      area_id: customerInfo.area || null,
      neighborhood_id: customerInfo.neighborhood || null
    });
    
  } catch (error) {
    console.error("Error in findOrCreateCustomer:", error);
    return null;
  }
}

export async function searchCustomersByPhone(phone: string) {
  try {
    const { data, error } = await supabase
      .from("customers")
      .select("*")
      .ilike("phone", `%${phone}%`)
      .order("name")
      .limit(10);

    if (error) {
      console.error("Error searching customers by phone:", error);
      return [];
    }

    return data as Customer[];
  } catch (error) {
    console.error("Unexpected error searching customers by phone:", error);
    return [];
  }
}
