// ============================================
// SAVEHYDROO - Payment Simulation Edge Function
// Simulated payment transactions (no real gateway)
// ============================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Credit packages (Synced with frontend starter/pro/ultra)
const CREDIT_PACKAGES = [
    { id: "starter", name: "Starter Pack", amount: 99, credits: 100 },
    { id: "pro", name: "Pro Pack", amount: 399, credits: 500 },
    { id: "ultra", name: "Ultra Pack", amount: 999, credits: 1500 },
    { id: "basic", name: "Basic Credits", amount: 10, credits: 100 }, // Keep for backward compatibility
];

// Feature unlocks
const FEATURES = [
    { id: "advanced_analytics", name: "Advanced Analytics", price: 500 },
    { id: "export_data", name: "Export Historical Data", price: 300 },
    { id: "custom_alerts", name: "Custom Alerts", price: 200 },
    { id: "premium_support", name: "Premium Support", price: 1000 },
];

interface TransactionRequest {
    userId: string;
    type: "credit_purchase" | "feature_unlock" | "donation";
    packageId?: string;
    featureId?: string;
    amount?: number;
    description?: string;
}

// Simulate payment processing with 90% success rate
function simulatePaymentGateway(): { success: boolean; transactionId: string } {
    const success = Math.random() < 0.9; // 90% success rate
    const transactionId = `txn_${Date.now()}_${Math.random().toString(36).substring(7)}`;
    return { success, transactionId };
}

serve(async (req) => {
    if (req.method === "OPTIONS") {
        return new Response("ok", { headers: corsHeaders });
    }

    try {
        const supabaseUrl = Deno.env.get("SUPABASE_URL");
        const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

        if (!supabaseUrl || !serviceRoleKey) {
            console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables.");
            return new Response(JSON.stringify({
                error: "Server configuration error. Missing database keys.",
                details: { hasUrl: !!supabaseUrl, hasKey: !!serviceRoleKey }
            }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }

        const supabaseClient = createClient(supabaseUrl, serviceRoleKey, {
            db: { schema: 'public' }
        });

        // --- DIAGNOSTIC: Check table visibility ---
        const { data: tableCheck, error: checkError } = await supabaseClient
            .from("sensor_readings")
            .select("id")
            .limit(1);

        if (checkError) {
            console.error("Diagnostic failed: Cannot see sensor_readings", checkError.message);
        } else {
            console.log("Diagnostic passed: Database connection active.");
        }
        // --- END DIAGNOSTIC ---

        // GET: Fetch transaction history or packages
        if (req.method === "GET") {
            const url = new URL(req.url);
            const action = url.searchParams.get("action");
            const userId = url.searchParams.get("userId");

            // Get available packages
            if (action === "packages") {
                return new Response(JSON.stringify({
                    success: true,
                    packages: [
                        { id: "starter", name: "Starter Pack", credits: 100, price: 99 },
                        { id: "pro", name: "Pro Pack", credits: 500, price: 399 },
                        { id: "ultra", name: "Ultra Pack", credits: 1500, price: 999 },
                    ],
                }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
            }

            // Get transaction history
            if (!userId) {
                return new Response(
                    JSON.stringify({ error: "userId is required" }),
                    { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
                );
            }

            // I'll try with explicit public schema prefix to bypass cache issues
            const { data: transactions, error: fetchError } = await supabaseClient
                .from("transactions")
                .select("*")
                .eq("user_id", userId)
                .order("created_at", { ascending: false })
                .limit(50);

            return new Response(
                JSON.stringify({ success: true, transactions }),
                { headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
        }

        // POST: Initiate transaction
        if (req.method === "POST") {
            const payload: TransactionRequest = await req.json();

            if (!payload.userId || !payload.type) {
                return new Response(
                    JSON.stringify({ error: "userId and type are required" }),
                    { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
                );
            }

            let amount = 0;
            let credits = 0;
            let description = "";

            // Determine transaction details
            switch (payload.type) {
                case "credit_purchase": {
                    const pkg = CREDIT_PACKAGES.find(p => p.id === payload.packageId);
                    if (!pkg) {
                        return new Response(
                            JSON.stringify({ error: "Invalid package ID" }),
                            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
                        );
                    }
                    amount = pkg.amount;
                    credits = pkg.credits;
                    description = `Purchased ${pkg.name}`;
                    break;
                }

                case "feature_unlock": {
                    const feature = FEATURES.find(f => f.id === payload.featureId);
                    if (!feature) {
                        return new Response(
                            JSON.stringify({ error: "Invalid feature ID" }),
                            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
                        );
                    }
                    amount = feature.price;
                    description = `Unlocked ${feature.name}`;
                    break;
                }

                case "donation":
                    amount = payload.amount || 0;
                    description = payload.description || "Donation";
                    // Bonus points for donations
                    credits = Math.floor(amount * 0.5); // 50% of donation as bonus points
                    break;

                default:
                    return new Response(
                        JSON.stringify({ error: "Invalid transaction type" }),
                        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
                    );
            }

            // Create initial transaction record
            const { data: transaction, error: txError } = await supabaseClient
                .from("transactions")
                .insert({
                    user_id: payload.userId,
                    type: payload.type,
                    amount,
                    credits,
                    description,
                    status: "initiated",
                })
                .select()
                .single();

            if (txError) {
                throw new Error(`Failed to create transaction: ${txError.message}`);
            }

            // Simulate payment gateway
            const paymentResult = simulatePaymentGateway();

            // Update transaction status
            const finalStatus = paymentResult.success ? "successful" : "failed";
            await supabaseClient
                .from("transactions")
                .update({
                    status: finalStatus,
                    completed_at: new Date().toISOString(),
                })
                .eq("id", transaction.id);

            // If successful, update user wallet and unlock features
            let returnedNewBalance = 0;
            if (paymentResult.success) {
                const { data: profile } = await supabaseClient
                    .from("profiles")
                    .select("wallet_balance, points")
                    .eq("id", payload.userId)
                    .single();

                if (profile) {
                    let newBalance = parseFloat(profile.wallet_balance || 0);
                    let newPoints = parseInt(profile.points || 0);

                    if (payload.type === "credit_purchase") {
                        newBalance += credits;
                    } else if (payload.type === "feature_unlock") {
                        newBalance -= amount;
                    } else if (payload.type === "donation") {
                        newBalance -= amount;
                        newPoints += credits; // bonus points
                    }

                    returnedNewBalance = newBalance;

                    const updatePayload: any = { wallet_balance: newBalance };
                    if (payload.type === "donation") {
                        updatePayload.points = newPoints;
                    }

                    await supabaseClient
                        .from("profiles")
                        .update(updatePayload)
                        .eq("id", payload.userId);

                    // Unlock feature if applicable
                    if (payload.type === "feature_unlock" && payload.featureId) {
                        await supabaseClient
                            .from("user_features")
                            .insert({
                                user_id: payload.userId,
                                feature_id: payload.featureId,
                            })
                            .onConflict("user_id,feature_id")
                            .ignoreDuplicates();
                    }
                }
            }

            return new Response(
                JSON.stringify({
                    success: true,
                    newBalance: returnedNewBalance,
                    transaction: {
                        ...transaction,
                        status: finalStatus,
                        credits: paymentResult.success ? credits : 0,
                        transactionId: paymentResult.transactionId,
                    },
                }),
                { headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
        }

        return new Response(
            JSON.stringify({ error: "Method not allowed" }),
            { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    } catch (error) {
        console.error("Error in payment-simulation function:", error);
        return new Response(
            JSON.stringify({ error: "Internal server error", message: error instanceof Error ? error.message : String(error) }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    }
});
