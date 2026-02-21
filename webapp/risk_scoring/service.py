from __future__ import annotations

import logging
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, List

from django.conf import settings

from .features import (
    feature_dicts_to_dataframe,
    heuristic_risk_score,
    patient_to_feature_dict,
    top_heuristic_factors,
)

logger = logging.getLogger(__name__)


@dataclass
class RiskPrediction:
    risk_probability: float
    risk_band: str
    model_version: str
    top_factors: List[Dict[str, Any]]
    scoring_mode: str


class RiskScoringService:
    # Resolve artifact path relative to Django BASE_DIR and track latest load error.
    def __init__(self):
        self.model_dir = Path(settings.BASE_DIR) / "risk_scoring" / "artifacts"
        self._last_load_error: str | None = None

    # Map probability to low/medium/high with payload thresholds when available.
    # Applies safe defaults and guards against invalid threshold ordering.
    @staticmethod
    def _to_band(prob: float, thresholds: Dict[str, Any] | None = None) -> str:
        medium = 0.15
        high = 0.35
        if isinstance(thresholds, dict):
            try:
                medium = float(thresholds.get("medium", medium))
            except (TypeError, ValueError):
                medium = 0.15
            try:
                high = float(thresholds.get("high", high))
            except (TypeError, ValueError):
                high = 0.35
        if high <= medium:
            high = medium + 0.05

        if prob >= high:
            return "high"
        if prob >= medium:
            return "medium"
        return "low"

    # Wrapper for deterministic fallback scoring to keep predict() flow simple.
    def _heuristic_score(self, feature_row: Dict[str, Any]) -> float:
        return heuristic_risk_score(feature_row)

    # Main runtime entrypoint: build features, run supervised model, fallback if needed.
    # Returns API-ready prediction payload fields via RiskPrediction.
    def predict(self, patient: Any) -> RiskPrediction:
        feature_row = patient_to_feature_dict(patient)
        model_payload = self._load_latest_model_payload()
        if not model_payload:
            score = self._heuristic_score(feature_row)
            return RiskPrediction(
                risk_probability=round(score, 4),
                risk_band=self._to_band(score),
                model_version="heuristic-v1",
                top_factors=top_heuristic_factors(feature_row, score),
                scoring_mode="heuristic",
            )

        pipeline = model_payload.get("pipeline")
        calibrator = model_payload.get("calibrator")
        thresholds = model_payload.get("band_thresholds")
        X = feature_dicts_to_dataframe([feature_row])

        try:
            if calibrator is not None:
                prob = calibrator.predict_proba(X)[:, 1][0]
            else:
                prob = pipeline.predict_proba(X)[:, 1][0]
            prob = float(max(0.0, min(1.0, prob)))
            factors = self._top_model_factors(model_payload, X)
        except Exception as exc:
            logger.warning("Risk model prediction failed, using heuristic fallback: %s", exc)
            score = self._heuristic_score(feature_row)
            return RiskPrediction(
                risk_probability=round(score, 4),
                risk_band=self._to_band(score),
                model_version="heuristic-v1",
                top_factors=top_heuristic_factors(feature_row, score),
                scoring_mode="heuristic",
            )

        return RiskPrediction(
            risk_probability=round(prob, 4),
            risk_band=self._to_band(prob, thresholds),
            model_version=model_payload.get("model_version", "model-unknown"),
            top_factors=factors,
            scoring_mode="supervised",
        )

    # Convert transformed feature names (e.g. num__/cat__) to human-friendly labels.
    @staticmethod
    def _humanize_feature_name(name: str) -> str:
        if name.startswith("num__"):
            return name.replace("num__", "", 1)
        if name.startswith("cat__"):
            raw = name.replace("cat__", "", 1)
            if "_" in raw:
                field, value = raw.split("_", 1)
                return f"{field}={value}"
            return raw
        return name

    # Compute per-patient top contributions as transformed_value * coefficient.
    # Falls back to stored top weights for older artifact formats.
    def _top_model_factors(self, model_payload: Dict[str, Any], X):
        factors: List[Dict[str, Any]] = []
        try:
            import numpy as np

            pipeline = model_payload["pipeline"]
            preprocess = pipeline.named_steps["preprocess"]
            model = pipeline.named_steps["model"]
            names = preprocess.get_feature_names_out()
            transformed = preprocess.transform(X)
            row = transformed.toarray()[0] if hasattr(transformed, "toarray") else np.asarray(transformed)[0]
            coefs = model.coef_[0]
            contributions = np.asarray(row) * np.asarray(coefs)

            order = np.argsort(np.abs(contributions))[::-1]
            for idx in order:
                contribution = float(contributions[idx])
                if abs(contribution) < 1e-9:
                    continue
                factors.append(
                    {
                        "feature": self._humanize_feature_name(str(names[idx])),
                        "direction": "up" if contribution >= 0 else "down",
                        "contribution": round(contribution, 4),
                    }
                )
                if len(factors) >= 5:
                    break
        except Exception:
            # Backward-compatible fallback for older model payloads.
            top_names = model_payload.get("top_feature_names", [])
            top_weights = model_payload.get("top_feature_weights", [])
            for idx, name in enumerate(top_names[:5]):
                weight = float(top_weights[idx]) if idx < len(top_weights) else 0.0
                factors.append(
                    {
                        "feature": self._humanize_feature_name(str(name)),
                        "direction": "up" if weight >= 0 else "down",
                        "contribution": round(weight, 4),
                    }
                )

        if not factors:
            factors.append(
                {"feature": "model_intercept", "direction": "up", "contribution": 0.0}
            )
        return factors

    # Load newest readable risk_model_*.joblib payload; skip unreadable artifacts.
    # Stores last failure message for diagnostics without crashing requests.
    def _load_latest_model_payload(self) -> Dict[str, Any] | None:
        if not self.model_dir.exists():
            return None
        model_files = list(self.model_dir.glob("risk_model_*.joblib"))
        if not model_files:
            return None
        try:
            import joblib
        except Exception:
            return None
        for model_path in sorted(model_files, key=lambda p: p.stat().st_mtime, reverse=True):
            try:
                payload = joblib.load(model_path)
                self._last_load_error = None
                return payload
            except Exception as exc:
                self._last_load_error = f"{type(exc).__name__}: {exc}"
                logger.warning(
                    "Unable to load risk model '%s': %s", model_path.name, self._last_load_error
                )
                continue
        return None
