"""
SaveHydroo — Synthetic Training Data Generator
================================================
Generates realistic water sensor data for the ML model.

Features produced:
  - ro_reject_tds, ro_reject_temperature, ro_reject_level, ro_reject_flow
  - rainwater_tds, rainwater_temperature, rainwater_level, rainwater_flow
  - blend_ratio_ro, blend_ratio_rain
  - blended_tds, blended_temperature, blended_level, blended_flow
  - use_case (car_washing / toilet / floor_cleaning / irrigation / construction)
  - target_tds, is_optimal, anomaly_detected
  - timestamp

Run: python generate_training_data.py
Output: training_data.csv  (10 000 rows by default)
"""

import csv
import math
import random
import datetime

# ── Config ────────────────────────────────────────────────────────────
ROWS       = 20_000
START_TIME = datetime.datetime(2025, 1, 1, 0, 0, 0)
INTERVAL   = datetime.timedelta(minutes=2)   # one reading every 2 min
OUT_FILE   = "training_data.csv"
SEED       = 42
random.seed(SEED)

# ── Use-case thresholds (matches ml-predict/index.ts) ─────────────────
USE_CASES = [
    {"name": "car_washing",    "target_tds": 400,  "tolerance": 50,  "max_tds": 500},
    {"name": "toilet",         "target_tds": 700,  "tolerance": 100, "max_tds": 1000},
    {"name": "floor_cleaning", "target_tds": 1000, "tolerance": 150, "max_tds": 1500},
    {"name": "irrigation",     "target_tds": 1500, "tolerance": 200, "max_tds": 2000},
    {"name": "construction",   "target_tds": 2000, "tolerance": 300, "max_tds": 3000},
]

def detect_use_case(tds):
    if tds <= 500:  return USE_CASES[0]
    if tds <= 1000: return USE_CASES[1]
    if tds <= 1500: return USE_CASES[2]
    if tds <= 2000: return USE_CASES[3]
    if tds <= 3000: return USE_CASES[4]
    return {"name": "unsuitable", "target_tds": 3000, "tolerance": 0, "max_tds": 3000}

def calc_blend(target_tds, ro_tds, rain_tds, tolerance):
    d = ro_tds - rain_tds
    if abs(d) < 1:
        r = 0.5
    else:
        r = max(0.0, min(1.0, (target_tds - rain_tds) / d))
        r = min(0.95, r * 1.35)   # same 35% RO bias as the Edge Function
    rain_r = round(1 - r, 2)
    r = round(r, 2)
    blended = r * ro_tds + rain_r * rain_tds
    feasible = abs(blended - target_tds) <= tolerance
    return r, rain_r, round(blended, 1), feasible

def noisy(value, pct=0.03):
    """Add ±pct Gaussian noise."""
    return max(0.0, value + random.gauss(0, value * pct))

# ── Slow drift generators ─────────────────────────────────────────────
def sine_drift(i, period, amplitude, base):
    return base + amplitude * math.sin(2 * math.pi * i / period)

# ── Main ──────────────────────────────────────────────────────────────
fieldnames = [
    "timestamp",
    "ro_reject_tds", "ro_reject_temperature", "ro_reject_level", "ro_reject_flow",
    "rainwater_tds", "rainwater_temperature", "rainwater_level", "rainwater_flow",
    "blend_ratio_ro", "blend_ratio_rain",
    "blended_tds",  "blended_temperature",  "blended_level",  "blended_flow",
    "target_tds", "use_case", "is_optimal", "anomaly_detected",
    "tds_change_rate",   # ppm/sec (ground-truth slope for regression training)
    "predicted_tds_60s", # what TDS will be in 60s (label for regression)
]

rows = []

# Slowly varying base TDS values
ro_base  = random.uniform(800, 1200)   # RO reject: 800–1200 ppm
rain_base = random.uniform(50, 150)    # Rainwater: 50–150 ppm

