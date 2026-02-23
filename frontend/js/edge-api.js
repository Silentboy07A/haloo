// ============================================
// SAVEHYDROO - Updated API Client for Edge Functions
// ============================================

// Supabase Configuration
const SUPABASE_URL = 'https://gjwabhyztjgqurirdwhx.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imdqd2FiaHl6dGpncXVyaXJkd2h4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA1NTQ5NjgsImV4cCI6MjA4NjEzMDk2OH0.MnOkq65slHUQc6LfV_sBmUcmvvnQszmzDF03BcV3AwM';

const EdgeAPI = {
    // Supabase Edge Functions base URL
    baseUrl: `${SUPABASE_URL}/functions/v1`,

    // API Key
    apiKey: SUPABASE_ANON_KEY,

    // Authentication token (set after login)
    authToken: null,

    // Current user ID (set after login)
    userId: null,

    // Initialize API
    init() {
        console.log('Edge API initialized');
        // Check for stored auth token
        const storedAuth = localStorage.getItem('supabase.auth.token');
        if (storedAuth) {
            this.authToken = storedAuth;
        }
        // Set default user for demo
        this.userId = this.userId || 'demo-user-' + Date.now();
    },

    // Generic fetch wrapper with auth
    async request(endpoint, options = {}) {
        const headers = {
            'Content-Type': 'application/json',
            'apikey': this.apiKey,
            ...options.headers
        };

        if (this.authToken) {
            headers['Authorization'] = `Bearer ${this.authToken}`;
        }

        const response = await fetch(`${this.baseUrl}/${endpoint}`, {
            ...options,
            headers
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.message || `HTTP error! status: ${response.status}`);
        }

        return await response.json();
    },

    // ============================================
    // SENSOR DATA ENDPOINTS
    // ============================================

    // Ingest sensor data (primary endpoint)
    async ingestSensorData(readings, blendRatio) {
        return await this.request('sensor-ingest', {
            method: 'POST',
            body: JSON.stringify({
                userId: this.userId,
                readings,
                blendRatio
            })
        });
    },

    // Get latest sensor readings
    async getLatestReadings() {
        return await this.request(`sensor-ingest/latest?userId=${this.userId}`, {
            method: 'GET'
        });
    },

    // ============================================
    // ML PREDICTION ENDPOINTS
    // ============================================

    // Get ML prediction
    async getPrediction(currentReadings, stepsAhead = 60) {
        return await this.request('ml-predict', {
            method: 'POST',
            body: JSON.stringify({
                userId: this.userId,
                currentReadings,
                stepsAhead
            })
        });
    },

    // ============================================
    // GAMIFICATION ENDPOINTS
    // ============================================

    // Get user stats
    async getStats() {
        return await this.request(`gamification?userId=${this.userId}`, {
            method: 'GET'
        });
    },

    // Award points
    async awardPoints(action, metadata = {}) {
        return await this.request('gamification', {
            method: 'POST',
            body: JSON.stringify({
                userId: this.userId,
                action,
                metadata
            })
        });
    },

    // Get leaderboard
    async getLeaderboard() {
        return await this.request('gamification?action=leaderboard', {
            method: 'GET'
        });
    },

    // ============================================
    // PAYMENT ENDPOINTS
    // ============================================

    // Get available packages
    async getPaymentPackages() {
        return await this.request('payment-simulation?action=packages', {
            method: 'GET'
        });
    },

    // Initiate payment
    async initiatePayment(type, packageId = null, featureId = null, amount = 0, description = '') {
        return await this.request('payment-simulation', {
            method: 'POST',
            body: JSON.stringify({
                userId: this.userId,
                type,
                packageId,
                featureId,
                amount,
                description
            })
        });
    },

    // Get transaction history
    async getTransactionHistory() {
        return await this.request(`payment-simulation?userId=${this.userId}`, {
            method: 'GET'
        });
    },

    // ============================================
    // AUTHENTICATION HELPERS
    // ============================================

    setUserId(userId) {
        this.userId = userId;
        localStorage.setItem('hydro_user_id', userId);
    },

    setAuthToken(token) {
        this.authToken = token;
        localStorage.setItem('supabase.auth.token', token);
    },

    logout() {
        this.authToken = null;
        this.userId = null;
        localStorage.removeItem('supabase.auth.token');
        localStorage.removeItem('hydro_user_id');
    }
};

// Initialize on load
EdgeAPI.init();

// Export for use
window.EdgeAPI = EdgeAPI;
