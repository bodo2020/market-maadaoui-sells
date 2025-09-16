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
    const { error } = await supabase
      .from("favorites")
      .insert({
        user_id: userId,
        product_id: productId
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