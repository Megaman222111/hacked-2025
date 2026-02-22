# TriageID

*Medical emergency information at a tap.*

![20260222_011214 (1)](https://github.com/user-attachments/assets/4cffee80-0b79-4c1d-8c47-6fb63f5d76e9)
![20260222_011007 (1)](https://github.com/user-attachments/assets/83ec22a7-c06e-4dbc-b5a3-87264853c931)

## What it does

- **NFC bracelet + hub:** Patient wears a bracelet with a unique 15-character User ID. When tapped on the NFC scanner hub, the hub sends the ID over serial to the dashboard.
- **Doctor portal (web):** Clinics register at-risk patients and assign NFC bracelets. Patient data is stored encrypted; only the User ID lives on the tag (no PHI on the bracelet).
- **EMT dashboard:** Staff connect the NFC hub to their computer, open the dashboard, and tap a bracelet. They see patient info immediately, plus an AI summary and a risk/seriousness score from a trained model, all without on-the-spot rediagnosis.

---

## Project structure

| Path | Description |
|------|-------------|
| **webapp/** | Django API + Next.js frontend + risk model (backend, frontend, train script, artifacts). |
| **arduino_user_interface/** | Arduino (C++) firmware for the NFC hub: PN532 reader, 16x2 LCD, buzzer. Reads/writes User ID at 115200 baud. |
| **3D-print-models/** | STL files for the NFC scanner case and bracelet. |

---

## Tech stack (full project)

| Layer | Stack |
|-------|--------|
| **Hardware** | Arduino Nano, PN532 NFC module, 16x2 LCD, active buzzer; 3D-printed enclosure and bracelet |
| **Backend** | Django 5+, Python 3.11+; SQLite; JWT auth; encrypted patient storage |
| **Risk / AI** | scikit-learn (risk model trained on UCI diabetic dataset); Ark API for AI text overview (proof-of-concept) |
| **Frontend** | Next.js 16, React 19, TypeScript, Tailwind CSS, Radix UI; Web Serial API for NFC hub |
| **Firmware** | Arduino IDE, C++; PN532 (I2C/SPI), LiquidCrystal |

**Web app layout:** `webapp/config/` (Django settings), `webapp/accounts/` (doctor auth), `webapp/nfc_users/` (patients, NFC mapping, API, AI overview), `webapp/risk_scoring/` (features, training, service), `webapp/frontend/` (Next.js app).

---

## How to run the full project

### Prerequisites

- Python 3.11+
- Node.js 20+ and npm
- (Optional) NFC hub connected via USB for dashboard tap-to-read

---

### 1. Web app – Backend (Django)

From the repo root:

```bash
cd webapp
python -m venv .venv
# Windows:
.venv\Scripts\activate
# macOS/Linux:
source .venv/bin/activate

pip install -U pip
pip install -r requirements.txt
```

**Environment:** Create `webapp/.env`:

```env
AI_OVERVIEW_API_KEY=your_ark_api_key
AI_OVERVIEW_BASE_URL=https://api.ark-labs.cloud/api/v1
AI_OVERVIEW_MODEL=your_fast_model_name
```

(Do not wrap values in quotes. Optional if you only need risk scores.)

**Database:**

```bash
python manage.py migrate
```

**Create a doctor user (optional):**

```bash
python manage.py create_doctor doctor@example.com yourpassword --first-name "Doctor" --last-name "User"
```
---

### 2. Web app – Train the risk model

The seriousness/risk score uses a scikit-learn model trained on the UCI diabetic dataset. Run once (or after pulling new code/data):

```bash
# From webapp, with venv activated
python manage.py train_risk_model --min-rows 25 --min-positives 5 --max-rows 50000
```

- Training data: `webapp/risk_scoring/data/diabetic_data.csv`
- Artifacts: `webapp/risk_scoring/artifacts/risk_model_risk-v3-*.joblib`

Custom CSV:

```bash
python manage.py train_risk_model --csv-path /path/to/data.csv --max-rows 10000
```

Check which model is loaded:

```bash
python manage.py shell -c "from risk_scoring.service import RiskScoringService; print(RiskScoringService()._load_latest_model_payload().get('model_version'))"
```

---

### 3. Web app – Frontend (Next.js)

From the repo root:

```bash
cd webapp/frontend
npm install
```

Create `webapp/frontend/.env.local` if needed:

```env
NEXT_PUBLIC_DJANGO_API_BASE_URL=http://127.0.0.1:8000
```

---

### 4. Web app – Run backend and frontend

**Terminal 1 – backend:**

```bash
cd webapp
.venv\Scripts\activate   # Windows
# source .venv/bin/activate   # macOS/Linux
python manage.py runserver
```

**Terminal 2 – frontend:**

```bash
cd webapp/frontend
npm run dev
```

- API: http://127.0.0.1:8000  
- App: http://localhost:3000 (or the port Next.js shows)

---

### 5. NFC hub (Arduino)

- **Hardware:** Arduino Nano, PN532 (I2C), 16x2 LCD (4-bit), active buzzer. Wiring is in `arduino_user_interface/arduino_user_interface.ino`.
- **Library:** [PN532](https://github.com/elechouse/PN532) (e.g. PN532 + PN532_I2C in `Arduino/libraries`).
- **Upload:** Open the `.ino` in Arduino IDE, select board and port, upload.
- **Serial:** 115200 baud; commands `READ` or `WRITE|userid`; hub prints User ID when a tag is read.

---

### 6. Dashboard ↔ hub

In the web dashboard, use **Connect** to attach the hub via the browser’s Web Serial API (port is remembered in cookies). Tap a bracelet; the dashboard gets the User ID and fetches patient data and AI/risk results from the API.

---

## Inspiration and impact

Roughly **370,000 ED patients** experience serious harm from diagnostic errors each year. Early decisions by EMTs and nurses can be life-or-death; lack of prior patient information leads to bias and misdiagnosis. TriageID aims to give emergency staff **ready, rapid access** to curated, at-risk patient information and AI-assisted insights.

---

## What's next

Planned improvements from feedback:

- Run a local LLM for AI overview (instead of external API) for health security.
- Apple Watch / WearOS integration (NFC).
- Integration with NetCare (Alberta Health platform).
- Support multiple NFC bracelets per patient (e.g. if one is lost).

---

## Links
- **DevPost** [DevPost Link](https://devpost.com/software/triageid)
- **Video Demo** [Video Demo](https://youtu.be/T2ygs-dIF6k)
- **Pitch deck:** [TriageID Pitch Deck](https://pitch.com/v/triageid-pitch-deck-6bzk7b)
---

## Contributors

- Megh Mistry  
- Kulgagan Bajwa
- Hasish Karri  
- Hari Mallampalli
