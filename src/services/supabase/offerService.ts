
import { supabase } from "@/integrations/supabase/client";

export enum OfferType {
  FREE_DELIVERY = 'free_delivery',
  COUPON = 'coupon'
}

export enum DiscountType {
  PERCENTAGE = 'percentage',
  FIXED = 'fixed'
}

export interface SpecialOffer {
  id: string;
  offer_type: OfferType;
  code?: string;
  name: string;
  description?: string;
  min_order_amount?: number;
  discount_type?: DiscountType;
  discount_value?: number;
  max_discount?: number;
  usage_limit?: number;
  expiry_date?: string;
  active: boolean;
  created_at?: string;
  updated_at?: string;
}

export async function fetchSpecialOffers(offerType?: OfferType) {
  let query = supabase
    .from('special_offers')
    .select('*')
    .order('created_at', { ascending: false });
    
  if (offerType) {
    query = query.eq('offer_type', offerType);
  }
  
  const { data, error } = await query;
    
  if (error) throw error;
  return data as SpecialOffer[];
}

export async function createSpecialOffer(offer: Omit<SpecialOffer, 'id' | 'created_at' | 'updated_at'>) {
  const { data, error } = await supabase
    .from('special_offers')
    .insert([offer])
    .select()
    .single();
    
  if (error) throw error;
  return data as SpecialOffer;
}

export async function updateSpecialOffer(id: string, updates: Partial<SpecialOffer>) {
  const { data, error } = await supabase
    .from('special_offers')
    .update({
      ...updates,
      updated_at: new Date().toISOString()
    })
    .eq('id', id)
    .select()
    .single();
    
  if (error) throw error;
  return data as SpecialOffer;
}

export async function deleteSpecialOffer(id: string) {
  const { error } = await supabase
    .from('special_offers')
    .delete()
    .eq('id', id);
    
  if (error) throw error;
  return true;
}

export async function validateCoupon(code: string, orderAmount: number) {
  const { data, error } = await supabase
    .from('special_offers')
    .select('*')
    .eq('code', code)
    .eq('active', true)
    .eq('offer_type', OfferType.COUPON)
    .single();
    
  if (error) throw error;
  
  if (!data) {
    throw new Error('كود الخصم غير صالح');
  }
  
  const offer = data as SpecialOffer;
  
  // Check expiry date
  if (offer.expiry_date && new Date(offer.expiry_date) < new Date()) {
    throw new Error('كود الخصم منتهي الصلاحية');
  }
  
  // Check minimum order amount
  if (offer.min_order_amount && orderAmount < offer.min_order_amount) {
    throw new Error(`الحد الأدنى للطلب ${offer.min_order_amount} جنيه`);
  }
  
  return offer;
}

export async function isFreeDeliveryEligible(orderAmount: number) {
  const { data, error } = await supabase
    .from('special_offers')
    .select('*')
    .eq('offer_type', OfferType.FREE_DELIVERY)
    .eq('active', true)
    .order('min_order_amount', { ascending: true });
    
  if (error) throw error;
  
  if (!data || data.length === 0) {
    return false;
  }
  
  // Find the first eligible offer (with lowest min_order_amount)
  for (const offer of data) {
    if (!offer.min_order_amount || orderAmount >= offer.min_order_amount) {
      return true;
    }
  }
  
  return false;
}
