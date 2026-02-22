"""
REST API for NFC user lookup, create, and Patient API for React frontend.
"""
import json
from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_GET, require_POST, require_http_methods

from .ai_overview import AiOverviewError, build_fallback_overview, generate_ai_overview
from .models import UserProfile, Patient


def _get_user_json(profile):
    return profile.to_api_dict()


def _as_string_list(value):
    if value is None:
        return []
    if isinstance(value, list):
        out = []
        for item in value:
            s = str(item).strip()
            if s and s not in out:
                out.append(s)
        return out
    s = str(value).strip()
    return [s] if s else []


@require_GET
def user_by_id(request, user_id: str):
    """GET /api/users/<user_id>/ – Look up user by NFC user_id."""
    try:
        profile = UserProfile.objects.get(user_id=user_id.strip())
    except UserProfile.DoesNotExist:
        return JsonResponse(
            {"detail": f"No user found for ID '{user_id}'."},
            status=404,
        )
    return JsonResponse(_get_user_json(profile))


@require_GET
def user_list(request):
    """GET /api/users/ – List all users (user_id only for privacy, or full if needed)."""
    profiles = UserProfile.objects.all().order_by("user_id")
    return JsonResponse({
        "users": [p.to_api_dict() for p in profiles],
    })


@csrf_exempt
@require_POST
def user_create(request):
    """
    POST /api/users/ – Create a user.
    Body: JSON with userId (required), firstName, lastName, email, phone, notes.
    """
    try:
        body = json.loads(request.body)
    except json.JSONDecodeError:
        return JsonResponse({"detail": "Invalid JSON."}, status=400)

    user_id = (body.get("userId") or "").strip()[:15]
    if not user_id:
        return JsonResponse({"detail": "userId is required (max 15 characters)."}, status=400)

    if UserProfile.objects.filter(user_id=user_id).exists():
        return JsonResponse(
            {"detail": f"A user with ID '{user_id}' already exists."},
            status=409,
        )

    profile = UserProfile(user_id=user_id)
    profile.set_plain_fields(
        first_name=body.get("firstName", ""),
        last_name=body.get("lastName", ""),
        email=body.get("email", ""),
        phone=body.get("phone", ""),
        notes=body.get("notes", ""),
    )
    profile.save()
    return JsonResponse(_get_user_json(profile), status=201)


# ----- Patient API (React frontend) -----

@require_GET
def patient_list(request):
    """GET /api/patients/ – List all patients."""
    patients = Patient.objects.all().order_by("id")
    return JsonResponse([p.to_api_dict() for p in patients], safe=False)


def _patient_api_dict_from_body(body):
    """Build patient field dict from JSON body (camelCase or snake_case)."""
    def get(key_camel, key_snake=None):
        k = key_snake or key_camel
        return body.get(key_camel) if body.get(key_camel) is not None else body.get(k)
    return {
        "first_name": (get("firstName", "first_name") or "").strip() or None,
        "last_name": (get("lastName", "last_name") or "").strip() or None,
        "date_of_birth": get("dateOfBirth", "date_of_birth") or "",
        "gender": get("gender") or "",
        "blood_type": get("bloodType", "blood_type") or "",
        "status": get("status") or "active",
        "room": get("room") or "",
        "admission_date": get("admissionDate", "admission_date") or "",
        "primary_diagnosis": get("primaryDiagnosis", "primary_diagnosis") or "",
        "insurance_provider": get("insuranceProvider", "insurance_provider") or "",
        "insurance_id": get("insuranceId", "insurance_id") or "",
        "use_alberta_health_card": get("useAlbertaHealthCard", "use_alberta_health_card") if get("useAlbertaHealthCard", "use_alberta_health_card") is not None else None,
        "alberta_health_card_number": get("albertaHealthCardNumber", "alberta_health_card_number") or "",
        "allergies": _as_string_list(get("allergies")),
        "emergency_contact": get("emergencyContact", "emergency_contact") if get("emergencyContact", "emergency_contact") is not None else {},
        "medications": get("medications") if get("medications") is not None else [],
        "current_prescriptions": _as_string_list(get("currentPrescriptions", "current_prescriptions")),
        "medical_history": _as_string_list(get("medicalHistory", "medical_history")),
        "past_medical_history": _as_string_list(get("pastMedicalHistory", "past_medical_history")),
        "important_test_results": (get("importantTestResults", "important_test_results") or "").strip(),
        "notes": get("notes") if get("notes") is not None else [],
        "historical_blood_pressure": get("historicalBloodPressure", "historical_blood_pressure") if get("historicalBloodPressure", "historical_blood_pressure") is not None else None,
        "historical_heart_rate": get("historicalHeartRate", "historical_heart_rate") if get("historicalHeartRate", "historical_heart_rate") is not None else None,
        "historical_body_weight": get("historicalBodyWeight", "historical_body_weight") if get("historicalBodyWeight", "historical_body_weight") is not None else None,
        "family_history": get("familyHistory", "family_history") if get("familyHistory", "family_history") is not None else None,
    }


