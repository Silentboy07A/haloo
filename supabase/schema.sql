-- ============================================
-- SAVEHYDROO - Supabase Database Schema
-- ============================================
-- Run this script in your Supabase SQL Editor

-- Enable necessary extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- PROFILES TABLE
-- Extends Supabase auth.users with app-specific data
-- ============================================
CREATE TABLE IF NOT EXISTS profiles (
  id UUID REFERENCES auth.users ON DELETE CASCADE PRIMARY KEY,
  username TEXT UNIQUE,
  avatar_url TEXT,
  points INTEGER DEFAULT 0,
  level INTEGER DEFAULT 1,
  streak_days INTEGER DEFAULT 0,
  last_active DATE DEFAULT CURRENT_DATE,
  wallet_balance DECIMAL(10, 2) DEFAULT 0,
  total_water_saved DECIMAL(10, 2) DEFAULT 0,
  total_rainwater_used DECIMAL(10, 2) DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create index for leaderboard queries
CREATE INDEX IF NOT EXISTS idx_profiles_points ON profiles(points DESC);

-- ============================================
-- SENSOR READINGS TABLE
-- Stores all sensor data from simulation
-- ============================================
CREATE TABLE IF NOT EXISTS sensor_readings (
  id SERIAL PRIMARY KEY,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  tank_type TEXT NOT NULL CHECK (tank_type IN ('ro_reject', 'rainwater', 'blended')),
  tds DECIMAL(8, 2),
  temperature DECIMAL(5, 2),
  water_level DECIMAL(5, 2),
  flow_rate DECIMAL(6, 3),
  timestamp TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_readings_user ON sensor_readings(user_id);
CREATE INDEX IF NOT EXISTS idx_readings_timestamp ON sensor_readings(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_readings_tank ON sensor_readings(tank_type);

-- ============================================
-- PREDICTIONS TABLE
-- Stores ML prediction results
-- ============================================
CREATE TABLE IF NOT EXISTS predictions (
  id SERIAL PRIMARY KEY,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  predicted_tds DECIMAL(8, 2),
  time_to_target INTEGER, -- seconds
  time_to_fill INTEGER, -- seconds
  confidence DECIMAL(4, 3),
  blend_ratio_ro DECIMAL(4, 3),
  blend_ratio_rain DECIMAL(4, 3),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_predictions_user ON predictions(user_id);
CREATE INDEX IF NOT EXISTS idx_predictions_time ON predictions(created_at DESC);

-- ============================================
-- ACHIEVEMENTS TABLE
-- Master list of all available achievements
-- ============================================
CREATE TABLE IF NOT EXISTS achievements (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  icon TEXT,
  category TEXT CHECK (category IN ('water_saving', 'streak', 'tds_control', 'engagement')),
  points_required INTEGER DEFAULT 0,
  requirement_type TEXT,
  requirement_value INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert default achievements
INSERT INTO achievements (name, description, icon, category, requirement_type, requirement_value) VALUES
  ('Rain Champion', 'Used 100L rainwater', '🌧️', 'water_saving', 'rainwater_used', 100),
  ('Recycler Pro', 'Reduced RO reject by 50%', '♻️', 'water_saving', 'ro_reduction', 50),
  ('TDS Master', 'Maintained optimal TDS for 24 hours', '🎯', 'tds_control', 'optimal_tds_hours', 24),
  ('Week Warrior', 'Achieved 7-day streak', '🔥', 'streak', 'streak_days', 7),
  ('Month Maestro', 'Achieved 30-day streak', '⭐', 'streak', 'streak_days', 30),
  ('Water Whisperer', 'Saved 500L water total', '🔮', 'water_saving', 'water_saved', 500),
  ('First Drop', 'Started your water saving journey', '💧', 'engagement', 'days_active', 1),
  ('Century Club', 'Earned 100 points', '💯', 'engagement', 'points', 100),
  ('Hydro Hero', 'Saved 1000L water total', '🦸', 'water_saving', 'water_saved', 1000)
ON CONFLICT (name) DO NOTHING;

-- ============================================
-- USER ACHIEVEMENTS TABLE
-- Tracks which achievements each user has earned
-- ============================================
CREATE TABLE IF NOT EXISTS user_achievements (
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  achievement_id INTEGER REFERENCES achievements(id) ON DELETE CASCADE,
  earned_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (user_id, achievement_id)
);

-- ============================================
-- TRANSACTIONS TABLE
-- Payment simulation records
-- ============================================
CREATE TABLE IF NOT EXISTS transactions (
  id SERIAL PRIMARY KEY,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('credit_purchase', 'feature_unlock', 'donation')),
  amount DECIMAL(10, 2) NOT NULL,
  credits INTEGER DEFAULT 0,
  description TEXT,
  status TEXT DEFAULT 'initiated' CHECK (status IN ('initiated', 'successful', 'failed')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_transactions_user ON transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_transactions_status ON transactions(status);

-- ============================================
-- USER FEATURES TABLE
-- Tracks unlocked premium features per user
-- ============================================
CREATE TABLE IF NOT EXISTS user_features (
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  feature_id TEXT NOT NULL,
  unlocked_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (user_id, feature_id)
);

-- ============================================
-- DAILY STATS TABLE
-- Aggregated daily statistics for each user
-- ============================================
CREATE TABLE IF NOT EXISTS daily_stats (
  id SERIAL PRIMARY KEY,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  date DATE DEFAULT CURRENT_DATE,
  rainwater_used DECIMAL(10, 2) DEFAULT 0,
  ro_reject_used DECIMAL(10, 2) DEFAULT 0,
  water_saved DECIMAL(10, 2) DEFAULT 0,
  avg_tds DECIMAL(8, 2),
  optimal_tds_minutes INTEGER DEFAULT 0,
  points_earned INTEGER DEFAULT 0,
  UNIQUE(user_id, date)
);

CREATE INDEX IF NOT EXISTS idx_daily_stats_user ON daily_stats(user_id);
CREATE INDEX IF NOT EXISTS idx_daily_stats_date ON daily_stats(date DESC);

-- ============================================
-- VIEWS
-- ============================================

-- Leaderboard view
CREATE OR REPLACE VIEW leaderboard AS
SELECT 
  id,
  username,
  avatar_url,
  points,
  level,
  streak_days,
  total_water_saved,
  ROW_NUMBER() OVER (ORDER BY points DESC) as rank
FROM profiles
WHERE username IS NOT NULL
ORDER BY points DESC
LIMIT 100;

-- User stats view
CREATE OR REPLACE VIEW user_stats AS
SELECT 
  p.id,
  p.username,
  p.points,
  p.level,
  p.streak_days,
  p.wallet_balance,
  p.total_water_saved,
  p.total_rainwater_used,
  COUNT(DISTINCT ua.achievement_id) as achievement_count,
  (SELECT COUNT(*) FROM achievements) as total_achievements
FROM profiles p
LEFT JOIN user_achievements ua ON p.id = ua.user_id
GROUP BY p.id;

-- ============================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================

-- Enable RLS on all tables
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE sensor_readings ENABLE ROW LEVEL SECURITY;
ALTER TABLE predictions ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_achievements ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_features ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_stats ENABLE ROW LEVEL SECURITY;

-- Profiles policies
CREATE POLICY "Users can view own profile" ON profiles
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Users can update own profile" ON profiles
  FOR UPDATE USING (auth.uid() = id);

CREATE POLICY "Enable insert for authenticated users only" ON profiles
  FOR INSERT WITH CHECK (auth.uid() = id);

-- Public leaderboard access
CREATE POLICY "Anyone can view leaderboard data" ON profiles
  FOR SELECT USING (true);

-- Sensor readings policies
CREATE POLICY "Users can view own readings" ON sensor_readings
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own readings" ON sensor_readings
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Predictions policies
CREATE POLICY "Users can view own predictions" ON predictions
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own predictions" ON predictions
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- User achievements policies
CREATE POLICY "Users can view own achievements" ON user_achievements
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can earn achievements" ON user_achievements
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Transactions policies
CREATE POLICY "Users can view own transactions" ON transactions
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can create own transactions" ON transactions
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own transactions" ON transactions
  FOR UPDATE USING (auth.uid() = user_id);

-- User features policies
CREATE POLICY "Users can view own features" ON user_features
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can unlock features" ON user_features
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Daily stats policies
CREATE POLICY "Users can view own stats" ON daily_stats
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own stats" ON daily_stats
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own stats" ON daily_stats
  FOR UPDATE USING (auth.uid() = user_id);

-- ============================================
-- FUNCTIONS & TRIGGERS
-- ============================================

-- Function to handle new user signup
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO profiles (id, username)
  VALUES (NEW.id, NEW.raw_user_meta_data->>'username');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger for new user signup
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- Function to update streak on daily activity
CREATE OR REPLACE FUNCTION update_streak()
RETURNS TRIGGER AS $$
DECLARE
  last_active_date DATE;
  current_streak INTEGER;
BEGIN
  SELECT last_active, streak_days INTO last_active_date, current_streak
  FROM profiles WHERE id = NEW.user_id;
  
  IF last_active_date = CURRENT_DATE - INTERVAL '1 day' THEN
    -- Consecutive day, increment streak
    UPDATE profiles 
    SET streak_days = current_streak + 1, last_active = CURRENT_DATE
    WHERE id = NEW.user_id;
  ELSIF last_active_date < CURRENT_DATE - INTERVAL '1 day' THEN
    -- Streak broken, reset to 1
    UPDATE profiles 
    SET streak_days = 1, last_active = CURRENT_DATE
    WHERE id = NEW.user_id;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to update profile timestamp
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for profile updates
CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================
-- SAMPLE DATA (for development/testing)
-- ============================================

-- Note: Run this section only in development environments
-- Uncomment and modify as needed

/*
-- Insert sample achievements (already done above via INSERT)

-- Sample user profile (requires auth.users entry first)
-- INSERT INTO profiles (id, username, points, level, streak_days, wallet_balance)
-- VALUES ('sample-uuid-here', 'demo_user', 250, 2, 5, 100.00);

-- Sample sensor readings
-- INSERT INTO sensor_readings (user_id, tank_type, tds, temperature, water_level, flow_rate)
-- VALUES 
--   ('sample-uuid', 'ro_reject', 1200.5, 28.3, 75.0, 2.5),
--   ('sample-uuid', 'rainwater', 45.2, 24.1, 60.0, 3.0),
--   ('sample-uuid', 'blended', 220.8, 26.5, 50.0, 4.5);
*/
