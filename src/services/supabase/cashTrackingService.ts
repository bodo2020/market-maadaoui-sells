
import { supabase } from "@/integrations/supabase/client";

export enum RegisterType {
  STORE = 'store',
  ONLINE = 'online',
  MERGED = 'merged'
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
  branch_id?: string;
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
    
  // Show merged records or all records if no specific type requested
  if (registerType) {
    query = query.eq('register_type', registerType);
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

export async function getLatestCashBalance(registerType: RegisterType, branchId?: string): Promise<number> {
  try {
    const currentBranchId = branchId || localStorage.getItem('currentBranchId');
    
    // Special handling for merged balance
    if (registerType === RegisterType.MERGED) {
      // Get store balance
      const storeBalance = await getLatestCashBalance(RegisterType.STORE, currentBranchId);
      // Get online balance
      const onlineBalance = await getLatestCashBalance(RegisterType.ONLINE, currentBranchId);
      return storeBalance + onlineBalance;
    }

    // For store and online, get from cash_transactions first
    let txQuery = supabase
      .from('cash_transactions')
      .select('balance_after')
      .eq('register_type', registerType)
      .order('transaction_date', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(1);

    if (currentBranchId) {
      txQuery = txQuery.eq('branch_id', currentBranchId);
    }

    const { data: txData, error: txError } = await txQuery.maybeSingle();

    if (!txError && txData) {
      return txData.balance_after || 0;
    }

    // If no branch-specific transaction found, try without branch filter (legacy data)
    if (currentBranchId) {
      const { data: txAny, error: txAnyError } = await supabase
        .from('cash_transactions')
        .select('balance_after')
        .eq('register_type', registerType)
        .order('transaction_date', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!txAnyError && txAny) {
        return txAny.balance_after || 0;
      }
    }

    // Fallback to cash_tracking
    let trackingQuery = supabase
      .from('cash_tracking')
      .select('closing_balance')
      .eq('register_type', registerType)
      .order('date', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(1);

    if (currentBranchId) {
      trackingQuery = trackingQuery.eq('branch_id', currentBranchId);
    }

    const { data: trackingData, error: trackingError } = await trackingQuery.maybeSingle();

    if (!trackingError && trackingData) {
      return trackingData.closing_balance || 0;
    }

    // As a final fallback, read any tracking record regardless of branch (legacy)
    if (currentBranchId) {
      const { data: trackingAny, error: trackingAnyError } = await supabase
        .from('cash_tracking')
        .select('closing_balance')
        .eq('register_type', registerType)
        .order('date', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!trackingAnyError && trackingAny) {
        return trackingAny.closing_balance || 0;
      }
    }

    return 0;
  } catch (error) {
    console.error('Error in getLatestCashBalance:', error);
    return 0;
  }
}

export async function getMergedCashBalance() {
  try {
    const { data, error } = await supabase.rpc('get_merged_cash_balance');
    if (error) {
      console.error('Error getting merged balance:', error);
      return 0;
    }
    return data || 0;
  } catch (error) {
    console.error('Error getting merged balance:', error);
    return 0;
  }
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
    // Route by register type
    if (registerType === RegisterType.MERGED) {
      const { data, error } = await supabase.rpc('record_merged_cash_transaction', {
        p_amount: amount,
        p_transaction_type: transactionType,
        p_notes: notes || '',
        p_created_by: userId
      });
      
      if (error) {
        console.error(`Error during ${transactionType} (merged):`, error);
        throw error;
      }
      
      console.log(`Successfully recorded ${transactionType} (merged):`, data);
      return { balance_after: data };
    } else {
      // Use per-register function for store/online
      const { data, error } = await supabase.rpc('add_cash_transaction_api', {
        p_amount: amount,
        p_transaction_type: transactionType,
        p_register_type: registerType,
        p_notes: notes || '',
        p_created_by: userId,
        p_branch_id: branchId || null
      });
      if (error) {
        console.error(`Error during ${transactionType} (${registerType}):`, error);
        throw error;
      }
      console.log(`Successfully recorded ${transactionType} (${registerType}):`, data);
      return { balance_after: data };
    }

    // Fallback for other register types (should not be used)
    const currentBalance = await getLatestCashBalanceFromTracking(registerType);
    
    let newBalance: number;
    if (transactionType === 'deposit') {
      newBalance = currentBalance + amount;
    } else {
      if (amount > currentBalance) {
        throw new Error(`Insufficient funds. Current balance: ${currentBalance}`);
      }
      newBalance = currentBalance - amount;
    }

    const record: any = {
      date: new Date().toISOString().split('T')[0],
      register_type: registerType,
      opening_balance: currentBalance,
      closing_balance: newBalance,
      difference: transactionType === 'deposit' ? amount : -amount,
      notes,
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
    
    let query = supabase
      .from('cash_tracking')
      .select('closing_balance')
      .eq('register_type', registerType)
      .order('date', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(1);
    
    const { data, error } = await query;
    
    if (error) {
      console.error('Error fetching balance from cash_tracking:', error);
      return 0;
    }
    
    if (data && data.length > 0) {
      const balance = data[0].closing_balance || 0;
      console.log(`Found balance in cash_tracking: ${balance}`);
      return balance;
    }
    
    console.log('No cash_tracking records found, returning 0');
    return 0;
  } catch (error) {
    console.error(`Error getting balance from cash_tracking for ${registerType}:`, error);
    return 0;
  }
}

// سحب ذكي: يسحب من خزنة المحل أولاً ثم يكمل من خزنة الأونلاين عند الحاجة
export async function recordSmartWithdrawal(amount: number, notes: string, userId: string | null) {
  if (amount <= 0) throw new Error('المبلغ غير صالح');

  const storeBalance = await getLatestCashBalanceFromTracking(RegisterType.STORE);
  if (amount <= storeBalance) {
    const { error } = await supabase.rpc('add_cash_transaction_api', {
      p_amount: amount,
      p_transaction_type: 'withdrawal',
      p_register_type: 'store',
      p_notes: notes || '',
      p_created_by: userId,
      p_branch_id: null
    });
    if (error) throw error;
    return true;
  }

  // Otherwise, withdraw all store balance then the remainder from online
  const onlineBalance = await getLatestCashBalanceFromTracking(RegisterType.ONLINE);
  const remainder = amount - storeBalance;

  // Withdraw store balance if any
  if (storeBalance > 0) {
    const { error: err1 } = await supabase.rpc('add_cash_transaction_api', {
      p_amount: storeBalance,
      p_transaction_type: 'withdrawal',
      p_register_type: 'store',
      p_notes: notes ? `${notes} (من خزنة المحل)` : '(من خزنة المحل)',
      p_created_by: userId,
      p_branch_id: null
    });
    if (err1) throw err1;
  }

  if (remainder <= onlineBalance) {
    const { error: err2 } = await supabase.rpc('add_cash_transaction_api', {
      p_amount: remainder,
      p_transaction_type: 'withdrawal',
      p_register_type: 'online',
      p_notes: notes ? `${notes} (تكملة من الأونلاين)` : '(تكملة من الأونلاين)',
      p_created_by: userId,
      p_branch_id: null
    });
    if (err2) throw err2;
    return true;
  }

  // If not enough funds overall, rollback is manual; inform the user
  throw new Error('الرصيد غير كافٍ في الخزنتين');
}

// تحويل بين الخزنات: سحب من خزنة وإيداع في خزنة أخرى مع تسجيل التحويل
export async function recordCashTransfer(
  amount: number,
  fromRegister: RegisterType,
  toRegister: RegisterType,
  notes: string,
  userId: string | null,
  branchId?: string
) {
  try {
    if (fromRegister === toRegister) {
      throw new Error('لا يمكن التحويل إلى نفس الخزنة');
    }

    if (fromRegister === RegisterType.MERGED || toRegister === RegisterType.MERGED) {
      throw new Error('لا يمكن التحويل من أو إلى الخزنة المدمجة');
    }

    // Get balance from source register
    const fromBalance = await getLatestCashBalance(fromRegister);
    
    if (amount > fromBalance) {
      const registerName = fromRegister === RegisterType.STORE ? 'المحل' : 'الأونلاين';
      throw new Error(`الرصيد غير كافٍ في خزنة ${registerName}. الرصيد الحالي: ${fromBalance}`);
    }

    // Withdraw from source
    await recordCashTransaction(
      amount,
      'withdrawal',
      fromRegister,
      `تحويل إلى خزنة ${toRegister === RegisterType.STORE ? 'المحل' : 'الأونلاين'}${notes ? ' - ' + notes : ''}`,
      userId,
      branchId
    );

    // Deposit to destination
    await recordCashTransaction(
      amount,
      'deposit',
      toRegister,
      `تحويل من خزنة ${fromRegister === RegisterType.STORE ? 'المحل' : 'الأونلاين'}${notes ? ' - ' + notes : ''}`,
      userId,
      branchId
    );

    // Record the transfer in cash_transfers table
    const { data: transferData, error: transferError } = await supabase
      .from('cash_transfers')
      .insert({
        amount,
        from_register: fromRegister,
        to_register: toRegister,
        notes: notes || null,
        created_by: userId,
        branch_id: branchId || null
      })
      .select()
      .single();

    if (transferError) {
      console.error('Error recording transfer:', transferError);
      throw transferError;
    }

    console.log('Transfer recorded successfully:', transferData);
    return transferData;
  } catch (error) {
    console.error('Error during cash transfer:', error);
    throw error;
  }
}
