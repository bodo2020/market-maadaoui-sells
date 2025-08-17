import { supabase } from "@/integrations/supabase/client";

// Customer Interactions
export async function fetchCustomerInteractions() {
  const { data, error } = await supabase
    .from("customer_interactions")
    .select(`
      *,
      customers (
        name
      )
    `)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Error fetching customer interactions:", error);
    throw error;
  }

  return data?.map(interaction => ({
    ...interaction,
    customer_name: interaction.customers?.name
  })) || [];
}

export async function addCustomerInteraction(interaction: {
  customer_id: string;
  type: string;
  subject: string;
  description?: string;
  priority: string;
  scheduled_at?: string;
}) {
  const { data, error } = await supabase
    .from("customer_interactions")
    .insert([{
      ...interaction,
      status: "pending",
      created_by: (await supabase.auth.getUser()).data.user?.id
    }])
    .select();

  if (error) {
    console.error("Error adding customer interaction:", error);
    throw error;
  }

  return data[0];
}

// Customer Analytics
export async function fetchCustomerAnalytics() {
  try {
    // جلب إحصائيات العملاء
    const { data: customers, error: customersError } = await supabase
      .from("customers")
      .select("*");

    if (customersError) throw customersError;

    // جلب إحصائيات المبيعات
    const { data: sales, error: salesError } = await supabase
      .from("sales")
      .select("*");

    if (salesError) throw salesError;

    return {
      totalCustomers: customers?.length || 0,
      totalSales: sales?.length || 0,
      // يمكن إضافة المزيد من الإحصائيات هنا
    };
  } catch (error) {
    console.error("Error fetching customer analytics:", error);
    throw error;
  }
}

// Leads Management
export async function fetchLeads() {
  const { data, error } = await supabase
    .from("leads")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Error fetching leads:", error);
    throw error;
  }

  return data || [];
}

export async function addLead(lead: {
  name: string;
  email?: string;
  phone?: string;
  source: string;
  notes?: string;
}) {
  const { data, error } = await supabase
    .from("leads")
    .insert([{
      ...lead,
      status: "new",
      score: 50, // نقاط افتراضية
    }])
    .select();

  if (error) {
    console.error("Error adding lead:", error);
    throw error;
  }

  return data[0];
}

export async function updateLeadStatus(id: string, status: string) {
  const { data, error } = await supabase
    .from("leads")
    .update({ 
      status,
      updated_at: new Date().toISOString()
    })
    .eq("id", id)
    .select();

  if (error) {
    console.error("Error updating lead status:", error);
    throw error;
  }

  return data[0];
}

// Customer Lifecycle
export async function getCustomerLifecycleData(customerId: string) {
  try {
    // جلب طلبات العميل
    const { data: orders, error: ordersError } = await supabase
      .from("online_orders")
      .select("*")
      .eq("customer_id", customerId)
      .order("created_at", { ascending: true });

    if (ordersError) throw ordersError;

    // جلب تفاعلات العميل
    const { data: interactions, error: interactionsError } = await supabase
      .from("customer_interactions")
      .select("*")
      .eq("customer_id", customerId)
      .order("created_at", { ascending: true });

    if (interactionsError) throw interactionsError;

    return {
      orders: orders || [],
      interactions: interactions || [],
    };
  } catch (error) {
    console.error("Error fetching customer lifecycle data:", error);
    throw error;
  }
}