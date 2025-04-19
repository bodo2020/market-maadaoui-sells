
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface DeliveryPerson {
  id: string;
  name: string;
  phone?: string;
  available: boolean;
}

export function useDeliveryPersonnel() {
  const [deliveryPersonnel, setDeliveryPersonnel] = useState<DeliveryPerson[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  useEffect(() => {
    fetchDeliveryPersonnel();
  }, [refreshTrigger]);

  const fetchDeliveryPersonnel = async () => {
    try {
      setLoading(true);
      
      // Query users with delivery role
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('role', 'delivery')
        .eq('active', true)
        .order('name', { ascending: true });
      
      if (error) throw error;
      
      // Transform to DeliveryPerson objects
      const personnel: DeliveryPerson[] = (data || []).map(user => ({
        id: user.id,
        name: user.name,
        phone: user.phone,
        available: true
      }));
      
      setDeliveryPersonnel(personnel);
    } catch (error) {
      console.error('Error fetching delivery personnel:', error);
      toast.error("حدث خطأ أثناء تحميل مندوبي التوصيل");
    } finally {
      setLoading(false);
    }
  };
  
  const refreshPersonnel = () => {
    setRefreshTrigger(prev => prev + 1);
  };
  
  return {
    deliveryPersonnel,
    loading,
    refreshPersonnel
  };
}
