// ============================================
// SAVEHYDROO - Gamification API
// Vercel Serverless Function
// ============================================

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    process.env.SUPABASE_URL || '',
    process.env.SUPABASE_SERVICE_KEY || ''
);

// Points configuration
const POINTS = {
    RAINWATER_USE_10L: 10,
    RO_REJECT_REDUCE_5PCT: 15,
    OPTIMAL_TDS_1HR: 20,
    DAILY_STREAK_BASE: 5,
    WATER_SAVED_PER_LITER: 1,
    DAILY_LOGIN: 5
};

// Level thresholds
const LEVELS = [
    { level: 1, name: 'Water Beginner', minPoints: 0 },
    { level: 2, name: 'Eco Learner', minPoints: 101 },
    { level: 3, name: 'Water Saver', minPoints: 501 },
    { level: 4, name: 'Hydro Master', minPoints: 1501 },
    { level: 5, name: 'Aqua Legend', minPoints: 5001 }
];

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    try {
        const path = req.url.split('?')[0];

        if (path.endsWith('/stats')) {
            return await getStats(req, res);
        }
        if (path.endsWith('/leaderboard')) {
            return await getLeaderboard(req, res);
        }
        if (path.endsWith('/points')) {
            return await awardPoints(req, res);
        }
        if (path.endsWith('/achievements')) {
            return await getAchievements(req, res);
        }
        if (path.endsWith('/check-achievements')) {
            return await checkAchievements(req, res);
        }

        return res.status(404).json({ error: 'Endpoint not found' });
    } catch (error) {
        console.error('API Error:', error);
        return res.status(500).json({ error: 'Internal server error', message: error.message });
    }
}

async function getStats(req, res) {
    const { userId } = req.query;

    if (!userId) {
        return res.status(400).json({ error: 'userId is required' });
    }

    // Get profile
    const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();

    if (profileError) {
        return res.status(400).json({ error: profileError.message });
    }

    // Get achievement count
    const { count: achievementCount } = await supabase
        .from('user_achievements')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId);

    // Get total achievements available
    const { count: totalAchievements } = await supabase
        .from('achievements')
        .select('*', { count: 'exact', head: true });

    // Calculate level info
    const currentLevel = LEVELS.find(l => l.level === profile.level) || LEVELS[0];
    const nextLevel = LEVELS.find(l => l.level === profile.level + 1);

    let pointsToNextLevel = null;
    let progressPercent = 100;

    if (nextLevel) {
        pointsToNextLevel = nextLevel.minPoints - profile.points;
        const levelRange = nextLevel.minPoints - currentLevel.minPoints;
        const pointsInLevel = profile.points - currentLevel.minPoints;
        progressPercent = Math.round((pointsInLevel / levelRange) * 100);
    }

    return res.status(200).json({
        success: true,
        stats: {
            points: profile.points,
            level: profile.level,
            levelName: currentLevel.name,
            streakDays: profile.streak_days,
            walletBalance: parseFloat(profile.wallet_balance || 0),
            totalWaterSaved: parseFloat(profile.total_water_saved || 0),
            totalRainwaterUsed: parseFloat(profile.total_rainwater_used || 0),
            achievements: {
                earned: achievementCount || 0,
                total: totalAchievements || 0
            },
            levelProgress: {
                current: currentLevel,
                next: nextLevel,
                pointsToNext: pointsToNextLevel,
                progressPercent
            }
        }
    });
}

async function getLeaderboard(req, res) {
    const { limit = 100 } = req.query;

    const { data, error } = await supabase
        .from('profiles')
        .select('id, username, avatar_url, points, level, streak_days, total_water_saved')
        .order('points', { ascending: false })
        .limit(parseInt(limit));

    if (error) {
        return res.status(400).json({ error: error.message });
    }

    // Add rank to each entry
    const leaderboard = data.map((entry, index) => ({
        rank: index + 1,
        ...entry,
        levelName: LEVELS.find(l => l.level === entry.level)?.name || 'Unknown'
    }));

    return res.status(200).json({ success: true, leaderboard });
}

