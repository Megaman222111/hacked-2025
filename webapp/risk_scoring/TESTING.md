# How to test risk scoring (CSV-trained model, DB inference)

For full new-machine setup (backend + frontend + env + model consistency), see:
`webapp/SETUP_NEW_DEVICE.md`

All commands assume you are in the `webapp` directory.

## 1. Install dependencies

```bash
cd webapp
pip install -r requirements.txt
```

If you run frontend locally too:

```bash
cd webapp/frontend
npm install
```

## 2. Ensure training CSV exists

Default CSV path:

`webapp/risk_scoring/data/diabetic_data.csv`

Dataset used for supervised training:

- UCI Machine Learning Repository: *Diabetes 130-US hospitals for years 1999-2008*
- DOI: `10.24432/C5230J`
- Label: `readmitted == "<30"` (30-day deterioration/readmission proxy)

Model only uses features available in this app:

- `age_years` (from patient DOB)
- `days_since_admission`
- `medication_count` (from medications list length)
- `current_prescription_count`
- `allergy_count`
- `high_risk_allergy_count`
- `history_count` (from medical history list length)
- `high_risk_history_count`
- `past_history_count` (from past medical history list length)
- `high_risk_prescription_count`
- `gender`

## 3. Train model from CSV

```bash
cd webapp
python manage.py train_risk_model --min-rows 25 --min-positives 5 --max-rows 50000
```

Optional custom CSV path:

```bash
cd webapp
python manage.py train_risk_model --csv-path /absolute/path/to/diabetic_data.csv --max-rows 0
```

Output includes model version, row count, positives, and metrics.
Model artifact is saved in `webapp/risk_scoring/artifacts/risk_model_risk-v3-*.joblib`.

## 4. Test API risk scoring

Start Django:

```bash
cd webapp
python manage.py runserver
```

In another terminal:

```bash
API_BASE="http://127.0.0.1:8000"

PATIENT_ID=$(
  curl -s "$API_BASE/api/patients/" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d[0]['id'] if d else '')"
)

if [ -z "$PATIENT_ID" ]; then
  echo "No patients found. Create one first, then retry."
else
  echo "Using patient_id=$PATIENT_ID"
  curl -s -X POST "$API_BASE/api/patients/risk-score/" \
    -H "Content-Type: application/json" \
    -d "{\"patient_id\":\"$PATIENT_ID\"}" | python3 -m json.tool
fi
```

You should get: `riskBand`, `riskProbability`, `modelVersion`, `topFactors`, `scoringMode`, `seriousnessFactor`, `seriousnessLevel`, `assessmentRecommendation`.

## 5. Full stack check

Backend:

```bash
cd webapp
python manage.py runserver
```

Frontend:

```bash
cd webapp/frontend
npm run dev
```

Open a patient in the UI and verify risk data is displayed.
