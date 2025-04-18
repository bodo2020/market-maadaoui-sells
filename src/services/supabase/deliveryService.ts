
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
  // Create a composite name for the location if none is provided
  // This addresses the name field requirement in the database
  const locationWithName = {
    ...location,
    name: location.name || `${location.governorate} - ${location.city}${location.area ? ` - ${location.area}` : ''}${location.neighborhood ? ` - ${location.neighborhood}` : ''}`
  };

  const { data, error } = await supabase
    .from('delivery_locations')
    .insert([locationWithName])
    .select()
    .single();
    
  if (error) throw error;
  return data as DeliveryLocation;
}

export async function updateDeliveryLocation(id: string, updates: Partial<DeliveryLocation>) {
  // If updating governorate, city, area or neighborhood and no name is provided,
  // generate a new composite name
  if ((updates.governorate || updates.city || updates.area || updates.neighborhood) && !updates.name) {
    // We need to fetch the current location to create the updated name
    const { data: currentLocation } = await supabase
      .from('delivery_locations')
      .select('*')
      .eq('id', id)
      .single();
      
    if (currentLocation) {
      const gov = updates.governorate || currentLocation.governorate;
      const city = updates.city || currentLocation.city;
      const area = updates.area || currentLocation.area;
      const neighborhood = updates.neighborhood || currentLocation.neighborhood;
      
      updates.name = `${gov} - ${city}${area ? ` - ${area}` : ''}${neighborhood ? ` - ${neighborhood}` : ''}`;
    }
  }

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
