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

    // ============================================
    // SIMULATION ENDPOINTS
    // ============================================

    async getSimulationData() {
        if (this.simulation) {
            return this.simulation.step();
        }
        return null;
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
