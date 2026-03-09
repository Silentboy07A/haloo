// ============================================
// SAVEHYDROO - Local Simulation Script
// Acts as a fallback when Wokwi IoT is offline
// ============================================

const API = {
    simulation: null,
    predictor: null,

    init() {
        this.simulation = new WaterSimulation({
            deterministic: false,
            updateInterval: 2000
        });
        this.predictor = new WaterPredictor();
    },

    dbHistory: null,
    dbHistoryIndex: 0,
    timestep: 0,

    // ============================================
    // SIMULATION ENDPOINTS
    // ============================================

    async getSimulationData() {
        // 1. Try to fetch and cache historical database data for replay-style simulation
        if (!this.dbHistory && window.EdgeAPI && EdgeAPI.apiKey) {
            try {
                // Use AbortController for a 5s timeout to prevent hanging
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 5000);

                const url = `${EdgeAPI.baseUrl.replace('/functions/v1', '')}/rest/v1/sensor_readings?select=*&limit=1000&order=timestamp.desc&user_id=is.null`;
                const response = await fetch(url, {
                    method: 'GET',
                    headers: { 'Content-Type': 'application/json', 'apikey': EdgeAPI.apiKey },
                    signal: controller.signal
                });

                clearTimeout(timeoutId);

                if (response.ok) {
                    const data = await response.json();

                    // Group rows by timestamp so we get all 3 tanks per step
                    const grouped = {};
                    data.forEach(r => {
                        const ts = r.timestamp;
                        if (!grouped[ts]) grouped[ts] = {};
                        grouped[ts][r.tank_type] = {
                            tds: parseFloat(r.tds || 0),
                            temperature: parseFloat(r.temperature || 0),
                            level: parseFloat(r.level || 0),
                            flowRate: parseFloat(r.flow_rate || 0)
                        };
                    });

                    // Filter out steps that have at least one tank defined
                    const filtered = Object.values(grouped).filter(g => g.ro_reject || g.rainwater || g.blended);

                    if (filtered.length > 0) {
                        // Sort by timestamp (already likely sorted, but to be sure)
                        this.dbHistory = filtered;
                        this.dbHistoryIndex = this.dbHistory.length - 1; // start from oldest
                        console.log(`Initialized DB Replay with ${this.dbHistory.length} steps`);
                    }
                }
            } catch (e) {
                console.warn('DB Replay fetch failed, using mathematical simulation instead', e.message);
            }
        }

        // 2. Play back the cached database history if available
        if (this.dbHistory && this.dbHistory.length > 0) {
            const tanks = this.dbHistory[this.dbHistoryIndex];

            // Move to next step (playing backwards through desc-sorted array = playing forward in time)
            this.dbHistoryIndex--;
            if (this.dbHistoryIndex < 0) {
                this.dbHistoryIndex = this.dbHistory.length - 1; // loop back to oldest
            }

            return {
                success: true,
                timestep: this.timestep++,
                timestamp: new Date().toISOString(),
                tanks: tanks,
                blendRatio: this.simulation ? this.simulation.blendRatio : { ro: 0.3, rain: 0.7 }
            };
        }

        // 3. Absolute Fallback: Original purely mathematical JS simulation
        if (this.simulation) {
            const data = this.simulation.step();
            return {
                success: true,
                ...data,
                timestamp: new Date().toISOString()
            };
        }

        return { success: false };
    },

    async resetSimulation(seed = 12345) {
        if (this.simulation) {
            this.simulation.reset();
        }
    },

    async setBlendRatio(ro, rain) {
        if (this.simulation) {
            this.simulation.setBlendRatio(ro, rain);
        }
    },

    // ============================================
    // PREDICTIONS
    // ============================================

    async calculatePrediction(userId, readings, blendRatio) {
        // Local predictor logic
        if (this.predictor && readings) {
            const tankReadings = {};
            for (const [type, data] of Object.entries(readings)) {
                tankReadings[type] = data;
                this.predictor.addReading(type, data);
            }
            return this.predictor.getPredictionReport(tankReadings, blendRatio);
        }
        return null;
    }
};

// Initialize API after DOM is ready so WaterSimulation & WaterPredictor exist
document.addEventListener('DOMContentLoaded', () => API.init());

// Export for use
window.API = API;
