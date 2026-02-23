// ============================================
// SAVEHYDROO - Supabase Client Configuration
// ============================================

import { createClient } from '@supabase/supabase-js';

// Supabase Configuration
// Replace these with your actual Supabase project credentials
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://your-project.supabase.co';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || 'your-anon-key';

// Create Supabase client
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: true
    }
});

// ============================================
// Authentication Helpers
// ============================================

export async function signUp(email, password, username) {
    const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
            data: { username }
        }
    });

    if (error) throw error;

    // Create profile after signup
    if (data.user) {
        await createProfile(data.user.id, username);
    }

    return data;
}

export async function signIn(email, password) {
    const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password
    });

    if (error) throw error;
    return data;
}

export async function signOut() {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
}

export async function getCurrentUser() {
    const { data: { user } } = await supabase.auth.getUser();
    return user;
}

export async function getSession() {
    const { data: { session } } = await supabase.auth.getSession();
    return session;
}

// ============================================
// Profile Helpers
// ============================================

export async function createProfile(userId, username) {
    const { data, error } = await supabase
        .from('profiles')
        .insert({
            id: userId,
            username: username || `user_${userId.slice(0, 8)}`,
            points: 0,
            level: 1,
            streak_days: 0,
            wallet_balance: 0
        });

    if (error) throw error;
    return data;
}

export async function getProfile(userId) {
    const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();

    if (error) throw error;
    return data;
}

export async function updateProfile(userId, updates) {
    const { data, error } = await supabase
        .from('profiles')
        .update(updates)
        .eq('id', userId);

    if (error) throw error;
    return data;
}

// ============================================
// Sensor Data Helpers
// ============================================

export async function saveSensorReading(userId, tankType, reading) {
    const { data, error } = await supabase
        .from('sensor_readings')
        .insert({
            user_id: userId,
            tank_type: tankType,
            tds: reading.tds,
            temperature: reading.temperature,
            water_level: reading.waterLevel,
            flow_rate: reading.flowRate
        });

    if (error) throw error;
    return data;
}

export async function getSensorReadings(userId, tankType, limit = 100) {
    let query = supabase
        .from('sensor_readings')
        .select('*')
        .eq('user_id', userId)
        .order('timestamp', { ascending: false })
        .limit(limit);

    if (tankType) {
        query = query.eq('tank_type', tankType);
    }

    const { data, error } = await query;
    if (error) throw error;
    return data;
}

export async function getLatestReadings(userId) {
    const { data, error } = await supabase
        .rpc('get_latest_readings', { p_user_id: userId });

    if (error) {
        // Fallback if RPC doesn't exist
        const readings = {};
        for (const tankType of ['ro_reject', 'rainwater', 'blended']) {
            const { data: tankData } = await supabase
                .from('sensor_readings')
                .select('*')
                .eq('user_id', userId)
                .eq('tank_type', tankType)
                .order('timestamp', { ascending: false })
                .limit(1)
                .single();
            readings[tankType] = tankData;
        }
        return readings;
    }
    return data;
}

// ============================================
// Prediction Helpers
// ============================================

export async function savePrediction(userId, prediction) {
    const { data, error } = await supabase
        .from('predictions')
        .insert({
            user_id: userId,
            predicted_tds: prediction.predictedTDS,
            time_to_target: prediction.timeToTarget,
            time_to_fill: prediction.timeToFill,
            confidence: prediction.confidence
        });

    if (error) throw error;
    return data;
}

export async function getPredictions(userId, limit = 50) {
    const { data, error } = await supabase
        .from('predictions')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(limit);

    if (error) throw error;
    return data;
}

// ============================================
// Gamification Helpers
// ============================================

export async function addPoints(userId, points, reason) {
    // Get current profile
    const profile = await getProfile(userId);
    const newPoints = profile.points + points;

    // Calculate new level
    const levels = [0, 101, 501, 1501, 5001];
    let newLevel = 1;
    for (let i = levels.length - 1; i >= 0; i--) {
        if (newPoints >= levels[i]) {
            newLevel = i + 1;
            break;
        }
    }

    await updateProfile(userId, {
        points: newPoints,
        level: newLevel
    });

    return { newPoints, newLevel, pointsAdded: points };
}

export async function getLeaderboard(limit = 100) {
    const { data, error } = await supabase
        .from('leaderboard')
        .select('*')
        .limit(limit);

    if (error) {
        // Fallback if view doesn't exist
        const { data: profiles, error: profileError } = await supabase
            .from('profiles')
            .select('id, username, points, level, streak_days')
            .order('points', { ascending: false })
            .limit(limit);

        if (profileError) throw profileError;
        return profiles;
    }
    return data;
}

export async function getAchievements(userId) {
    const { data, error } = await supabase
        .from('user_achievements')
        .select(`
      earned_at,
      achievements (
        id,
        name,
        description,
        icon,
        points_required
      )
    `)
        .eq('user_id', userId);

    if (error) throw error;
    return data;
}

export async function awardAchievement(userId, achievementId) {
    const { data, error } = await supabase
        .from('user_achievements')
        .insert({
            user_id: userId,
            achievement_id: achievementId
        });

    if (error && error.code !== '23505') throw error; // Ignore duplicate
    return data;
}

// ============================================
// Transaction Helpers
// ============================================

export async function createTransaction(userId, type, amount) {
    const { data, error } = await supabase
        .from('transactions')
        .insert({
            user_id: userId,
            type,
            amount,
            status: 'initiated'
        })
        .select()
        .single();

    if (error) throw error;
    return data;
}

export async function updateTransactionStatus(transactionId, status) {
    const { data, error } = await supabase
        .from('transactions')
        .update({ status })
        .eq('id', transactionId)
        .select()
        .single();

    if (error) throw error;
    return data;
}

export async function getTransactionHistory(userId, limit = 50) {
    const { data, error } = await supabase
        .from('transactions')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(limit);

    if (error) throw error;
    return data;
}

export async function updateWalletBalance(userId, amount) {
    const profile = await getProfile(userId);
    const newBalance = profile.wallet_balance + amount;

    await updateProfile(userId, {
        wallet_balance: newBalance
    });

    return newBalance;
}

export default supabase;
