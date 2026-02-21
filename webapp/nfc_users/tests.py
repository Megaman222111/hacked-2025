import json

from django.test import Client, TestCase

from nfc_users.models import Patient


def _create_patient(
    *,
    patient_id: str,
    nfc_id: str,
    admission_date: str,
    status: str = "active",
) -> Patient:
    p = Patient(
        id=patient_id,
        nfc_id=nfc_id,
        status=status,
        use_alberta_health_card=False,
    )
    p.first_name = "Test"
    p.last_name = "Patient"
    p.date_of_birth = "1980-01-01"
    p.gender = "female"
    p.blood_type = "O+"
    p.room = "A-101"
    p.admission_date = admission_date
    p.primary_diagnosis = "Test diagnosis"
    p.insurance_provider = ""
    p.insurance_id = ""
    p.allergies = []
    p.emergency_contact = {}
    p.medications = ["med-a"]
    p.current_prescriptions = []
    p.medical_history = ["history-a"]
    p.past_medical_history = ["past-a"]
    p.notes = []
    p.save()
    return p


class RiskApiFlowTests(TestCase):
    def test_nfc_scan_then_risk_score(self):
        patient = _create_patient(
            patient_id="FLOW-001",
            nfc_id="FLOW-001",
            admission_date="2026-02-10",
            status="active",
        )
        client = Client()

        scan_resp = client.post(
            "/api/nfc/scan/",
            data=json.dumps({"tag_id": patient.nfc_id}),
            content_type="application/json",
        )
        self.assertEqual(scan_resp.status_code, 200)
        scan_body = scan_resp.json()
        self.assertEqual(scan_body.get("patient", {}).get("id"), patient.id)

        risk_resp = client.post(
            "/api/patients/risk-score/",
            data=json.dumps({"patient_id": patient.id}),
            content_type="application/json",
        )
        self.assertEqual(risk_resp.status_code, 200)
        risk_body = risk_resp.json()
        self.assertIn(risk_body.get("riskBand"), {"low", "medium", "high"})
        self.assertTrue(0 <= float(risk_body.get("riskProbability", -1)) <= 1)
        self.assertIn(risk_body.get("scoringMode"), {"heuristic", "supervised"})
