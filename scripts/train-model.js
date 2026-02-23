/**
 * SAVEHYDROO - ML Training Script
 * Generates synthetic data, trains the Random Rain Forest, and saves the state.
 * This runs during the Vercel build process.
 */

const fs = require('fs');
const path = require('path');
const { WaterPredictor, RandomRainForest, StormGuard } = require('../lib/ml-predictor');

const MODEL_PATH = path.join(__dirname, '../frontend/data/trained-model.json');

function generateTrainingData() {
    console.log('🌧️  Generating high-fidelity synthetic water data...');
    const data = [];
    const now = Date.now();

    // Simulate various trends to make the forest robust
    // 1. Stable trend
    for (let i = 0; i < 100; i++) {
        data.push({ timestamp: now + (i * 1000), tds: 200 + Math.random() * 5 });
    }

    // 2. Increasing trend (simulating RO reject accumulation)
    for (let i = 100; i < 200; i++) {
        data.push({ timestamp: now + (i * 1000), tds: 205 + (i - 100) * 0.5 + Math.random() * 5 });
    }

    // 3. Spikes (to train Storm Guard resilience)
    for (let i = 200; i < 250; i++) {
        let tds = 250 + Math.random() * 5;
        if (i % 10 === 0) tds = 800; // Large spikes
        data.push({ timestamp: now + (i * 1000), tds });
    }

    return data;
}

function train() {
    console.log('🌲 Starting Random Rain Forest training sequence...');
    const rawData = generateTrainingData();

    const predictor = new WaterPredictor();
    const startTime = rawData[0].timestamp;

    const x = rawData.map(d => (d.timestamp - startTime) / 1000);
    const y = rawData.map(d => d.tds);

    // Apply Storm Guard filtering during training
    const anomalies = StormGuard.detect(y);
    const filteredX = x.filter((_, i) => !anomalies[i]);
    const filteredY = y.filter((_, i) => !anomalies[i]);

    console.log(`📊 Filtered ${rawData.length - filteredX.length} anomalies.`);

    const forest = new RandomRainForest(12); // Slightly larger for deployment
    forest.fit(filteredX, filteredY);

    const rmse = forest.calculateRMSE(filteredX, filteredY);
    console.log(`✅ Training Complete. RMSE: ${rmse.toFixed(4)}`);

    const modelData = {
        version: '1.0.0',
        trainedAt: new Date().toISOString(),
        metrics: {
            rmse: Math.round(rmse * 100) / 100,
            samples: filteredX.length
        },
        forest: forest.toJSON()
    };

    fs.mkdirSync(path.dirname(MODEL_PATH), { recursive: true });
    fs.writeFileSync(MODEL_PATH, JSON.stringify(modelData, null, 2));
    console.log(`📦 Model serialized and saved to: ${MODEL_PATH}`);
}

try {
    train();
} catch (err) {
    console.error('❌ Training failed:', err);
    process.exit(1);
}
