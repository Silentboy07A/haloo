// ============================================
// SAVEHYDROO - Constants and Configuration
// ============================================

export const TANK_TYPES = {
  RO_REJECT: 'ro_reject',
  RAINWATER: 'rainwater',
  BLENDED: 'blended'
};

export const TANK_CONFIG = {
  [TANK_TYPES.RO_REJECT]: {
    name: 'RO Reject Tank',
    capacity: 500, // liters
    icon: '🔄',
    color: '#ef4444',
    baseTDS: { min: 800, max: 1500 },
    baseTemp: { min: 25, max: 35 }
  },
  [TANK_TYPES.RAINWATER]: {
    name: 'Rainwater Tank',
    capacity: 1000, // liters
    icon: '🌧️',
    color: '#3b82f6',
    baseTDS: { min: 20, max: 80 },
    baseTemp: { min: 20, max: 30 }
  },
  [TANK_TYPES.BLENDED]: {
    name: 'Blended Tank',
    capacity: 750, // liters
    icon: '💧',
    color: '#10b981',
    baseTDS: { min: 150, max: 300 }, // target optimal range
    baseTemp: { min: 22, max: 32 }
  }
};

export const OPTIMAL_TDS_RANGE = {
  min: 150,
  max: 300
};

export const SENSOR_CONFIG = {
  TDS: {
    unit: 'ppm',
    precision: 1,
    updateInterval: 2000 // ms
  },
  TEMPERATURE: {
    unit: '°C',
    precision: 1,
    updateInterval: 3000
  },
  WATER_LEVEL: {
    unit: '%',
    precision: 0,
    updateInterval: 1000
  },
  FLOW_RATE: {
    unit: 'L/min',
    precision: 2,
    updateInterval: 1000
  }
};

// Gamification Constants
export const GAMIFICATION = {
  POINTS: {
    RAINWATER_USE_10L: 10,
    RO_REJECT_REDUCE_5PCT: 15,
    OPTIMAL_TDS_1HR: 20,
    DAILY_STREAK_BASE: 5,
    WATER_SAVED_PER_LITER: 1
  },
  LEVELS: [
    { level: 1, name: 'Water Beginner', minPoints: 0, icon: '💧' },
    { level: 2, name: 'Eco Learner', minPoints: 101, icon: '🌱' },
    { level: 3, name: 'Water Saver', minPoints: 501, icon: '🌿' },
    { level: 4, name: 'Hydro Master', minPoints: 1501, icon: '🌊' },
    { level: 5, name: 'Aqua Legend', minPoints: 5001, icon: '👑' }
  ],
  BADGES: [
    { id: 'rain_champion', name: 'Rain Champion', icon: '🌧️', description: 'Used 100L rainwater', requirement: { type: 'rainwater_used', value: 100 } },
    { id: 'recycler_pro', name: 'Recycler Pro', icon: '♻️', description: 'Reduced RO reject 50%', requirement: { type: 'ro_reduction', value: 50 } },
    { id: 'tds_master', name: 'TDS Master', icon: '🎯', description: 'Maintained optimal TDS 24hrs', requirement: { type: 'optimal_tds_hours', value: 24 } },
    { id: 'week_warrior', name: 'Week Warrior', icon: '🔥', description: '7-day streak', requirement: { type: 'streak_days', value: 7 } },
    { id: 'month_maestro', name: 'Month Maestro', icon: '⭐', description: '30-day streak', requirement: { type: 'streak_days', value: 30 } },
    { id: 'water_whisperer', name: 'Water Whisperer', icon: '🔮', description: 'Saved 500L water', requirement: { type: 'water_saved', value: 500 } }
  ]
};

// Payment Constants
export const PAYMENT = {
  TRANSACTION_TYPES: {
    CREDIT_PURCHASE: 'credit_purchase',
    FEATURE_UNLOCK: 'feature_unlock',
    DONATION: 'donation'
  },
  TRANSACTION_STATUS: {
    INITIATED: 'initiated',
    SUCCESSFUL: 'successful',
    FAILED: 'failed'
  },
  CREDIT_PACKAGES: [
    { id: 'starter', name: 'Starter Pack', credits: 100, price: 99, currency: 'INR' },
    { id: 'pro', name: 'Pro Pack', credits: 500, price: 399, currency: 'INR' },
    { id: 'ultra', name: 'Ultra Pack', credits: 1500, price: 999, currency: 'INR' }
  ],
  FEATURES: [
    { id: 'advanced_analytics', name: 'Advanced Analytics', price: 200, description: 'Detailed charts and reports' },
    { id: 'predictions_pro', name: 'Predictions Pro', price: 300, description: 'Extended ML predictions' },
    { id: 'export_data', name: 'Data Export', price: 150, description: 'Export all your data' }
  ]
};

// Simulation Constants
export const SIMULATION = {
  DEFAULT_BLEND_RATIO: {
    ro_reject: 0.3,
    rainwater: 0.7
  },
  NOISE_FACTOR: 0.05, // 5% random noise
  UPDATE_INTERVAL: 2000, // ms
  DETERMINISTIC_SEED: 12345
};

// API Endpoints
export const API_ENDPOINTS = {
  SENSOR_DATA: '/api/sensor-data',
  PREDICTIONS: '/api/predictions',
  GAMIFICATION: '/api/gamification',
  PAYMENTS: '/api/payments',
  SIMULATION: '/api/simulation'
};
