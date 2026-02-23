// ============================================
// SAVEHYDROO - Predictions API (Random Rain Forest Edition)
// Vercel Serverless Function
// ============================================

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    process.env.SUPABASE_URL || '',
    process.env.SUPABASE_SERVICE_KEY || ''
);

/**
 * Storm Guard - Anomaly Detection
 */
class StormGuard {
    static detect(data, windowSize = 5, threshold = 2.5) {
        if (data.length < windowSize) return data.map(() => false);
        const anomalies = [];
        for (let i = 0; i < data.length; i++) {
            if (i < windowSize) { anomalies.push(false); continue; }
            const window = data.slice(i - windowSize, i);
            const mean = window.reduce((a, b) => a + b, 0) / windowSize;
            const variance = window.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / windowSize;
            const stdDev = Math.sqrt(variance);
            anomalies.push(stdDev > 0 && Math.abs(data[i] - mean) > threshold * stdDev);
        }
        return anomalies;
    }
}

/**
 * Raindrop Tree (Decision Tree Regressor)
 */
class RaindropTree {
    constructor(maxDepth = 3) {
        this.maxDepth = maxDepth;
        this.tree = null;
    }
    fit(x, y) { this.tree = this._buildTree(x, y, 0); }
    _buildTree(x, y, depth) {
        if (depth >= this.maxDepth || x.length <= 2) return { value: y.reduce((a, b) => a + b, 0) / y.length };
        let bestSplit = null;
        let minMSE = Infinity;
        for (let i = 1; i < x.length - 1; i++) {
            const leftY = y.slice(0, i); const rightY = y.slice(i);
            const leftMean = leftY.reduce((a, b) => a + b, 0) / leftY.length;
            const rightMean = rightY.reduce((a, b) => a + b, 0) / rightY.length;
            const mse = leftY.reduce((a, b) => a + Math.pow(b - leftMean, 2), 0) + rightY.reduce((a, b) => a + Math.pow(b - rightMean, 2), 0);
            if (mse < minMSE) { minMSE = mse; bestSplit = { index: i, threshold: x[i] }; }
        }
        if (!bestSplit) return { value: y.reduce((a, b) => a + b, 0) / y.length };
        return {
            threshold: bestSplit.threshold,
            left: this._buildTree(x.slice(0, bestSplit.index), y.slice(0, bestSplit.index), depth + 1),
            right: this._buildTree(x.slice(bestSplit.index), y.slice(bestSplit.index), depth + 1)
        };
    }
    predict(val) {
        let node = this.tree;
        while (node && node.threshold !== undefined) node = val < node.threshold ? node.left : node.right;
        return node ? node.value : 0;
    }
}

/**
 * Random Rain Forest (Ensemble)
 */
class RandomRainForest {
    constructor(numTrees = 5) {
        this.numTrees = numTrees; this.forest = []; this.isTrained = false;
    }
    fit(x, y) {
        if (x.length < 5) return false;
        this.forest = [];
        for (let i = 0; i < this.numTrees; i++) {
            const tree = new RaindropTree(3);
            const indices = Array.from({ length: x.length }, () => Math.floor(Math.random() * x.length));
            tree.fit(indices.map(idx => x[idx]), indices.map(idx => y[idx]));
            this.forest.push(tree);
        }
        this.isTrained = true; return true;
    }
    predict(val) {
        if (!this.isTrained) return 0;
        const preds = this.forest.map(t => t.predict(val));
        return preds.reduce((a, b) => a + b, 0) / preds.length;
    }
    calculateRMSE(x, y) {
        if (!this.isTrained) return 100;
        const se = x.map((val, i) => Math.pow(this.predict(val) - y[i], 2));
        return Math.sqrt(se.reduce((a, b) => a + b, 0) / se.length);
    }
}

