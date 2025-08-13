
import { serve } from "https://deno.land/std@0.131.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

interface CashTransactionRequest {
  amount: number;
  transaction_type: 'deposit' | 'withdrawal';
  register_type: 'store' | 'online';
  notes?: string;
  created_by?: string;
  branch_id?: string;
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Create a Supabase client with the Auth context of the logged in user
    const supabaseClient = createClient(
      // Supabase API URL
      Deno.env.get('SUPABASE_URL') ?? '',
      // Supabase API ANON KEY
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      // Create client with Auth context of the user that called the function
      {
        global: {
          headers: { Authorization: req.headers.get('Authorization')! },
        },
      }
    );

// Get the request body
const payload = await req.json() as CashTransactionRequest;
const { amount, transaction_type, register_type, notes, created_by } = payload;

console.log('Processing transaction:', { amount, transaction_type, register_type, notes, branch_id: payload.branch_id });

// Validate inputs
if (!amount || amount <= 0) {
  return new Response(
    JSON.stringify({ error: 'Amount must be greater than zero' }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
  );
}

if (!['deposit', 'withdrawal'].includes(transaction_type)) {
  return new Response(
    JSON.stringify({ error: 'Invalid transaction type' }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
  );
}

if (!['store', 'online'].includes(register_type)) {
  return new Response(
    JSON.stringify({ error: 'Invalid register type' }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
  );
}

// Resolve user and branch
const { data: authData } = await supabaseClient.auth.getUser();
const userId = authData?.user?.id || created_by || null;

let branchId: string | null = payload.branch_id || null;
if (!branchId && userId) {
  const { data: branchRow } = await supabaseClient
    .from('user_branch_roles')
    .select('branch_id')
    .eq('user_id', userId)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();
  branchId = branchRow?.branch_id || null;
}

// Get the current balance before the transaction
let currentBalance = 0;
let txQuery = supabaseClient
  .from('cash_transactions')
  .select('balance_after')
  .eq('register_type', register_type)
  .order('transaction_date', { ascending: false })
  .limit(1);

if (branchId) {
  txQuery = txQuery.eq('branch_id', branchId);
}
const { data: currentBalanceData, error: balanceError } = await txQuery;
    
if (!balanceError && currentBalanceData && currentBalanceData.length > 0) {
  currentBalance = currentBalanceData[0].balance_after || 0;
  console.log('Current balance from transactions:', currentBalance);
} else {
  // If no transactions, check the tracking table
  let trQuery = supabaseClient
    .from('cash_tracking')
    .select('closing_balance')
    .eq('register_type', register_type)
    .order('date', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(1);
  if (branchId) {
    trQuery = trQuery.eq('branch_id', branchId);
  }
  const { data: trackingBalanceData, error: trackingBalanceError } = await trQuery;
  if (!trackingBalanceError && trackingBalanceData && trackingBalanceData.length > 0) {
    currentBalance = trackingBalanceData[0].closing_balance || 0;
    console.log('Current balance from tracking:', currentBalance);
  }
}

    // Calculate new balance
    let newBalance = currentBalance;
    if (transaction_type === 'deposit') {
      newBalance = currentBalance + amount;
    } else {
      // Check if there's enough balance for withdrawal
      if (amount > currentBalance) {
        return new Response(
          JSON.stringify({ error: 'لا يوجد رصيد كافي في الخزنة' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
        );
      }
      newBalance = currentBalance - amount;
    }
    
    console.log('New balance will be:', newBalance);

    // Use the database function to handle transactions (this bypasses RLS)
    const { data: functionData, error: functionError } = await supabaseClient.rpc(
      'add_cash_transaction',
      {
        p_amount: amount,
        p_transaction_type: transaction_type,
        p_register_type: register_type,
        p_notes: notes || null,
        p_created_by: created_by || null,
        p_branch_id: branchId || null
      }
    );

    if (functionError) {
      console.error('Error calling database function:', functionError);
      return new Response(
        JSON.stringify({ 
          error: functionError.message || 'Error processing transaction'
        }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 500
        }
      );
    }

    console.log('Transaction successfully recorded, new balance:', functionData);

    // Get the newly created transaction to return to the client
let txFetch = supabaseClient
  .from('cash_transactions')
  .select('*')
  .eq('register_type', register_type)
  .order('transaction_date', { ascending: false })
  .limit(1);
if (branchId) {
  txFetch = txFetch.eq('branch_id', branchId);
}
const { data: transactionData, error: transactionError } = await txFetch.single();

    let transaction = null;
    if (transactionError) {
      console.error('Error retrieving transaction:', transactionError);
    } else {
      console.log('Retrieved transaction:', transactionData);
      transaction = transactionData;
      newBalance = transactionData.balance_after; // Use the balance from the transaction
    }

    // Get the latest tracking record
let trackingFetch = supabaseClient
  .from('cash_tracking')
  .select('*')
  .eq('register_type', register_type)
  .order('date', { ascending: false })
  .order('created_at', { ascending: false })
  .limit(1);
if (branchId) {
  trackingFetch = trackingFetch.eq('branch_id', branchId);
}
const { data: trackingData, error: trackingError } = await trackingFetch.single();

    let tracking = null;
    if (trackingError) {
      console.error('Error retrieving tracking record:', trackingError);
    } else {
      console.log('Retrieved tracking record:', trackingData);
      tracking = trackingData;
    }

    return new Response(
      JSON.stringify({ 
        success: true,
        transaction: transaction,
        tracking: tracking,
        previous_balance: currentBalance,
        new_balance: newBalance
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200
      }
    );
  } catch (error) {
    console.error('Unhandled error:', error);
    return new Response(
      JSON.stringify({ 
        error: error instanceof Error ? error.message : 'Internal Server Error' 
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500
      }
    );
  }
});
