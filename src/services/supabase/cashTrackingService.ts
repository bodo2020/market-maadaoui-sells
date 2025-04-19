
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
  console.log('Fetched cash records:', data);
  return data as CashRecord[];
}

export async function createCashRecord(record: Omit<CashRecord, 'id' | 'created_at' | 'updated_at'>) {
  const { data, error } = await supabase
    .from('cash_tracking')
    .insert([record])
    .select()
    .single();
    
  if (error) throw error;
  console.log('Created cash record:', data);
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
  console.log('Updated cash record:', data);
  return data as CashRecord;
}

export async function getLatestCashBalance(registerType: RegisterType) {
  // First check the transactions table, which is more reliable
  try {
    console.log(`Fetching balance for register ${registerType} from transactions table`);
    const { data: transactionData, error: transactionError } = await supabase
      .from('cash_transactions')
      .select('balance_after')
      .eq('register_type', registerType)
      .order('transaction_date', { ascending: false })
      .limit(1);
      
    if (!transactionError && transactionData && transactionData.length > 0) {
      console.log(`Found balance in transactions table: ${transactionData[0].balance_after}`);
      return transactionData[0].balance_after || 0;
    }
    
    console.log('No transactions found or error, checking tracking table');
    
    // If no transactions found, check the tracking table
    const { data, error } = await supabase
      .from('cash_tracking')
      .select('*')
      .eq('register_type', registerType)
      .order('date', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(1);
      
    if (error) {
      console.error('Error fetching cash tracking:', error);
      throw error;
    }
    
    if (data && data.length > 0) {
      console.log(`Found balance in tracking table: ${data[0].closing_balance || data[0].opening_balance || 0}`);
      return data[0].closing_balance || data[0].opening_balance || 0;
    }
    
    console.log('No cash records found, returning 0');
    return 0;
  } catch (error) {
    console.error(`Error getting latest cash balance for ${registerType}:`, error);
    throw error;
  }
}

export async function recordCashTransaction(
  amount: number,
  transactionType: 'deposit' | 'withdrawal',
  registerType: RegisterType,
  notes: string,
  userId: string
) {
  try {
    console.log(`Recording ${transactionType} of ${amount} to ${registerType}:`, {
      amount,
      transaction_type: transactionType,
      register_type: registerType,
      notes
    });
    
    const { data, error } = await supabase.functions.invoke('add-cash-transaction', {
      body: {
        amount,
        transaction_type: transactionType,
        register_type: registerType,
        notes
      }
    });
      
    if (error) {
      console.error(`Error during ${transactionType}:`, error);
      throw error;
    }
    
    console.log(`Successfully recorded ${transactionType}:`, data);
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
  
  if (fromBalance < amount) {
    throw new Error('لا يوجد رصيد كافي في الخزنة المصدر');
  }
  
  // First, record the withdrawal from the source register
  await recordCashTransaction(amount, 'withdrawal', fromRegister, 
    `تحويل إلى خزنة ${toRegister === RegisterType.STORE ? 'المحل' : 'الأونلاين'}: ${notes}`, userId);
  
  // Then, record the deposit to the destination register
  await recordCashTransaction(amount, 'deposit', toRegister, 
    `تحويل من خزنة ${fromRegister === RegisterType.STORE ? 'المحل' : 'الأونلاين'}: ${notes}`, userId);
  
  // Record the transfer in the register_transfers table
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
  console.log('Fetched cash transactions:', data);
  return data as CashTransaction[];
}