// Simple Linear Regression (For trend)
class LinearRegression {
    constructor() { this.slope = 0; }
    fit(x, y) {
        const n = x.length; let sX = 0, sY = 0, sXY = 0, sXX = 0;
        for (let i = 0; i < n; i++) { sX += x[i]; sY += y[i]; sXY += x[i] * y[i]; sXX += x[i] * x[i]; }
        const denom = n * sXX - sX * sX;
        this.slope = denom === 0 ? 0 : (n * sXY - sX * sY) / denom;
        return true;
    }
}

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') return res.status(200).end();

    try {
        const path = req.url.split('?')[0];
        if (path.endsWith('/calculate')) return await calculatePrediction(req, res);

        switch (req.method) {
            case 'GET': return await getPredictions(req, res);
            case 'POST': return await savePrediction(req, res);
            default: return res.status(405).json({ error: 'Method not allowed' });
        }
    } catch (error) {
        console.error('API Error:', error);
        return res.status(500).json({ error: 'Internal server error', message: error.message });
    }
}

async function getPredictions(req, res) {
    const { userId, limit = 50 } = req.query;
    if (!userId) return res.status(400).json({ error: 'userId is required' });

    const { data, error } = await supabase
        .from('predictions')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(parseInt(limit));

    if (error) return res.status(400).json({ error: error.message });
    return res.status(200).json({ success: true, predictions: data });
}

async function savePrediction(req, res) {
    const { userId, prediction } = req.body;
    if (!userId || !prediction) return res.status(400).json({ error: 'userId and prediction are required' });

    const { error } = await supabase
        .from('predictions')
        .insert({
            user_id: userId,
            predicted_tds: prediction.predictedTDS,
            confidence: prediction.confidence,
            blend_ratio_ro: prediction.blendRatio?.ro,
            blend_ratio_rain: prediction.blendRatio?.rain
        });

    if (error) return res.status(400).json({ error: error.message });
    return res.status(201).json({ success: true, message: 'Prediction saved' });
}

async function calculatePrediction(req, res) {
    const { userId, readings } = req.body;
    if (!userId || !readings) return res.status(400).json({ error: 'userId and readings are required' });

    const targetTDS = { min: 150, max: 300 };
    const optimalTDS = 225;

    const { data: history } = await supabase
        .from('sensor_readings')
        .select('*')
        .eq('user_id', userId)
        .eq('tank_type', 'blended')
        .order('timestamp', { ascending: true })
        .limit(30);

    let tdsTrend = 'learning', futureTDS = readings.blended?.tds || 0, confidence = 0.2, rmse = 0;

    if (history && history.length >= 5) {
        const x = history.map((h, i) => i * 2); // 2 seconds apart
        const y = history.map(h => parseFloat(h.tds));

        const anomalies = StormGuard.detect(y);
        const filteredX = x.filter((_, i) => !anomalies[i]);
        const filteredY = y.filter((_, i) => !anomalies[i]);

        if (filteredX.length >= 5) {
            const forest = new RandomRainForest(5);
            forest.fit(filteredX, filteredY);
            futureTDS = forest.predict(x[x.length - 1] + 60);
            rmse = forest.calculateRMSE(filteredX, filteredY);
            confidence = Math.max(0.1, Math.min(0.95, 1 - (rmse / 150)));

            const lr = new LinearRegression();
            lr.fit(filteredX, filteredY);
            if (lr.slope > 0.3) tdsTrend = 'increasing';
            else if (lr.slope < -0.3) tdsTrend = 'decreasing';
            else tdsTrend = 'stable';
        }
    }

    const roTDS = readings.ro_reject?.tds || 1200;
    const rainTDS = readings.rainwater?.tds || 50;
    const denom = roTDS - rainTDS;
    let optimalRoRatio = denom !== 0 ? (optimalTDS - rainTDS) / denom : 0.3;
    optimalRoRatio = Math.max(0, Math.min(1, optimalRoRatio));

    const prediction = {
        timestamp: new Date().toISOString(),
        model: 'Random Rain Forest v1.0',
        predictedTDS: Math.round(futureTDS * 10) / 10,
        tdsTrend,
        confidence: Math.round(confidence * 100) / 100,
        rmse: Math.round(rmse * 100) / 100,
        optimalBlendRatio: {
            ro: Math.round(optimalRoRatio * 100) / 100,
            rain: Math.round((1 - optimalRoRatio) * 100) / 100
        }
    };

    // Save
    await supabase.from('predictions').insert({
        user_id: userId,
        predicted_tds: prediction.predictedTDS,
        confidence: prediction.confidence,
        blend_ratio_ro: optimalRoRatio,
        blend_ratio_rain: 1 - optimalRoRatio
    });

    return res.status(200).json({ success: true, prediction });
}
