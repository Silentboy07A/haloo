"""
SaveHydroo — Enhanced ML with Time-Series Lag Features
========================================================
Fixes underfitting (R² 0.62) by adding:
  - Lag features: TDS at t-1, t-2, ..., t-10
  - Rolling stats: mean, std, min, max over last 5 and 10 readings
  - Rate of change features
  - Hour of day (diurnal patterns)

These replicate what the Edge Function does with its 100-row history.
"""

import pandas as pd
import numpy as np
from sklearn.linear_model import LinearRegression, Ridge
from sklearn.ensemble import GradientBoostingRegressor, RandomForestRegressor
from sklearn.preprocessing import PolynomialFeatures
from sklearn.pipeline import make_pipeline
from sklearn.metrics import mean_squared_error, mean_absolute_error, r2_score

# ── Load data ────────────────────────────────────────────────────────
df = pd.read_csv("training_data.csv", parse_dates=["timestamp"])
df = df.sort_values("timestamp").reset_index(drop=True)

# ── Engineer time-series features ────────────────────────────────────
LAG_STEPS = 10   # look back 10 readings (= 20 mins)

for lag in range(1, LAG_STEPS + 1):
    df[f"blended_tds_lag{lag}"]     = df["blended_tds"].shift(lag)
    df[f"tds_change_rate_lag{lag}"] = df["tds_change_rate"].shift(lag)

# Rolling statistics (window = 5 and 10)
for w in [5, 10]:
    df[f"tds_roll_mean_{w}"]  = df["blended_tds"].shift(1).rolling(w).mean()
    df[f"tds_roll_std_{w}"]   = df["blended_tds"].shift(1).rolling(w).std()
    df[f"tds_roll_max_{w}"]   = df["blended_tds"].shift(1).rolling(w).max()
    df[f"tds_roll_min_{w}"]   = df["blended_tds"].shift(1).rolling(w).min()

# Time features (diurnal pattern)
df["hour"] = df["timestamp"].dt.hour
df["hour_sin"] = np.sin(2 * np.pi * df["hour"] / 24)
df["hour_cos"] = np.cos(2 * np.pi * df["hour"] / 24)

# Rate of change from lag1 to now
df["tds_delta1"] = df["blended_tds"] - df["blended_tds_lag1"]
df["tds_accel"]  = df["tds_delta1"] - (df["blended_tds_lag1"] - df["blended_tds_lag2"])

# Drop NaN rows from lagging
df = df.dropna().reset_index(drop=True)
print(f"After lag engineering: {len(df)} rows\n")

# ── Feature + label ───────────────────────────────────────────────────
LAG_COLS  = [f"blended_tds_lag{i}" for i in range(1, LAG_STEPS+1)]
ROLL_COLS = [c for c in df.columns if "roll" in c]
BASE_COLS = ["ro_reject_tds", "rainwater_tds", "blend_ratio_ro",
             "blended_level", "blended_flow", "tds_change_rate"]
TIME_COLS = ["hour_sin", "hour_cos", "tds_delta1", "tds_accel"]

FEATURES = BASE_COLS + LAG_COLS + ROLL_COLS + TIME_COLS
TARGET   = "predicted_tds_60s"

X, y = df[FEATURES], df[TARGET]

# Time-ordered split (no data leakage)
split = int(len(df) * 0.8)
Xtr, Xte = X.iloc[:split], X.iloc[split:]
ytr, yte = y.iloc[:split], y.iloc[split:]

print(f"Features used: {len(FEATURES)}")
print(f"Train: {len(Xtr)}  |  Test: {len(Xte)}\n")
print("=" * 65)

def evaluate(name, model):
    model.fit(Xtr, ytr)
    yp_tr = model.predict(Xtr)
    yp_te = model.predict(Xte)
    r2_tr = r2_score(ytr, yp_tr)
    r2_te = r2_score(yte, yp_te)
    rmse  = np.sqrt(mean_squared_error(yte, yp_te))
    mae   = mean_absolute_error(yte, yp_te)
    gap   = r2_tr - r2_te
    diag  = "UNDERFITTING" if r2_te < 0.5 else ("OVERFITTING" if gap > 0.15 else "GOOD FIT")
    accuracy_pct = round(r2_te * 100, 1)
    print(f"\n{name}")
    print(f"  Train R2={r2_tr:.4f}  Test R2={r2_te:.4f}  RMSE={rmse:.1f}ppm  MAE={mae:.1f}ppm  Gap={gap:.3f} -> {diag}")
    print(f"  Accuracy: ~{accuracy_pct}%")
    return r2_te, rmse

results = {}
results["Linear (no lags)"]   = evaluate("Linear Regression (baseline, no lags)", LinearRegression())
results["Ridge + lags"]        = evaluate("Ridge Regression + lag features", Ridge(alpha=1.0))
results["Poly d2 + lags"]      = evaluate("Polynomial deg=2 + lag features", make_pipeline(PolynomialFeatures(2, interaction_only=True), Ridge(alpha=1.0)))
results["GradientBoosting"]    = evaluate("Gradient Boosting (XGBoost-style)", GradientBoostingRegressor(n_estimators=200, max_depth=4, learning_rate=0.05, random_state=42))
results["RandomForest"]        = evaluate("Random Forest", RandomForestRegressor(n_estimators=100, random_state=42, n_jobs=-1))

print("\n" + "=" * 65)
best = max(results, key=lambda k: results[k][0])
print(f"\nBest model: {best}  R2={results[best][0]:.4f}  RMSE={results[best][1]:.1f} ppm")
print("\nNext step: export best model weights and embed in the Edge Function.")
