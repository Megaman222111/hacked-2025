# TriageID Setup On A New Device

This guide gets the full stack working on another machine and makes risk/seriousness scoring consistent.

## 1) Prerequisites

- `git`
- Python 3.11+ (or same version used on your main machine)
- Node.js 20+ and npm

Check quickly:

```bash
python3 --version
node --version
npm --version
```

## 2) Pull The Latest Code

From the repo root:

```bash
git pull
git rev-parse --short HEAD
```

Make sure this matches the commit you expect.

## 3) Backend Setup (Django)

From repo root:

```bash
cd webapp
python3 -m venv .venv
source .venv/bin/activate
pip install -U pip
pip install -r requirements.txt
```

### Environment file

Create `webapp/.env` with:

```env
AI_OVERVIEW_API_KEY=your_ark_api_key
AI_OVERVIEW_BASE_URL=https://api.ark-labs.cloud/api/v1
AI_OVERVIEW_MODEL=your_fast_model_name
```

Notes:

- Do not wrap values in quotes.
- Do not include a leading `.` in the token unless your provider requires it.

### Database

Run migrations:

```bash
python manage.py migrate
```

If you want the exact same patient data as another device, copy the SQLite file from that device:

- source: `webapp/data/nfc_users.sqlite3`
- destination: `webapp/data/nfc_users.sqlite3` (replace local file)

Without copying DB, risk/seriousness values can differ because patient records differ.

### Doctor login user (if needed)

```bash
python manage.py create_doctor doctor@example.com strongpassword --first-name "Doctor" --last-name "User"
```

## 4) Risk Model / Seriousness Setup

Train model on this machine:

```bash
python manage.py train_risk_model --min-rows 25 --min-positives 5 --max-rows 50000
```

This creates an artifact under:

- `webapp/risk_scoring/artifacts/risk_model_risk-v3-*.joblib`

Verify which model is actually loaded:

```bash
python manage.py shell -c "from risk_scoring.service import RiskScoringService; print(RiskScoringService()._load_latest_model_payload().get('model_version'))"
```

Expected: a `risk-v3-...` model.

## 5) Frontend Setup (Next.js)

From repo root:

```bash
cd webapp/frontend
npm install
```

If needed, create `.env.local`:

```env
NEXT_PUBLIC_DJANGO_API_BASE_URL=http://127.0.0.1:8000
```

## 6) Run Backend + Frontend

Terminal 1:

```bash
cd webapp
source .venv/bin/activate
python manage.py runserver
```

Terminal 2:

```bash
cd webapp/frontend
npm run dev
```

## 7) Verify End-To-End

Risk API check:

```bash
API_BASE="http://127.0.0.1:8000"
PATIENT_ID=$(curl -s "$API_BASE/api/patients/" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d[0]['id'] if d else '')")
curl -s -X POST "$API_BASE/api/patients/risk-score/" -H "Content-Type: application/json" -d "{\"patient_id\":\"$PATIENT_ID\"}" | python3 -m json.tool
```

Confirm response includes:

- `modelVersion` (should be `risk-v3-...`)
- `seriousnessFactor`
- `seriousnessLevel`
- `assessmentRecommendation`

## 8) Why Seriousness Differs Across Devices

If one device is different, it is usually one of these:

1. Different patient DB contents (`webapp/data/nfc_users.sqlite3` not copied).
2. Backend not restarted after pull (old code still running).
3. Wrong model loaded (not `risk-v3`).
4. Dependencies not installed in active venv.
5. Frontend hitting the wrong backend URL.

Quick checks:

```bash
cd webapp
source .venv/bin/activate
python manage.py shell -c "from risk_scoring.service import RiskScoringService; print(RiskScoringService()._load_latest_model_payload().get('model_version'))"
python manage.py test nfc_users.tests -v 1
```

## 9) AI Overview Troubleshooting (Ark Labs)

If overview fails:

1. Check `webapp/.env` has valid `AI_OVERVIEW_API_KEY`, `AI_OVERVIEW_BASE_URL`, `AI_OVERVIEW_MODEL`.
2. Restart Django after editing `.env`.
3. Confirm token is valid for your Ark project/model.

## 10) One-Time Team Baseline

For team consistency, everyone should:

1. Use the same commit hash.
2. Use the same DB snapshot (if you expect identical patient scores).
3. Retrain once on that commit or use the committed `risk-v3` artifact.
4. Restart backend after every pull that touches `risk_scoring/` or `nfc_users/`.
