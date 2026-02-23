// ============================================
// SAVEHYDROO - Gamification Edge Function
// Server-side points, levels, achievements
// ============================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Level thresholds
const LEVELS = [
    { level: 1, name: "Water Beginner", minPoints: 0 },
    { level: 2, name: "H2O Apprentice", minPoints: 100 },
    { level: 3, name: "Aqua Expert", minPoints: 500 },
    { level: 4, name: "Hydro Master", minPoints: 1500 },
    { level: 5, name: "Aqua Legend", minPoints: 5000 },
];

interface PointsRequest {
    userId: string;
    action: "rainwater_usage" | "ro_reduction" | "optimal_tds" | "daily_login" | "manual";
    amount?: number;
    metadata?: {
        rainwaterLiters?: number;
        roReductionPercent?: number;
        optimalTdsHours?: number;
    };
}

// Calculate points based on action
function calculatePoints(action: string, metadata?: any): number {
    switch (action) {
        case "rainwater_usage":
            // +10 points per 10L of rainwater used
            return Math.floor((metadata?.rainwaterLiters || 0) / 10) * 10;

        case "ro_reduction":
            // +15 points per 5% reduction in RO reject usage
            return Math.floor((metadata?.roReductionPercent || 0) / 5) * 15;

        case "optimal_tds":
            // +20 points per hour of optimal TDS maintenance
            return (metadata?.optimalTdsHours || 0) * 20;

        case "daily_login":
            // Handled separately with streak multiplier
            return 0;

        default:
            return 0;
    }
}

// Determine user level based on points
function getUserLevel(points: number) {
    for (let i = LEVELS.length - 1; i >= 0; i--) {
        if (points >= LEVELS[i].minPoints) {
            return LEVELS[i];
        }
    }
    return LEVELS[0];
}

// Check and award achievements
async function checkAchievements(supabase: any, userId: string, profile: any) {
    const { data: allAchievements } = await supabase
        .from("achievements")
        .select("*");

    const { data: earnedAchievements } = await supabase
        .from("user_achievements")
        .select("achievement_id")
        .eq("user_id", userId);

    const earnedIds = new Set(earnedAchievements?.map((a: any) => a.achievement_id) || []);
    const newAchievements = [];

    for (const achievement of allAchievements || []) {
        if (earnedIds.has(achievement.id)) continue;

        let earned = false;

        switch (achievement.requirement_type) {
            case "rainwater_used":
                earned = profile.total_rainwater_used >= achievement.requirement_value;
                break;
            case "water_saved":
                earned = profile.total_water_saved >= achievement.requirement_value;
                break;
            case "streak_days":
                earned = profile.streak_days >= achievement.requirement_value;
                break;
            case "points":
                earned = profile.points >= achievement.requirement_value;
                break;
            case "days_active":
                // Calculate days since profile creation
                const createdDate = new Date(profile.created_at);
                const daysSinceCreation = Math.floor((Date.now() - createdDate.getTime()) / (1000 * 60 * 60 * 24));
                earned = daysSinceCreation >= achievement.requirement_value;
                break;
        }

        if (earned) {
            newAchievements.push(achievement);
            await supabase
                .from("user_achievements")
                .insert({ user_id: userId, achievement_id: achievement.id });
        }
    }

    return newAchievements;
}

serve(async (req) => {
    if (req.method === "OPTIONS") {
        return new Response("ok", { headers: corsHeaders });
    }

    try {
        const supabaseClient = createClient(
            Deno.env.get("SUPABASE_URL") ?? "",
            Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
        );

        // GET: Fetch user stats and leaderboard
        if (req.method === "GET") {
            const url = new URL(req.url);
            const userId = url.searchParams.get("userId");
            const action = url.searchParams.get("action");

            // Get leaderboard
            if (action === "leaderboard") {
                const { data: leaderboard } = await supabaseClient
                    .from("leaderboard")
                    .select("*")
                    .limit(100);

                return new Response(
                    JSON.stringify({ success: true, leaderboard }),
                    { headers: { ...corsHeaders, "Content-Type": "application/json" } }
                );
            }

            // Get user stats
            if (!userId) {
                return new Response(
                    JSON.stringify({ error: "userId is required" }),
                    { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
                );
            }

            const { data: profile } = await supabaseClient
                .from("profiles")
                .select("*")
                .eq("id", userId)
                .single();

            if (!profile) {
                return new Response(
                    JSON.stringify({ error: "User not found" }),
                    { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
                );
            }

            const { data: achievements } = await supabaseClient
                .from("user_achievements")
                .select("achievement_id, achievements(*)")
                .eq("user_id", userId);

            const level = getUserLevel(profile.points);

            const stats = {
                points: profile.points,
                level: level.level,
                levelName: level.name,
                nextLevel: LEVELS[level.level] || null,
                pointsToNextLevel: LEVELS[level.level] ? LEVELS[level.level].minPoints - profile.points : 0,
                streak: profile.streak_days,
                walletBalance: parseFloat(profile.wallet_balance),
                totalWaterSaved: parseFloat(profile.total_water_saved),
                totalRainwaterUsed: parseFloat(profile.total_rainwater_used),
                achievements: achievements?.map((a: any) => a.achievements) || [],
                achievementCount: achievements?.length || 0,
            };

            return new Response(
                JSON.stringify({ success: true, stats }),
                { headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
        }

        // POST: Award points
        if (req.method === "POST") {
            const payload: PointsRequest = await req.json();

            if (!payload.userId || !payload.action) {
                return new Response(
                    JSON.stringify({ error: "userId and action are required" }),
                    { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
                );
            }

            // Get current profile
            const { data: profile } = await supabaseClient
                .from("profiles")
                .select("*")
                .eq("id", payload.userId)
                .single();

            if (!profile) {
                return new Response(
                    JSON.stringify({ error: "User not found" }),
                    { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
                );
            }

            // Calculate points
            let pointsEarned = payload.amount || calculatePoints(payload.action, payload.metadata);

            // Handle daily login with streak multiplier
            if (payload.action === "daily_login") {
                pointsEarned = 5 * Math.max(1, profile.streak_days);
            }

            // Update profile
            const newPoints = profile.points + pointsEarned;
            const newLevel = getUserLevel(newPoints);

            const updates: any = {
                points: newPoints,
                level: newLevel.level,
            };

            // Update water metrics if provided
            if (payload.metadata?.rainwaterLiters) {
                updates.total_rainwater_used = profile.total_rainwater_used + payload.metadata.rainwaterLiters;
            }

            await supabaseClient
                .from("profiles")
                .update(updates)
                .eq("id", payload.userId);

            // Check for new achievements
            const updatedProfile = { ...profile, ...updates };
            const newAchievements = await checkAchievements(supabaseClient, payload.userId, updatedProfile);

            return new Response(
                JSON.stringify({
                    success: true,
                    pointsEarned,
                    totalPoints: newPoints,
                    level: newLevel,
                    newAchievements,
                }),
                { headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
        }

        return new Response(
            JSON.stringify({ error: "Method not allowed" }),
            { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    } catch (error) {
        console.error("Error in gamification function:", error);
        return new Response(
            JSON.stringify({ error: "Internal server error", message: error.message }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    }
});
