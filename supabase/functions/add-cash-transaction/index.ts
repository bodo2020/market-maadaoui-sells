import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.49.4";

interface CashTransactionRequest {
  amount?: unknown;
  transaction_type?: unknown;
  register_type?: unknown;
  notes?: unknown;
  branch_id?: unknown;
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  try {
    const authorization = req.headers.get("Authorization");
    if (!authorization) {
      return json({ error: "Authentication required" }, 401);
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      {
        auth: { persistSession: false, autoRefreshToken: false },
        global: { headers: { Authorization: authorization } },
      },
    );

    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError || !userData.user) {
      return json({ error: "Authentication required" }, 401);
    }

    const payload = (await req.json().catch(() => null)) as CashTransactionRequest | null;
    const amount = typeof payload?.amount === "number" ? payload.amount : Number(payload?.amount);
    const transactionType = typeof payload?.transaction_type === "string" ? payload.transaction_type : "";
    const registerType = typeof payload?.register_type === "string" ? payload.register_type : "";
    const notes = typeof payload?.notes === "string" ? payload.notes.slice(0, 1000) : "";
    const branchId = typeof payload?.branch_id === "string" ? payload.branch_id.trim() : "";

    if (!Number.isFinite(amount) || amount <= 0) {
      return json({ error: "Amount must be greater than zero" }, 400);
    }
    if (!['deposit', 'withdrawal'].includes(transactionType)) {
      return json({ error: "Invalid transaction type" }, 400);
    }
    if (!['store', 'online'].includes(registerType)) {
      return json({ error: "Invalid register type" }, 400);
    }
    if (!branchId) {
      return json({ error: "Branch is required" }, 400);
    }

    // The database wrapper re-validates Auth, branch access, amount/type and
    // prevents created_by spoofing. Never call the legacy SECURITY DEFINER core
    // function directly from a browser-authenticated context.
    const { data: newBalance, error: rpcError } = await supabase.rpc(
      "add_cash_transaction_api",
      {
        p_amount: amount,
        p_transaction_type: transactionType,
        p_register_type: registerType,
        p_notes: notes,
        p_created_by: userData.user.id,
        p_branch_id: branchId,
      },
    );

    if (rpcError) {
      console.error("Cash RPC failed", rpcError.message);
      const status = rpcError.code === "42501" ? 403 : rpcError.code === "22023" ? 400 : 500;
      return json({ error: rpcError.message || "Error processing transaction" }, status);
    }

    const { data: transaction } = await supabase
      .from("cash_transactions")
      .select("*")
      .eq("branch_id", branchId)
      .eq("register_type", registerType)
      .order("transaction_date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const { data: tracking } = await supabase
      .from("cash_tracking")
      .select("*")
      .eq("branch_id", branchId)
      .eq("register_type", registerType)
      .order("date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    return json({
      success: true,
      transaction: transaction ?? null,
      tracking: tracking ?? null,
      new_balance: Number(newBalance ?? 0),
    });
  } catch (error) {
    console.error("Unhandled add-cash-transaction error", error);
    return json({ error: "Internal Server Error" }, 500);
  }
});
