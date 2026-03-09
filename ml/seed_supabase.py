"""
SaveHydroo — Seed Supabase with Synthetic Training Data
=========================================================
Reads training_data.csv and uploads all rows into the
`sensor_readings` table so the ml-predict Edge Function
has a rich history to train its models on.

Requirements:
    pip install supabase pandas

Usage:
    python seed_supabase.py

The script uploads data for 3 tank types per CSV row:
  - ro_reject
  - rainwater
  - blended

Each gets its own row in sensor_readings with the correct
tank_type and sensor values.
"""

import pandas as pd
from supabase import create_client
import time

# ── Config ────────────────────────────────────────────────────────────
SUPABASE_URL         = "https://gjwabhyztjgqurirdwhx.supabase.co"
SUPABASE_SERVICE_KEY = input("Paste your Supabase SERVICE ROLE key: ").strip()

# Optional: attach readings to a real user so queries via RLS work.
# Leave as None to insert without user_id (requires service role key).
USER_ID = None   # e.g. "9155da4-7d5c-4972-a446-90102d0cc7a5"

CSV_FILE    = "training_data.csv"
BATCH_SIZE  = 200        # rows per upsert call (Supabase limit ~500)
# ─────────────────────────────────────────────────────────────────────

supabase = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)
df = pd.read_csv(CSV_FILE)

print(f"📂  Loaded {len(df)} rows from {CSV_FILE}")
print(f"🔗  Connecting to Supabase: {SUPABASE_URL}")

def make_readings(row):
    """Turn one CSV row into 3 sensor_readings records."""
    ts = row["timestamp"]
    uid = USER_ID
    return [
        {
            "user_id":    uid,
            "tank_type":  "ro_reject",
            "tds":        row["ro_reject_tds"],
            "temperature":row["ro_reject_temperature"],
            "water_level":row["ro_reject_level"],
            "flow_rate":  row["ro_reject_flow"],
            "timestamp":  ts,
        },
        {
            "user_id":    uid,
            "tank_type":  "rainwater",
            "tds":        row["rainwater_tds"],
            "temperature":row["rainwater_temperature"],
            "water_level":row["rainwater_level"],
            "flow_rate":  row["rainwater_flow"],
            "timestamp":  ts,
        },
        {
            "user_id":    uid,
            "tank_type":  "blended",
            "tds":        row["blended_tds"],
            "temperature":row["blended_temperature"],
            "water_level":row["blended_level"],
            "flow_rate":  row["blended_flow"],
            "timestamp":  ts,
        },
    ]

# Build full list
records = []
for _, row in df.iterrows():
    records.extend(make_readings(row))

print(f"📊  Total records to insert: {len(records)} ({len(df)} rows × 3 tanks)")

# Upload in batches
total_batches = (len(records) + BATCH_SIZE - 1) // BATCH_SIZE
for i in range(0, len(records), BATCH_SIZE):
    batch  = records[i : i + BATCH_SIZE]
    batch_num = i // BATCH_SIZE + 1
    try:
        supabase.table("sensor_readings").insert(batch).execute()
        print(f"  ✅  Batch {batch_num}/{total_batches} — inserted {len(batch)} records")
    except Exception as e:
        print(f"  ❌  Batch {batch_num} failed: {e}")
    time.sleep(0.1)   # be gentle on the API

print("\n🎉  Done! The ml-predict Edge Function will now train on historical data.")
print("     Open the SaveHydroo dashboard → the ML confidence score should rise above 0.8.")
