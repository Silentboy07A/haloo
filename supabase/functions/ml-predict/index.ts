import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ─────────────────────────────────────────────
//  AUTO USE-CASE ROUTER
//  No manual selection — picks best use from TDS
// ─────────────────────────────────────────────
function detectUseCase(tds: number) {
    if (tds <= 500) return { name: "car_washing", targetTDS: 400, tolerance: 50, maxTDS: 500 };
    if (tds <= 1000) return { name: "toilet", targetTDS: 700, tolerance: 100, maxTDS: 1000 };
    if (tds <= 1500) return { name: "floor_cleaning", targetTDS: 1000, tolerance: 150, maxTDS: 1500 };
    if (tds <= 2000) return { name: "irrigation", targetTDS: 1500, tolerance: 200, maxTDS: 2000 };
    if (tds <= 3000) return { name: "construction", targetTDS: 2000, tolerance: 300, maxTDS: 3000 };
    return { name: "unsuitable", targetTDS: 3000, tolerance: 0, maxTDS: 3000 };
}

// ─────────────────────────────────────────────
//  SUITABILITY SCORES — all 5 uses at once
// ─────────────────────────────────────────────
function calcSuitability(tds: number) {
    return {
        car_washing: tds <= 500 ? Math.round((1 - tds / 500) * 100) : 0,
        toilet: tds <= 1000 ? Math.round((1 - tds / 1000) * 100) : 0,
        floor_cleaning: tds <= 1500 ? Math.round((1 - tds / 1500) * 100) : 0,
        irrigation: tds <= 2000 ? Math.round((1 - tds / 2000) * 100) : 0,
        construction: tds <= 3000 ? Math.round((1 - tds / 3000) * 100) : 0,
    };
}

// ─────────────────────────────────────────────
//  ML MODELS
// ─────────────────────────────────────────────
const MIN_HISTORY = 5;
const HISTORY_LIMIT = 100;
const TREND_THRESH = 0.5;
const ANOMALY_Z = 2.5;

class LinearRegression {
    slope = 0; intercept = 0; r2 = 0;
    fit(x: number[], y: number[]): boolean {
        const n = x.length;
        if (n < 2) return false;
        const mx = x.reduce((a, b) => a + b) / n;
        const my = y.reduce((a, b) => a + b) / n;
        let ssXY = 0, ssXX = 0, ssYY = 0;
        for (let i = 0; i < n; i++) {
            ssXY += (x[i] - mx) * (y[i] - my);
            ssXX += (x[i] - mx) ** 2;
            ssYY += (y[i] - my) ** 2;
        }
        if (ssXX === 0) { this.slope = 0; this.intercept = my; this.r2 = 0; return true; }
        this.slope = ssXY / ssXX;
        this.intercept = my - this.slope * mx;
        const ssRes = y.reduce((s, yi, i) => s + (yi - this.predict(x[i])) ** 2, 0);
        this.r2 = ssYY === 0 ? 1 : Math.max(0, 1 - ssRes / ssYY);
        return true;
    }
    predict(x: number) { return this.slope * x + this.intercept; }
}

class PolynomialRegression {
    coeffs = [0, 0, 0]; r2 = 0;
    fit(x: number[], y: number[]): boolean {
        const n = x.length;
        if (n < 3) return false;
        let s0 = n, s1 = 0, s2 = 0, s3 = 0, s4 = 0, r0 = 0, r1 = 0, r2v = 0;
        for (let i = 0; i < n; i++) {
            const xi = x[i], yi = y[i];
            s1 += xi; s2 += xi ** 2; s3 += xi ** 3; s4 += xi ** 4;
            r0 += yi; r1 += xi * yi; r2v += xi ** 2 * yi;
        }
        const A = [[s0, s1, s2, r0], [s1, s2, s3, r1], [s2, s3, s4, r2v]];
        for (let col = 0; col < 3; col++) {
            let mr = col;
            for (let row = col + 1; row < 3; row++) if (Math.abs(A[row][col]) > Math.abs(A[mr][col])) mr = row;
            [A[col], A[mr]] = [A[mr], A[col]];
            if (Math.abs(A[col][col]) < 1e-10) return false;
            for (let row = col + 1; row < 3; row++) {
                const f = A[row][col] / A[col][col];
                for (let k = col; k <= 3; k++) A[row][k] -= f * A[col][k];
            }
        }
        const c = [0, 0, 0];
        for (let i = 2; i >= 0; i--) {
            c[i] = A[i][3];
            for (let j = i + 1; j < 3; j++) c[i] -= A[i][j] * c[j];
            c[i] /= A[i][i];
        }
        this.coeffs = c;
        const my = y.reduce((a, b) => a + b) / n;
        const st = y.reduce((s, yi) => s + (yi - my) ** 2, 0);
        const sr = y.reduce((s, yi, i) => s + (yi - this.predict(x[i])) ** 2, 0);
        this.r2 = st === 0 ? 1 : Math.max(0, 1 - sr / st);
        return true;
    }
    predict(x: number) { return this.coeffs[0] + this.coeffs[1] * x + this.coeffs[2] * x ** 2; }
}

