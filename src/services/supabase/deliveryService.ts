
import { supabase } from "@/integrations/supabase/client";
import { DeliveryLocation } from "@/types/shipping";

export async function fetchDeliveryLocations() {
  const { data, error } = await supabase
    .from('delivery_locations')
    .select('*')
    .order('governorate', { ascending: true });
    
  if (error) throw error;
  return data as DeliveryLocation[];
}

export async function fetchGovernorates() {
  const { data, error } = await supabase
    .from('delivery_locations')
    .select('governorate')
    .is('city', null)
    .is('area', null)
    .is('neighborhood', null)
    .order('governorate');
    
  if (error) throw error;
  return data as { governorate: string }[];
}

export async function fetchCities(governorate: string) {
  const { data, error } = await supabase
    .from('delivery_locations')
    .select('city')
    .eq('governorate', governorate)
    .is('area', null)
    .is('neighborhood', null)
    .not('city', 'is', null)
    .order('city');
    
  if (error) throw error;
  return data as { city: string }[];
}

export async function fetchAreas(governorate: string, city: string) {
  const { data, error } = await supabase
    .from('delivery_locations')
    .select('area')
    .eq('governorate', governorate)
    .eq('city', city)
    .is('neighborhood', null)
    .not('area', 'is', null)
    .order('area');
    
  if (error) throw error;
  return data as { area: string }[];
}

export async function fetchNeighborhoods(governorate: string, city: string, area: string) {
  const { data, error } = await supabase
    .from('delivery_locations')
    .select('id, neighborhood, price, estimated_time')
    .eq('governorate', governorate)
    .eq('city', city)
    .eq('area', area)
    .not('neighborhood', 'is', null)
    .order('neighborhood');
    
  if (error) throw error;
  return data as { id: string, neighborhood: string, price: number, estimated_time: string }[];
}

export async function createGovernorate(data: { 
  governorate: string, 
  name?: string
}) {
  const locationWithName = {
    ...data,
    name: data.name || data.governorate
  };

  const { data: result, error } = await supabase
    .from('delivery_locations')
    .insert([locationWithName])
    .select()
    .single();
    
  if (error) throw error;
  return result as DeliveryLocation;
}

export async function createCity(data: { 
  governorate: string, 
  city: string,
  name?: string
}) {
  const locationWithName = {
    ...data,
    name: data.name || `${data.governorate} - ${data.city}`
  };

  const { data: result, error } = await supabase
    .from('delivery_locations')
    .insert([locationWithName])
    .select()
    .single();
    
  if (error) throw error;
  return result as DeliveryLocation;
}

export async function createArea(data: { 
  governorate: string, 
  city: string,
  area: string,
  name?: string
}) {
  const locationWithName = {
    ...data,
    name: data.name || `${data.governorate} - ${data.city} - ${data.area}`
  };

  const { data: result, error } = await supabase
    .from('delivery_locations')
    .insert([locationWithName])
    .select()
    .single();
    
  if (error) throw error;
  return result as DeliveryLocation;
}

export async function createNeighborhood(data: { 
  governorate: string, 
  city: string,
  area: string,
  neighborhood: string,
  price: number,
  estimated_time?: string,
  name?: string
}) {
  const locationWithName = {
    ...data,
    name: data.name || `${data.governorate} - ${data.city} - ${data.area} - ${data.neighborhood}`
  };

  const { data: result, error } = await supabase
    .from('delivery_locations')
    .insert([locationWithName])
    .select()
    .single();
    
  if (error) throw error;
  return result as DeliveryLocation;
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
