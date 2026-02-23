// ============================================
// SAVEHYDROO - Main Application
// ============================================

// Toast notification system
const Toast = {
    show(message, type = 'info', duration = 3000) {
        const container = document.getElementById('toast-container');
        if (!container) return;

        const icons = { success: '✓', error: '✕', warning: '⚠', info: 'ℹ' };

        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.innerHTML = `
      <span class="toast-icon">${icons[type]}</span>
      <span class="toast-message">${message}</span>
    `;

        container.appendChild(toast);

        setTimeout(() => {
            toast.style.opacity = '0';
            toast.style.transform = 'translateX(100px)';
            setTimeout(() => toast.remove(), 300);
        }, duration);
    }
};

window.Toast = Toast;

// Tab navigation
function initTabs() {
    const links = document.querySelectorAll('.nav-link');
    const tabs = document.querySelectorAll('.tab-content');

    links.forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const tabId = link.dataset.tab;

            links.forEach(l => l.classList.remove('active'));
            tabs.forEach(t => t.classList.remove('active'));

            link.classList.add('active');
            document.getElementById(tabId)?.classList.add('active');

            // Refresh tab-specific content
            if (tabId === 'gamification') {
                Gamification.loadLeaderboard();
            } else if (tabId === 'wallet') {
                Payments.loadHistory();
            }
        });
    });
}

// Water Simulation (browser version)
class WaterSimulation {
    constructor(opts = {}) {
        this.seed = opts.seed || 12345;
        this.blendRatio = { ro: 0.3, rain: 0.7 };
        this.timestep = 0;
        this.tanks = {
            ro_reject: { level: 75, tds: 1200, temperature: 28, flowRate: 0 },
            rainwater: { level: 60, tds: 45, temperature: 24, flowRate: 0 },
            blended: { level: 50, tds: 220, temperature: 26, flowRate: 0 }
        };
    }

    random() {
        this.seed = (this.seed * 1103515245 + 12345) & 0x7fffffff;
        return this.seed / 0x7fffffff;
    }

    noise(factor = 0.05) {
        return 1 + (this.random() - 0.5) * 2 * factor;
    }

    setBlendRatio(ro, rain) {
        const total = ro + rain;
        this.blendRatio = { ro: ro / total, rain: rain / total };
    }

    step() {
        this.timestep++;
        const { ro, rain } = this.blendRatio;
        const roT = this.tanks.ro_reject;
        const rainT = this.tanks.rainwater;
        const blendT = this.tanks.blended;

        const canFlow = roT.level > 5 && rainT.level > 5 && blendT.level < 95;

        if (canFlow) {
            const n = this.noise(0.03);
            roT.level = Math.max(0, roT.level - 0.1 * ro);
            rainT.level = Math.max(0, rainT.level - 0.1 * rain);
            blendT.level = Math.min(100, blendT.level + 0.05);
            blendT.tds = (roT.tds * ro + rainT.tds * rain) * n;
            blendT.temperature = (roT.temperature * ro + rainT.temperature * rain) * this.noise(0.02);
            roT.flowRate = 2 * ro * this.noise(0.05);
            rainT.flowRate = 2 * rain * this.noise(0.05);
            blendT.flowRate = roT.flowRate + rainT.flowRate;
        } else {
            roT.flowRate = rainT.flowRate = blendT.flowRate = 0;
        }

        // Drift
        roT.tds = Math.max(800, Math.min(1500, roT.tds + (this.random() - 0.5) * 10));
        rainT.tds = Math.max(20, Math.min(80, rainT.tds + (this.random() - 0.5) * 3));
        roT.temperature = Math.max(25, Math.min(35, roT.temperature + (this.random() - 0.5) * 0.3));
        rainT.temperature = Math.max(20, Math.min(30, rainT.temperature + (this.random() - 0.5) * 0.3));

        return this.getCurrentReading();
    }

    getCurrentReading() {
        const fmt = t => ({
            tds: Math.round(t.tds * 10) / 10,
            temperature: Math.round(t.temperature * 10) / 10,
            level: Math.round(t.level * 10) / 10,
            flowRate: Math.round(t.flowRate * 100) / 100
        });
        return {
            timestep: this.timestep,
            timestamp: new Date().toISOString(),
            tanks: {
                ro_reject: fmt(this.tanks.ro_reject),
                rainwater: fmt(this.tanks.rainwater),
                blended: fmt(this.tanks.blended)
            },
            blendRatio: this.blendRatio
        };
    }

    reset() {
        this.seed = 12345;
        this.timestep = 0;
        this.tanks.ro_reject = { level: 75, tds: 1200, temperature: 28, flowRate: 0 };
        this.tanks.rainwater = { level: 60, tds: 45, temperature: 24, flowRate: 0 };
        this.tanks.blended = { level: 50, tds: 220, temperature: 26, flowRate: 0 };
    }
}

window.WaterSimulation = WaterSimulation;

// Water Predictor (browser version)
class WaterPredictor {
    constructor() {
        this.history = { ro_reject: [], rainwater: [], blended: [] };
        this.targetTDS = { min: 150, max: 300 };
    }

    addReading(tankType, reading) {
        this.history[tankType].push({ ...reading, timestamp: Date.now() });
        if (this.history[tankType].length > 50) this.history[tankType].shift();
    }

    getPredictionReport(readings, blendRatio) {
        const blend = readings.blended || {};
        const ro = readings.ro_reject || {};
        const rain = readings.rainwater || {};

        // Simple prediction
        const predictedTDS = (ro.tds * blendRatio.ro + rain.tds * blendRatio.rain);
        const optimalTDS = 225;

        // Optimal blend
        const denom = ro.tds - rain.tds;
        let optRo = denom !== 0 ? (optimalTDS - rain.tds) / denom : 0.3;
        optRo = Math.max(0, Math.min(1, optRo));

        // Time estimates
        const flow = blend.flowRate || 0;
        const timeToFill = flow > 0 ? {
            formatted: `${Math.round((100 - blend.level) / 100 * 750 / flow)}m`
        } : { formatted: 'N/A' };

        return {
            predictions: { futureTDS: predictedTDS, tdsTrend: 'stable' },
            timing: {
                timeToOptimalTDS: { formatted: 'Calculating...' },
                timeToTankFull: timeToFill
            },
            recommendations: {
                optimalBlendRatio: { ro: optRo, rain: 1 - optRo }
            }
        };
    }
}

window.WaterPredictor = WaterPredictor;

// Initialize application
document.addEventListener('DOMContentLoaded', () => {
    console.log('🌊 SaveHydroo Initializing...');

    // Initialize modules
    initTabs();
    Charts.init();
    Dashboard.init();
    Gamification.init();
    Payments.init();

    console.log('✅ SaveHydroo Ready!');
    Toast.show('Dashboard connected!', 'success');
});
