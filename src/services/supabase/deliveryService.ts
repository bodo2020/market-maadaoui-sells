import { supabase } from "@/integrations/supabase/client";
import { DeliveryLocation, ShippingProvider, DeliveryType, DeliveryTypePrice } from "@/types/shipping";

export async function fetchDeliveryLocations() {
  const { data, error } = await supabase
    .from('delivery_locations')
    .select('*')
    .order('governorate', { ascending: true });
    
  if (error) throw error;
  return data as DeliveryLocation[];
}

export async function fetchShippingProviders() {
  const { data, error } = await supabase
    .from('companies')
    .select('*')
    .order('name', { ascending: true });
    
  if (error) throw error;
  return data as ShippingProvider[];
}

export async function createShippingProvider(data: Omit<ShippingProvider, 'id' | 'created_at' | 'updated_at'>) {
  const { data: result, error } = await supabase
    .from('companies')
    .insert([data])
    .select()
    .single();
    
  if (error) throw error;
  return result as ShippingProvider;
}

export async function fetchGovernorates() {
  const { data, error } = await supabase
    .from('delivery_locations')
    .select('id, governorate')
    .is('city', null)
    .is('area', null)
    .is('neighborhood', null)
    .order('governorate');
    
  if (error) throw error;
  return data as { id: string, governorate: string }[];
}

export async function fetchCities(governorate: string) {
  const { data, error } = await supabase
    .from('delivery_locations')
    .select('id, city')
    .eq('governorate', governorate)
    .is('area', null)
    .is('neighborhood', null)
    .not('city', 'is', null)
    .order('city');
    
  if (error) throw error;
  return data as { id: string, city: string }[];
}

export async function fetchAreas(governorate: string, city: string) {
  const { data, error } = await supabase
    .from('delivery_locations')
    .select('id, area')
    .eq('governorate', governorate)
    .eq('city', city)
    .is('neighborhood', null)
    .not('area', 'is', null)
    .order('area');
    
  if (error) throw error;
  return data as { id: string, area: string }[];
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
  name?: string,
  provider_id?: string
}) {
  const locationData = {
    governorate: data.governorate,
    name: data.name || data.governorate,
    provider_id: data.provider_id
  };

  const { data: result, error } = await supabase
    .from('delivery_locations')
    .insert([locationData])
    .select()
    .single();
    
  if (error) throw error;
  return result as DeliveryLocation;
}

export async function createCity(data: { 
  governorate: string, 
  city: string,
  name?: string,
  provider_id?: string
}) {
  const locationData = {
    governorate: data.governorate,
    city: data.city,
    name: `${data.governorate} - ${data.city}`,
    provider_id: data.provider_id
  };

  const { data: result, error } = await supabase
    .from('delivery_locations')
    .insert([locationData])
    .select()
    .single();
    
  if (error) throw error;
  return result as DeliveryLocation;
}

export async function createArea(data: { 
  governorate: string, 
  city: string,
  area: string,
  name?: string,
  provider_id?: string
}) {
  const locationData = {
    governorate: data.governorate,
    city: data.city,
    area: data.area,
    name: `${data.governorate} - ${data.city} - ${data.area}`,
    provider_id: data.provider_id
  };

  const { data: result, error } = await supabase
    .from('delivery_locations')
    .insert([locationData])
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
  name?: string,
  provider_id?: string
}) {
  const locationData = {
    governorate: data.governorate,
    city: data.city,
    area: data.area,
    neighborhood: data.neighborhood,
    price: data.price,
    estimated_time: data.estimated_time,
    name: `${data.governorate} - ${data.city} - ${data.area} - ${data.neighborhood}`,
    provider_id: data.provider_id
  };

  const { data: result, error } = await supabase
    .from('delivery_locations')
    .insert([locationData])
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
  console.log('Deleting location with ID:', id);
  
  try {
    const { error } = await supabase
      .from('delivery_locations')
      .delete()
      .eq('id', id);
      
    if (error) {
      console.error('Error in deleteDeliveryLocation:', error);
      throw error;
    }
    
    console.log('Location deleted successfully');
    return true;
  } catch (err) {
    console.error('Exception in deleteDeliveryLocation:', err);
    throw err;
  }
}

export async function deleteDeliveryTypePrice(id: string) {
  const { error } = await supabase
    .from('delivery_type_pricing')
    .delete()
    .eq('id', id);
    
  if (error) throw error;
  return true;
}

export async function fetchDeliveryTypes() {
  console.log('Fetching delivery types');
  
  try {
    const { data, error } = await supabase
      .from('delivery_types')
      .select('*')
      .eq('active', true)
      .order('name');
      
    if (error) {
      console.error('Error in fetchDeliveryTypes:', error);
      throw error;
    }
    
    console.log('Fetched delivery types:', data);
    return data;
  } catch (err) {
    console.error('Exception in fetchDeliveryTypes:', err);
    throw err;
  }
}

export async function fetchDeliveryTypePricing(locationId: string) {
  const { data, error } = await supabase
    .from('delivery_type_pricing')
    .select(`
      *,
      delivery_types(*)
    `)
    .eq('delivery_location_id', locationId);
    
  if (error) throw error;
  return data;
}

export async function createDeliveryTypePrice(data: {
  delivery_location_id: string;
  delivery_type_id: string;
  price: number;
}) {
  console.log('Creating delivery type price:', data);
  
  try {
    const { data: result, error } = await supabase
      .from('delivery_type_pricing')
      .insert([data])
      .select()
      .single();
      
    if (error) {
      console.error('Error in createDeliveryTypePrice:', error);
      throw error;
    }
    
    console.log('Created delivery type price:', result);
    return result;
  } catch (err) {
    console.error('Exception in createDeliveryTypePrice:', err);
    throw err;
  }
}
