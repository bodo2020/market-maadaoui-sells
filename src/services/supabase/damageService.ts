import { supabase } from "@/integrations/supabase/client";

export interface DamagedProduct {
  id: string;
  product_id: string;
  batch_number: string;
  damaged_quantity: number;
  damage_cost: number;
  damage_date: string;
  notes?: string;
  created_by?: string;
  created_at: string;
  updated_at: string;
}

// تسجيل منتج تالف
export async function recordDamagedProduct(damage: Omit<DamagedProduct, "id" | "created_at" | "updated_at">) {
  try {
    const { data, error } = await supabase
      .from("damaged_products")
      .insert([{
        product_id: damage.product_id,
        batch_number: damage.batch_number,
        damaged_quantity: damage.damaged_quantity,
        damage_cost: damage.damage_cost,
        damage_date: damage.damage_date,
        notes: damage.notes,
        created_by: damage.created_by
      }])
      .select()
      .single();

    if (error) {
      console.error("Error recording damaged product:", error);
      throw error;
    }

    return data as DamagedProduct;
  } catch (error) {
    console.error("Error in recordDamagedProduct:", error);
    throw error;
  }
}

// جلب التوالف
export async function fetchDamagedProducts() {
  try {
    const { data, error } = await supabase
      .from("damaged_products")
      .select("*")
      .order("damage_date", { ascending: false });

    if (error) {
      console.error("Error fetching damaged products:", error);
      throw error;
    }

    return data as DamagedProduct[];
  } catch (error) {
    console.error("Error in fetchDamagedProducts:", error);
    return [];
  }
}

// حساب إجمالي قيمة التوالف لفترة معينة
export async function getDamageStatistics(startDate?: string, endDate?: string) {
  try {
    let query = supabase
      .from("damaged_products")
      .select("damage_cost, damaged_quantity");

    if (startDate) {
      query = query.gte("damage_date", startDate);
    }
    if (endDate) {
      query = query.lte("damage_date", endDate);
    }

    const { data, error } = await query;

    if (error) {
      console.error("Error fetching damage statistics:", error);
      throw error;
    }

    const totalCost = data?.reduce((sum, item) => sum + item.damage_cost, 0) || 0;
    const totalQuantity = data?.reduce((sum, item) => sum + item.damaged_quantity, 0) || 0;

    return {
      totalCost,
      totalQuantity,
      recordsCount: data?.length || 0
    };
  } catch (error) {
    console.error("Error in getDamageStatistics:", error);
    return { totalCost: 0, totalQuantity: 0, recordsCount: 0 };
  }
}