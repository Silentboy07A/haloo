/**
 * Dedicated ML Test Suite for SaveHydroo
 * Tests the "Random Rain Forest" ensemble and "Storm Guard"
 */

const { WaterPredictor, StormGuard } = require('../lib/ml-predictor');

const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';

function runTest(name, fn) {
    console.log(`${BOLD}Running Test: ${name}${RESET}`);
    try {
        fn();
        console.log(`${GREEN}✓ PASSED${RESET}\n`);
    } catch (err) {
        console.error(`${RED}✗ FAILED: ${err.message}${RESET}\n`);
        process.exit(1);
    }
}

// ==========================================
// TEST CASES
// ==========================================

runTest('Storm Guard - Anomaly Detection', () => {
    const data = [100, 102, 101, 99, 100, 500, 101, 102]; // 500 is a clear spike
    const anomalies = StormGuard.detect(data, 5, 2);

    if (!anomalies[5]) throw new Error('Failed to detect spike at index 5');
    if (anomalies[0]) throw new Error('False positive at index 0');
    console.log(`Detected Anomaly: ${data[5]} at index 5 correctly.`);
});

runTest('Random Rain Forest - Trend Learning', () => {
    const predictor = new WaterPredictor();
    const now = Date.now();

    // Simulate a steady increasing trend in TDS over 40 seconds
    for (let i = 0; i < 20; i++) {
        predictor.history['blended'].push({
            timestamp: now + (i * 2000), // 2 seconds apart
            tds: 200 + (i * 5) + (Math.random() * 2), // steady climb
            level: 50,
            temperature: 25,
            flowRate: 2
        });
    }

    const future = predictor.predictFutureTDS('blended', 10);

    console.log(`Current (last): ~${200 + (19 * 5)}`);
    console.log(`Predicted (10s ahead): ${future.predicted}`);
    console.log(`Trend Identified: ${future.trend}`);
    console.log(`Confidence Score: ${future.confidence}`);

    if (future.trend !== 'increasing') throw new Error(`Failed to identify increasing trend (found ${future.trend})`);
    // Decision trees are weak at extrapolation, but should be at least near the last high
    if (future.predicted < 250) throw new Error(`Prediction too low (${future.predicted}) for increasing trend`);
    if (future.confidence < 0.6) throw new Error('Confidence unexpectedly low for clean data');
});

runTest('Forest vs Noise - Robustness Test', () => {
    const predictor = new WaterPredictor();
    const now = Date.now();

    // Mostly stable at 200, with two massive spikes
    for (let i = 0; i < 30; i++) {
        let tds = 200 + (Math.random() * 2);
        if (i === 15 || i === 25) tds = 999; // Noise spikes

        predictor.history['blended'].push({
            timestamp: now + (i * 2000),
            tds: tds,
            level: 50,
            temperature: 25,
            flowRate: 2
        });
    }

    const future = predictor.predictFutureTDS('blended', 10);
    console.log(`Predicted with noise: ${future.predicted}`);
    console.log(`RMSE: ${future.rmse}`);

    if (future.predicted > 250) throw new Error('Model was too influenced by noise spikes');
    if (future.confidence < 0.6) throw new Error('Confidence dropped too much despite Storm Guard');
});

console.log(`${BOLD}${GREEN}All ML Tests Completed Successfully!${RESET}`);
