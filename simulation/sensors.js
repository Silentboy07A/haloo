// ============================================
// SAVEHYDROO - JavaScript Sensor Data Generator
// Standalone simulation for frontend/backend testing
// ============================================

/**
 * Seeded random number generator for deterministic output
 */
class SeededRandom {
    constructor(seed = 12345) {
        this.seed = seed;
    }

    next() {
        this.seed = (this.seed * 1103515245 + 12345) & 0x7fffffff;
        return this.seed / 0x7fffffff;
    }

    range(min, max) {
        return min + this.next() * (max - min);
    }

    noise(factor = 0.05) {
        return 1 + (this.next() - 0.5) * 2 * factor;
    }
}

/**
 * Tank configuration
 */
const TANK_CONFIG = {
    ro_reject: {
        name: 'RO Reject Tank',
        capacity: 500,
        baseTDS: { min: 800, max: 1500 },
        baseTemp: { min: 25, max: 35 },
        initialLevel: 75
    },
    rainwater: {
        name: 'Rainwater Tank',
        capacity: 1000,
        baseTDS: { min: 20, max: 80 },
        baseTemp: { min: 20, max: 30 },
        initialLevel: 60
    },
    blended: {
        name: 'Blended Tank',
        capacity: 750,
        baseTDS: { min: 150, max: 300 },
        baseTemp: { min: 22, max: 32 },
        initialLevel: 50
    }
};

/**
 * Water Tank Simulator
 */
class TankSimulator {
    constructor(type, config, rng) {
        this.type = type;
        this.config = config;
        this.rng = rng;
        this.reset();
    }

    reset() {
        this.level = this.config.initialLevel;
        this.tds = this.rng.range(this.config.baseTDS.min, this.config.baseTDS.max);
        this.temperature = this.rng.range(this.config.baseTemp.min, this.config.baseTemp.max);
        this.flowRate = 0;
    }

    update(flowIn = 0, flowOut = 0, mixTDS = null, mixTemp = null) {
        const noise = this.rng.noise(0.03);

        // Update level based on flow
        const netFlow = flowIn - flowOut;
        this.level += netFlow / this.config.capacity * 100;
        this.level = Math.max(0, Math.min(100, this.level));

        // Update TDS with drift and mixing
        if (mixTDS !== null) {
            this.tds = mixTDS * noise;
        } else {
            this.tds += (this.rng.next() - 0.5) * 10;
            this.tds = Math.max(this.config.baseTDS.min, Math.min(this.config.baseTDS.max, this.tds));
        }

        // Update temperature with drift and mixing
        if (mixTemp !== null) {
            this.temperature = mixTemp * this.rng.noise(0.02);
        } else {
            this.temperature += (this.rng.next() - 0.5) * 0.5;
            this.temperature = Math.max(this.config.baseTemp.min, Math.min(this.config.baseTemp.max, this.temperature));
        }

        // Update flow rate
        this.flowRate = Math.abs(flowOut) * this.rng.noise(0.05);
    }

    getReading() {
        return {
            type: this.type,
            name: this.config.name,
            tds: Math.round(this.tds * 10) / 10,
            temperature: Math.round(this.temperature * 10) / 10,
            level: Math.round(this.level * 10) / 10,
            flowRate: Math.round(this.flowRate * 100) / 100,
            capacity: this.config.capacity,
            timestamp: new Date().toISOString()
        };
    }
}

/**
 * Main Simulation Engine
 */
class WaterSimulation {
    constructor(options = {}) {
        this.deterministic = options.deterministic !== false;
        this.seed = options.seed || 12345;
        this.updateInterval = options.updateInterval || 2000;
        this.blendRatio = options.blendRatio || { ro: 0.3, rain: 0.7 };

        this.rng = new SeededRandom(this.seed);
        this.tanks = {};
        this.history = [];
        this.running = false;
        this.timestep = 0;

        this.initializeTanks();
    }

    initializeTanks() {
        for (const [type, config] of Object.entries(TANK_CONFIG)) {
            this.tanks[type] = new TankSimulator(type, config, this.rng);
        }
    }

    setBlendRatio(roRatio, rainRatio) {
        const total = roRatio + rainRatio;
        this.blendRatio = {
            ro: roRatio / total,
            rain: rainRatio / total
        };
    }

