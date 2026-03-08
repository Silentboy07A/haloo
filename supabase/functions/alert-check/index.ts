// ============================================
// SAVEHYDROO - Alert Check Edge Function
// Water quality alert detection and management
// ============================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Alert thresholds
const THRESHOLDS = {
    tds: {
        low: 50,    // ppm — below this is suspiciously pure (possible sensor fault)
        high: 500,  // ppm — above this is unsafe for drinking
        optimal_min: 150,
        optimal_max: 300,
    },
    water_level: {
        critical: 10,   // % — critically low
        warning: 25,    // % — getting low
    },
    temperature: {
        high: 45,   // °C — too hot
        low: 5,     // °C — too cold
    },
};

interface SensorReadings {
    ro_reject?: { tds: number; temperature: number; level: number; flowRate: number };
    rainwater?: { tds: number; temperature: number; level: number; flowRate: number };
    blended?: { tds: number; temperature: number; level: number; flowRate: number };
}

interface AlertCheckPayload {
    userId: string;
    readings: SensorReadings;
}

// Evaluate readings and return list of alerts to create
function evaluateAlerts(userId: string, readings: SensorReadings): any[] {
    const alerts: any[] = [];
    const now = new Date().toISOString();

    for (const [tankType, reading] of Object.entries(readings)) {
        if (!reading) continue;

        // TDS out of range
        if (reading.tds > THRESHOLDS.tds.high) {
            alerts.push({
                user_id: userId,
                tank_type: tankType,
                alert_type: "tds_high",
                message: `TDS in ${tankType.replace("_", " ")} tank is critically high (${reading.tds.toFixed(0)} ppm). Reduce RO reject ratio immediately.`,
                value: reading.tds,
                threshold: THRESHOLDS.tds.high,
                resolved: false,
                timestamp: now,
            });
        } else if (reading.tds < THRESHOLDS.tds.low && tankType === "blended") {
            alerts.push({
                user_id: userId,
                tank_type: tankType,
                alert_type: "tds_low",
                message: `Blended TDS is unusually low (${reading.tds.toFixed(0)} ppm). Check sensor or increase RO ratio.`,
                value: reading.tds,
                threshold: THRESHOLDS.tds.low,
                resolved: false,
                timestamp: now,
            });
        }

        // Blended TDS outside optimal range
        if (
            tankType === "blended" &&
            reading.tds >= THRESHOLDS.tds.low &&
            reading.tds <= THRESHOLDS.tds.high &&
            (reading.tds < THRESHOLDS.tds.optimal_min || reading.tds > THRESHOLDS.tds.optimal_max)
        ) {
            alerts.push({
                user_id: userId,
                tank_type: tankType,
                alert_type: "tds_suboptimal",
                message: `Blended TDS (${reading.tds.toFixed(0)} ppm) is outside the optimal range of ${THRESHOLDS.tds.optimal_min}–${THRESHOLDS.tds.optimal_max} ppm. Adjust blend ratio.`,
                value: reading.tds,
                threshold: THRESHOLDS.tds.optimal_max,
                resolved: false,
                timestamp: now,
            });
        }

        // Water level alerts
        if (reading.level <= THRESHOLDS.water_level.critical) {
            alerts.push({
                user_id: userId,
                tank_type: tankType,
                alert_type: "level_critical",
                message: `${tankType.replace("_", " ")} tank level is critically low (${reading.level.toFixed(0)}%). Refill immediately.`,
                value: reading.level,
                threshold: THRESHOLDS.water_level.critical,
                resolved: false,
                timestamp: now,
            });
        } else if (reading.level <= THRESHOLDS.water_level.warning) {
            alerts.push({
                user_id: userId,
                tank_type: tankType,
                alert_type: "level_low",
                message: `${tankType.replace("_", " ")} tank level is getting low (${reading.level.toFixed(0)}%).`,
                value: reading.level,
                threshold: THRESHOLDS.water_level.warning,
                resolved: false,
                timestamp: now,
            });
        }

        // Temperature alerts
        if (reading.temperature > THRESHOLDS.temperature.high) {
            alerts.push({
                user_id: userId,
                tank_type: tankType,
                alert_type: "temp_high",
                message: `${tankType.replace("_", " ")} tank temperature is too high (${reading.temperature.toFixed(1)}°C). Risk of bacterial growth.`,
                value: reading.temperature,
                threshold: THRESHOLDS.temperature.high,
                resolved: false,
                timestamp: now,
            });
        }
    }

    return alerts;
}

serve(async (req) => {
    if (req.method === "OPTIONS") {
        return new Response("ok", { headers: corsHeaders });
    }

    try {
        const supabaseClient = createClient(
            Deno.env.get("SUPABASE_URL") ?? "",
            Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
        );

        // ─── GET: Fetch alerts for a user ────────────────────────────
        if (req.method === "GET") {
            const url = new URL(req.url);
            const userId = url.searchParams.get("userId");
            const unresolvedOnly = url.searchParams.get("unresolvedOnly") !== "false";

            if (!userId) {
                return new Response(
                    JSON.stringify({ error: "userId is required" }),
                    { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
                );
            }

            let query = supabaseClient
                .from("alerts")
                .select("*")
                .eq("user_id", userId)
                .order("timestamp", { ascending: false })
                .limit(50);

            if (unresolvedOnly) {
                query = query.eq("resolved", false);
            }

            const { data: alerts, error } = await query;

            if (error) {
                throw new Error(`Failed to fetch alerts: ${error.message}`);
            }

            return new Response(
                JSON.stringify({ success: true, alerts: alerts || [], count: alerts?.length || 0 }),
                { headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
        }

        // ─── POST: Evaluate sensor readings and create alerts ─────────
        if (req.method === "POST") {
            const payload: AlertCheckPayload = await req.json();

            if (!payload.userId || !payload.readings) {
                return new Response(
                    JSON.stringify({ error: "userId and readings are required" }),
                    { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
                );
            }

            const newAlerts = evaluateAlerts(payload.userId, payload.readings);

            if (newAlerts.length === 0) {
                return new Response(
                    JSON.stringify({ success: true, alertsCreated: 0, alerts: [] }),
                    { headers: { ...corsHeaders, "Content-Type": "application/json" } }
                );
            }

            // Insert new alerts
            const { data: inserted, error: insertError } = await supabaseClient
                .from("alerts")
                .insert(newAlerts)
                .select();

            if (insertError) {
                throw new Error(`Failed to create alerts: ${insertError.message}`);
            }

            return new Response(
                JSON.stringify({
                    success: true,
                    alertsCreated: inserted?.length || 0,
                    alerts: inserted || [],
                }),
                { headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
        }

        // ─── PATCH: Resolve an alert ──────────────────────────────────
        if (req.method === "PATCH") {
            const { alertId, userId } = await req.json();

            if (!alertId || !userId) {
                return new Response(
                    JSON.stringify({ error: "alertId and userId are required" }),
                    { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
                );
            }

            const { data, error } = await supabaseClient
                .from("alerts")
                .update({ resolved: true, resolved_at: new Date().toISOString() })
                .eq("id", alertId)
                .eq("user_id", userId) // safety: users can only resolve their own alerts
                .select()
                .single();

            if (error || !data) {
                return new Response(
                    JSON.stringify({ error: "Alert not found or already resolved" }),
                    { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
                );
            }

            return new Response(
                JSON.stringify({ success: true, alert: data }),
                { headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
        }

        return new Response(
            JSON.stringify({ error: "Method not allowed" }),
            { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );

    } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        console.error("Error in alert-check function:", error);
        return new Response(
            JSON.stringify({ error: "Internal server error", message: error.message }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    }
});
