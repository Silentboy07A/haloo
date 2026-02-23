-- ============================================
-- INSERT WOKWI ESP32 TEST USER PROFILE
-- ============================================
-- Run this in your Supabase SQL Editor to create
-- a test user profile for the Wokwi ESP32 device

-- Insert the test profile (bypassing auth.users requirement)
-- This allows the ESP32 to send data without authentication
INSERT INTO profiles (id, username, points, level, streak_days, wallet_balance, total_water_saved, total_rainwater_used)
VALUES (
  '00000000-0000-0000-0000-000000000001',
  'wokwi-esp32',
  0,
  1,
  0,
  0,
  0,
  0
)
ON CONFLICT (id) DO NOTHING;

-- Verify the profile was created
SELECT * FROM profiles WHERE id = '00000000-0000-0000-0000-000000000001';
