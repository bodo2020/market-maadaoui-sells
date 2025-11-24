import { supabase } from "@/integrations/supabase/client";
import type { DeliveryZone, VerifyLocationResult } from "@/types/deliveryZone";

export async function saveDeliveryZone(
  branchId: string,
  zoneData: {
    zone_name: string;
    polygon_coordinates: any;
    delivery_price: number;
    estimated_time?: string;
    priority: number;
    color: string;
  }
): Promise<DeliveryZone> {
  const { data, error } = await supabase
    .from("branch_delivery_zones")
    .insert({
      branch_id: branchId,
      ...zoneData,
    })
    .select()
    .single();

  if (error) throw error;
  return data as DeliveryZone;
}

export async function fetchBranchDeliveryZones(
  branchId: string
): Promise<DeliveryZone[]> {
  const { data, error } = await supabase
    .from("branch_delivery_zones")
    .select("*")
    .eq("branch_id", branchId)
    .order("priority", { ascending: true });

  if (error) throw error;
  return (data || []) as DeliveryZone[];
}

export async function updateDeliveryZone(
  zoneId: string,
  updates: Partial<DeliveryZone>
): Promise<void> {
  const { error } = await supabase
    .from("branch_delivery_zones")
    .update(updates)
    .eq("id", zoneId);

  if (error) throw error;
}

export async function deleteDeliveryZone(zoneId: string): Promise<void> {
  const { error } = await supabase
    .from("branch_delivery_zones")
    .delete()
    .eq("id", zoneId);

  if (error) throw error;
}

export async function verifyCustomerLocation(
  lat: number,
  lng: number
): Promise<VerifyLocationResult> {
  const { data, error } = await supabase.rpc("check_point_in_delivery_zone", {
    p_lat: lat,
    p_lng: lng,
  });

  if (error) throw error;

  if (!data || data.length === 0) {
    return { isInZone: false };
  }

  return {
    isInZone: true,
    zone: data[0],
  };
}
