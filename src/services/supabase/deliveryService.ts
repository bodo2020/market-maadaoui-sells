
import { supabase } from "@/integrations/supabase/client";
import { 
  ShippingProvider, 
  DeliveryLocation,
  DeliveryType, 
  DeliveryTypePrice,
  DeliveryGovernorate,
  DeliveryCity,
  DeliveryArea,
  DeliveryNeighborhood
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
    .select('*')
    .eq('area_id', areaId)
    .order('name');
    
  if (error) throw error;
  return data;
}

// Create functions
export async function createGovernorate(data: { 
  name: string;
  provider_id?: string;
  branch_id?: string;
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
  branch_id?: string;
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
  branch_id?: string;
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
  branch_id: string; // Made required for branch linking
}) {
  const { data: result, error } = await supabase
    .from('neighborhoods')
    .insert([data])
    .select()
    .single();
    
  if (error) throw error;
  return result;
}

// Fixed type recursion issue here
export async function createDeliveryTypePrice(data: {
  neighborhood_id?: string;
  delivery_location_id?: string;
  delivery_type_id: string;
  price: number;
  estimated_time?: string;
}) {
  // Using a simple object literal instead of a variable to avoid type recursion
  const { data: result, error } = await supabase
    .from('delivery_type_pricing')
    .insert([{
      delivery_location_id: data.delivery_location_id || data.neighborhood_id,
      delivery_type_id: data.delivery_type_id,
      price: data.price,
      estimated_time: data.estimated_time
    }])
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

// Combined the two fetchDeliveryTypePricing functions into one that works for both use cases
export async function fetchDeliveryTypePricing(locationId: string) {
  try {
    const { data, error } = await supabase
      .from('delivery_type_pricing')
      .select(`
        *,
        delivery_types (*)
      `)
      .eq('delivery_location_id', locationId);
      
    if (error) throw error;
    return data || [];
  } catch (err) {
    console.error("Error fetching delivery type pricing:", err);
    throw err;
  }
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
export async function fetchDeliveryLocations(branchId?: string) {
  let query = supabase
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
    
  // Filter by branch if specified
  if (branchId) {
    query = query.eq('branch_id', branchId);
  }
  
  const { data: neighborhoods, error } = await query;
    
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

// Added function to update delivery type pricing
export async function updateDeliveryTypePricing(data: {
  delivery_location_id: string;
  delivery_type_id: string;
  price: number;
  estimated_time?: string;
}): Promise<DeliveryTypePrice> {
  try {
    // Check if pricing record already exists
    const { data: existingPricing, error: fetchError } = await supabase
      .from('delivery_type_pricing')
      .select('*')
      .eq('delivery_location_id', data.delivery_location_id)
      .eq('delivery_type_id', data.delivery_type_id);
      
    if (fetchError) throw fetchError;
    
    // If pricing record exists, update it
    if (existingPricing && existingPricing.length > 0) {
      const { data: result, error } = await supabase
        .from('delivery_type_pricing')
        .update({
          price: data.price,
          estimated_time: data.estimated_time,
          updated_at: new Date().toISOString() // Convert Date to ISO string
        })
        .eq('delivery_location_id', data.delivery_location_id)
        .eq('delivery_type_id', data.delivery_type_id)
        .select()
        .single();
        
      if (error) {
        console.error("Error updating delivery type pricing:", error);
        throw error;
      }
      
      return result;
    } else {
      // If pricing record doesn't exist, create a new one
      const { data: result, error } = await supabase
        .from('delivery_type_pricing')
        .insert([{
          delivery_location_id: data.delivery_location_id,
          delivery_type_id: data.delivery_type_id,
          price: data.price,
          estimated_time: data.estimated_time
        }])
        .select()
        .single();
        
      if (error) {
        console.error("Error creating delivery type pricing:", error);
        throw error;
      }
      
      return result;
    }
  } catch (err) {
    console.error("Error in updateDeliveryTypePricing:", err);
    throw err;
  }
}
