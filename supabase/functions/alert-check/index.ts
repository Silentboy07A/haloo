import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ─────────────────────────────────────────────
//  ALERT THRESHOLDS
// ─────────────────────────────────────────────
const THRESHOLDS = {
    tds: {
        high: 500,   // ppm — above this = too dirty for car washing
        critical: 1000,  // ppm — above this = unsuitable for any non-potable use
    },
    temperature: {
        high: 35,        // °C — above this = abnormal
        low: 10,        // °C — below this = abnormal
    },
    level: {
        low: 20,    // cm — below this = tank low
        critical: 10,    // cm — below this = tank nearly empty
    },
    pressure: {
        high: 5.0,   // bar — above this = pump stress
        critical: 7.0,   // bar — above this = pipe burst risk
        low: 0.5,   // bar — below this = pump failure
    },
    turbidity: {
        high: 200,   // NTU — above this = too dirty for car washing
        critical: 500,   // NTU — above this = unsuitable
    },
    leak: {
        threshold: 1.5,  // L/min difference between flow_in and flow_out
    },
};

// ─────────────────────────────────────────────
//  ALERT BUILDER
// ─────────────────────────────────────────────
function checkTank(tank: string, r: any): any[] {
    const alerts: any[] = [];
    if (!r) return alerts;

    // TDS alerts
    if (r.tds >= THRESHOLDS.tds.critical) {
        alerts.push({
            tank, type: "tds_critical", severity: "critical",
            message: `🚨 ${tank}: TDS ${r.tds} ppm — water unsuitable for any use`,
            value: r.tds, threshold: THRESHOLDS.tds.critical,
        });
    } else if (r.tds >= THRESHOLDS.tds.high) {
        alerts.push({
            tank, type: "tds_high", severity: "warning",
            message: `⚠️ ${tank}: TDS ${r.tds} ppm — exceeds car washing limit`,
            value: r.tds, threshold: THRESHOLDS.tds.high,
        });
    }

    // Temperature alerts
    if (r.temperature >= THRESHOLDS.temperature.high) {
        alerts.push({
            tank, type: "temp_high", severity: "warning",
            message: `⚠️ ${tank}: Temperature ${r.temperature}°C — abnormally high`,
            value: r.temperature, threshold: THRESHOLDS.temperature.high,
        });
    } else if (r.temperature <= THRESHOLDS.temperature.low) {
        alerts.push({
            tank, type: "temp_low", severity: "warning",
            message: `⚠️ ${tank}: Temperature ${r.temperature}°C — abnormally low`,
            value: r.temperature, threshold: THRESHOLDS.temperature.low,
        });
    }

    // Level alerts
    if (r.level !== null && r.level !== undefined) {
        if (r.level <= THRESHOLDS.level.critical) {
            alerts.push({
                tank, type: "level_critical", severity: "critical",
                message: `🚨 ${tank}: Water level ${r.level} cm — tank nearly empty!`,
                value: r.level, threshold: THRESHOLDS.level.critical,
            });
        } else if (r.level <= THRESHOLDS.level.low) {
            alerts.push({
                tank, type: "level_low", severity: "warning",
                message: `⚠️ ${tank}: Water level ${r.level} cm — tank running low`,
                value: r.level, threshold: THRESHOLDS.level.low,
            });
        }
    }

    // Pressure alerts
    if (r.pressure !== null && r.pressure !== undefined) {
        if (r.pressure >= THRESHOLDS.pressure.critical) {
            alerts.push({
                tank, type: "pressure_critical", severity: "critical",
                message: `🚨 ${tank}: Pressure ${r.pressure} bar — pipe burst risk!`,
                value: r.pressure, threshold: THRESHOLDS.pressure.critical,
            });
        } else if (r.pressure >= THRESHOLDS.pressure.high) {
            alerts.push({
                tank, type: "pressure_high", severity: "warning",
                message: `⚠️ ${tank}: Pressure ${r.pressure} bar — pump under stress`,
                value: r.pressure, threshold: THRESHOLDS.pressure.high,
            });
        } else if (r.pressure <= THRESHOLDS.pressure.low) {
            alerts.push({
                tank, type: "pressure_low", severity: "critical",
                message: `🚨 ${tank}: Pressure ${r.pressure} bar — possible pump failure`,
                value: r.pressure, threshold: THRESHOLDS.pressure.low,
            });
        }
    }

    // Turbidity alerts
    if (r.turbidity !== null && r.turbidity !== undefined) {
        if (r.turbidity >= THRESHOLDS.turbidity.critical) {
            alerts.push({
                tank, type: "turbidity_critical", severity: "critical",
                message: `🚨 ${tank}: Turbidity ${r.turbidity} NTU — water unsuitable`,
                value: r.turbidity, threshold: THRESHOLDS.turbidity.critical,
            });
        } else if (r.turbidity >= THRESHOLDS.turbidity.high) {
            alerts.push({
                tank, type: "turbidity_high", severity: "warning",
                message: `⚠️ ${tank}: Turbidity ${r.turbidity} NTU — water too dirty for car washing`,
                value: r.turbidity, threshold: THRESHOLDS.turbidity.high,
            });
        }
    }

    // Leak detection
    if (r.flow_in !== null && r.flow_in !== undefined &&
        r.flow_out !== null && r.flow_out !== undefined) {
        const diff = r.flow_in - r.flow_out;
        if (diff > THRESHOLDS.leak.threshold) {
            alerts.push({
                tank, type: "leak_detected", severity: "critical",
                message: `🚨 ${tank}: Leak detected! Flow in ${r.flow_in} L/min vs out ${r.flow_out} L/min (diff: ${diff.toFixed(2)} L/min)`,
                value: diff, threshold: THRESHOLDS.leak.threshold,
            });
        }
    }

    return alerts;
}

// ─────────────────────────────────────────────
//  SERVE
// ─────────────────────────────────────────────
serve(async (req) => {
    if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
    try {
        const supabase = createClient(
            Deno.env.get("SUPABASE_URL") ?? "",
            Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
        );

        const { userId, readings } = await req.json();

        if (!readings) return new Response(
            JSON.stringify({ error: "readings required" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );

        // Check all tanks
        const allAlerts = [
            ...checkTank("ro_reject", readings?.ro_reject),
            ...checkTank("rainwater", readings?.rainwater),
            ...checkTank("blended", readings?.blended),
        ];

        // Save alerts to DB if userId present and alerts exist
        if (userId && allAlerts.length > 0) {
            for (const alert of allAlerts) {
                await supabase.from("alerts").insert({
                    user_id: userId,
                    tank_type: alert.tank,
                    type: alert.type,
                    severity: alert.severity,
                    message: alert.message,
                    value: alert.value,
                    threshold: alert.threshold,
                    created_at: new Date().toISOString(),
                });
            }
        }

        const criticalAlerts = allAlerts.filter(a => a.severity === "critical");
        const warningAlerts = allAlerts.filter(a => a.severity === "warning");

        return new Response(JSON.stringify({
            success: true,
            alerts: allAlerts.length > 0 ? allAlerts : null,
            summary: {
                total: allAlerts.length,
                critical: criticalAlerts.length,
                warnings: warningAlerts.length,
                hasLeak: allAlerts.some(a => a.type === "leak_detected"),
            },
        }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

    } catch (error) {
        return new Response(
            JSON.stringify({ error: "Internal server error", message: (error as Error).message }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    }
});