class KalmanFilter {
    private x = 0; private P = 1; private Q = 0.1; private R = 2.0; private init = false;
    update(z: number): number {
        if (!this.init) { this.x = z; this.init = true; return this.x; }
        const xp = this.x, Pp = this.P + this.Q, K = Pp / (Pp + this.R);
        this.x = xp + K * (z - xp); this.P = (1 - K) * Pp;
        return this.x;
    }
    getEstimate() { return this.x; }
}

function wma(values: number[], window = 10): number {
    const s = values.slice(-window), n = s.length;
    let ws = 0, vs = 0;
    for (let i = 0; i < n; i++) { ws += i + 1; vs += (i + 1) * s[i]; }
    return vs / ws;
}

function arima(values: number[], steps: number): number {
    if (values.length < 3) return values[values.length - 1];
    const d = values.slice(1).map((v, i) => v - values[i]), n = d.length;
    let num = 0, den = 0;
    for (let i = 1; i < n; i++) { num += d[i] * d[i - 1]; den += d[i - 1] ** 2; }
    const phi = den === 0 ? 0 : Math.max(-0.95, Math.min(0.95, num / den));
    let ld = d[n - 1], lv = values[values.length - 1];
    for (let s = 0; s < steps; s++) { ld = phi * ld; lv += ld; }
    return lv;
}

function ensemble(preds: { value: number; weight: number }[]): number {
    const total = preds.reduce((s, p) => s + p.weight, 0);
    return total === 0 ? preds[0].value : preds.reduce((s, p) => s + p.value * (p.weight / total), 0);
}

function detectAnomaly(values: number[], current: number, maxTDS: number) {
    const exceedsMax = current > maxTDS;
    if (values.length < MIN_HISTORY) return { isAnomaly: exceedsMax, zScore: 0, severity: exceedsMax ? "severe" : "none" };
    const m = values.reduce((a, b) => a + b) / values.length;
    const std = Math.sqrt(values.reduce((s, v) => s + (v - m) ** 2, 0) / values.length);
    if (std === 0) return { isAnomaly: exceedsMax, zScore: 0, severity: exceedsMax ? "severe" : "none" };
    const z = Math.abs((current - m) / std);
    const stat = z > ANOMALY_Z;
    return {
        isAnomaly: exceedsMax || stat,
        zScore: Math.round(z * 100) / 100,
        severity: exceedsMax ? "severe" : z > 4 ? "severe" : stat ? "mild" : "none",
    };
}

function calcConfidence(n: number, r2: number, values: number[]): number {
    const vol = Math.min(0.4, (n / HISTORY_LIMIT) * 0.4);
    const fit = r2 * 0.4;
    const m = values.reduce((a, b) => a + b) / values.length;
    const std = Math.sqrt(values.reduce((s, v) => s + (v - m) ** 2, 0) / values.length);
    return Math.round(Math.min(0.99, vol + fit + Math.max(0, 0.2 * (1 - std / 500))) * 100) / 100;
}

function calcBlend(targetTDS: number, roTDS: number, rainTDS: number, tolerance: number) {
    const d = roTDS - rainTDS;
    if (Math.abs(d) < 1) return { ro: 0.5, rain: 0.5, feasible: Math.abs(roTDS - targetTDS) < tolerance };
    const r = Math.max(0, Math.min(1, (targetTDS - rainTDS) / d));
    return {
        ro: Math.round(r * 100) / 100,
        rain: Math.round((1 - r) * 100) / 100,
        feasible: Math.abs(r * roTDS + (1 - r) * rainTDS - targetTDS) <= tolerance,
    };
}

function timeToTarget(current: number, target: number, rate: number): number | null {
    if (Math.abs(rate) < 0.01) return null;
    const d = target - current;
    if ((d > 0 && rate < 0) || (d < 0 && rate > 0)) return null;
    return Math.round(Math.abs(d / rate));
}

