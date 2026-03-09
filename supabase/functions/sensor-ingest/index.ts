import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
    if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

    try {
        const supabase = createClient(
            Deno.env.get("SUPABASE_URL") ?? "",
            Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
        );

        // ── GET /latest — return latest reading per tank for a user ──────────────
        if (req.method === "GET" && req.url.includes("/latest")) {
            const url = new URL(req.url);
            const userId = url.searchParams.get("userId");

            if (!userId) return new Response(
                JSON.stringify({ error: "userId required" }),
                { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );

            const readings: Record<string, any> = {};
            for (const tank of ["ro_reject", "rainwater", "blended"]) {
                // First try user-specific data
                let { data } = await supabase
                    .from("sensor_readings")
                    .select("*")
                    .eq("user_id", userId)
                    .eq("tank_type", tank)
                    .order("timestamp", { ascending: false })
                    .limit(1)
                    .maybeSingle();

                // If no user-specific data, fallback to global seeded data (null user_id)
                if (!data) {
                    const { data: globalData } = await supabase
                        .from("sensor_readings")
                        .select("*")
                        .is("user_id", null)
                        .eq("tank_type", tank)
                        .order("timestamp", { ascending: false })
                        .limit(1)
                        .maybeSingle();
                    data = globalData;
                }

                if (data) {
                    readings[tank] = {
                        tds: parseFloat(data.tds),
                        temperature: parseFloat(data.temperature),
                        level: parseFloat(data.level ?? data.water_level ?? 0),
                        flowRate: parseFloat(data.flow_rate ?? data.flow_in ?? 0),
                        flow_in: parseFloat(data.flow_in ?? 0),
                        flow_out: parseFloat(data.flow_out ?? 0),
                        pressure: data.pressure ? parseFloat(data.pressure) : null,
                        turbidity: data.turbidity ? parseFloat(data.turbidity) : null,
                        leak: data.leak ?? false,
                        timestamp: data.timestamp,
                    };
                }
            }

            return new Response(
                JSON.stringify({ success: true, readings }),
                { headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
        }

        // ── POST — ingest sensor readings ────────────────────────────────────────
        if (req.method !== "POST") return new Response(
            JSON.stringify({ error: "Method not allowed" }),
            { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );

        const { userId, readings } = await req.json();

        if (!readings) return new Response(
            JSON.stringify({ error: "readings required" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );

        const tanks = ["ro_reject", "rainwater", "blended"] as const;
        const sensorIds: number[] = [];

        for (const tank of tanks) {
            const r = readings[tank];
            if (!r) continue;

            const { data, error } = await supabase.from("sensor_readings").insert({
                user_id: userId ?? null,
                tank_type: tank,
                tds: r.tds,
                temperature: r.temperature,
                level: r.level ?? null,
                flow_rate: r.flow_in ?? r.flowRate ?? 0,
                pressure: r.pressure ?? null,
                turbidity: r.turbidity ?? null,
                flow_in: r.flow_in ?? null,
                flow_out: r.flow_out ?? null,
                leak: r.leak ?? false,
                timestamp: new Date().toISOString(),
            }).select("id").single();

            if (!error && data) sensorIds.push(data.id);
        }

        // Fan-out: call ml-predict, alert-check, gamification in parallel
        const baseUrl = Deno.env.get("SUPABASE_URL");
        const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
        const headers = { "Content-Type": "application/json", "Authorization": `Bearer ${serviceKey}` };
        const body = JSON.stringify({ userId, readings });

        const [mlRes, alertRes, gameRes] = await Promise.allSettled([
            fetch(`${baseUrl}/functions/v1/ml-predict`, { method: "POST", headers, body }),
            fetch(`${baseUrl}/functions/v1/alert-check`, { method: "POST", headers, body }),
            fetch(`${baseUrl}/functions/v1/gamification`, { method: "POST", headers, body }),
        ]);

        const prediction = mlRes.status === "fulfilled" && mlRes.value.ok ? await mlRes.value.json() : null;
        const alert = alertRes.status === "fulfilled" && alertRes.value.ok ? await alertRes.value.json() : null;
        const points = gameRes.status === "fulfilled" && gameRes.value.ok ? await gameRes.value.json() : null;

        return new Response(JSON.stringify({
            success: true,
            message: "Sensor data ingested successfully",
            sensorIds,
            prediction: prediction?.prediction ?? null,
            alert: alert?.alerts ?? null,
            points: points?.result ?? null,
        }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

    } catch (error) {
        return new Response(
            JSON.stringify({ error: "Internal server error", message: (error as Error).message }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    }
});