    step() {
        this.timestep++;

        const roTank = this.tanks.ro_reject;
        const rainTank = this.tanks.rainwater;
        const blendTank = this.tanks.blended;

        // Calculate flows based on blend ratio
        const baseFlowRate = 2.0; // L/min base
        const roFlowOut = baseFlowRate * this.blendRatio.ro;
        const rainFlowOut = baseFlowRate * this.blendRatio.rain;
        const blendFlowIn = roFlowOut + rainFlowOut;

        // Check if we can flow (source has water, dest has space)
        const canFlow = roTank.level > 5 && rainTank.level > 5 && blendTank.level < 95;

        if (canFlow) {
            // Calculate mixed properties
            const mixedTDS = (roTank.tds * this.blendRatio.ro + rainTank.tds * this.blendRatio.rain);
            const mixedTemp = (roTank.temperature * this.blendRatio.ro + rainTank.temperature * this.blendRatio.rain);

            // Update tanks
            roTank.update(0, roFlowOut * 0.1);
            rainTank.update(0, rainFlowOut * 0.1);
            blendTank.update(blendFlowIn * 0.05, 0, mixedTDS, mixedTemp);
        } else {
            roTank.update(0, 0);
            rainTank.update(0, 0);
            blendTank.update(0, 0);
        }

        const reading = this.getCurrentReading();
        this.history.push(reading);

        // Keep only last 1000 readings
        if (this.history.length > 1000) {
            this.history.shift();
        }

        return reading;
    }

    getCurrentReading() {
        return {
            timestep: this.timestep,
            timestamp: new Date().toISOString(),
            tanks: {
                ro_reject: this.tanks.ro_reject.getReading(),
                rainwater: this.tanks.rainwater.getReading(),
                blended: this.tanks.blended.getReading()
            },
            blendRatio: { ...this.blendRatio },
            simulation: {
                deterministic: this.deterministic,
                seed: this.seed
            }
        };
    }

    getHistory(limit = 100) {
        return this.history.slice(-limit);
    }

    reset() {
        this.rng = new SeededRandom(this.seed);
        this.history = [];
        this.timestep = 0;
        this.initializeTanks();
    }

    // Generate time series data
    generateTimeSeries(duration = 3600, interval = 2) {
        const steps = duration / interval;
        const data = [];

        this.reset();

        for (let i = 0; i < steps; i++) {
            data.push(this.step());
        }

        return data;
    }

    // Start real-time simulation
    start(callback) {
        if (this.running) return;

        this.running = true;
        this.intervalId = setInterval(() => {
            const reading = this.step();
            if (callback) callback(reading);
        }, this.updateInterval);
    }

    stop() {
        this.running = false;
        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = null;
        }
    }

    fillTank(tankType, level) {
        if (this.tanks[tankType]) {
            this.tanks[tankType].level = Math.max(0, Math.min(100, level));
        }
    }
}

// ============================================
// CLI INTERFACE
// ============================================

function runCLI() {
    const args = process.argv.slice(2);
    const isTest = args.includes('--test');
    const isGenerate = args.includes('--generate');

    const sim = new WaterSimulation({
        deterministic: true,
        seed: 12345
    });

    if (isTest) {
        console.log('Running deterministic test...');

        // Generate 10 readings
        for (let i = 0; i < 10; i++) {
            const reading = sim.step();
            console.log(JSON.stringify(reading, null, 2));
        }

        console.log('\nTest complete. Deterministic output verified.');
        process.exit(0);
    }

    if (isGenerate) {
        const duration = parseInt(args[args.indexOf('--generate') + 1]) || 3600;
        console.log(`Generating ${duration} seconds of data...`);

        const data = sim.generateTimeSeries(duration, 2);
        console.log(JSON.stringify(data, null, 2));
        process.exit(0);
    }

    // Default: real-time simulation
    console.log('Starting real-time simulation (Ctrl+C to stop)...\n');

    sim.start((reading) => {
        console.log(JSON.stringify(reading));
    });
}

// Export for use as module
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        WaterSimulation,
        TankSimulator,
        SeededRandom,
        TANK_CONFIG
    };
}

// Run CLI if executed directly
if (typeof require !== 'undefined' && require.main === module) {
    runCLI();
}

// Export for browser
if (typeof window !== 'undefined') {
    window.WaterSimulation = WaterSimulation;
    window.TANK_CONFIG = TANK_CONFIG;
}
