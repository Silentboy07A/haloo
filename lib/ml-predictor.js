// ============================================
// SAVEHYDROO - ML Prediction Engine (Random Rain Forest Edition)
// Lightweight ensemble prediction for TDS and tank timing
// ============================================

/**
 * Storm Guard - Anomaly Detection
 * Filters out "heavy rain" (noisy sensor spikes)
 */
class StormGuard {
    static detect(data, windowSize = 5, threshold = 2.5) {
        if (data.length < windowSize) return data.map(() => false);

        const anomalies = [];
        for (let i = 0; i < data.length; i++) {
            if (i < windowSize) {
                anomalies.push(false);
                continue;
            }

            const window = data.slice(i - windowSize, i);
            const mean = window.reduce((a, b) => a + b, 0) / windowSize;
            const variance = window.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / windowSize;
            const stdDev = Math.sqrt(variance);

            const isAnomaly = stdDev > 0 && Math.abs(data[i] - mean) > threshold * stdDev;
            anomalies.push(isAnomaly);
        }
        return anomalies;
    }
}

/**
 * Simple Decision Tree Regressor (A single "Raindrop")
 */
class RaindropTree {
    constructor(maxDepth = 3) {
        this.maxDepth = maxDepth;
        this.tree = null;
    }

    fit(x, y) {
        this.tree = this._buildTree(x, y, 0);
    }

    _buildTree(x, y, depth) {
        if (depth >= this.maxDepth || x.length <= 2) {
            return { value: y.reduce((a, b) => a + b, 0) / y.length };
        }

        let bestSplit = null;
        let minMSE = Infinity;

        // Try simple splits based on index (time-ordered)
        for (let i = 1; i < x.length - 1; i++) {
            const leftY = y.slice(0, i);
            const rightY = y.slice(i);

            const leftMean = leftY.reduce((a, b) => a + b, 0) / leftY.length;
            const rightMean = rightY.reduce((a, b) => a + b, 0) / rightY.length;

            const mse = leftY.reduce((a, b) => a + Math.pow(b - leftMean, 2), 0) +
                rightY.reduce((a, b) => a + Math.pow(b - rightMean, 2), 0);

            if (mse < minMSE) {
                minMSE = mse;
                bestSplit = { index: i, threshold: x[i] };
            }
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
        while (node && node.threshold !== undefined) {
            node = val < node.threshold ? node.left : node.right;
        }
        return node ? node.value : 0;
    }

    toJSON() {
        return {
            maxDepth: this.maxDepth,
            tree: this.tree
        };
    }

    static fromJSON(data) {
        const tree = new RaindropTree(data.maxDepth);
        tree.tree = data.tree;
        return tree;
    }
}

/**
 * Random Rain Forest - Ensemble of RaindropTrees
 */
class RandomRainForest {
    constructor(numTrees = 5) {
        this.numTrees = numTrees;
        this.forest = [];
        this.isTrained = false;
    }

    fit(x, y) {
        if (x.length < 5) return false;
        this.forest = [];

        for (let i = 0; i < this.numTrees; i++) {
            const tree = new RaindropTree(3);
            // Bootstrapping (with a bit of "rainy" randomness)
            const indices = Array.from({ length: x.length }, () => Math.floor(Math.random() * x.length));
            const bx = indices.map(idx => x[idx]);
            const by = indices.map(idx => y[idx]);

            tree.fit(bx, by);
            this.forest.push(tree);
        }
        this.isTrained = true;
        return true;
    }

    predict(val) {
        if (!this.isTrained) return 0;
        const predictions = this.forest.map(tree => tree.predict(val));
        return predictions.reduce((a, b) => a + b, 0) / predictions.length;
    }

    calculateRMSE(x, y) {
        if (!this.isTrained) return 100;
        const se = x.map((val, i) => Math.pow(this.predict(val) - y[i], 2));
        return Math.sqrt(se.reduce((a, b) => a + b, 0) / se.length);
    }

    toJSON() {
        return {
            numTrees: this.numTrees,
            forest: this.forest.map(tree => tree.toJSON()),
            isTrained: this.isTrained
        };
    }

    static fromJSON(data) {
        const forest = new RandomRainForest(data.numTrees);
        forest.forest = data.forest.map(treeData => RaindropTree.fromJSON(treeData));
        forest.isTrained = data.isTrained;
        return forest;
    }
}

/**
 * Simple Linear Regression (Legacy Fallback)
 */
class LinearRegression {
    constructor() {
        this.slope = 0;
        this.intercept = 0;
        this.trained = false;
    }

    fit(x, y) {
        if (x.length < 2) return false;
        const n = x.length;
        let sX = 0, sY = 0, sXY = 0, sXX = 0;
        for (let i = 0; i < n; i++) {
            sX += x[i]; sY += y[i]; sXY += x[i] * y[i]; sXX += x[i] * x[i];
        }
        const denom = n * sXX - sX * sX;
        if (denom === 0) {
            this.slope = 0; this.intercept = sY / n;
        } else {
            this.slope = (n * sXY - sX * sY) / denom;
            this.intercept = (sY - this.slope * sX) / n;
        }
        this.trained = true;
        return true;
    }

    predict(x) { return this.slope * x + this.intercept; }
}

/**
 * Exponential Moving Average for smoothing
 */
class EMA {
    constructor(alpha = 0.3) {
        this.alpha = alpha;
        this.value = null;
    }

