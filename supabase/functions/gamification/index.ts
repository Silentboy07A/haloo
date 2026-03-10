import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

const corsHeaders = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };
const TARGET_TDS = 225, TDS_TOLERANCE = 25;

serve(async (req) => {
    if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
    try {
        const authHeader = req.headers.get("Authorization");
        const supabase = createClient(
            Deno.env.get("SUPABASE_URL") ?? "",
            Deno.env.get("SUPABASE_ANON_KEY") ?? "",
            { global: { headers: { Authorization: authHeader! } } }
        );

        // GET: Fetch stats and achievements
        if (req.method === "GET") {
            const url = new URL(req.url);
            const userId = url.searchParams.get("userId");
            const action = url.searchParams.get("action");

            if (action === "leaderboard") {
                const { data } = await supabase.from("leaderboard").select("*, profiles (username, points)").order("points", { ascending: false }).limit(20);

                // Map the profile data into a flat array structure expected by the frontend
                const mappedLeaderboard = (data || []).map((row: any, i: number) => ({
                    rank: i + 1,
                    username: row.profiles?.username || "Anonymous",
                    points: row.points || row.profiles?.points || 0,
                    levelName: "Level " + Math.floor((row.points || 0) / 100 + 1) // simple approximation
                }));

                return new Response(JSON.stringify({ success: true, leaderboard: mappedLeaderboard }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
            }

            if (!userId) {
                return new Response(JSON.stringify({ error: "userId is required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
            }

            // Fetch user stats
            const { data: stats } = await supabase.from("user_stats").select("*").eq("user_id", userId).single();
            const { data: achievements } = await supabase.from("user_achievements").select(`
                achievement_id,
                achievements ( id, name, description, icon )
            `).eq("user_id", userId);

            // Format fetched achievements to include 'earned: true' and basic properties
            const formattedAchievements = achievements?.map((a: any) => ({
                id: a.achievement_id,
                name: a.achievements?.name,
                description: a.achievements?.description,
                icon: a.achievements?.icon,
                earned: true
            })) || [];

            return new Response(
                JSON.stringify({
                    success: true,
                    stats: stats || {},
                    achievements: formattedAchievements
                }),
                { headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
        }

        const { userId, readings } = await req.json();
        if (!userId) return new Response(JSON.stringify({ success: true, result: null }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
        const blendedTDS = readings?.blended?.tds ?? 0;
        const isOptimal = Math.abs(blendedTDS - TARGET_TDS) <= TDS_TOLERANCE;
        const { data: stats } = await supabase.from("user_stats").select("*").eq("user_id", userId).single();
        if (!stats) return new Response(JSON.stringify({ success: false, error: "User not found" }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
        let pointsEarned = 1;
        if (isOptimal) pointsEarned += 2;
        const today = new Date().toISOString().split("T")[0];
        const yesterday = new Date(Date.now() - 86400000).toISOString().split("T")[0];
        let newStreak = stats.streak_days;
        if (stats.last_streak_date === today) { /* already counted */ }
        else if (stats.last_streak_date === yesterday) newStreak += 1;
        else newStreak = 1;
        const newTotal = stats.total_points + pointsEarned;
        const newReadings = stats.total_readings + 1;
        const newOptimal = isOptimal ? stats.optimal_hours + (5 / 3600) : stats.optimal_hours;
        await supabase.from("user_stats").update({
            total_points: newTotal,
            total_readings: newReadings,
            streak_days: newStreak,
            longest_streak: Math.max(stats.longest_streak, newStreak),
            optimal_hours: newOptimal,
            last_reading_at: new Date().toISOString(),
            last_streak_date: today,
            updated_at: new Date().toISOString(),
        }).eq("user_id", userId);
        const week = `${new Date().getFullYear()}-W${String(Math.ceil(new Date().getDate() / 7)).padStart(2, "0")}`;
        await supabase.from("leaderboard").upsert(
            { user_id: userId, week, points: newTotal, updated_at: new Date().toISOString() },
            { onConflict: "user_id,week" }
        );
        const { data: allAch } = await supabase.from("achievements").select("*");
        const { data: earned } = await supabase.from("user_achievements").select("achievement_id").eq("user_id", userId);
        const earnedIds = new Set((earned ?? []).map((e: any) => e.achievement_id));
        const newlyEarned: any[] = [];
        for (const ach of (allAch ?? [])) {
            if (earnedIds.has(ach.id)) continue;
            let e = false;
            if (ach.condition === "total_readings >= 1" && newReadings >= 1) e = true;
            if (ach.condition === "total_readings >= 100" && newReadings >= 100) e = true;
            if (ach.condition === "total_readings >= 1000" && newReadings >= 1000) e = true;
            if (ach.condition === "optimal_hours >= 1" && newOptimal >= 1) e = true;
            if (ach.condition === "optimal_hours >= 24" && newOptimal >= 24) e = true;
            if (ach.condition === "streak_days >= 7" && newStreak >= 7) e = true;
            if (ach.condition === "streak_days >= 30" && newStreak >= 30) e = true;
            if (e) {
                await supabase.from("user_achievements").insert({ user_id: userId, achievement_id: ach.id, points_awarded: ach.points_value });
                newlyEarned.push({ name: ach.name, icon: ach.icon, points: ach.points_value });
            }
        }
        return new Response(JSON.stringify({
            success: true,
            result: { pointsEarned, totalPoints: newTotal, streak: newStreak, isOptimal, newAchievements: newlyEarned },
        }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    } catch (error) {
        return new Response(
            JSON.stringify({ error: "Internal server error", message: (error as Error).message }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    }
});
