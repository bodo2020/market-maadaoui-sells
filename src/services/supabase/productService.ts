import { supabase } from "@/integrations/supabase/client";
import { Product } from "@/types";
import { useNotificationStore } from '@/stores/notificationStore';

export const fetchProducts = async (): Promise<Product[]> => {
  try {
    const { data, error } = await supabase
      .from('products')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      throw error;
    }

    return data as Product[];
  } catch (error) {
    console.error("Error fetching products:", error);
    throw error;
  }
};

export const fetchProductById = async (id: string): Promise<Product> => {
  try {
    const { data, error } = await supabase
      .from('products')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      throw error;
    }

    return data as Product;
  } catch (error) {
    console.error("Error fetching product by ID:", error);
    throw error;
  }
};

export const createProduct = async (product: Omit<Product, 'id' | 'created_at' | 'updated_at'>): Promise<Product> => {
  try {
    const { data, error } = await supabase
      .from('products')
      .insert([product])
      .select()
      .single();

    if (error) {
      throw error;
    }

    return data as Product;
  } catch (error) {
    console.error("Error creating product:", error);
    throw error;
  }
};

export const updateProduct = async (id: string, updates: Partial<Product>) => {
  try {
    const { data: product, error } = await supabase
      .from('products')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    // Check if quantity is below notify_quantity
    if (
      product.quantity !== undefined && 
      product.quantity !== null &&
      product.notify_quantity !== undefined && 
      product.notify_quantity !== null &&
      product.quantity <= product.notify_quantity
    ) {
      useNotificationStore.getState().addLowStockProduct({
        id: product.id,
        name: product.name,
        quantity: product.quantity,
        notifyQuantity: product.notify_quantity
      });
    } else {
      useNotificationStore.getState().removeLowStockProduct(product.id);
    }

    return product;
  } catch (error) {
    console.error('Error updating product:', error);
    throw error;
  }
};

export const deleteProduct = async (id: string): Promise<void> => {
  try {
    const { error } = await supabase
      .from('products')
      .delete()
      .eq('id', id);

    if (error) {
      throw error;
    }
  } catch (error) {
    console.error("Error deleting product:", error);
    throw error;
  }
};
