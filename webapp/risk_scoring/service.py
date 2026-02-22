from __future__ import annotations

import logging
import re
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
    seriousness_factor: float
    seriousness_level: str
    assessment_recommendation: str


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

    @staticmethod
    def _normalized_band_thresholds(
        thresholds: Dict[str, Any] | None = None,
    ) -> tuple[float, float]:
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
        return medium, high

    # Apply conservative context adjustments that are not represented in the
    # supervised training labels (status transitions and severe-condition text).
    @staticmethod
    def _context_adjust_probability(
        probability: float,
        feature_row: Dict[str, Any],
        thresholds: Dict[str, Any] | None = None,
    ) -> tuple[float, List[Dict[str, Any]]]:
        adjusted = float(max(0.0, min(1.0, probability)))
        factors: List[Dict[str, Any]] = []

        status = str(feature_row.get("status", "") or "").strip().lower()
        if status == "critical" and adjusted < 0.45:
            delta = 0.45 - adjusted
            adjusted = 0.45
            factors.append(
                {
                    "feature": "status=critical",
                    "direction": "up",
                    "contribution": round(delta, 4),
                }
            )
        elif status == "discharged":
            delta = -min(0.10, adjusted * 0.40)
            adjusted += delta
            factors.append(
                {
                    "feature": "status=discharged",
                    "direction": "down",
                    "contribution": round(delta, 4),
                }
            )

        raw_days = float(
            feature_row.get("days_since_admission_raw")
            or feature_row.get("days_since_admission")
            or 0.0
        )
        if raw_days >= 60:
            adjusted += 0.03
            factors.append(
                {
                    "feature": "days_since_admission_raw>=60",
                    "direction": "up",
                    "contribution": 0.03,
                }
            )
        if raw_days >= 180:
            adjusted += 0.05
            factors.append(
                {
                    "feature": "days_since_admission_raw>=180",
                    "direction": "up",
                    "contribution": 0.05,
                }
            )

        severe_score = float(feature_row.get("serious_condition_score") or 0.0)
        severe_bonus = min(0.12, severe_score / 300.0)
        if severe_bonus > 0:
            adjusted += severe_bonus
            factors.append(
                {
                    "feature": "serious_conditions",
                    "direction": "up",
                    "contribution": round(severe_bonus, 4),
                }
            )

        if (feature_row.get("high_risk_history_count") or 0) >= 1:
            adjusted += 0.07
            factors.append(
                {
                    "feature": "high_risk_history_count>=1",
                    "direction": "up",
                    "contribution": 0.07,
                }
            )
        if (feature_row.get("high_risk_prescription_count") or 0) >= 1:
            adjusted += 0.05
            factors.append(
                {
                    "feature": "high_risk_prescription_count>=1",
                    "direction": "up",
                    "contribution": 0.05,
                }
            )
        if (feature_row.get("high_risk_allergy_count") or 0) >= 1:
            adjusted += 0.04
            factors.append(
                {
                    "feature": "high_risk_allergy_count>=1",
                    "direction": "up",
                    "contribution": 0.04,
                }
            )
        if (feature_row.get("current_prescription_count") or 0) >= 3:
            adjusted += 0.03
            factors.append(
                {
                    "feature": "current_prescription_count>=3",
                    "direction": "up",
                    "contribution": 0.03,
                }
            )

        # Policy override: very advanced age should not remain in low/medium due
        # solely to model calibration artifacts.
        age_raw = float(
            feature_row.get("age_years_raw") or feature_row.get("age_years") or 0.0
        )
        _medium, high = RiskScoringService._normalized_band_thresholds(thresholds)
        if age_raw >= 110:
            floor = min(0.95, high + 0.02)
            if adjusted < floor:
                delta = floor - adjusted
                adjusted = floor
                factors.append(
                    {
                        "feature": "age_years_raw>=110",
                        "direction": "up",
                        "contribution": round(delta, 4),
                    }
                )
        elif age_raw >= 100:
            floor = high
            if adjusted < floor:
                delta = floor - adjusted
                adjusted = floor
                factors.append(
                    {
                        "feature": "age_years_raw>=100",
                        "direction": "up",
                        "contribution": round(delta, 4),
                    }
                )

        adjusted = float(max(0.01, min(0.95, adjusted)))
        return adjusted, factors

    @staticmethod
    def _merge_top_factors(
        base_factors: List[Dict[str, Any]],
        extra_factors: List[Dict[str, Any]],
        *,
        limit: int = 5,
    ) -> List[Dict[str, Any]]:
        merged = [*extra_factors, *base_factors]
        merged = [
            f for f in merged if abs(float(f.get("contribution", 0.0))) >= 1e-9
        ]
        merged.sort(key=lambda f: abs(float(f.get("contribution", 0.0))), reverse=True)
        if merged:
            return merged[:limit]
        return (base_factors or extra_factors)[:limit]

    @staticmethod
    def _risk_from_seriousness(
        seriousness_factor: float,
        seriousness_level: str,
    ) -> tuple[float, str]:
        probability = max(0.01, min(0.95, float(seriousness_factor) / 100.0))
        level = (seriousness_level or "").strip().lower()
        if level in {"high", "critical"}:
            band = "high"
        elif level == "moderate":
            band = "medium"
        else:
            band = "low"
        return round(probability, 4), band

    # Convert probability + core clinical context into a 0-100 seriousness factor.
    # This is an operational triage aid for assessment urgency, not a diagnosis.
    @staticmethod
    def _seriousness_assessment(
        probability: float,
        risk_band: str,
        feature_row: Dict[str, Any],
    ) -> tuple[float, str, str]:
        # Scale base to 0–55 so overall scores sit in a lower range
        base = float(probability) * 55.0

        # Clinical floor: high-risk patients must not get a trivial score
        high_risk_allergy = float(feature_row.get("high_risk_allergy_count") or 0.0) >= 1
        high_risk_history = float(feature_row.get("high_risk_history_count") or 0.0) >= 1
        serious_score = float(feature_row.get("serious_condition_score") or 0.0)
        allergy_count = float(feature_row.get("allergy_count") or 0.0)
        history_count = float(feature_row.get("history_count") or 0.0)
        past_count = float(feature_row.get("past_history_count") or 0.0)
        clinical_floor = 1.0
        if serious_score >= 15 or (high_risk_history and float(feature_row.get("high_risk_prescription_count") or 0.0) >= 1):
            clinical_floor = 38.0
        elif serious_score >= 8 or high_risk_history or (high_risk_allergy and float(feature_row.get("high_risk_prescription_count") or 0.0) >= 1):
            clinical_floor = 28.0
        elif high_risk_allergy or float(feature_row.get("high_risk_prescription_count") or 0.0) >= 1 or allergy_count >= 2 or (history_count >= 4 or past_count >= 2):
            clinical_floor = 18.0
        base = max(base, clinical_floor)

        # Context adjustment (capped so scores don’t cluster at the top)
        adjustment = 0.0
        status = str(feature_row.get("status", "") or "").strip().lower()
        if status == "critical":
            adjustment += 12.0
        elif status == "discharged":
            adjustment -= 12.0

        age_for_context = float(
            feature_row.get("age_years_raw") or feature_row.get("age_years") or 0.0
        )
        if age_for_context >= 75:
            adjustment += 3.0
        raw_days = float(
            feature_row.get("days_since_admission_raw")
            or feature_row.get("days_since_admission")
            or 0.0
        )
        if raw_days >= 14:
            adjustment += 2.0
        if raw_days >= 60:
            adjustment += 2.0
        if raw_days >= 180:
            adjustment += 3.0
        if (feature_row.get("history_count") or 0) >= 4:
            adjustment += 2.0
        if (feature_row.get("past_history_count") or 0) >= 2:
            adjustment += 2.0
        if (feature_row.get("allergy_count") or 0) >= 2:
            adjustment += 1.0
        adjustment += min(3.0, float(feature_row.get("high_risk_allergy_count") or 0.0) * 2.0)
        if (feature_row.get("current_prescription_count") or 0) >= 3:
            adjustment += 2.0
        adjustment += min(4.0, float(feature_row.get("high_risk_prescription_count") or 0.0) * 2.0)
        if (feature_row.get("high_risk_history_count") or 0) >= 1:
            adjustment += 4.0
        if (feature_row.get("medication_count") or 0) == 0:
            adjustment += 1.0
        adjustment += min(8.0, float(feature_row.get("serious_condition_score") or 0.0) * 0.4)

        adjustment = max(-12.0, min(18.0, adjustment))
        score = base + adjustment

        # Align with risk band floor (lower thresholds)
        if risk_band == "high":
            score = max(score, 52.0)
        elif risk_band == "medium":
            score = max(score, 32.0)

        score = max(0.0, min(100.0, score))

        # Level thresholds lowered so “critical”/“high” are reserved for clearer cases
        if score >= 70.0:
            level = "critical"
            recommendation = "Immediate bedside assessment (target: within 15 minutes)."
        elif score >= 52.0:
            level = "high"
            recommendation = "Urgent clinician assessment (target: within 30 minutes)."
        elif score >= 28.0:
            level = "moderate"
            recommendation = "Priority reassessment and monitoring (target: within 4 hours)."
        else:
            level = "low"
            recommendation = "Routine monitoring; reassess on any status change."

        return round(score, 1), level, recommendation

    # Main runtime entrypoint: build features, run supervised model, fallback if needed.
    # Returns API-ready prediction payload fields via RiskPrediction.
    def predict(self, patient: Any) -> RiskPrediction:
        feature_row = patient_to_feature_dict(patient)
        model_payload = self._load_latest_model_payload()
        if not model_payload:
            score = self._heuristic_score(feature_row)
            score, context_factors = self._context_adjust_probability(
                score,
                feature_row,
                thresholds=None,
            )
            pre_band = self._to_band(score)
            seriousness_factor, seriousness_level, assessment_recommendation = (
                self._seriousness_assessment(score, pre_band, feature_row)
            )
            risk_probability, risk_band = self._risk_from_seriousness(
                seriousness_factor, seriousness_level
            )
            factors = self._merge_top_factors(
                top_heuristic_factors(feature_row, score),
                context_factors,
            )
            return RiskPrediction(
                risk_probability=risk_probability,
                risk_band=risk_band,
                model_version="heuristic-v1",
                top_factors=factors,
                scoring_mode="heuristic",
                seriousness_factor=seriousness_factor,
                seriousness_level=seriousness_level,
                assessment_recommendation=assessment_recommendation,
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
            score, context_factors = self._context_adjust_probability(
                score,
                feature_row,
                thresholds=None,
            )
            pre_band = self._to_band(score)
            seriousness_factor, seriousness_level, assessment_recommendation = (
                self._seriousness_assessment(score, pre_band, feature_row)
            )
            risk_probability, risk_band = self._risk_from_seriousness(
                seriousness_factor, seriousness_level
            )
            factors = self._merge_top_factors(
                top_heuristic_factors(feature_row, score),
                context_factors,
            )
            return RiskPrediction(
                risk_probability=risk_probability,
                risk_band=risk_band,
                model_version="heuristic-v1",
                top_factors=factors,
                scoring_mode="heuristic",
                seriousness_factor=seriousness_factor,
                seriousness_level=seriousness_level,
                assessment_recommendation=assessment_recommendation,
            )

        prob, context_factors = self._context_adjust_probability(
            prob,
            feature_row,
            thresholds=thresholds,
        )
        factors = self._merge_top_factors(factors, context_factors)
        pre_band = self._to_band(prob, thresholds)
        seriousness_factor, seriousness_level, assessment_recommendation = (
            self._seriousness_assessment(prob, pre_band, feature_row)
        )
        risk_probability, risk_band = self._risk_from_seriousness(
            seriousness_factor, seriousness_level
        )

        return RiskPrediction(
            risk_probability=risk_probability,
            risk_band=risk_band,
            model_version=model_payload.get("model_version", "model-unknown"),
            top_factors=factors,
            scoring_mode="supervised",
            seriousness_factor=seriousness_factor,
            seriousness_level=seriousness_level,
            assessment_recommendation=assessment_recommendation,
        )

    # Convert transformed feature names (e.g. num__/cat__) to human-friendly labels.
    @staticmethod
    def _humanize_feature_name(name: str) -> str:
        aliases = {
            "age_years": "age_years",
            "days_since_admission": "days_since_admission",
            "medication_count": "medications_count",
            "current_prescription_count": "current_prescription_count",
            "allergy_count": "allergy_count",
            "high_risk_allergy_count": "high_risk_allergy_count",
            "history_count": "medical_history_count",
            "high_risk_history_count": "high_risk_history_count",
            "past_history_count": "past_medical_history_count",
            "high_risk_prescription_count": "high_risk_prescription_count",
        }
        if name.startswith("num__"):
            raw = name.replace("num__", "", 1)
            return aliases.get(raw, raw)
        if name.startswith("cat__"):
            raw = name.replace("cat__", "", 1)
            if "_" in raw:
                field, value = raw.split("_", 1)
                return f"{aliases.get(field, field)}={value}"
            return aliases.get(raw, raw)
        return aliases.get(name, name)

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
        configured_version = str(getattr(settings, "RISK_MODEL_VERSION", "") or "").strip()
        configured_filename = (
            f"risk_model_{configured_version}.joblib" if configured_version else ""
        )

        def _artifact_sort_key(path: Path) -> tuple[int, int, float]:
            # Prefer higher semantic version (risk-v3 > risk-v2 > risk-v1), then newer timestamp.
            m = re.match(r"risk_model_risk-v(\d+)-(\d+)\.joblib$", path.name)
            if m:
                return (int(m.group(1)), int(m.group(2)), float(path.stat().st_mtime))
            return (0, 0, float(path.stat().st_mtime))

        ordered_files = sorted(model_files, key=_artifact_sort_key, reverse=True)
        if configured_filename:
            configured_paths = [p for p in ordered_files if p.name == configured_filename]
            other_paths = [p for p in ordered_files if p.name != configured_filename]
            ordered_files = configured_paths + other_paths

        for model_path in ordered_files:
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
