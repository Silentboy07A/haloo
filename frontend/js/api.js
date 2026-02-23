// ============================================
// SAVEHYDROO - API Client
// Handles all API communication
// ============================================

const API = {
    // Base URL - change for production
    baseUrl: window.location.hostname === 'localhost' ? '' : '/api',

    // Use local simulation when no backend
    useLocalSimulation: true,

    // Local simulation instance
    simulation: null,
    predictor: null,

    // Initialize API with simulation fallback
    init() {
        // Initialize local simulation
        this.simulation = new WaterSimulation({
            deterministic: false,
            updateInterval: 2000
        });

        this.predictor = new WaterPredictor();
    },

    // Generic fetch wrapper
    async request(endpoint, options = {}) {
        try {
            const response = await fetch(`${this.baseUrl}${endpoint}`, {
                headers: {
                    'Content-Type': 'application/json',
                    ...options.headers
                },
                ...options
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }

            return await response.json();
        } catch (error) {
            console.warn(`API request failed: ${endpoint}`, error);
            return null;
        }
    },

    // ============================================
    // SIMULATION ENDPOINTS
    // ============================================

    async getSimulationData() {
        // Try API first
        const apiData = await this.request('/api/simulation/step');
        if (apiData?.success) return apiData;

        // Fallback to local simulation
        if (this.simulation) {
            return this.simulation.step();
        }

        return null;
    },

    async resetSimulation(seed = 12345) {
        await this.request('/api/simulation/reset', {
            method: 'POST',
            body: JSON.stringify({ seed })
        });

        if (this.simulation) {
            this.simulation.reset();
        }
    },

    async setBlendRatio(ro, rain) {
        await this.request('/api/simulation/blend', {
            method: 'POST',
            body: JSON.stringify({ ro, rain })
        });

        if (this.simulation) {
            this.simulation.setBlendRatio(ro, rain);
        }
    },

    // ============================================
    // SENSOR DATA ENDPOINTS
    // ============================================

    async saveSensorData(userId, readings) {
        return await this.request('/api/sensor-data', {
            method: 'POST',
            body: JSON.stringify({ userId, readings })
        });
    },

    async getSensorHistory(userId, tankType = null, limit = 100) {
        const params = new URLSearchParams({ userId, limit });
        if (tankType) params.append('tankType', tankType);

        return await this.request(`/api/sensor-data?${params}`);
    },

    // ============================================
    // PREDICTION ENDPOINTS
    // ============================================

    async calculatePrediction(userId, readings, blendRatio) {
        // Try API first
        const apiResult = await this.request('/api/predictions/calculate', {
            method: 'POST',
            body: JSON.stringify({ userId, readings, blendRatio })
        });

        if (apiResult?.success) return apiResult.prediction;

        // Fallback to local predictor
        if (this.predictor && readings) {
            const tankReadings = {};
            for (const [type, data] of Object.entries(readings)) {
                tankReadings[type] = data;
                this.predictor.addReading(type, data);
            }

            return this.predictor.getPredictionReport(tankReadings, blendRatio);
        }

        return null;
    },

    // ============================================
    // GAMIFICATION ENDPOINTS
    // ============================================

    async getStats(userId) {
        return await this.request(`/api/gamification/stats?userId=${userId}`);
    },

    async awardPoints(userId, action, data = {}) {
        return await this.request('/api/gamification/points', {
            method: 'POST',
            body: JSON.stringify({ userId, action, ...data })
        });
    },

    async getLeaderboard(limit = 100) {
        const data = await this.request(`/api/gamification/leaderboard?limit=${limit}`);

        // Return mock data if API fails
        if (!data) {
            return {
                success: true,
                leaderboard: this.getMockLeaderboard()
            };
        }

        return data;
    },

    async getAchievements(userId) {
        const data = await this.request(`/api/gamification/achievements?userId=${userId}`);

        if (!data) {
            return {
                success: true,
                achievements: this.getMockAchievements()
            };
        }

        return data;
    },

    // ============================================
    // PAYMENT ENDPOINTS
    // ============================================

    async getBalance(userId) {
        return await this.request(`/api/payments/balance?userId=${userId}`);
    },

    async initiatePayment(userId, type, packageId) {
        return await this.request('/api/payments/initiate', {
            method: 'POST',
            body: JSON.stringify({ userId, type, packageId })
        });
    },

    async completePayment(transactionId, status = 'successful') {
        return await this.request('/api/payments/complete', {
            method: 'POST',
            body: JSON.stringify({ transactionId, status })
        });
    },

    async getTransactionHistory(userId, limit = 50) {
        const data = await this.request(`/api/payments/history?userId=${userId}&limit=${limit}`);

        if (!data) {
            return {
                success: true,
                transactions: [],
                totals: { successful: 0, failed: 0, pending: 0, totalSpent: 0, totalCredits: 0 }
            };
        }

        return data;
    },

    async donateCredits(userId, amount) {
        return await this.request('/api/payments/donate', {
            method: 'POST',
            body: JSON.stringify({ userId, amount })
        });
    },

    async unlockFeature(userId, featureId) {
        return await this.request('/api/payments/unlock-feature', {
            method: 'POST',
            body: JSON.stringify({ userId, featureId })
        });
    },

    // ============================================
    // MOCK DATA
    // ============================================

    getMockLeaderboard() {
        return [
            { rank: 1, username: 'AquaMaster', points: 5420, level: 5, levelName: 'Aqua Legend', streak_days: 32 },
            { rank: 2, username: 'RainCollector', points: 3850, level: 4, levelName: 'Hydro Master', streak_days: 21 },
            { rank: 3, username: 'EcoWarrior', points: 2900, level: 4, levelName: 'Hydro Master', streak_days: 15 },
            { rank: 4, username: 'WaterSaver99', points: 1820, level: 3, levelName: 'Water Saver', streak_days: 12 },
            { rank: 5, username: 'GreenDrop', points: 1540, level: 3, levelName: 'Water Saver', streak_days: 8 },
            { rank: 6, username: 'HydroHero', points: 980, level: 2, levelName: 'Eco Learner', streak_days: 5 },
            { rank: 7, username: 'BlueStream', points: 720, level: 2, levelName: 'Eco Learner', streak_days: 4 },
            { rank: 8, username: 'ClearWater', points: 450, level: 2, levelName: 'Eco Learner', streak_days: 3 },
            { rank: 9, username: 'DropletKing', points: 280, level: 1, levelName: 'Water Beginner', streak_days: 2 },
            { rank: 10, username: 'NewWaver', points: 50, level: 1, levelName: 'Water Beginner', streak_days: 1 }
        ];
    },

    getMockAchievements() {
        return [
            { id: 1, name: 'Rain Champion', icon: '🌧️', description: 'Used 100L rainwater', earned: false },
            { id: 2, name: 'Recycler Pro', icon: '♻️', description: 'Reduced RO reject 50%', earned: false },
            { id: 3, name: 'TDS Master', icon: '🎯', description: 'Maintained optimal TDS 24hrs', earned: false },
            { id: 4, name: 'Week Warrior', icon: '🔥', description: '7-day streak', earned: false },
            { id: 5, name: 'Month Maestro', icon: '⭐', description: '30-day streak', earned: false },
            { id: 6, name: 'Water Whisperer', icon: '🔮', description: 'Saved 500L water', earned: false },
            { id: 7, name: 'First Drop', icon: '💧', description: 'Started your journey', earned: true },
            { id: 8, name: 'Century Club', icon: '💯', description: 'Earned 100 points', earned: false }
        ];
    }
};

// Initialize API
API.init();

// Export for use
window.API = API;
