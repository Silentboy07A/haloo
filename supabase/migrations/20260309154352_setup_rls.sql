-- Rename water_level to level if it exists as water_level
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'sensor_readings' 
        AND column_name = 'water_level'
    ) THEN
        ALTER TABLE sensor_readings RENAME COLUMN water_level TO level;
    END IF;
END $$;

-- Update predictions table with all required columns for the ML ensemble
ALTER TABLE predictions 
ADD COLUMN IF NOT EXISTS current_tds DECIMAL(8, 2),
ADD COLUMN IF NOT EXISTS long_term_tds DECIMAL(8, 2),
ADD COLUMN IF NOT EXISTS tds_trend TEXT,
ADD COLUMN IF NOT EXISTS tds_change_rate DECIMAL(8, 4),
ADD COLUMN IF NOT EXISTS target_tds DECIMAL(8, 2),
ADD COLUMN IF NOT EXISTS blend_ro DECIMAL(4, 3),
ADD COLUMN IF NOT EXISTS blend_rain DECIMAL(4, 3),
ADD COLUMN IF NOT EXISTS blend_feasible BOOLEAN,
ADD COLUMN IF NOT EXISTS is_optimal BOOLEAN,
ADD COLUMN IF NOT EXISTS anomaly_detected BOOLEAN,
ADD COLUMN IF NOT EXISTS anomaly_zscore DECIMAL(6, 2),
ADD COLUMN IF NOT EXISTS anomaly_severity TEXT,
ADD COLUMN IF NOT EXISTS r2_linear DECIMAL(6, 4),
ADD COLUMN IF NOT EXISTS r2_polynomial DECIMAL(6, 4),
ADD COLUMN IF NOT EXISTS datapoints_used INTEGER;

-- Ensure RLS is enabled and set policy for predictions
ALTER TABLE predictions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Anyone can view global predictions" ON predictions;
CREATE POLICY "Anyone can view global predictions" ON predictions FOR SELECT USING (user_id IS NULL OR auth.uid() = user_id);