// ─────────────────────────────────────────────
//  MAIN
// ─────────────────────────────────────────────
serve(async (req) => {
    if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
    try {
        const supabase = createClient(
            Deno.env.get("SUPABASE_URL") ?? "",
            Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
        );

        const { userId, readings } = await req.json();

        const roTDS = readings?.ro_reject?.tds ?? 850;
        const rainTDS = readings?.rainwater?.tds ?? 120;
        const currentTDS = readings?.blended?.tds ?? 0;
        const currentLvl = readings?.blended?.level ?? 0;

        // Auto-detect use case from current blended TDS
        const profile = detectUseCase(currentTDS);
        const { name: useCase, targetTDS, tolerance, maxTDS } = profile;

        // Fetch blended TDS history
        const { data: history } = await supabase
            .from("sensor_readings")
            .select("tds, timestamp")
            .eq("tank_type", "blended")
            .order("timestamp", { ascending: true })
            .limit(HISTORY_LIMIT);

        let pred = currentTDS, ltPred = currentTDS;
        let trend = "stable", conf = 0.3, rate = 0, r2l = 0, r2p = 0;

        if (history && history.length >= MIN_HISTORY) {
            const tv = history.map((h: any) => parseFloat(h.tds));
            const st = new Date(history[0].timestamp).getTime();
            const xv = history.map((h: any) => (new Date(h.timestamp).getTime() - st) / 1000);
            const lx = xv[xv.length - 1];

            const lr = new LinearRegression(); lr.fit(xv, tv); r2l = lr.r2;
            const poly = new PolynomialRegression(); poly.fit(xv, tv); r2p = poly.r2;
            const kalman = new KalmanFilter(); for (const v of tv) kalman.update(v);

            // Short-term: 60s ahead
            pred = Math.max(0, ensemble([
                { value: lr.predict(lx + 60), weight: Math.max(0.1, lr.r2) },
                { value: poly.predict(lx + 60), weight: Math.max(0.1, poly.r2) },
                { value: kalman.getEstimate(), weight: 0.6 },
                { value: wma(tv, 10), weight: 0.4 },
                { value: arima(tv, 12), weight: 0.5 },
            ]));

            // Long-term: 1hr ahead
            ltPred = Math.max(0, ensemble([
                { value: lr.predict(lx + 3600), weight: Math.max(0.1, lr.r2) },
                { value: poly.predict(lx + 3600), weight: Math.max(0.1, poly.r2) },
                { value: arima(tv, 720), weight: 0.7 },
                { value: kalman.getEstimate(), weight: 0.3 },
            ]));

            rate = lr.slope;
            if (rate > TREND_THRESH) trend = "increasing";
            else if (rate < -TREND_THRESH) trend = "decreasing";
            conf = calcConfidence(history.length, Math.max(r2l, r2p), tv);
        }

        const tv2 = history?.map((h: any) => parseFloat(h.tds)) ?? [];
        const anom = detectAnomaly(tv2, currentTDS, maxTDS);
        const blendR = calcBlend(targetTDS, roTDS, rainTDS, tolerance);
        const ttt = timeToTarget(currentTDS, targetTDS, rate);
        const isOpt = Math.abs(currentTDS - targetTDS) <= tolerance && currentTDS <= maxTDS;
        const suitability = calcSuitability(currentTDS);

        // Save to predictions table
        await supabase.from("predictions").insert({
            user_id: userId ?? null,
            current_tds: currentTDS,
            predicted_tds: Math.round(pred * 10) / 10,
            long_term_tds: Math.round(ltPred * 10) / 10,
            tds_trend: trend,
            tds_change_rate: Math.round(rate * 1000) / 1000,
            time_to_target: ttt,
            confidence: conf,
            target_tds: targetTDS,
            blend_ro: blendR.ro,
            blend_rain: blendR.rain,
            blend_feasible: blendR.feasible,
            is_optimal: isOpt,
            anomaly_detected: anom.isAnomaly,
            anomaly_zscore: anom.zScore,
            anomaly_severity: anom.severity,
            r2_linear: Math.round(r2l * 1000) / 1000,
            r2_polynomial: Math.round(r2p * 1000) / 1000,
            datapoints_used: history?.length ?? 0,
            timestamp: new Date().toISOString(),
        });

        return new Response(JSON.stringify({
            success: true,
            prediction: {
                currentTDS,
                predictedTDS: Math.round(pred * 10) / 10,
                longTermPredicted: Math.round(ltPred * 10) / 10,
                remainingWater: currentLvl,
                tdsTrend: trend,
                tdsChangeRate: Math.round(rate * 1000) / 1000,
                timeToTarget: ttt,
                confidence: conf,
                useCase,
                targetTDS,
                maxTDS,
                isOptimal: isOpt,
                optimalBlendRatio: { ro: blendR.ro, rain: blendR.rain },
                blendFeasible: blendR.feasible,
                suitability,
                anomaly: {
                    detected: anom.isAnomaly,
                    zScore: anom.zScore,
                    severity: anom.severity,
                    message: useCase === "unsuitable"
                        ? `🚫 TDS ${currentTDS} ppm — unsuitable for any non-potable use`
                        : anom.isAnomaly
                            ? `⚠️ TDS ${currentTDS} ppm exceeds ${useCase} limit (${maxTDS} ppm)`
                            : `✅ Water suitable for ${useCase} (TDS ${currentTDS} ppm)`,
                },
                modelHealth: {
                    ensemble: "LinearRegression + Polynomial + Kalman + WMA + ARIMA",
                    r2Linear: Math.round(r2l * 1000) / 1000,
                    r2Polynomial: Math.round(r2p * 1000) / 1000,
                    datapointsUsed: history?.length ?? 0,
                    modelReady: (history?.length ?? 0) >= MIN_HISTORY,
                },
            },
        }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

    } catch (error) {
        return new Response(
            JSON.stringify({ error: "Internal server error", message: (error as Error).message }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    }
});
