
import { supabase } from "@/integrations/supabase/client";

interface CashRecord {
  id: string;
  date: string;
  opening_balance: number;
  closing_balance?: number;
  difference?: number;
  notes?: string;
  created_by?: string;
  verified_by?: string;
  created_at?: string;
  updated_at?: string;
}

export async function fetchCashRecords() {
  const { data, error } = await supabase
    .from('cash_tracking')
    .select('*')
    .order('date', { ascending: false });
    
  if (error) throw error;
  return data as CashRecord[];
}

export async function createCashRecord(record: Omit<CashRecord, 'id' | 'created_at' | 'updated_at'>) {
  const { data, error } = await supabase
    .from('cash_tracking')
    .insert([record])
    .select()
    .single();
    
  if (error) throw error;
  return data as CashRecord;
}

export async function updateCashRecord(id: string, updates: Partial<CashRecord>) {
  const { data, error } = await supabase
    .from('cash_tracking')
    .update(updates)
    .eq('id', id)
    .select()
    .single();
    
  if (error) throw error;
  return data as CashRecord;
}
