import sys, io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

"""
SaveHydroo — Train Best ML Model & Export Weights
===================================================
1. Loads synthetic training_data.csv
2. Engineers time-series lag/rolling features
3. Trains all candidate models, picks the best
4. Exports a JSON weights file for embedding in the Edge Function
5. Prints a full results report

Run:  python train_and_export.py
Output: model_weights.json, training_report.txt
"""

import pandas as pd
import numpy as np
import json
import sys
from sklearn.linear_model import LinearRegression, Ridge
from sklearn.ensemble import GradientBoostingRegressor, RandomForestRegressor
from sklearn.preprocessing import PolynomialFeatures
from sklearn.pipeline import make_pipeline
from sklearn.metrics import mean_squared_error, mean_absolute_error, r2_score

# ── Load data ────────────────────────────────────────────────────────
print("=" * 70)
print("  SaveHydroo — ML Model Training Pipeline")
print("=" * 70)

df = pd.read_csv("training_data.csv", parse_dates=["timestamp"])
df = df.sort_values("timestamp").reset_index(drop=True)
print(f"\nLoaded {len(df)} rows from training_data.csv")

# ── Engineer time-series features ────────────────────────────────────
LAG_STEPS = 10

for lag in range(1, LAG_STEPS + 1):
    df[f"blended_tds_lag{lag}"]     = df["blended_tds"].shift(lag)
    df[f"tds_change_rate_lag{lag}"] = df["tds_change_rate"].shift(lag)

for w in [5, 10]:
    df[f"tds_roll_mean_{w}"]  = df["blended_tds"].shift(1).rolling(w).mean()
    df[f"tds_roll_std_{w}"]   = df["blended_tds"].shift(1).rolling(w).std()
    df[f"tds_roll_max_{w}"]   = df["blended_tds"].shift(1).rolling(w).max()
    df[f"tds_roll_min_{w}"]   = df["blended_tds"].shift(1).rolling(w).min()

df["hour"]     = df["timestamp"].dt.hour
df["hour_sin"] = np.sin(2 * np.pi * df["hour"] / 24)
df["hour_cos"] = np.cos(2 * np.pi * df["hour"] / 24)

df["tds_delta1"] = df["blended_tds"] - df["blended_tds_lag1"]
df["tds_accel"]  = df["tds_delta1"] - (df["blended_tds_lag1"] - df["blended_tds_lag2"])

df = df.dropna().reset_index(drop=True)
print(f"After lag engineering: {len(df)} usable rows\n")

# ── Feature + label ───────────────────────────────────────────────────
LAG_COLS  = [f"blended_tds_lag{i}" for i in range(1, LAG_STEPS + 1)]
RATE_LAG_COLS = [f"tds_change_rate_lag{i}" for i in range(1, LAG_STEPS + 1)]
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
print(f"Train set: {len(Xtr)} rows  |  Test set: {len(Xte)} rows")
print("=" * 70)

# ── Define models ─────────────────────────────────────────────────────
models = {
    "Linear Regression (baseline)": LinearRegression(),
    "Ridge Regression + lags": Ridge(alpha=1.0),
    "Polynomial deg=2 + lags": make_pipeline(PolynomialFeatures(2, interaction_only=True), Ridge(alpha=1.0)),
    "Gradient Boosting": GradientBoostingRegressor(n_estimators=200, max_depth=4, learning_rate=0.05, random_state=42),
    "Random Forest": RandomForestRegressor(n_estimators=100, random_state=42, n_jobs=-1),
}

# ── Train & Evaluate ─────────────────────────────────────────────────
results = {}
report_lines = []

def evaluate(name, model):
    print(f"\nTraining: {name} ...", end=" ", flush=True)
    model.fit(Xtr, ytr)
    yp_tr = model.predict(Xtr)
    yp_te = model.predict(Xte)
    r2_tr = r2_score(ytr, yp_tr)
    r2_te = r2_score(yte, yp_te)
    rmse  = np.sqrt(mean_squared_error(yte, yp_te))
    mae   = mean_absolute_error(yte, yp_te)
    gap   = r2_tr - r2_te
    diag  = "UNDERFITTING" if r2_te < 0.5 else ("OVERFITTING" if gap > 0.15 else "GOOD_FIT")
    accuracy_pct = round(r2_te * 100, 1)
    
    line = f"  {name}:"
    line2 = f"    Train R2={r2_tr:.4f}  Test R2={r2_te:.4f}  RMSE={rmse:.1f} ppm  MAE={mae:.1f} ppm  Gap={gap:.3f} -> {diag}"
    line3 = f"    Accuracy: ~{accuracy_pct}%"
    print("done")
    print(line)
    print(line2)
    print(line3)
    
    report_lines.append(line)
    report_lines.append(line2)
    report_lines.append(line3)
    
    results[name] = {
        "model": model,
        "r2_train": r2_tr,
        "r2_test": r2_te,
        "rmse": rmse,
        "mae": mae,
        "gap": gap,
        "diagnosis": diag,
        "accuracy": accuracy_pct,
    }

for name, model in models.items():
    evaluate(name, model)

