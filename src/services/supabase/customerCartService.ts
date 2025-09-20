import { supabase } from "@/integrations/supabase/client";

export interface CartItem {
  id: string;
  user_id?: string;
  customer_id?: string;
  product_id: string;
  quantity: number;
  created_at: string;
  updated_at: string;
  metadata?: any;
  product?: {
    name: string;
    price: number;
    offer_price?: number;
    is_offer?: boolean;
    bulk_price?: number;
    bulk_quantity?: number;
    bulk_enabled?: boolean;
    barcode_type?: string;
  };
  customer?: {
    name: string;
    phone?: string;
    email?: string;
  };
}

export interface CustomerCart {
  customer_id: string;
  customer_name: string;
  customer_phone?: string;
  customer_email?: string;
  items: CartItem[];
  total_items: number;
  total_value: number;
  last_updated: string;
}

export const fetchCustomerCarts = async (): Promise<CustomerCart[]> => {
  try {
    // Get cart items with product and customer data
    const { data: cartItems, error } = await supabase
      .from('cart_items')
      .select(`
        *,
        product:products(
          name, 
          price, 
          offer_price, 
          is_offer, 
          bulk_price, 
          bulk_quantity, 
          bulk_enabled, 
          barcode_type
        ),
        customer:customers(name, phone, email)
      `)
      .order('updated_at', { ascending: false });

    if (error) {
      console.error('Error fetching cart items:', error);
      throw error;
    }

    if (!cartItems || cartItems.length === 0) {
      return [];
    }

    // Group cart items by customer
    const customerCartsMap = new Map<string, CustomerCart>();

    cartItems.forEach((item) => {
      const customerId = item.customer_id;
      if (!customerId || !item.customer) return;

      if (!customerCartsMap.has(customerId)) {
        customerCartsMap.set(customerId, {
          customer_id: customerId,
          customer_name: item.customer.name,
          customer_phone: item.customer.phone,
          customer_email: item.customer.email,
          items: [],
          total_items: 0,
          total_value: 0,
          last_updated: item.updated_at,
        });
      }

      const cart = customerCartsMap.get(customerId)!;
      cart.items.push(item);
      cart.total_items += item.quantity;
      
      if (item.product) {
        // Check if product has offer price or bulk pricing
        let effectivePrice = item.product.price;
        
        // Check product metadata for bulk or scale information
        if (item.metadata && typeof item.metadata === 'object') {
          const metadata = item.metadata as any;
          
          // Handle bulk products
          if (metadata.isBulk && item.product.bulk_price && item.product.bulk_quantity) {
            effectivePrice = item.product.bulk_price;
          } 
          // Handle scale/weight products
          else if (metadata.isScale && metadata.weight && metadata.price_per_kg) {
            effectivePrice = metadata.price_per_kg * metadata.weight;
          }
          // Handle custom offer price from metadata
          else if (metadata.offer_price) {
            effectivePrice = metadata.offer_price;
          }
          // Handle weight-based pricing with metadata price_per_kg
          else if (metadata.weight && metadata.price_per_kg) {
            effectivePrice = metadata.price_per_kg * metadata.weight;
          }
        }
        
        // Check product properties directly if no metadata overrides
        if (!item.metadata || typeof item.metadata !== 'object') {
          if (item.product.is_offer && item.product.offer_price) {
            effectivePrice = item.product.offer_price;
          } else if (item.product.bulk_enabled && item.product.bulk_price && item.product.bulk_quantity) {
            effectivePrice = item.product.bulk_price;
          }
        }
        
        cart.total_value += effectivePrice * item.quantity;
      }

      // Update last updated time if this item is newer
      if (new Date(item.updated_at) > new Date(cart.last_updated)) {
        cart.last_updated = item.updated_at;
      }
    });

    return Array.from(customerCartsMap.values())
      .sort((a, b) => new Date(b.last_updated).getTime() - new Date(a.last_updated).getTime());

  } catch (error) {
    console.error('Error in fetchCustomerCarts:', error);
    throw error;
  }
};

export const clearCustomerCart = async (customerId: string): Promise<void> => {
  try {
    const { error } = await supabase
      .from('cart_items')
      .delete()
      .eq('customer_id', customerId);

    if (error) {
      console.error('Error clearing cart:', error);
      throw error;
    }
  } catch (error) {
    console.error('Error in clearCustomerCart:', error);
    throw error;
  }
};

export const removeCartItem = async (itemId: string): Promise<void> => {
  try {
    const { error } = await supabase
      .from('cart_items')
      .delete()
      .eq('id', itemId);

    if (error) {
      console.error('Error removing cart item:', error);
      throw error;
    }
  } catch (error) {
    console.error('Error in removeCartItem:', error);
    throw error;
  }
};