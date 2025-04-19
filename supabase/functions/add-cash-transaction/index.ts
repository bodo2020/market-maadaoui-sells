
import { serve } from "https://deno.land/std@0.131.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

interface CashTransactionRequest {
  amount: number;
  transaction_type: 'deposit' | 'withdrawal';
  register_type: 'store' | 'online';
  notes?: string;
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
    const { amount, transaction_type, register_type, notes } = await req.json() as CashTransactionRequest;

    console.log('Processing transaction:', { amount, transaction_type, register_type, notes });

    // Get the current balance
    const { data: balanceData, error: balanceError } = await supabaseClient
      .from('cash_tracking')
      .select('closing_balance')
      .eq('register_type', register_type)
      .order('date', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(1);
    
    if (balanceError) {
      console.error('Error fetching balance:', balanceError);
      throw new Error('Error fetching current balance');
    }
    
    const currentBalance = balanceData && balanceData.length > 0 ? balanceData[0].closing_balance : 0;
    
    // Calculate new balance
    const newBalance = transaction_type === 'deposit' 
      ? currentBalance + amount 
      : currentBalance - amount;
    
    // Check for sufficient balance on withdrawal
    if (transaction_type === 'withdrawal' && amount > currentBalance) {
      return new Response(
        JSON.stringify({ 
          error: `Insufficient funds. Current balance: ${currentBalance}` 
        }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 400
        }
      );
    }

    // Use the database function to handle transactions (this bypasses RLS)
    const { data: functionData, error: functionError } = await supabaseClient.rpc(
      'add_cash_transaction',
      {
        p_amount: amount,
        p_transaction_type: transaction_type,
        p_register_type: register_type,
        p_notes: notes || null
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

    // Get the newly created records to return to the client
    const { data: transactionData, error: transactionError } = await supabaseClient
      .from('cash_transactions')
      .select('*')
      .eq('register_type', register_type)
      .order('transaction_date', { ascending: false })
      .limit(1)
      .single();

    if (transactionError) {
      console.error('Error retrieving transaction:', transactionError);
    }

    const { data: trackingData, error: trackingError } = await supabaseClient
      .from('cash_tracking')
      .select('*')
      .eq('register_type', register_type)
      .order('date', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (trackingError) {
      console.error('Error retrieving tracking record:', trackingError);
    }

    return new Response(
      JSON.stringify({ 
        success: true,
        transaction: transactionData || null,
        tracking: trackingData || null,
        previous_balance: currentBalance,
        new_balance: functionData || newBalance
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
