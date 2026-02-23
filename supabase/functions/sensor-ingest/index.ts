// ============================================
// SAVEHYDROO - Sensor Ingest Edge Function
// Primary data ingestion endpoint
// ============================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

// CORS headers for all responses
const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Sensor reading schema
interface SensorReading {
    tds: number;
    temperature: number;
    level: number;
    flowRate: number;
}

interface IngestPayload {
    userId: string | null;
    readings: {
        ro_reject: SensorReading;
        rainwater: SensorReading;
        blended: SensorReading;
    };
    blendRatio?: {
        ro: number;
        rain: number;
    };
}

// Simple Linear Regression for ML prediction
class LinearRegression {
    private slope = 0;
    private intercept = 0;

    fit(x: number[], y: number[]): boolean {
        if (x.length !== y.length || x.length < 2) return false;

        const n = x.length;
        let sumX = 0, sumY = 0, sumXY = 0, sumXX = 0;

        for (let i = 0; i < n; i++) {
            sumX += x[i];
            sumY += y[i];
            sumXY += x[i] * y[i];
            sumXX += x[i] * x[i];
        }

        const denom = n * sumXX - sumX * sumX;
        if (denom === 0) {
            this.slope = 0;
            this.intercept = sumY / n;
        } else {
            this.slope = (n * sumXY - sumX * sumY) / denom;
            this.intercept = (sumY - this.slope * sumX) / n;
        }

        return true;
    }

    predict(x: number): number {
        return this.slope * x + this.intercept;
    }

    getSlope(): number {
        return this.slope;
    }
}

// Validate sensor reading
function validateReading(reading: any, tankType: string): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (typeof reading.tds !== "number" || reading.tds < 0 || reading.tds > 5000) {
        errors.push(`${tankType}: TDS must be between 0-5000 ppm`);
    }

    if (typeof reading.temperature !== "number" || reading.temperature < -10 || reading.temperature > 60) {
        errors.push(`${tankType}: Temperature must be between -10 and 60°C`);
    }

    if (typeof reading.level !== "number" || reading.level < 0 || reading.level > 100) {
        errors.push(`${tankType}: Water level must be between 0-100%`);
    }

    if (typeof reading.flowRate !== "number" || reading.flowRate < 0 || reading.flowRate > 100) {
        errors.push(`${tankType}: Flow rate must be between 0-100 L/min`);
    }

    return { valid: errors.length === 0, errors };
}

// ML prediction logic
async function calculatePrediction(
    supabase: any,
    userId: string | null,
    readings: IngestPayload["readings"]
) {
    const targetTDS = { min: 150, max: 300 };
    const optimalTDS = 225;

    // Get historical readings for trend analysis (skip if userId is null)
    let history = null;
    if (userId) {
        const result = await supabase
            .from("sensor_readings")
            .select("tds, temperature, timestamp")
            .eq("user_id", userId)
            .eq("tank_type", "blended")
            .order("timestamp", { ascending: true })
            .limit(50);
        history = result.data;
    }

    // Calculate TDS trend
    let tdsTrend = "stable";
    let tdsChangeRate = 0;
    let futureTDS = readings.blended.tds;
    let confidence = 0.5;

    if (history && history.length >= 5) {
        const lr = new LinearRegression();
        const startTime = new Date(history[0].timestamp).getTime();
        const x = history.map((h: any) => (new Date(h.timestamp).getTime() - startTime) / 1000);
        const y = history.map((h: any) => parseFloat(h.tds));

        if (lr.fit(x, y)) {
            tdsChangeRate = lr.getSlope();
            const futureTime = x[x.length - 1] + 60; // 60 seconds ahead
            futureTDS = lr.predict(futureTime);

            if (tdsChangeRate > 0.5) tdsTrend = "increasing";
            else if (tdsChangeRate < -0.5) tdsTrend = "decreasing";

            confidence = Math.min(0.95, 0.5 + history.length * 0.01);
        }
    }

    // Calculate optimal blend ratio
    const roTDS = readings.ro_reject.tds;
    const rainTDS = readings.rainwater.tds;
    const currentTDS = readings.blended.tds;

    const denom = roTDS - rainTDS;
    let optimalRoRatio = denom !== 0 ? (optimalTDS - rainTDS) / denom : 0.3;
    optimalRoRatio = Math.max(0, Math.min(1, optimalRoRatio));

    // Calculate time to target TDS
    let timeToTarget = null;
    if (tdsChangeRate !== 0) {
        const tdsDiff = optimalTDS - currentTDS;
        const movingToward = (tdsDiff > 0 && tdsChangeRate > 0) || (tdsDiff < 0 && tdsChangeRate < 0);
        if (movingToward) {
            timeToTarget = Math.round(Math.abs(tdsDiff / tdsChangeRate));
        }
    }

    // Remaining water = current level (direct carry-forward, NO fill time calculation)
    const remainingWater = readings.blended.level;

    return {
        predictedTDS: Math.round(futureTDS * 10) / 10,
        remainingWater,
        tdsTrend,
        tdsChangeRate: Math.round(tdsChangeRate * 100) / 100,
        timeToTarget,
        confidence,
        optimalBlendRatio: {
            ro: Math.round(optimalRoRatio * 100) / 100,
            rain: Math.round((1 - optimalRoRatio) * 100) / 100,
        },
        isOptimal: currentTDS >= targetTDS.min && currentTDS <= targetTDS.max,
    };
}

