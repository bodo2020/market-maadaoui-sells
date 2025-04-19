
import { supabase } from "@/integrations/supabase/client";

export interface CashTransaction {
  id?: string;
  transaction_date?: string;
  amount: number;
  balance_after: number;
  transaction_type: 'deposit' | 'withdrawal' | 'transfer';
  register_type: 'store' | 'online';
  notes?: string;
  created_by?: string;
  created_at?: string;
}

export async function createCashTransaction(transaction: Omit<CashTransaction, 'id' | 'created_at'>) {
  try {
    const { data, error } = await supabase
      .from('cash_transactions')
      .insert([transaction])
      .select()
      .single();
    
    if (error) throw error;
    return data;
  } catch (error) {
    console.error('Error creating cash transaction:', error);
    throw error;
  }
}

export async function fetchCashTransactions(registerType?: 'store' | 'online') {
  try {
    let query = supabase
      .from('cash_transactions')
      .select('*')
      .order('transaction_date', { ascending: false });
    
    if (registerType) {
      query = query.eq('register_type', registerType);
    }
    
    const { data, error } = await query;
    
    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error('Error fetching cash transactions:', error);
    throw error;
  }
}

export async function getCurrentCashBalance(registerType: 'store' | 'online') {
  try {
    const { data, error } = await supabase
      .from('cash_transactions')
      .select('balance_after')
      .eq('register_type', registerType)
      .order('transaction_date', { ascending: false })
      .limit(1)
      .single();
    
    if (error) {
      // If no transactions exist, return 0
      if (error.code === 'PGRST116') return 0;
      throw error;
    }
    
    return data?.balance_after || 0;
  } catch (error) {
    console.error('Error getting current cash balance:', error);
    throw error;
  }
}
