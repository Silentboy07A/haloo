// ============================================
// SAVEHYDROO - Simulation API
// Vercel Serverless Function
// ============================================

// Seeded random for deterministic output
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

// Tank configuration
const TANK_CONFIG = {
    ro_reject: {
        capacity: 500,
        baseTDS: { min: 800, max: 1500 },
        baseTemp: { min: 25, max: 35 },
        initialLevel: 75
    },
    rainwater: {
        capacity: 1000,
        baseTDS: { min: 20, max: 80 },
        baseTemp: { min: 20, max: 30 },
        initialLevel: 60
    },
    blended: {
        capacity: 750,
        baseTDS: { min: 150, max: 300 },
        baseTemp: { min: 22, max: 32 },
        initialLevel: 50
    }
};

// Global simulation state
let simulationState = null;

function initializeSimulation(seed = 12345) {
    const rng = new SeededRandom(seed);

    simulationState = {
        rng,
        timestep: 0,
        blendRatio: { ro: 0.3, rain: 0.7 },
        tanks: {}
    };

    for (const [type, config] of Object.entries(TANK_CONFIG)) {
        simulationState.tanks[type] = {
            type,
            level: config.initialLevel,
            tds: rng.range(config.baseTDS.min, config.baseTDS.max),
            temperature: rng.range(config.baseTemp.min, config.baseTemp.max),
            flowRate: 0
        };
    }

    return simulationState;
}

function stepSimulation() {
    if (!simulationState) {
        initializeSimulation();
    }

    const { rng, blendRatio, tanks } = simulationState;
    simulationState.timestep++;

    const roTank = tanks.ro_reject;
    const rainTank = tanks.rainwater;
    const blendTank = tanks.blended;

    // Calculate flows
    const baseFlowRate = 2.0;
    const roFlowOut = baseFlowRate * blendRatio.ro;
    const rainFlowOut = baseFlowRate * blendRatio.rain;

    // Check if flow is possible
    const canFlow = roTank.level > 5 && rainTank.level > 5 && blendTank.level < 95;

    if (canFlow) {
        const noise = rng.noise(0.03);

        // Mixed properties
        const mixedTDS = (roTank.tds * blendRatio.ro + rainTank.tds * blendRatio.rain) * noise;
        const mixedTemp = (roTank.temperature * blendRatio.ro + rainTank.temperature * blendRatio.rain) * rng.noise(0.02);

        // Update levels
        roTank.level = Math.max(0, roTank.level - 0.1 * blendRatio.ro);
        rainTank.level = Math.max(0, rainTank.level - 0.1 * blendRatio.rain);
        blendTank.level = Math.min(100, blendTank.level + 0.05);

        // Update blended tank
        blendTank.tds = mixedTDS;
        blendTank.temperature = mixedTemp;
        blendTank.flowRate = (roFlowOut + rainFlowOut) * rng.noise(0.05);

        roTank.flowRate = roFlowOut * rng.noise(0.05);
        rainTank.flowRate = rainFlowOut * rng.noise(0.05);
    } else {
        roTank.flowRate = 0;
        rainTank.flowRate = 0;
        blendTank.flowRate = 0;
    }

    // Drift TDS in source tanks
    roTank.tds += (rng.next() - 0.5) * 10;
    roTank.tds = Math.max(TANK_CONFIG.ro_reject.baseTDS.min,
        Math.min(TANK_CONFIG.ro_reject.baseTDS.max, roTank.tds));

    rainTank.tds += (rng.next() - 0.5) * 3;
    rainTank.tds = Math.max(TANK_CONFIG.rainwater.baseTDS.min,
        Math.min(TANK_CONFIG.rainwater.baseTDS.max, rainTank.tds));

    // Drift temperatures
    roTank.temperature += (rng.next() - 0.5) * 0.3;
    roTank.temperature = Math.max(TANK_CONFIG.ro_reject.baseTemp.min,
        Math.min(TANK_CONFIG.ro_reject.baseTemp.max, roTank.temperature));

    rainTank.temperature += (rng.next() - 0.5) * 0.3;
    rainTank.temperature = Math.max(TANK_CONFIG.rainwater.baseTemp.min,
        Math.min(TANK_CONFIG.rainwater.baseTemp.max, rainTank.temperature));

    return getSimulationReading();
}

function getSimulationReading() {
    if (!simulationState) {
        initializeSimulation();
    }

    const { timestep, tanks, blendRatio } = simulationState;

    const formatTank = (tank) => ({
        type: tank.type,
        tds: Math.round(tank.tds * 10) / 10,
        temperature: Math.round(tank.temperature * 10) / 10,
        level: Math.round(tank.level * 10) / 10,
        flowRate: Math.round(tank.flowRate * 100) / 100
    });

    return {
        timestep,
        timestamp: new Date().toISOString(),
        tanks: {
            ro_reject: formatTank(tanks.ro_reject),
            rainwater: formatTank(tanks.rainwater),
            blended: formatTank(tanks.blended)
        },
        blendRatio
    };
}

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    try {
        const path = req.url.split('?')[0];

        if (path.endsWith('/step')) {
            const reading = stepSimulation();
            return res.status(200).json({ success: true, ...reading });
        }

        if (path.endsWith('/current')) {
            const reading = getSimulationReading();
            return res.status(200).json({ success: true, ...reading });
        }

        if (path.endsWith('/reset')) {
            const seed = parseInt(req.query.seed || req.body?.seed) || 12345;
            initializeSimulation(seed);
            return res.status(200).json({
                success: true,
                message: 'Simulation reset',
                seed
            });
        }

        if (path.endsWith('/blend')) {
            const { ro, rain } = req.body;
            if (typeof ro === 'number' && typeof rain === 'number') {
                const total = ro + rain;
                simulationState.blendRatio = {
                    ro: ro / total,
                    rain: rain / total
                };
                return res.status(200).json({
                    success: true,
                    blendRatio: simulationState.blendRatio
                });
            }
            return res.status(400).json({ error: 'ro and rain ratios required' });
        }

        if (path.endsWith('/fill')) {
            const { tank, level } = req.body;
            if (tank && typeof level === 'number' && simulationState?.tanks[tank]) {
                simulationState.tanks[tank].level = Math.max(0, Math.min(100, level));
                return res.status(200).json({
                    success: true,
                    tank,
                    level: simulationState.tanks[tank].level
                });
            }
            return res.status(400).json({ error: 'tank and level required' });
        }

        if (path.endsWith('/generate')) {
            const duration = parseInt(req.query.duration) || 3600;
            const interval = parseInt(req.query.interval) || 2;
            const steps = Math.floor(duration / interval);

            initializeSimulation(12345);
            const data = [];

            for (let i = 0; i < steps && i < 1000; i++) {
                data.push(stepSimulation());
            }

            return res.status(200).json({
                success: true,
                duration,
                interval,
                count: data.length,
                data
            });
        }

        // Default: return current state
        if (!simulationState) {
            initializeSimulation();
        }

        return res.status(200).json({
            success: true,
            ...getSimulationReading(),
            config: TANK_CONFIG
        });

    } catch (error) {
        console.error('API Error:', error);
        return res.status(500).json({ error: 'Internal server error', message: error.message });
    }
}
