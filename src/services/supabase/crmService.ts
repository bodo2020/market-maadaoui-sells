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
      .select("customer_name, customer_phone, total, created_at");

    if (salesError) throw salesError;

    // جلب الطلبات الإلكترونية
    const { data: onlineOrders, error: ordersError } = await supabase
      .from("online_orders")
      .select("customer_id, total, created_at, status");

    if (ordersError) throw ordersError;

    // حساب الإحصائيات المتقدمة
    const currentMonth = new Date().getMonth();
    const currentYear = new Date().getFullYear();
    
    const newCustomersThisMonth = customers?.filter(customer => {
      const customerDate = new Date(customer.created_at);
      return customerDate.getMonth() === currentMonth && 
             customerDate.getFullYear() === currentYear;
    }).length || 0;

    const verifiedCustomers = customers?.filter(customer => customer.phone_verified).length || 0;
    
    const totalRevenue = (sales?.reduce((sum, sale) => sum + Number(sale.total || 0), 0) || 0) +
                        (onlineOrders?.reduce((sum, order) => sum + Number(order.total || 0), 0) || 0);

    const averageOrderValue = sales?.length ? totalRevenue / (sales.length + (onlineOrders?.length || 0)) : 0;

    return {
      totalCustomers: customers?.length || 0,
      newCustomersThisMonth,
      verifiedCustomers,
      totalSales: (sales?.length || 0) + (onlineOrders?.length || 0),
      totalRevenue,
      averageOrderValue,
      conversionRate: customers?.length ? (verifiedCustomers / customers.length) * 100 : 0,
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