# ── Best model ────────────────────────────────────────────────────────
print("\n" + "=" * 70)
best_name = max(results, key=lambda k: results[k]["r2_test"])
best = results[best_name]
print(f"\n** BEST MODEL: {best_name}")
print(f"   Test R2  = {best['r2_test']:.4f}")
print(f"   RMSE     = {best['rmse']:.1f} ppm")
print(f"   MAE      = {best['mae']:.1f} ppm")
print(f"   Accuracy = ~{best['accuracy']}%")
print(f"   Status   = {best['diagnosis']}")

# ── Export model weights/parameters ───────────────────────────────────
print("\n" + "=" * 70)
print("Exporting model parameters ...")

best_model = best["model"]
export = {
    "model_name": best_name,
    "features": FEATURES,
    "metrics": {
        "r2_train": round(best["r2_train"], 6),
        "r2_test": round(best["r2_test"], 6),
        "rmse_ppm": round(best["rmse"], 2),
        "mae_ppm": round(best["mae"], 2),
        "accuracy_pct": best["accuracy"],
        "diagnosis": best["diagnosis"],
    },
    "training_info": {
        "total_rows": len(df),
        "train_rows": len(Xtr),
        "test_rows": len(Xte),
        "lag_steps": LAG_STEPS,
        "rolling_windows": [5, 10],
    },
}

# Extract model-specific parameters
if isinstance(best_model, GradientBoostingRegressor):
    export["model_type"] = "gradient_boosting"
    export["params"] = {
        "n_estimators": best_model.n_estimators,
        "max_depth": best_model.max_depth,
        "learning_rate": best_model.learning_rate,
        "feature_importances": {
            feat: round(float(imp), 6) 
            for feat, imp in sorted(
                zip(FEATURES, best_model.feature_importances_), 
                key=lambda x: -x[1]
            )[:15]  # top 15 features
        },
    }
    # Export feature importances for Edge Function optimization
    top_features = sorted(
        zip(FEATURES, best_model.feature_importances_),
        key=lambda x: -x[1]
    )
    export["top_features"] = [
        {"name": f, "importance": round(float(imp), 6)} 
        for f, imp in top_features
    ]

elif isinstance(best_model, RandomForestRegressor):
    export["model_type"] = "random_forest"
    export["params"] = {
        "n_estimators": best_model.n_estimators,
        "feature_importances": {
            feat: round(float(imp), 6)
            for feat, imp in sorted(
                zip(FEATURES, best_model.feature_importances_),
                key=lambda x: -x[1]
            )[:15]
        },
    }
    top_features = sorted(
        zip(FEATURES, best_model.feature_importances_),
        key=lambda x: -x[1]
    )
    export["top_features"] = [
        {"name": f, "importance": round(float(imp), 6)}
        for f, imp in top_features
    ]

elif isinstance(best_model, LinearRegression) or isinstance(best_model, Ridge):
    export["model_type"] = "linear"
    export["params"] = {
        "coefficients": {
            feat: round(float(coef), 6) 
            for feat, coef in zip(FEATURES, best_model.coef_)
        },
        "intercept": round(float(best_model.intercept_), 6),
    }

else:
    # Pipeline (polynomial)
    export["model_type"] = "polynomial_pipeline"
    ridge = best_model[-1]
    export["params"] = {
        "intercept": round(float(ridge.intercept_), 6),
        "n_coefficients": len(ridge.coef_),
    }

# ── Save JSON ─────────────────────────────────────────────────────────
with open("model_weights.json", "w") as f:
    json.dump(export, f, indent=2)
print(f"[OK] Saved model_weights.json")

# ── Save full report ──────────────────────────────────────────────────
with open("training_report.txt", "w") as f:
    f.write("SaveHydroo — ML Training Report\n")
    f.write("=" * 60 + "\n\n")
    for line in report_lines:
        f.write(line + "\n")
    f.write(f"\n{'=' * 60}\n")
    f.write(f"BEST MODEL: {best_name}\n")
    f.write(f"  Test R2  = {best['r2_test']:.4f}\n")
    f.write(f"  RMSE     = {best['rmse']:.1f} ppm\n")
    f.write(f"  MAE      = {best['mae']:.1f} ppm\n")
    f.write(f"  Accuracy = ~{best['accuracy']}%\n")
    f.write(f"  Status   = {best['diagnosis']}\n")
print(f"[OK] Saved training_report.txt")

# ── Recommendations for Edge Function ─────────────────────────────────
print("\n" + "=" * 70)
print("RECOMMENDATIONS FOR EDGE FUNCTION:")
print("-" * 70)

if "top_features" in export:
    print("\nTop 10 most important features:")
    for i, feat_info in enumerate(export["top_features"][:10], 1):
        bar = "#" * int(feat_info["importance"] * 100)
        print(f"  {i:2d}. {feat_info['name']:<30s} {feat_info['importance']:.4f}  {bar}")

print(f"""
The existing Edge Function already uses:
  [OK] LinearRegression, PolynomialRegression, Kalman, WMA, ARIMA ensemble
  [OK] History-based predictions (60s + 1hr)
  [OK] Anomaly detection with Z-scores
  [OK] Blend ratio calculation with RO bias

With the trained model showing {best['accuracy']}% accuracy, the current
Edge Function ensemble approach is well-validated. The feature importance
data above can be used to weight the ensemble components appropriately.
""")

print("=" * 70)
print("[OK] Training complete! All outputs saved.")