for i in range(ROWS):
    ts = START_TIME + i * INTERVAL

    # ── RO Reject Tank ────────────────────────────────────────────────
    ro_tds   = noisy(sine_drift(i, 720, 300, ro_base), 0.04)   # slow 24-h cycle
    ro_temp  = noisy(sine_drift(i, 360, 3, 28), 0.02)           # 26–31 °C
    ro_level = noisy(sine_drift(i, 480, 20, 65), 0.02)          # 45–85 %
    ro_flow  = noisy(2.5, 0.08)

    # ── Rainwater Tank ────────────────────────────────────────────────
    rain_tds   = noisy(sine_drift(i, 1440, 40, rain_base), 0.05)
    rain_temp  = noisy(sine_drift(i, 720, 4, 24), 0.02)         # 20–28 °C
    rain_level = noisy(sine_drift(i, 960, 25, 55), 0.03)        # 30–80 %
    rain_flow  = noisy(3.0, 0.08)

    # ── Random target use case ────────────────────────────────────────
    uc = random.choice(USE_CASES)
    target_tds = uc["target_tds"]

    # ── Blend ratio (physics-based) ───────────────────────────────────
    r_ro, r_rain, blended_tds, feasible = calc_blend(target_tds, ro_tds, rain_tds, uc["tolerance"])

    # Occasionally inject anomalies (≈5 % of rows)
    anomaly = False
    if random.random() < 0.05:
        blended_tds *= random.uniform(1.5, 2.5)   # spike
        anomaly = True

    blended_temp  = r_ro * ro_temp + r_rain * rain_temp + random.gauss(0, 0.3)
    blended_level = noisy(sine_drift(i, 600, 15, 50), 0.04)
    blended_flow  = noisy(r_ro * ro_flow + r_rain * rain_flow, 0.05)

    # ── Ground-truth labels ───────────────────────────────────────────
    tds_change_rate = random.gauss(0, 0.3)     # ppm/sec drift
    predicted_60s   = max(0, blended_tds + tds_change_rate * 60 + random.gauss(0, 5))

    use_case_name = detect_use_case(blended_tds)["name"]
    is_optimal = (abs(blended_tds - target_tds) <= uc["tolerance"]) and (blended_tds <= uc["max_tds"])

    rows.append({
        "timestamp":          ts.isoformat(),
        "ro_reject_tds":      round(ro_tds, 2),
        "ro_reject_temperature": round(ro_temp, 2),
        "ro_reject_level":    round(ro_level, 2),
        "ro_reject_flow":     round(ro_flow, 3),
        "rainwater_tds":      round(rain_tds, 2),
        "rainwater_temperature": round(rain_temp, 2),
        "rainwater_level":    round(rain_level, 2),
        "rainwater_flow":     round(rain_flow, 3),
        "blend_ratio_ro":     r_ro,
        "blend_ratio_rain":   r_rain,
        "blended_tds":        round(blended_tds, 2),
        "blended_temperature":round(blended_temp, 2),
        "blended_level":      round(blended_level, 2),
        "blended_flow":       round(blended_flow, 3),
        "target_tds":         target_tds,
        "use_case":           use_case_name,
        "is_optimal":         int(is_optimal),
        "anomaly_detected":   int(anomaly),
        "tds_change_rate":    round(tds_change_rate, 4),
        "predicted_tds_60s":  round(predicted_60s, 2),
    })

# ── Write CSV ─────────────────────────────────────────────────────────
with open(OUT_FILE, "w", newline="") as f:
    writer = csv.DictWriter(f, fieldnames=fieldnames)
    writer.writeheader()
    writer.writerows(rows)

print(f"✅  Wrote {ROWS} rows → {OUT_FILE}")
print(f"    Anomalies: {sum(r['anomaly_detected'] for r in rows)}")
print(f"    Optimal:   {sum(r['is_optimal'] for r in rows)}")
print(f"    Use cases: {set(r['use_case'] for r in rows)}")
