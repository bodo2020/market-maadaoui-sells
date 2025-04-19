
import { supabase } from "@/integrations/supabase/client";

export interface SpecialOffer {
  id?: string;
  offer_type: 'free_delivery' | 'coupon';
  code?: string;
  name: string;
  description?: string;
  min_order_amount?: number;
  discount_type?: 'percentage' | 'fixed';
  discount_value?: number;
  max_discount?: number;
  usage_limit?: number;
  expiry_date?: string;
  active?: boolean;
  created_at?: string;
  updated_at?: string;
}

export async function createSpecialOffer(offer: Omit<SpecialOffer, 'id' | 'created_at' | 'updated_at'>) {
  try {
    const { data, error } = await supabase
      .from('special_offers')
      .insert([offer])
      .select()
      .single();
    
    if (error) throw error;
    return data;
  } catch (error) {
    console.error('Error creating special offer:', error);
    throw error;
  }
}

export async function fetchSpecialOffers() {
  try {
    const { data, error } = await supabase
      .from('special_offers')
      .select('*')
      .eq('active', true)
      .order('created_at', { ascending: false });
    
    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error('Error fetching special offers:', error);
    throw error;
  }
}

export async function validateOfferCode(code: string) {
  try {
    const { data, error } = await supabase
      .from('special_offers')
      .select('*')
      .eq('code', code)
      .eq('active', true)
      .single();
    
    if (error) {
      if (error.code === 'PGRST116') {
        return null; // No offer found
      }
      throw error;
    }
    
    // Check if offer is still valid
    const now = new Date();
    const expiryDate = data.expiry_date ? new Date(data.expiry_date) : null;
    
    if (expiryDate && expiryDate < now) {
      return null; // Offer has expired
    }
    
    return data;
  } catch (error) {
    console.error('Error validating offer code:', error);
    throw error;
  }
}
