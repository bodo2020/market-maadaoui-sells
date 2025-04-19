import { supabase } from "@/integrations/supabase/client";

export enum RegisterType {
  STORE = 'store',
  ONLINE = 'online'
}

export interface CashRecord {
  id: string;
  date: string;
  opening_balance: number;
  closing_balance: number;
  difference?: number;
  notes?: string;
  created_by?: string;
  verified_by?: string;
  created_at?: string;
  updated_at?: string;
  register_type: RegisterType;
}

export interface TransferRecord {
  id: string;
  date: string;
  amount: number;
  from_register: RegisterType;
  to_register: RegisterType;
  notes?: string;
  created_by: string;
  created_at?: string;
}

export interface CashTransaction {
  id: string;
  transaction_date: string;
  amount: number;
  balance_after: number;
  transaction_type: 'deposit' | 'withdrawal' | 'transfer';
  register_type: RegisterType;
  notes?: string;
  created_by?: string;
  created_at?: string;
}

export async function fetchCashRecords(registerType?: RegisterType) {
  let query = supabase
    .from('cash_tracking')
    .select('*')
    .order('date', { ascending: false });
    
  if (registerType) {
    query = query.eq('register_type', registerType);
  }
  
  const { data, error } = await query;
    
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

export async function getLatestCashBalance(registerType: RegisterType) {
  const { data, error } = await supabase
    .from('cash_tracking')
    .select('*')
    .eq('register_type', registerType)
    .order('date', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(1);
    
  if (error) throw error;
  
  if (data && data.length > 0) {
    return data[0].closing_balance || data[0].opening_balance || 0;
  }
  
  return 0;
}

export async function recordCashTransaction(
  amount: number,
  transactionType: 'deposit' | 'withdrawal',
  registerType: RegisterType,
  notes: string,
  userId: string
) {
  try {
    const { data, error } = await supabase.rpc('add_cash_transaction', {
      p_amount: amount,
      p_transaction_type: transactionType,
      p_register_type: registerType,
      p_notes: notes
    });
      
    if (error) throw error;
    
    return data;
  } catch (error) {
    console.error(`Error during ${transactionType}:`, error);
    throw error;
  }
}

export async function transferBetweenRegisters(
  amount: number,
  fromRegister: RegisterType,
  toRegister: RegisterType,
  notes: string,
  userId: string
) {
  const fromBalance = await getLatestCashBalance(fromRegister);
  const toBalance = await getLatestCashBalance(toRegister);
  
  if (fromBalance < amount) {
    throw new Error('لا يوجد رصيد كافي في الخزنة المصدر');
  }
  
  const { error: transferError } = await supabase
    .from('register_transfers')
    .insert([{
      date: new Date().toISOString().split('T')[0],
      amount,
      from_register: fromRegister,
      to_register: toRegister,
      notes,
      created_by: userId
    }]);
    
  if (transferError) throw transferError;
  
  const { error: transactionError } = await supabase
    .from('cash_transactions')
    .insert([{
      transaction_date: new Date().toISOString(),
      amount,
      balance_after: fromBalance - amount,
      transaction_type: 'transfer',
      register_type: fromRegister,
      notes: `تحويل إلى خزنة ${toRegister === 'store' ? 'المحل' : 'الأونلاين'}: ${notes}`,
      created_by: userId
    }]);
    
  if (transactionError) throw transactionError;
  
  const { error: sourceError } = await supabase
    .from('cash_tracking')
    .insert([{
      date: new Date().toISOString().split('T')[0],
      opening_balance: fromBalance,
      closing_balance: fromBalance - amount,
      difference: -amount,
      notes: `تحويل إلى خزنة ${toRegister === 'store' ? 'المحل' : 'الأونلاين'}: ${notes}`,
      created_by: userId,
      register_type: fromRegister
    }]);
    
  if (sourceError) throw sourceError;
  
  const { error: destError } = await supabase
    .from('cash_tracking')
    .insert([{
      date: new Date().toISOString().split('T')[0],
      opening_balance: toBalance,
      closing_balance: toBalance + amount,
      difference: amount,
      notes: `تحويل من خزنة ${fromRegister === 'store' ? 'المحل' : 'الأونلاين'}: ${notes}`,
      created_by: userId,
      register_type: toRegister
    }]);
    
  if (destError) throw destError;
  
  return true;
}

export async function fetchTransfers() {
  const { data, error } = await supabase
    .from('register_transfers')
    .select('*')
    .order('date', { ascending: false });
    
  if (error) throw error;
  return data as TransferRecord[];
}

export async function fetchCashTransactions(registerType?: RegisterType) {
  let query = supabase
    .from('cash_transactions')
    .select('*')
    .order('transaction_date', { ascending: false });
    
  if (registerType) {
    query = query.eq('register_type', registerType);
  }
  
  const { data, error } = await query;
    
  if (error) throw error;
  return data as CashTransaction[];
}