@require_GET
def patient_by_id(request, patient_id: str):
    """GET /api/patients/<id>/ – Get patient by id."""
    try:
        p = Patient.objects.get(pk=patient_id.strip())
    except Patient.DoesNotExist:
        return JsonResponse(
            {"detail": f"Patient '{patient_id}' not found."},
            status=404,
        )
    return JsonResponse(p.to_api_dict())


@csrf_exempt
@require_http_methods(["PUT", "PATCH"])
def patient_update(request, patient_id: str):
    """PUT/PATCH /api/patients/<id>/ – Update patient (full or partial)."""
    try:
        body = json.loads(request.body) if request.body else {}
    except json.JSONDecodeError:
        return JsonResponse({"detail": "Invalid JSON."}, status=400)

    try:
        p = Patient.objects.get(pk=patient_id.strip())
    except Patient.DoesNotExist:
        return JsonResponse(
            {"detail": f"Patient '{patient_id}' not found."},
            status=404,
        )

    data = _patient_api_dict_from_body(body)
    for key, value in data.items():
        if value is not None:
            setattr(p, key, value)
    p.save()
    return JsonResponse(p.to_api_dict())


@require_GET
def patient_by_nfc(request, nfc_id: str):
    """GET /api/patients/by-nfc/<nfc_id>/ – Get patient by NFC tag id."""
    try:
        p = Patient.objects.get(nfc_id=nfc_id.strip())
    except Patient.DoesNotExist:
        return JsonResponse(
            {"detail": f"No patient mapped to NFC tag '{nfc_id}'."},
            status=404,
        )
    return JsonResponse(p.to_api_dict())


@csrf_exempt
@require_POST
def patient_create(request):
    """
    POST /api/patients/create/ – Create a patient (e.g. when scanning an empty card).
    Body: JSON with nfcId (required), firstName, lastName (required); optional room, etc.
    Uses nfc_id as patient id. Other fields get sensible defaults.
    """
    try:
        body = json.loads(request.body) if request.body else {}
    except json.JSONDecodeError:
        return JsonResponse({"detail": "Invalid JSON."}, status=400)

    nfc_id = (body.get("nfcId") or body.get("nfc_id") or "").strip()[:15]
    first_name = (body.get("firstName") or body.get("first_name") or "").strip()
    last_name = (body.get("lastName") or body.get("last_name") or "").strip()

    if not nfc_id:
        return JsonResponse({"detail": "nfcId is required."}, status=400)
    if not first_name:
        return JsonResponse({"detail": "firstName is required."}, status=400)
    if not last_name:
        return JsonResponse({"detail": "lastName is required."}, status=400)

    if Patient.objects.filter(nfc_id=nfc_id).exists():
        return JsonResponse(
            {"detail": f"A patient is already linked to NFC tag '{nfc_id}'."},
            status=409,
        )

    patient_id = nfc_id
    p = Patient(
        id=patient_id,
        nfc_id=nfc_id,
        first_name=first_name,
        last_name=last_name,
        date_of_birth=body.get("dateOfBirth") or body.get("date_of_birth") or "",
        gender=body.get("gender") or "",
        blood_type=body.get("bloodType") or body.get("blood_type") or "",
        status=body.get("status") or "active",
        room=body.get("room") or "",
        admission_date=body.get("admissionDate") or body.get("admission_date") or "",
        primary_diagnosis=body.get("primaryDiagnosis") or body.get("primary_diagnosis") or "",
        insurance_provider=body.get("insuranceProvider") or body.get("insurance_provider") or "",
        insurance_id=body.get("insuranceId") or body.get("insurance_id") or "",
        use_alberta_health_card=body.get("useAlbertaHealthCard") or body.get("use_alberta_health_card") or False,
        alberta_health_card_number=(body.get("albertaHealthCardNumber") or body.get("alberta_health_card_number") or "").strip()[:32],
        allergies=_as_string_list(body.get("allergies")),
        emergency_contact=body.get("emergencyContact") or body.get("emergency_contact") or {},
        medications=body.get("medications") or [],
        current_prescriptions=_as_string_list(
            body.get("currentPrescriptions") if body.get("currentPrescriptions") is not None else body.get("current_prescriptions")
        ),
        medical_history=_as_string_list(
            body.get("medicalHistory") if body.get("medicalHistory") is not None else body.get("medical_history")
        ),
        past_medical_history=_as_string_list(
            body.get("pastMedicalHistory") if body.get("pastMedicalHistory") is not None else body.get("past_medical_history")
        ),
        important_test_results=(
            body.get("importantTestResults")
            if body.get("importantTestResults") is not None
            else body.get("important_test_results")
        ) or "",
        notes=body.get("notes") or [],
        historical_blood_pressure=body.get("historicalBloodPressure") or body.get("historical_blood_pressure") or [],
        historical_heart_rate=body.get("historicalHeartRate") or body.get("historical_heart_rate") or [],
        historical_body_weight=body.get("historicalBodyWeight") or body.get("historical_body_weight") or [],
        family_history=body.get("familyHistory") or body.get("family_history") or [],
    )
    p.save()
    return JsonResponse(p.to_api_dict(), status=201)


