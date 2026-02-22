# End-to-end verification: NFC -> Backend -> Risk model -> Frontend

This doc is the runnable verification flow for the current setup:
- model is trained from CSV data
- model predicts on DB patient records at runtime

## 1. Prepare and train model

```bash
cd webapp
pip install -r requirements.txt
python manage.py train_risk_model --min-rows 25 --min-positives 5 --max-rows 50000
```

Expected training output includes:
- `model_version=risk-v1-...`
- `rows=...`
- `positives=...`
- `metrics=...`

Model artifact is written to `webapp/risk_scoring/artifacts/risk_model_risk-v1-*.joblib`.

## 2. Start backend and validate risk API

Terminal 1:

```bash
cd webapp
python manage.py runserver
```

Terminal 2:

```bash
API_BASE="http://127.0.0.1:8000"

PATIENT_ID=$(
  curl -s "$API_BASE/api/patients/" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d[0]['id'] if d else '')"
)

if [ -z "$PATIENT_ID" ]; then
  echo "No patients found. Create one first."
else
  echo "Using patient_id=$PATIENT_ID"
  curl -s -X POST "$API_BASE/api/patients/risk-score/" \
    -H "Content-Type: application/json" \
    -d "{\"patient_id\":\"$PATIENT_ID\"}" | python3 -m json.tool
fi
```

Expected response shape:
- `riskProbability`
- `riskBand` (`low` | `medium` | `high`)
- `modelVersion`
- `topFactors`
- `scoringMode` (`supervised` when model is loaded, otherwise `heuristic`)

## 3. Start frontend and verify UI

```bash
cd webapp/frontend
npm install
npm run dev
```

Then verify:
1. Scan NFC wristband linked to a patient and confirm overlay shows risk band + probability.
2. Open patient detail page and confirm the same risk block is shown.

## Wiring summary

1. NFC scan:
- Frontend `scanNfcTag(tagId)` posts to `/api/nfc/scan/`.
- Backend `nfc_scan` resolves `Patient` by `nfc_id`.

2. Risk score:
- Frontend `getPatientRiskScore(patient.id)` posts to `/api/patients/risk-score/`.
- Backend `patient_risk_score` calls `RISK_SERVICE.predict(patient)`.

3. Feature + model behavior:
- Runtime features come from DB patient fields mapped by `patient_to_feature_dict`:
  `age_years`, `days_since_admission`, `medication_count`, `history_count`,
  `past_history_count`, `gender` (plus `status` only for heuristic fallback).
- Service loads latest `risk_model_*.joblib` from `risk_scoring/artifacts/`.
- If model load/predict fails, service returns heuristic fallback.
