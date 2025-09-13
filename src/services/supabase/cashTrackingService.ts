
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


export async function fetchCashRecords(registerType?: RegisterType, dateRange?: { from: Date, to: Date }) {
  let query = supabase
    .from('cash_tracking')
    .select('*')
    .order('date', { ascending: false })
    .order('created_at', { ascending: false });
    
  if (registerType) {
    query = query.eq('register_type', registerType);
  }
  
  // Filter by current branch if available, otherwise show all data
  const branchId = typeof window !== 'undefined' ? localStorage.getItem('currentBranchId') : null;
  if (branchId) {
    query = query.eq('branch_id', branchId);
  }
  
  if (dateRange?.from && dateRange?.to) {
    const fromDate = dateRange.from.toISOString().split('T')[0];
    const toDate = dateRange.to.toISOString().split('T')[0];
    query = query.gte('date', fromDate).lte('date', toDate);
  }
  
  const { data, error } = await query;
    
  if (error) throw error;
  console.log('Fetched cash records:', data);
  return data as CashRecord[];
}

export async function createCashRecord(record: Omit<CashRecord, 'id' | 'created_at' | 'updated_at'>) {
  // التأكد من وجود branch_id
  let branchId = typeof window !== 'undefined' ? localStorage.getItem('currentBranchId') : null;
  
  if (!branchId) {
    console.warn('No branch ID found, attempting to get default branch');
    const { data: branches } = await supabase
      .from('branches')
      .select('id')
      .eq('active', true)
      .order('created_at', { ascending: true })
      .limit(1);
    
    if (branches && branches.length > 0) {
      branchId = branches[0].id;
      if (typeof window !== 'undefined') {
        localStorage.setItem('currentBranchId', branchId);
      }
    }
  }

  const recordWithBranch = {
    ...record,
    branch_id: branchId
  };

  const { data, error } = await supabase
    .from('cash_tracking')
    .insert([recordWithBranch])
    .select()
    .single();
    
  if (error) throw error;
  console.log('Created cash record with branch_id:', data);
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
  return await getLatestCashBalanceFromTracking(registerType);
}


export async function recordCashTransaction(
  amount: number,
  transactionType: 'deposit' | 'withdrawal',
  registerType: RegisterType,
  notes: string,
  userId: string | null,
  branchId?: string
) {
  try {
    // Get current balance
    const currentBalance = await getLatestCashBalanceFromTracking(registerType);
    
    // Calculate new balance
    let newBalance: number;
    if (transactionType === 'deposit') {
      newBalance = currentBalance + amount;
    } else {
      if (amount > currentBalance) {
        throw new Error(`Insufficient funds. Current balance: ${currentBalance}`);
      }
      newBalance = currentBalance - amount;
    }

    // Get or set branch_id - use passed parameter or get from localStorage/default
    let finalBranchId = branchId || (typeof window !== 'undefined' ? localStorage.getItem('currentBranchId') : null);
    
    if (!finalBranchId) {
      console.warn('No branch ID found, attempting to get default branch');
      const { data: branches } = await supabase
        .from('branches')
        .select('id')
        .eq('active', true)
        .order('created_at', { ascending: true })
        .limit(1);
      
      if (branches && branches.length > 0) {
        finalBranchId = branches[0].id;
        if (typeof window !== 'undefined') {
          localStorage.setItem('currentBranchId', finalBranchId);
        }
      }
    }

    // Create cash tracking record
    const record: any = {
      date: new Date().toISOString().split('T')[0],
      register_type: registerType,
      opening_balance: currentBalance,
      closing_balance: newBalance,
      difference: transactionType === 'deposit' ? amount : -amount,
      notes,
      branch_id: finalBranchId,
      ...(userId ? { created_by: userId } : {})
    };

    const { data, error } = await supabase
      .from('cash_tracking')
      .insert([record])
      .select()
      .single();
      
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


export async function getLatestCashBalanceFromTracking(registerType: RegisterType) {
  try {
    console.log(`Fetching balance for register ${registerType} from cash_tracking table`);
    
    // التأكد من وجود branch_id أولاً
    let branchId = typeof window !== 'undefined' ? localStorage.getItem('currentBranchId') : null;
    
    if (!branchId) {
      console.warn('No branch ID found, attempting to get default branch');
      const { data: branches } = await supabase
        .from('branches')
        .select('id')
        .eq('active', true)
        .order('created_at', { ascending: true })
        .limit(1);
      
      if (branches && branches.length > 0) {
        branchId = branches[0].id;
        if (typeof window !== 'undefined') {
          localStorage.setItem('currentBranchId', branchId);
        }
      }
    }

    let query = supabase
      .from('cash_tracking')
      .select('closing_balance')
      .eq('register_type', registerType)
      .order('date', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(1);
    
    // Filter by branch if available
    if (branchId) {
      query = query.eq('branch_id', branchId);
    }
    
    const { data, error } = await query;
    
    if (error) {
      console.error('Error fetching balance from cash_tracking:', error);
      return 0;
    }
    
    if (data && data.length > 0) {
      const balance = data[0].closing_balance || 0;
      console.log(`Found balance in cash_tracking: ${balance} for branch: ${branchId}`);
      return balance;
    }
    
    console.log('No cash_tracking records found, returning 0');
    return 0;
  } catch (error) {
    console.error(`Error getting balance from cash_tracking for ${registerType}:`, error);
    return 0;
  }
}
