
import { supabase } from "@/integrations/supabase/client";

interface DeliveryLocation {
  id: string;
  governorate?: string;
  city?: string;
  area?: string;
  neighborhood?: string;
  name: string;
  price: number;
  estimated_time?: string;
  active: boolean;
  notes?: string;
  created_at?: string;
  updated_at?: string;
}

export async function fetchDeliveryLocations() {
  const { data, error } = await supabase
    .from('delivery_locations')
    .select('*')
    .order('name');
    
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