async function awardPoints(req, res) {
    const { userId, action, amount, reason } = req.body;

    if (!userId || (!action && !amount)) {
        return res.status(400).json({ error: 'userId and action or amount required' });
    }

    // Calculate points based on action
    let pointsToAdd = amount || 0;

    if (action) {
        switch (action) {
            case 'rainwater_use':
                pointsToAdd = POINTS.RAINWATER_USE_10L;
                break;
            case 'ro_reduce':
                pointsToAdd = POINTS.RO_REJECT_REDUCE_5PCT;
                break;
            case 'optimal_tds':
                pointsToAdd = POINTS.OPTIMAL_TDS_1HR;
                break;
            case 'daily_login':
                pointsToAdd = POINTS.DAILY_LOGIN;
                break;
            case 'water_saved':
                pointsToAdd = Math.round((req.body.liters || 1) * POINTS.WATER_SAVED_PER_LITER);
                break;
        }
    }

    // Get current profile
    const { data: profile, error: getError } = await supabase
        .from('profiles')
        .select('points, level, streak_days')
        .eq('id', userId)
        .single();

    if (getError) {
        return res.status(400).json({ error: getError.message });
    }

    const newPoints = profile.points + pointsToAdd;

    // Calculate new level
    let newLevel = 1;
    for (let i = LEVELS.length - 1; i >= 0; i--) {
        if (newPoints >= LEVELS[i].minPoints) {
            newLevel = LEVELS[i].level;
            break;
        }
    }

    const leveledUp = newLevel > profile.level;

    // Update profile
    const { error: updateError } = await supabase
        .from('profiles')
        .update({
            points: newPoints,
            level: newLevel
        })
        .eq('id', userId);

    if (updateError) {
        return res.status(400).json({ error: updateError.message });
    }

    return res.status(200).json({
        success: true,
        pointsAwarded: pointsToAdd,
        newTotal: newPoints,
        previousLevel: profile.level,
        newLevel,
        leveledUp,
        levelName: LEVELS.find(l => l.level === newLevel)?.name
    });
}

async function getAchievements(req, res) {
    const { userId } = req.query;

    if (!userId) {
        return res.status(400).json({ error: 'userId is required' });
    }

    // Get all achievements
    const { data: allAchievements } = await supabase
        .from('achievements')
        .select('*')
        .order('id');

    // Get user's earned achievements
    const { data: userAchievements } = await supabase
        .from('user_achievements')
        .select('achievement_id, earned_at')
        .eq('user_id', userId);

    const earnedIds = new Set(userAchievements?.map(ua => ua.achievement_id) || []);
    const earnedMap = {};
    userAchievements?.forEach(ua => {
        earnedMap[ua.achievement_id] = ua.earned_at;
    });

    const achievements = allAchievements?.map(a => ({
        ...a,
        earned: earnedIds.has(a.id),
        earnedAt: earnedMap[a.id] || null
    })) || [];

    return res.status(200).json({
        success: true,
        achievements,
        summary: {
            earned: earnedIds.size,
            total: achievements.length
        }
    });
}

async function checkAchievements(req, res) {
    const { userId, stats } = req.body;

    if (!userId) {
        return res.status(400).json({ error: 'userId is required' });
    }

    // Get user's current achievements
    const { data: userAchievements } = await supabase
        .from('user_achievements')
        .select('achievement_id')
        .eq('user_id', userId);

    const earnedIds = new Set(userAchievements?.map(ua => ua.achievement_id) || []);

    // Get all achievements
    const { data: allAchievements } = await supabase
        .from('achievements')
        .select('*');

    // Get user profile
    const { data: profile } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();

    const newlyEarned = [];

    for (const achievement of allAchievements || []) {
        if (earnedIds.has(achievement.id)) continue;

        let earned = false;
        const reqType = achievement.requirement_type;
        const reqValue = achievement.requirement_value;

        // Check if achievement is earned based on stats
        if (reqType === 'rainwater_used' && (stats?.totalRainwaterUsed || profile?.total_rainwater_used || 0) >= reqValue) {
            earned = true;
        } else if (reqType === 'water_saved' && (stats?.totalWaterSaved || profile?.total_water_saved || 0) >= reqValue) {
            earned = true;
        } else if (reqType === 'streak_days' && (profile?.streak_days || 0) >= reqValue) {
            earned = true;
        } else if (reqType === 'points' && (profile?.points || 0) >= reqValue) {
            earned = true;
        } else if (reqType === 'days_active' && stats?.daysActive >= reqValue) {
            earned = true;
        }

        if (earned) {
            // Award the achievement
            await supabase
                .from('user_achievements')
                .insert({ user_id: userId, achievement_id: achievement.id });

            newlyEarned.push(achievement);
        }
    }

    return res.status(200).json({
        success: true,
        newlyEarned,
        totalEarned: earnedIds.size + newlyEarned.length
    });
}
