import { supabase } from "@/integrations/supabase/client";

export async function getFavoriteProducts(userId: string): Promise<string[]> {
  try {
    const { data, error } = await supabase
      .from("favorites")
      .select("product_id")
      .eq("user_id", userId);

    if (error) {
      console.error("Error fetching favorites:", error);
      return [];
    }

    return data?.map(fav => fav.product_id) || [];
  } catch (error) {
    console.error("Error in getFavoriteProducts:", error);
    return [];
  }
}

export async function addFavoriteProduct(userId: string, productId: string): Promise<boolean> {
  try {
    // Avoid duplicates
    const { data: existing, error: existError } = await supabase
      .from("favorites")
      .select("id")
      .eq("user_id", userId)
      .eq("product_id", productId)
      .limit(1);

    if (existError) {
      console.warn("Warning checking existing favorite:", existError);
    }
    if (existing && existing.length > 0) return true;

    // Fetch customer_id required by RLS policy
    let customerId: string | null = null;

    const { data: rpcCustomerId, error: rpcError } = await supabase.rpc(
      "get_customer_id_from_user"
    );

    if (rpcError) {
      console.warn("RPC get_customer_id_from_user failed, fallback to query:", rpcError);
      const { data: customerRow, error: customerError } = await supabase
        .from("customers")
        .select("id")
        .eq("user_id", userId)
        .maybeSingle();
      if (customerError) {
        console.error("Error fetching customer for favorites:", customerError);
        return false;
      }
      customerId = customerRow?.id ?? null;
    } else {
      customerId = rpcCustomerId ?? null;
    }

    if (!customerId) {
      console.error("No customer_id found for user. Cannot save favorite due to RLS.");
      return false;
    }

    const { error } = await supabase
      .from("favorites")
      .insert({
        user_id: userId,
        customer_id: customerId,
        product_id: productId,
      });

    if (error) {
      console.error("Error adding favorite:", error);
      return false;
    }

    return true;
  } catch (error) {
    console.error("Error in addFavoriteProduct:", error);
    return false;
  }
}

export async function removeFavoriteProduct(userId: string, productId: string): Promise<boolean> {
  try {
    const { error } = await supabase
      .from("favorites")
      .delete()
      .eq("user_id", userId)
      .eq("product_id", productId);

    if (error) {
      console.error("Error removing favorite:", error);
      return false;
    }

    return true;
  } catch (error) {
    console.error("Error in removeFavoriteProduct:", error);
    return false;
  }
}