@csrf_exempt
@require_POST
def nfc_scan(request):
    """
    POST /api/nfc/scan/ – Look up patient by NFC tag id from reader.
    Body must include tag_id (the User ID read from the Arduino). Only returns
    patients that exist in the database for that nfc_id.
    """
    try:
        body = json.loads(request.body) if request.body else {}
    except json.JSONDecodeError:
        return JsonResponse({"detail": "Body must be valid JSON."}, status=400)

    tag_id = (body.get("tag_id") or "").strip()
    if not tag_id:
        return JsonResponse(
            {"detail": "tag_id is required. Use the NFC reader to get the User ID."},
            status=400,
        )

    try:
        p = Patient.objects.get(nfc_id=tag_id)
        return JsonResponse({"mode": "nfc-tag", "patient": p.to_api_dict()})
    except Patient.DoesNotExist:
        return JsonResponse(
            {"detail": f"No patient mapped to NFC tag '{tag_id}'."},
            status=404,
        )


@csrf_exempt
@require_POST
def patient_ai_overview(request):
    """
    POST /api/patients/ai-overview/
    Body: JSON with patient_id. Returns AI-generated overview (requires AI_OVERVIEW_API_KEY and AI_OVERVIEW_BASE_URL in .env).
    """
    try:
        body = json.loads(request.body) if request.body else {}
    except json.JSONDecodeError:
        return JsonResponse({"detail": "Invalid JSON."}, status=400)

    patient_id = (body.get("patient_id") or body.get("patientId") or "").strip()
    if not patient_id:
        return JsonResponse({"detail": "patient_id is required."}, status=400)

    try:
        patient = Patient.objects.get(pk=patient_id)
    except Patient.DoesNotExist:
        return JsonResponse({"detail": f"Patient '{patient_id}' not found."}, status=404)

    prediction = None
    try:
        from risk_scoring.service import RiskScoringService
        prediction = RiskScoringService().predict(patient)
    except Exception:
        pass

    try:
        overview = generate_ai_overview(patient, prediction)
        return JsonResponse({"overview": overview or ""})
    except AiOverviewError as e:
        overview = build_fallback_overview(patient, prediction)
        return JsonResponse(
            {
                "overview": overview,
                "source": "fallback",
                "warning": str(e),
            }
        )


@csrf_exempt
@require_POST
def patient_risk_score(request):
    """
    POST /api/patients/risk-score/
    Body: JSON with patient_id. Returns risk band, probability, model version, top factors.
    """
    try:
        body = json.loads(request.body) if request.body else {}
    except json.JSONDecodeError:
        return JsonResponse({"detail": "Invalid JSON."}, status=400)

    patient_id = (body.get("patient_id") or body.get("patientId") or "").strip()
    if not patient_id:
        return JsonResponse({"detail": "patient_id is required."}, status=400)

    try:
        patient = Patient.objects.get(pk=patient_id)
    except Patient.DoesNotExist:
        return JsonResponse({"detail": f"Patient '{patient_id}' not found."}, status=404)

    try:
        from risk_scoring.service import RiskScoringService
        prediction = RiskScoringService().predict(patient)
    except Exception as e:
        return JsonResponse(
            {"detail": f"Risk scoring failed: {e}"},
            status=503,
        )

    return JsonResponse({
        "riskBand": prediction.risk_band,
        "riskProbability": prediction.risk_probability,
        "modelVersion": prediction.model_version,
        "topFactors": prediction.top_factors or [],
        "scoringMode": prediction.scoring_mode,
        "seriousnessFactor": prediction.seriousness_factor,
        "seriousnessLevel": prediction.seriousness_level,
        "assessmentRecommendation": prediction.assessment_recommendation,
    })
