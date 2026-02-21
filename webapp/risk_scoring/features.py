from __future__ import annotations

from datetime import date, datetime
from typing import Any, Dict, List

# Compact feature schema shared by training and live scoring.
# Keep this small and aligned with fields that exist in both the app and UCI training data.
FEATURE_NUMERIC_COLUMNS = [
    "age_years",
    "days_since_admission",
    "medication_count",
    "history_count",
    "past_history_count",
]
FEATURE_CATEGORICAL_COLUMNS = ["gender"]
FEATURE_COLUMN_ORDER: List[str] = FEATURE_NUMERIC_COLUMNS + FEATURE_CATEGORICAL_COLUMNS


# Parse ISO-like date/datetime strings into a date; return None on empty/invalid.
def _safe_date(value: str) -> date | None:
    if not value:
        return None
    raw = value.strip()
    if not raw:
        return None
    try:
        return date.fromisoformat(raw)
    except ValueError:
        pass
    for fmt in ("%Y-%m-%dT%H:%M:%S", "%Y-%m-%d %H:%M:%S"):
        try:
            return datetime.strptime(raw, fmt).date()
        except ValueError:
            continue
    return None


# Normalize patient fields that may be scalar/list/dict into a clean list[str].
# This keeps downstream count features stable regardless of source shape.
def _as_list(value: Any) -> list[str]:
    if not value:
        return []
    if isinstance(value, list):
        out: list[str] = []
        for item in value:
            if isinstance(item, dict):
                out.append(" ".join(str(v).strip() for v in item.values() if str(v).strip()))
            else:
                out.append(str(item).strip())
        return [x for x in out if x]
    return [str(value).strip()] if str(value).strip() else []


# Build one model-ready feature row from a patient object.
# Computes bounded age/length-of-stay features, count features, and normalized categories.
def patient_to_feature_dict(patient: Any, *, now_date: date | None = None) -> Dict[str, Any]:
    today = now_date or date.today()

    dob = _safe_date(getattr(patient, "date_of_birth", "") or "")
    admission = _safe_date(getattr(patient, "admission_date", "") or "")
    age_years = (today - dob).days // 365 if dob else None
    days_since_admission = (today - admission).days if admission else None
    if age_years is not None:
        age_years = max(0, min(110, age_years))
    if days_since_admission is not None:
        days_since_admission = max(0, min(30, days_since_admission))

    meds = _as_list(getattr(patient, "medications", []))
    history = _as_list(getattr(patient, "medical_history", []))
    past_history = _as_list(getattr(patient, "past_medical_history", []))
    status = (getattr(patient, "status", "") or "unknown").strip().lower() or "unknown"

    return {
        "age_years": float(age_years) if age_years is not None and age_years >= 0 else 0.0,
        "days_since_admission": float(days_since_admission) if days_since_admission is not None else 0.0,
        "medication_count": float(len(meds)),
        "history_count": float(len(history)),
        "past_history_count": float(len(past_history)),
        "gender": (getattr(patient, "gender", "") or "unknown").strip().lower() or "unknown",
        # Status is not part of supervised features but is used by heuristic fallback.
        "status": status,
    }

# Compute a bounded fallback probability using transparent additive rules.
# Used when no trained model is available or model prediction fails.
def heuristic_risk_score(feature_row: Dict[str, Any]) -> float:
    """Same rule-based score used when no trained model is available (0–1)."""
    score = 0.08
    if feature_row.get("status") == "critical":
        score += 0.20
    if (feature_row.get("days_since_admission") or 0) >= 14:
        score += 0.10
    if (feature_row.get("age_years") or 0) >= 75:
        score += 0.08
    if (feature_row.get("history_count") or 0) >= 4:
        score += 0.06
    if (feature_row.get("past_history_count") or 0) >= 2:
        score += 0.04
    if (feature_row.get("medication_count") or 0) == 0:
        score -= 0.04
    return max(0.01, min(0.95, score))


# Return up to 5 rule contributions explaining the heuristic score.
# Keeps explainability payload shape similar to supervised scoring mode.
def top_heuristic_factors(feature_row: Dict[str, Any], score: float) -> list[Dict[str, Any]]:
    factors: list[Dict[str, Any]] = []
    if feature_row["status"] == "critical":
        factors.append({"feature": "status=critical", "direction": "up", "contribution": 0.20})
    if feature_row["days_since_admission"] >= 14:
        factors.append({"feature": "days_since_admission>=14", "direction": "up", "contribution": 0.10})
    if feature_row["age_years"] >= 75:
        factors.append({"feature": "age>=75", "direction": "up", "contribution": 0.08})
    if feature_row["history_count"] >= 4:
        factors.append({"feature": "history_count>=4", "direction": "up", "contribution": 0.06})
    if feature_row["past_history_count"] >= 2:
        factors.append({"feature": "past_history_count>=2", "direction": "up", "contribution": 0.04})
    if feature_row["medication_count"] == 0:
        factors.append({"feature": "medication_count=0", "direction": "down", "contribution": -0.04})

    if not factors:
        factors.append({"feature": "baseline_risk", "direction": "up", "contribution": round(score, 4)})
    return factors[:5]


# Convert feature dict rows into a DataFrame expected by the sklearn pipeline.
# Enforces column order and normalizes numeric/categorical dtypes.
def feature_dicts_to_dataframe(rows: List[Dict[str, Any]]):
    """Convert list of feature dicts to a DataFrame with columns in pipeline order."""
    import pandas as pd

    if not rows:
        return pd.DataFrame(columns=FEATURE_COLUMN_ORDER)
    df = pd.DataFrame(rows, columns=FEATURE_COLUMN_ORDER)
    # Ensure numeric columns are numeric (fill missing with 0)
    for col in FEATURE_NUMERIC_COLUMNS:
        if col in df.columns:
            df[col] = pd.to_numeric(df[col], errors="coerce").fillna(0).astype(float)
    # Ensure categorical columns are normalized strings
    for col in FEATURE_CATEGORICAL_COLUMNS:
        if col in df.columns:
            df[col] = df[col].fillna("unknown").astype(str).str.strip().str.lower().replace("", "unknown")
    return df
