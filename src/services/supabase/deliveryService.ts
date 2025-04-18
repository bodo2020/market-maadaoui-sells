
import { supabase } from "@/integrations/supabase/client";
import { DeliveryLocation, ShippingProvider } from "@/types/shipping";

export async function fetchShippingProviders() {
  const { data, error } = await supabase
    .from('delivery_providers')
    .select('*')
    .order('name');
    
  if (error) throw error;
  return data as ShippingProvider[];
}

export async function createShippingProvider(provider: Omit<ShippingProvider, 'id' | 'created_at' | 'updated_at'>) {
  const { data, error } = await supabase
    .from('delivery_providers')
    .insert([provider])
    .select()
    .single();
    
  if (error) throw error;
  return data as ShippingProvider;
}

export async function fetchDeliveryLocations(providerId: string) {
  const { data, error } = await supabase
    .from('delivery_locations')
    .select('*')
    .eq('provider_id', providerId)
    .order('governorate', { ascending: true });
    
  if (error) throw error;
  return data as DeliveryLocation[];
}

export async function createDeliveryLocation(location: Omit<DeliveryLocation, 'id' | 'created_at' | 'updated_at'>) {
  const { data, error } = await supabase
    .from('delivery_locations')
    .insert([location])
    .select()
    .single();
    
  if (error) throw error;
  return data as DeliveryLocation;
}

export async function updateDeliveryLocation(id: string, updates: Partial<DeliveryLocation>) {
  const { data, error } = await supabase
    .from('delivery_locations')
    .update(updates)
    .eq('id', id)
    .select()
    .single();
    
  if (error) throw error;
  return data as DeliveryLocation;
}

export async function deleteDeliveryLocation(id: string) {
  const { error } = await supabase
    .from('delivery_locations')
    .delete()
    .eq('id', id);
    
  if (error) throw error;
}
