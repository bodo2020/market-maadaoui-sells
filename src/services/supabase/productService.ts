
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

export const fetchProductByBarcode = async (barcode: string): Promise<Product | null> => {
  try {
    const { data, error } = await supabase
      .from('products')
      .select('*')
      .eq('barcode', barcode)
      .maybeSingle();

    if (error) {
      throw error;
    }

    return data as Product | null;
  } catch (error) {
    console.error("Error fetching product by barcode:", error);
    throw error;
  }
};

export const fetchProductsByCategory = async (categoryId: string): Promise<Product[]> => {
  try {
    const { data, error } = await supabase
      .from('products')
      .select('*')
      .eq('category_id', categoryId);

    if (error) {
      throw error;
    }

    return data as Product[];
  } catch (error) {
    console.error("Error fetching products by category:", error);
    throw error;
  }
};

export const fetchProductsBySubcategory = async (subcategoryId: string): Promise<Product[]> => {
  try {
    const { data, error } = await supabase
      .from('products')
      .select('*')
      .eq('subcategory_id', subcategoryId);

    if (error) {
      throw error;
    }

    return data as Product[];
  } catch (error) {
    console.error("Error fetching products by subcategory:", error);
    throw error;
  }
};

export const fetchProductsBySubsubcategory = async (subsubcategoryId: string): Promise<Product[]> => {
  try {
    const { data, error } = await supabase
      .from('products')
      .select('*')
      .eq('subsubcategory_id', subsubcategoryId);

    if (error) {
      throw error;
    }

    return data as Product[];
  } catch (error) {
    console.error("Error fetching products by subsubcategory:", error);
    throw error;
  }
};

export const fetchProductsByCompany = async (companyId: string): Promise<Product[]> => {
  try {
    const { data, error } = await supabase
      .from('products')
      .select('*')
      .eq('company_id', companyId);

    if (error) {
      throw error;
    }

    return data as Product[];
  } catch (error) {
    console.error("Error fetching products by company:", error);
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

export const updateProduct = async (id: string, updates: Partial<Omit<Product, 'created_at' | 'updated_at'>>) => {
  try {
    const { data: product, error } = await supabase
      .from('products')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    // Cast the product to include notify_quantity
    const productWithNotify = product as Product;

    // Check if quantity is below notify_quantity
    if (
      productWithNotify.quantity !== undefined && 
      productWithNotify.quantity !== null &&
      productWithNotify.notify_quantity !== undefined && 
      productWithNotify.notify_quantity !== null &&
      productWithNotify.quantity <= productWithNotify.notify_quantity
    ) {
      useNotificationStore.getState().addLowStockProduct({
        id: productWithNotify.id,
        name: productWithNotify.name,
        quantity: productWithNotify.quantity,
        notifyQuantity: productWithNotify.notify_quantity
      });
    } else {
      useNotificationStore.getState().removeLowStockProduct(productWithNotify.id);
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
