from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
import re
from typing import Dict, List, Tuple

from django.conf import settings

from .features import (
    FEATURE_CATEGORICAL_COLUMNS,
    FEATURE_COLUMN_ORDER,
    FEATURE_NUMERIC_COLUMNS,
    feature_dicts_to_dataframe,
)


@dataclass
class TrainingResult:
    model_version: str
    rows: int
    positives: int
    calibrator: str
    metrics: Dict[str, float]


def _age_bracket_to_years(age_str: str) -> float:
    """Map UCI-style age brackets like '[40-50)' to midpoint years."""
    if not age_str or not isinstance(age_str, str):
        return 45.0
    match = re.match(r"\[(\d+)-(\d+)\)", age_str.strip())
    if not match:
        return 45.0
    lo, hi = int(match.group(1)), int(match.group(2))
    return float((lo + hi) // 2)


def _build_training_rows_from_csv(
    csv_path: Path,
    *,
    max_rows: int | None = 50_000,
    random_state: int = 42,
) -> Tuple[List[Dict[str, object]], List[int]]:
    try:
        import pandas as pd
    except ImportError as exc:
        raise RuntimeError("pandas is required for CSV training.") from exc

    csv_path = Path(csv_path)
    if not csv_path.exists():
        raise RuntimeError(
            f"Training CSV not found: {csv_path}. "
            "Provide --csv-path or place diabetic_data.csv in webapp/risk_scoring/data/."
        )

    df = pd.read_csv(csv_path)
    if max_rows and max_rows > 0 and len(df) > max_rows:
        df = df.sample(n=max_rows, random_state=random_state).reset_index(drop=True)

    rows: List[Dict[str, object]] = []
    labels: List[int] = []

    for _, r in df.iterrows():
        age_years = _age_bracket_to_years(str(r.get("age", "")))
        time_in_hospital = int(r.get("time_in_hospital", 0)) if pd.notna(r.get("time_in_hospital")) else 0
        num_medications = int(r.get("num_medications", 0)) if pd.notna(r.get("num_medications")) else 0
        number_diagnoses = int(r.get("number_diagnoses", 0)) if pd.notna(r.get("number_diagnoses")) else 0
        number_inpatient = int(r.get("number_inpatient", 0)) if pd.notna(r.get("number_inpatient")) else 0
        number_outpatient = int(r.get("number_outpatient", 0)) if pd.notna(r.get("number_outpatient")) else 0
        number_emergency = int(r.get("number_emergency", 0)) if pd.notna(r.get("number_emergency")) else 0

        gender = (str(r.get("gender", "Unknown")).strip().lower() or "unknown")[:20]
        if gender not in ("male", "female", "unknown"):
            gender = "unknown"

        rows.append(
            {
                "age_years": float(age_years),
                "days_since_admission": float(time_in_hospital),
                "medication_count": float(num_medications),
                "history_count": float(number_diagnoses),
                "past_history_count": float(number_inpatient + number_outpatient + number_emergency),
                "gender": gender,
            }
        )
        labels.append(1 if str(r.get("readmitted", "NO")).strip() == "<30" else 0)

    return rows, labels


def _fit_and_save_pipeline(X, labels: List[int], model_dir: Path, model_version: str) -> TrainingResult:
    try:
        import joblib
        import numpy as np
        import pandas as pd
        import sklearn
        from sklearn.compose import ColumnTransformer
        from sklearn.linear_model import LogisticRegression
        from sklearn.metrics import average_precision_score, brier_score_loss, roc_auc_score
        from sklearn.model_selection import train_test_split
        from sklearn.pipeline import Pipeline
        from sklearn.preprocessing import OneHotEncoder, StandardScaler
    except ImportError as exc:
        raise RuntimeError("scikit-learn, joblib, and pandas are required.") from exc

    if not isinstance(X, pd.DataFrame):
        raise TypeError("X must be a pandas DataFrame")
    n = len(X)
    positives = int(sum(labels))
    if n < 3:
        raise ValueError(f"Need at least 3 rows, got {n}")
    if positives < 1:
        raise ValueError("Need at least one positive label")
    if not all(col in X.columns for col in FEATURE_COLUMN_ORDER):
        missing = [col for col in FEATURE_COLUMN_ORDER if col not in X.columns]
        raise ValueError(f"Missing required feature columns: {missing}")

    def _build_pipeline() -> Pipeline:
        preprocess = ColumnTransformer(
            transformers=[
                ("num", StandardScaler(), FEATURE_NUMERIC_COLUMNS),
                ("cat", OneHotEncoder(handle_unknown="ignore"), FEATURE_CATEGORICAL_COLUMNS),
            ],
            remainder="drop",
        )
        return Pipeline(
            steps=[
                ("preprocess", preprocess),
                ("model", LogisticRegression(max_iter=1000)),
            ]
        )

    pipeline = _build_pipeline()
    pipeline.fit(X, labels)

    # Prove the trained model can score multiple instances in one call.
    validation_instances = min(8, n)
    validation_batch = X.sample(n=validation_instances, random_state=42) if n > validation_instances else X
    validation_probs = pipeline.predict_proba(validation_batch)[:, 1]
    if len(validation_probs) != validation_instances:
        raise RuntimeError("Prediction validation failed: batch size mismatch.")
    if not np.all(np.isfinite(validation_probs)):
        raise RuntimeError("Prediction validation failed: non-finite probabilities.")
    if np.any(validation_probs < 0.0) or np.any(validation_probs > 1.0):
        raise RuntimeError("Prediction validation failed: probabilities out of [0, 1].")

    metrics: Dict[str, float] = {
        "validation_instances": float(validation_instances),
    }
    if positives >= 10 and (n - positives) >= 10 and n >= 200:
        X_train, X_valid, y_train, y_valid = train_test_split(
            X,
            labels,
            test_size=0.2,
            random_state=42,
            stratify=labels,
        )
        eval_pipeline = _build_pipeline()
        eval_pipeline.fit(X_train, y_train)
        valid_prob = eval_pipeline.predict_proba(X_valid)[:, 1]
        metrics["roc_auc"] = float(roc_auc_score(y_valid, valid_prob))
        metrics["avg_precision"] = float(average_precision_score(y_valid, valid_prob))
        metrics["brier"] = float(brier_score_loss(y_valid, valid_prob))

    base_rate = float(positives / n)
    medium_threshold = max(0.08, min(0.20, base_rate))
    high_threshold = max(medium_threshold + 0.05, min(0.35, base_rate * 2.0))

    model_dir = Path(model_dir)
    model_dir.mkdir(parents=True, exist_ok=True)
    path = model_dir / f"risk_model_{model_version}.joblib"

    top_feature_names: List[str] = []
    top_feature_weights: List[float] = []
    try:
        final = pipeline.named_steps["model"]
        coefs = final.coef_[0]
        order = np.argsort(np.abs(coefs))[::-1][:12]
        names = pipeline.named_steps["preprocess"].get_feature_names_out()
        top_feature_names = [str(names[i]) for i in order]
        top_feature_weights = [float(coefs[i]) for i in order]
    except Exception:
        pass

    payload = {
        "model_version": model_version,
        "pipeline": pipeline,
        "calibrator": None,
        "top_feature_names": top_feature_names,
        "top_feature_weights": top_feature_weights,
        "feature_columns": FEATURE_COLUMN_ORDER,
        "band_thresholds": {
            "medium": round(float(medium_threshold), 4),
            "high": round(float(high_threshold), 4),
        },
        "training_metrics": metrics,
        "base_rate": round(base_rate, 4),
        "sklearn_version": sklearn.__version__,
    }
    joblib.dump(payload, path)
    return TrainingResult(
        model_version=model_version,
        rows=n,
        positives=positives,
        calibrator="none",
        metrics=metrics,
    )


def train_and_save(
    min_rows: int = 25,
    min_positives: int = 5,
    *,
    allow_low_positives: bool = False,
    csv_path: Path | None = None,
    max_rows: int | None = 50_000,
    random_state: int = 42,
    model_dir: Path | None = None,
) -> TrainingResult:
    base_dir: Path | None = None
    if csv_path is None or model_dir is None:
        try:
            base_dir = Path(settings.BASE_DIR)
        except Exception:
            base_dir = Path(__file__).resolve().parents[1]

    if csv_path is None:
        csv_path = base_dir / "risk_scoring" / "data" / "diabetic_data.csv"
    rows, labels = _build_training_rows_from_csv(
        Path(csv_path),
        max_rows=max_rows,
        random_state=random_state,
    )
    positives = int(sum(labels))

    if len(rows) < min_rows:
        raise RuntimeError(f"Not enough patients to train: rows={len(rows)}, required>={min_rows}.")
    if positives < 1:
        raise RuntimeError("Need at least one positive label in training CSV.")
    if positives < min_positives and not allow_low_positives:
        raise RuntimeError(
            f"Not enough positive labels in training CSV: positives={positives}, "
            f"required>={min_positives}. Use a larger CSV slice or lower --min-positives."
        )

    X = feature_dicts_to_dataframe(rows)
    if model_dir is None:
        model_dir = base_dir / "risk_scoring" / "artifacts"
    model_version = datetime.utcnow().strftime("risk-v1-%Y%m%d%H%M%S")
    return _fit_and_save_pipeline(X, labels, Path(model_dir), model_version=model_version)
