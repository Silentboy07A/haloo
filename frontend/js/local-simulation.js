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
                // Fetch thousands of historical rows to play back as a "Live stream"
                // Specifically targeting seeded data (user_id IS NULL)
                const url = `${EdgeAPI.baseUrl.replace('/functions/v1', '')}/rest/v1/sensor_readings?select=*&limit=3000&order=timestamp.desc&user_id=is.null`;
                const response = await fetch(url, {
                    method: 'GET',
                    headers: { 'Content-Type': 'application/json', 'apikey': EdgeAPI.apiKey }
                });
                if (response.ok) {
                    const data = await response.json();

                    // Group rows by timestamp so we get all 3 tanks per step
                    const grouped = {};
                    data.forEach(r => {
                        if (!grouped[r.timestamp]) grouped[r.timestamp] = {};
                        grouped[r.timestamp][r.tank_type] = {
                            tds: parseFloat(r.tds || 0),
                            temperature: parseFloat(r.temperature || 0),
                            level: parseFloat(r.level || r.water_level || 0),
                            flowRate: parseFloat(r.flow_rate || r.flow_in || 0)
                        };
                    });

                    // Filter out steps that don't have complete data for all 3 tanks
                    this.dbHistory = Object.values(grouped).filter(g => g.ro_reject && g.rainwater && g.blended);
                    this.dbHistoryIndex = this.dbHistory.length - 1; // start from oldest to newest
                }
            } catch (e) {
                console.warn('DB Replay fetch failed, using mathematical simulation instead', e);
            }
        }

        // 2. Play back the cached database history if available
        if (this.dbHistory && this.dbHistory.length > 0) {
            const tanks = this.dbHistory[this.dbHistoryIndex];

            // Loop backwards through array (which is sorted newest to oldest) so we play oldest to newest
            this.dbHistoryIndex--;
            if (this.dbHistoryIndex < 0) {
                this.dbHistoryIndex = this.dbHistory.length - 1; // loop back
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
            return { success: true, ...data };
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