serve(async (req) => {
    // Handle CORS preflight
    if (req.method === "OPTIONS") {
        return new Response("ok", { headers: corsHeaders });
    }

    try {
        // Initialize Supabase client
        const supabaseClient = createClient(
            Deno.env.get("SUPABASE_URL") ?? "",
            Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
        );

        // Get latest readings endpoint
        if (req.url.endsWith("/latest") && req.method === "GET") {
            const url = new URL(req.url);
            const userId = url.searchParams.get("userId");

            if (!userId) {
                return new Response(
                    JSON.stringify({ error: "userId is required" }),
                    { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
                );
            }

            const readings: any = {};
            for (const type of ["ro_reject", "rainwater", "blended"]) {
                const { data } = await supabaseClient
                    .from("sensor_readings")
                    .select("*")
                    .eq("user_id", userId)
                    .eq("tank_type", type)
                    .order("timestamp", { ascending: false })
                    .limit(1)
                    .single();

                if (data) {
                    readings[type] = {
                        tds: parseFloat(data.tds),
                        temperature: parseFloat(data.temperature),
                        level: parseFloat(data.water_level),
                        flowRate: parseFloat(data.flow_rate),
                        remainingWater: parseFloat(data.remaining_water || data.water_level),
                        timestamp: data.timestamp,
                    };
                }
            }

            return new Response(
                JSON.stringify({ success: true, readings }),
                { headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
        }

        // Ingest sensor data
        if (req.method !== "POST") {
            return new Response(
                JSON.stringify({ error: "Method not allowed" }),
                { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
        }

        const payload: IngestPayload = await req.json();

        // Validate payload (allow null userId for testing)
        if (payload.userId === undefined || !payload.readings) {
            return new Response(
                JSON.stringify({ error: "userId and readings are required" }),
                { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
        }

        // Validate each tank reading
        const validationErrors: string[] = [];
        for (const [tankType, reading] of Object.entries(payload.readings)) {
            const { valid, errors } = validateReading(reading, tankType);
            if (!valid) {
                validationErrors.push(...errors);
            }
        }

        if (validationErrors.length > 0) {
            return new Response(
                JSON.stringify({ error: "Validation failed", details: validationErrors }),
                { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
        }

        // Calculate ML prediction
        const prediction = await calculatePrediction(supabaseClient, payload.userId, payload.readings);

        // Insert sensor readings
        const insertData = [];
        for (const [tankType, reading] of Object.entries(payload.readings)) {
            insertData.push({
                user_id: payload.userId,
                tank_type: tankType,
                tds: reading.tds,
                temperature: reading.temperature,
                water_level: reading.level,
                flow_rate: reading.flowRate,
                remaining_water: tankType === "blended" ? prediction.remainingWater : reading.level,
            });
        }

        const { data: sensorData, error: sensorError } = await supabaseClient
            .from("sensor_readings")
            .insert(insertData)
            .select();

        if (sensorError) {
            throw new Error(`Failed to insert sensor data: ${sensorError.message}`);
        }

        // Insert prediction (only for blended tank)
        const { error: predictionError } = await supabaseClient
            .from("predictions")
            .insert({
                user_id: payload.userId,
                predicted_tds: prediction.predictedTDS,
                time_to_target: prediction.timeToTarget,
                confidence: prediction.confidence,
                blend_ratio_ro: prediction.optimalBlendRatio.ro,
                blend_ratio_rain: prediction.optimalBlendRatio.rain,
            });

        if (predictionError) {
            console.error("Failed to insert prediction:", predictionError);
            // Don't fail the entire request if prediction insert fails
        }

        return new Response(
            JSON.stringify({
                success: true,
                message: "Sensor data ingested successfully",
                sensorIds: sensorData?.map((d: any) => d.id),
                prediction,
            }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    } catch (error) {
        console.error("Error in sensor-ingest function:", error);
        return new Response(
            JSON.stringify({ error: "Internal server error", message: error.message }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    }
});
