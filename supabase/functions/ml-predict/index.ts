// ============================================
// SAVEHYDROO - ML Prediction Edge Function
// Standalone TDS prediction engine
// ============================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Linear Regression Model
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

        const denominator = n * sumXX - sumX * sumX;
        if (denominator === 0) {
            this.slope = 0;
            this.intercept = sumY / n;
        } else {
            this.slope = (n * sumXY - sumX * sumY) / denominator;
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

// Exponential Moving Average
class EMA {
    private alpha: number;
    private value: number | null = null;

    constructor(alpha = 0.3) {
        this.alpha = alpha;
    }

    update(newValue: number): number {
        if (this.value === null) {
            this.value = newValue;
        } else {
            this.value = this.alpha * newValue + (1 - this.alpha) * this.value;
        }
        return this.value;
    }

    get(): number | null {
        return this.value;
    }
}

interface PredictionRequest {
    userId: string;
    currentReadings: {
        tds: number;
        temperature: number;
        level: number;
        flowRate: number;
    };
    stepsAhead?: number; // Prediction horizon in seconds
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

        if (req.method !== "POST") {
            return new Response(
                JSON.stringify({ error: "Method not allowed" }),
                { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
        }

        const payload: PredictionRequest = await req.json();

        if (!payload.userId || !payload.currentReadings) {
            return new Response(
                JSON.stringify({ error: "userId and currentReadings are required" }),
                { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
        }

        const stepsAhead = payload.stepsAhead || 60; // Default 60 seconds

        // Fetch historical TDS data (sliding window)
        const { data: history } = await supabaseClient
            .from("sensor_readings")
            .select("tds, temperature, flow_rate, timestamp")
            .eq("user_id", payload.userId)
            .eq("tank_type", "blended")
            .order("timestamp", { ascending: true })
            .limit(50);

        // Default prediction
        let predictedTDS = payload.currentReadings.tds;
        let trend = "stable";
        let confidence = 0.3;
        let tdsChangeRate = 0;

        if (history && history.length >= 5) {
            const lr = new LinearRegression();
            const startTime = new Date(history[0].timestamp).getTime();

            const x = history.map((h: any) => (new Date(h.timestamp).getTime() - startTime) / 1000);
            const y = history.map((h: any) => parseFloat(h.tds));

            if (lr.fit(x, y)) {
                tdsChangeRate = lr.getSlope();
                const lastTime = x[x.length - 1];
                const futureTime = lastTime + stepsAhead;
                predictedTDS = lr.predict(futureTime);

                // Determine trend
                if (tdsChangeRate > 0.5) trend = "increasing";
                else if (tdsChangeRate < -0.5) trend = "decreasing";

                // Calculate confidence based on data points
                confidence = Math.min(0.95, 0.5 + history.length * 0.01);

                // Apply EMA smoothing
                const ema = new EMA(0.2);
                for (const tdsValue of y) {
                    ema.update(tdsValue);
                }
                const smoothedCurrent = ema.get();
                if (smoothedCurrent !== null) {
                    // Blend predicted with smoothed
                    predictedTDS = 0.7 * predictedTDS + 0.3 * smoothedCurrent;
                }
            }
        }

        // Remaining water = current level (NO fill time calculation)
        const remainingWater = payload.currentReadings.level;

        // Calculate optimal blend ratio for target TDS
        const targetTDS = 225; // Optimal TDS
        const optimalBlend = calculateOptimalBlend(targetTDS, history);

        const prediction = {
            timestamp: new Date().toISOString(),
            predictedTDS: Math.round(predictedTDS * 10) / 10,
            remainingWater,
            trend,
            tdsChangeRate: Math.round(tdsChangeRate * 100) / 100,
            confidence: Math.round(confidence * 100) / 100,
            optimalBlendRatio: optimalBlend,
            currentState: {
                tds: payload.currentReadings.tds,
                temperature: payload.currentReadings.temperature,
                level: payload.currentReadings.level,
                flowRate: payload.currentReadings.flowRate,
            },
            predictionHorizon: stepsAhead,
        };

        return new Response(
            JSON.stringify({ success: true, prediction }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    } catch (error) {
        console.error("Error in ml-predict function:", error);
        return new Response(
            JSON.stringify({ error: "Internal server error", message: error.message }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    }
});

function calculateOptimalBlend(targetTDS: number, history: any[] | null) {
    // Default blend if no history
    if (!history || history.length < 2) {
        return { ro: 0.3, rain: 0.7 };
    }

    // Estimate average RO and Rain TDS from historical patterns
    // This is a simplified heuristic - in production, you'd get actual tank readings
    const avgTDS = history.reduce((sum: number, h: any) => sum + parseFloat(h.tds), 0) / history.length;

    // Assume typical values for blend calculation
    const roTDS = 1200;
    const rainTDS = 50;

    const denom = roTDS - rainTDS;
    let roRatio = denom !== 0 ? (targetTDS - rainTDS) / denom : 0.3;
    roRatio = Math.max(0, Math.min(1, roRatio));

    return {
        ro: Math.round(roRatio * 100) / 100,
        rain: Math.round((1 - roRatio) * 100) / 100,
    };
}
