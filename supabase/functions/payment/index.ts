import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ─────────────────────────────────────────────
//  PLANS
// ─────────────────────────────────────────────
const PLANS = {
    free: {
        price: 0,
        features: [
            "Basic TDS monitoring",
            "7-day history",
            "Basic alerts (level + temp)",
            "1 tank",
        ],
    },
    pro: {
        price: 9.99,
        features: [
            "Full 3-tank monitoring",
            "90-day history",
            "ML predictions (5-model ensemble)",
            "Auto use-case routing",
            "All alerts",
            "Leaderboard",
            "Achievements",
        ],
    },
    enterprise: {
        price: 29.99,
        features: [
            "Everything in Pro",
            "Unlimited history",
            "API access",
            "Custom alert thresholds",
            "Multi-device / multi-site",
            "Priority support",
            "Export data (CSV/JSON)",
        ],
    },
};

serve(async (req) => {
    if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
    try {
        const supabase = createClient(
            Deno.env.get("SUPABASE_URL") ?? "",
            Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
        );

        const { userId, plan, paymentMethod = "simulation" } = await req.json();

        if (!userId) return new Response(
            JSON.stringify({ error: "userId is required" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );

        if (!plan || !PLANS[plan as keyof typeof PLANS]) return new Response(
            JSON.stringify({ error: `Invalid plan. Choose: free, pro, enterprise` }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );

        const selectedPlan = PLANS[plan as keyof typeof PLANS];

        // Simulate payment (95% success rate)
        const success = plan === "free" ? true : Math.random() > 0.05;

        // Record transaction
        const { data: tx } = await supabase.from("transactions").insert({
            user_id: userId,
            plan,
            amount: selectedPlan.price,
            currency: "USD",
            status: success ? "success" : "failed",
            payment_method: paymentMethod,
            description: `SaveHydroo ${plan} plan subscription`,
            metadata: { features: selectedPlan.features },
        }).select("id").single();

        if (success) {
            // Update profile plan
            await supabase.from("profiles")
                .update({ plan, updated_at: new Date().toISOString() })
                .eq("id", userId);

            // Award Pro Upgrader achievement
            if (plan === "pro" || plan === "enterprise") {
                const { data: ach } = await supabase
                    .from("achievements")
                    .select("id, points_value")
                    .eq("name", "Pro Upgrader")
                    .single();

                if (ach) {
                    const { error: dupError } = await supabase.from("user_achievements").insert({
                        user_id: userId,
                        achievement_id: ach.id,
                        points_awarded: ach.points_value,
                    });

                    if (!dupError) {
                        const { data: stats } = await supabase
                            .from("user_stats")
                            .select("total_points")
                            .eq("user_id", userId)
                            .single();

                        if (stats) {
                            await supabase.from("user_stats").update({
                                total_points: stats.total_points + ach.points_value,
                                updated_at: new Date().toISOString(),
                            }).eq("user_id", userId);
                        }
                    }
                }
            }
        }

        return new Response(JSON.stringify({
            success,
            transaction: { id: tx?.id ?? null, status: success ? "success" : "failed" },
            plan: { name: plan, price: selectedPlan.price, currency: "USD", features: selectedPlan.features },
            message: success
                ? `✅ Successfully subscribed to SaveHydroo ${plan}!`
                : `❌ Payment failed. Please try again.`,
        }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

    } catch (error) {
        return new Response(
            JSON.stringify({ error: "Internal server error", message: (error as Error).message }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    }
});
