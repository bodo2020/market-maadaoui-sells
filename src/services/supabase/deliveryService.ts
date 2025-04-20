
import { supabase } from "@/integrations/supabase/client";

export async function fetchGovernorates() {
  const { data, error } = await supabase
    .from('governorates')
    .select('*, companies(*)')
    .order('name');
    
  if (error) throw error;
  return data;
}

export async function fetchCities(governorateId: string) {
  const { data, error } = await supabase
    .from('cities')
    .select('*')
    .eq('governorate_id', governorateId)
    .order('name');
    
  if (error) throw error;
  return data;
}

export async function fetchAreas(cityId: string) {
  const { data, error } = await supabase
    .from('areas')
    .select('*')
    .eq('city_id', cityId)
    .order('name');
    
  if (error) throw error;
  return data;
}

export async function fetchNeighborhoods(areaId: string) {
  const { data, error } = await supabase
    .from('neighborhoods')
    .select(`
      *,
      delivery_type_pricing (
        *,
        delivery_types (*)
      )
    `)
    .eq('area_id', areaId)
    .order('name');
    
  if (error) throw error;
  return data;
}

export async function createGovernorate(data: { 
  name: string;
  provider_id?: string;
}) {
  const { data: result, error } = await supabase
    .from('governorates')
    .insert([data])
    .select()
    .single();
    
  if (error) throw error;
  return result;
}

export async function createCity(data: { 
  name: string;
  governorate_id: string;
}) {
  const { data: result, error } = await supabase
    .from('cities')
    .insert([data])
    .select()
    .single();
    
  if (error) throw error;
  return result;
}

export async function createArea(data: { 
  name: string;
  city_id: string;
}) {
  const { data: result, error } = await supabase
    .from('areas')
    .insert([data])
    .select()
    .single();
    
  if (error) throw error;
  return result;
}

export async function createNeighborhood(data: { 
  name: string;
  area_id: string;
  price?: number;
  estimated_time?: string;
}) {
  const { data: result, error } = await supabase
    .from('neighborhoods')
    .insert([data])
    .select()
    .single();
    
  if (error) throw error;
  return result;
}

export async function createDeliveryTypePrice(data: {
  neighborhood_id: string;
  delivery_type_id: string;
  price: number;
  estimated_time?: string;
}) {
  const { data: result, error } = await supabase
    .from('delivery_type_pricing')
    .insert([data])
    .select()
    .single();
    
  if (error) throw error;
  return result;
}

export async function deleteGovernorate(id: string) {
  const { error } = await supabase
    .from('governorates')
    .delete()
    .eq('id', id);
    
  if (error) throw error;
  return true;
}

export async function deleteCity(id: string) {
  const { error } = await supabase
    .from('cities')
    .delete()
    .eq('id', id);
    
  if (error) throw error;
  return true;
}

export async function deleteArea(id: string) {
  const { error } = await supabase
    .from('areas')
    .delete()
    .eq('id', id);
    
  if (error) throw error;
  return true;
}

export async function deleteNeighborhood(id: string) {
  const { error } = await supabase
    .from('neighborhoods')
    .delete()
    .eq('id', id);
    
  if (error) throw error;
  return true;
}

export async function deleteDeliveryTypePrice(id: string) {
  const { error } = await supabase
    .from('delivery_type_pricing')
    .delete()
    .eq('id', id);
    
  if (error) throw error;
  return true;
}
