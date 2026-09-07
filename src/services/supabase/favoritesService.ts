import { supabase } from "@/integrations/supabase/client";

type FavoriteCacheEntry = { ids: string[]; loadedAt: number };
const CACHE_MS = 5 * 60_000;
const favoriteCache = new Map<string, FavoriteCacheEntry>();
const pendingRequests = new Map<string, Promise<string[]>>();

export function invalidateFavoriteProducts(userId?: string) {
  if (userId) favoriteCache.delete(userId);
  else favoriteCache.clear();
}

export async function getFavoriteProducts(userId: string, force = false): Promise<string[]> {
  const cached = favoriteCache.get(userId);
  if (!force && cached && Date.now() - cached.loadedAt < CACHE_MS) return cached.ids;
  if (!force && pendingRequests.has(userId)) return pendingRequests.get(userId)!;

  const request = (async () => {
    try {
      const { data, error } = await supabase
        .from("favorites")
        .select("product_id")
        .eq("user_id", userId);

      if (error) {
        console.error("Error fetching favorites:", error);
        return favoriteCache.get(userId)?.ids || [];
      }

      const ids = data?.map(fav => fav.product_id) || [];
      favoriteCache.set(userId, { ids, loadedAt: Date.now() });
      return ids;
    } catch (error) {
      console.error("Error in getFavoriteProducts:", error);
      return favoriteCache.get(userId)?.ids || [];
    } finally {
      pendingRequests.delete(userId);
    }
  })();

  pendingRequests.set(userId, request);
  return request;
}

export async function addFavoriteProduct(userId: string, productId: string): Promise<boolean> {
  try {
    const cached = favoriteCache.get(userId);
    if (cached?.ids.includes(productId)) return true;

    const { data: existing, error: existError } = await supabase
      .from("favorites")
      .select("id")
      .eq("user_id", userId)
      .eq("product_id", productId)
      .limit(1);

    if (existError) console.warn("Warning checking existing favorite:", existError);

    if (!existing || existing.length === 0) {
      const { error } = await supabase
        .from("favorites")
        .insert({ user_id: userId, product_id: productId });
      if (error) {
        console.error("Error adding favorite:", error);
        return false;
      }
    }

    const ids = [...new Set([...(favoriteCache.get(userId)?.ids || []), productId])];
    favoriteCache.set(userId, { ids, loadedAt: Date.now() });
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

    const current = favoriteCache.get(userId)?.ids || [];
    favoriteCache.set(userId, { ids: current.filter(id => id !== productId), loadedAt: Date.now() });
    return true;
  } catch (error) {
    console.error("Error in removeFavoriteProduct:", error);
    return false;
  }
}
