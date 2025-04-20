import { supabase } from "@/integrations/supabase/client";
import { 
  ShippingProvider, 
  DeliveryLocation,
  DeliveryType, 
  DeliveryTypePrice 
} from "@/types/shipping";

// Governorates functions
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

// Create functions
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
  try {
    const { data: result, error } = await supabase
      .from('cities')
      .insert([data])
      .select()
      .single();
      
    if (error) throw error;
    return result;
  } catch (error) {
    console.error("Error creating city:", error);
    throw error;
  }
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
  neighborhood_id?: string;
  delivery_location_id?: string;
  delivery_type_id: string;
  price: number;
  estimated_time?: string;
}) {
  const insertData = {
    delivery_location_id: data.delivery_location_id || data.neighborhood_id,
    delivery_type_id: data.delivery_type_id,
    price: data.price,
    estimated_time: data.estimated_time
  };
  
  const { data: result, error } = await supabase
    .from('delivery_type_pricing')
    .insert([insertData])
    .select()
    .single();
    
  if (error) throw error;
  return result;
}

// Delete functions
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

// Added missing functions
export async function fetchDeliveryTypes(): Promise<DeliveryType[]> {
  const { data, error } = await supabase
    .from('delivery_types')
    .select('*')
    .order('name');
    
  if (error) throw error;
  return data || [];
}

export async function fetchDeliveryTypePricing(neighborhoodId: string) {
  const { data, error } = await supabase
    .from('delivery_type_pricing')
    .select(`
      *,
      delivery_types (*)
    `)
    .eq('neighborhood_id', neighborhoodId);
    
  if (error) throw error;
  return data || [];
}

// Create a custom function for shipping providers since it's not in the database schema
export async function createShippingProvider(data: {
  name: string;
  active?: boolean;
}) {
  const { data: result, error } = await supabase
    .from('companies')
    .insert([{
      name: data.name,
      description: 'Shipping Provider'
    }])
    .select()
    .single();
    
  if (error) throw error;
  return result;
}

export async function fetchShippingProviders(): Promise<ShippingProvider[]> {
  const { data, error } = await supabase
    .from('companies')
    .select('*')
    .eq('description', 'Shipping Provider')
    .order('name');
    
  if (error) throw error;
  
  return (data || []).map(company => ({
    id: company.id,
    name: company.name,
    active: true,
    created_at: company.created_at,
    updated_at: company.updated_at
  }));
}

// Temporary function to fulfill the DeliveryLocationsTable component needs
export async function fetchDeliveryLocations() {
  const { data: neighborhoods, error } = await supabase
    .from('neighborhoods')
    .select(`
      *,
      areas!inner(
        *,
        cities!inner(
          *,
          governorates!inner(*)
        )
      )
    `);
    
  if (error) throw error;
  
  const result = (neighborhoods || []).map((neighborhood: any) => {
    const area = neighborhood.areas;
    const city = area.cities;
    const governorate = city.governorates;
    
    return {
      id: neighborhood.id,
      name: neighborhood.name,
      price: neighborhood.price,
      estimated_time: neighborhood.estimated_time,
      provider_id: governorate.provider_id,
      governorate: governorate.name,
      city: city.name,
      area: area.name,
      neighborhood: neighborhood.name
    };
  });
  
  return result;
}

export async function deleteDeliveryLocation(id: string) {
  return deleteNeighborhood(id);
}