    update(newValue) {
        if (this.value === null) this.value = newValue;
        else this.value = this.alpha * newValue + (1 - this.alpha) * this.value;
        return this.value;
    }
}

/**
 * Main ML Predictor for Water System (Upgraded to Random Rain Forest)
 */
class WaterPredictor {
    constructor(options = {}) {
        this.historySize = options.historySize || 60;
        this.targetTDS = options.targetTDS || { min: 150, max: 300 };
        this.optimalTDS = (this.targetTDS.min + this.targetTDS.max) / 2;

        this.history = { ro_reject: [], rainwater: [], blended: [] };

        // Models
        this.forest = new RandomRainForest(8);
        this.fallbackModel = new LinearRegression();

        this.tdsEMA = new EMA(0.15); // Slower smoothing for the forest output
    }

    addReading(tankType, reading) {
        const timestamp = Date.now();
        this.history[tankType].push({
            timestamp,
            tds: reading.tds,
            temperature: reading.temperature,
            level: reading.level,
            flowRate: reading.flowRate
        });

        if (this.history[tankType].length > this.historySize) {
            this.history[tankType].shift();
        }
    }

    predictBlendedTDS(roTDS, rainTDS, blendRatio) {
        const predictedTDS = roTDS * blendRatio.ro + rainTDS * blendRatio.rain;
        const smoothedTDS = this.tdsEMA.update(predictedTDS);

        return {
            predicted: Math.round(predictedTDS * 10) / 10,
            smoothed: Math.round(smoothedTDS * 10) / 10,
            confidence: this.calculateConfidence()
        };
    }

    predictFutureTDS(tankType, secondsAhead = 30) {
        const history = this.history[tankType];
        if (history.length < 10) {
            return { predicted: null, trend: 'learning', confidence: 0.1 };
        }

        const startTime = history[0].timestamp;
        const x = history.map(h => (h.timestamp - startTime) / 1000);
        const y = history.map(h => h.tds);

        // Apply Storm Guard (Anomaly Detection)
        const anomalies = StormGuard.detect(y);
        const filteredX = x.filter((_, i) => !anomalies[i]);
        const filteredY = y.filter((_, i) => !anomalies[i]);

        if (filteredX.length < 5) return { predicted: y[y.length - 1], trend: 'unstable', confidence: 0.2 };

        // Fit Forest
        this.forest.fit(filteredX, filteredY);
        const lastX = x[x.length - 1];
        const futureX = lastX + secondsAhead;
        const predictedTDS = this.forest.predict(futureX);

        // Fit Linear for Trend Direction
        this.fallbackModel.fit(filteredX, filteredY);
        const slope = this.fallbackModel.slope;

        let trend = 'stable';
        if (slope > 0.3) trend = 'increasing';
        else if (slope < -0.3) trend = 'decreasing';

        // Calculate Confidence based on RMSE
        const rmse = this.forest.calculateRMSE(filteredX, filteredY);
        const confidence = Math.max(0.1, Math.min(0.95, 1 - (rmse / 100)));

        return {
            predicted: Math.round(predictedTDS * 10) / 10,
            trend,
            rmse: Math.round(rmse * 100) / 100,
            confidence: Math.round(confidence * 100) / 100
        };
    }

    timeToTargetTDS(currentTDS, targetTDS, slope) {
        if (Math.abs(slope) < 0.01) return Infinity;
        const time = (targetTDS - currentTDS) / slope;
        return time > 0 ? Math.round(time) : Infinity;
    }

    calculateOptimalBlendRatio(roTDS, rainTDS) {
        const denom = roTDS - rainTDS;
        if (denom === 0) return { ro: 0.5, rain: 0.5, achievable: false };
        let ro = (this.optimalTDS - rainTDS) / denom;
        ro = Math.max(0, Math.min(1, ro));
        const achieved = roTDS * ro + rainTDS * (1 - ro);
        return {
            ro: Math.round(ro * 100) / 100,
            rain: Math.round((1 - ro) * 100) / 100,
            achievedTDS: Math.round(achieved * 10) / 10,
            achievable: Math.abs(achieved - this.optimalTDS) < 20
        };
    }

    getPredictionReport(readings, blendRatio) {
        this.addReading('ro_reject', readings.ro_reject);
        this.addReading('rainwater', readings.rainwater);
        this.addReading('blended', readings.blended);

        const futureTDS = this.predictFutureTDS('blended', 60);
        const optimalBlend = this.calculateOptimalBlendRatio(readings.ro_reject.tds, readings.rainwater.tds);

        return {
            timestamp: new Date().toISOString(),
            model: 'Random Rain Forest v1.0',
            currentState: {
                blendedTDS: readings.blended.tds,
                isOptimal: readings.blended.tds >= this.targetTDS.min && readings.blended.tds <= this.targetTDS.max
            },
            predictions: {
                futureTDS: futureTDS.predicted,
                trend: futureTDS.trend,
                confidence: futureTDS.confidence,
                rmse: futureTDS.rmse
            },
            recommendations: {
                optimalBlend,
                stormAlert: futureTDS.rmse > 20 ? 'High variance detected - sensor noise likely.' : 'Stable'
            }
        };
    }

    calculateConfidence() {
        const h = this.history.blended;
        if (h.length < 10) return 0.2;
        if (h.length < 30) return 0.5;
        return 0.85;
    }

    reset() {
        this.history = { ro_reject: [], rainwater: [], blended: [] };
        this.forest = new RandomRainForest(8);
        this.tdsEMA = new EMA(0.15);
    }
}


// Export for different environments
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { WaterPredictor, RandomRainForest, RaindropTree, LinearRegression, EMA, StormGuard };
}

if (typeof window !== 'undefined') {
    window.WaterPredictor = WaterPredictor;
}
