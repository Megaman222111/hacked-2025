"""
User profile keyed by NFC user_id. Sensitive fields stored encrypted in SQLite.
"""
from django.db import models


class UserProfile(models.Model):
    """
    User record keyed by the ID written on their NFC tag (user_id, max 15 chars).
    Sensitive info is encrypted at rest; user_id is not encrypted for lookup.
    """
    user_id = models.CharField(max_length=15, unique=True, db_index=True)
    # Encrypted at rest (stored as base64 ciphertext in DB)
    _first_name = models.TextField(blank=True, default="")
    _last_name = models.TextField(blank=True, default="")
    _email = models.TextField(blank=True, default="")
    _phone = models.TextField(blank=True, default="")
    _notes = models.TextField(blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["user_id"]
        verbose_name = "User (NFC)"
        verbose_name_plural = "Users (NFC)"

    def __str__(self):
        return self.user_id

    @property
    def first_name(self):
        from .encryption import decrypt_value_fernet
        return decrypt_value_fernet(self._first_name) if self._first_name else ""

    @first_name.setter
    def first_name(self, value):
        from .encryption import encrypt_value_fernet
        self._first_name = encrypt_value_fernet((value or "").strip())

    @property
    def last_name(self):
        from .encryption import decrypt_value_fernet
        return decrypt_value_fernet(self._last_name) if self._last_name else ""

    @last_name.setter
    def last_name(self, value):
        from .encryption import encrypt_value_fernet
        self._last_name = encrypt_value_fernet((value or "").strip())

    @property
    def email(self):
        from .encryption import decrypt_value_fernet
        return decrypt_value_fernet(self._email) if self._email else ""

    @email.setter
    def email(self, value):
        from .encryption import encrypt_value_fernet
        self._email = encrypt_value_fernet((value or "").strip())

    @property
    def phone(self):
        from .encryption import decrypt_value_fernet
        return decrypt_value_fernet(self._phone) if self._phone else ""

    @phone.setter
    def phone(self, value):
        from .encryption import encrypt_value_fernet
        self._phone = encrypt_value_fernet((value or "").strip())

    @property
    def notes(self):
        from .encryption import decrypt_value_fernet
        return decrypt_value_fernet(self._notes) if self._notes else ""

    @notes.setter
    def notes(self, value):
        from .encryption import encrypt_value_fernet
        self._notes = encrypt_value_fernet((value or "").strip())

    def set_plain_fields(self, first_name="", last_name="", email="", phone="", notes=""):
        self.first_name = first_name
        self.last_name = last_name
        self.email = email
        self.phone = phone
        self.notes = notes

    def to_api_dict(self):
        return {
            "userId": self.user_id,
            "firstName": self.first_name,
            "lastName": self.last_name,
            "email": self.email,
            "phone": self.phone,
            "notes": self.notes,
            "createdAt": self.created_at.isoformat() if self.created_at else None,
            "updatedAt": self.updated_at.isoformat() if self.updated_at else None,
        }


class Patient(models.Model):
    """
    Patient record for TriageID dashboard. Matches the React Patient interface.
    nfc_id is the value stored on the NFC tag (max 15 chars from PN532).
    Sensitive PII/PHI is encrypted at rest with AES-256-GCM; id and nfc_id remain plain for lookups.
    """
    id = models.CharField(max_length=64, primary_key=True)
    nfc_id = models.CharField(max_length=15, unique=True, db_index=True)
    status = models.CharField(max_length=32)  # active | discharged | critical
    use_alberta_health_card = models.BooleanField(default=False)
    # Encrypted at rest (AES-256-GCM); stored as base64 ciphertext
    _first_name = models.TextField(blank=True, default="")
    _last_name = models.TextField(blank=True, default="")
    _date_of_birth = models.TextField(blank=True, default="")
    _gender = models.TextField(blank=True, default="")
    _blood_type = models.TextField(blank=True, default="")
    _room = models.TextField(blank=True, default="")
    _admission_date = models.TextField(blank=True, default="")
    _primary_diagnosis = models.TextField(blank=True, default="")
    _insurance_provider = models.TextField(blank=True, default="")
    _insurance_id = models.TextField(blank=True, default="")
    _alberta_health_card_number = models.TextField(blank=True, default="")
    _emergency_contact = models.TextField(blank=True, default="")
    _allergies = models.TextField(blank=True, default="")
    _medications = models.TextField(blank=True, default="")
    _current_prescriptions = models.TextField(blank=True, default="")
    _medical_history = models.TextField(blank=True, default="")
    _past_medical_history = models.TextField(blank=True, default="")
    _important_test_results = models.TextField(blank=True, default="")
    _notes = models.TextField(blank=True, default="")
    _historical_blood_pressure = models.TextField(blank=True, default="")
    _historical_heart_rate = models.TextField(blank=True, default="")
    _historical_body_weight = models.TextField(blank=True, default="")
    _family_history = models.TextField(blank=True, default="")

    class Meta:
        ordering = ["id"]

    def __str__(self):
        return f"{self.first_name} {self.last_name} ({self.nfc_id})"

    # ---- Encrypted properties (AES-256-GCM) ----
    def _get_enc(self, name):
        from .encryption import decrypt_value
        val = getattr(self, name, None)
        return decrypt_value(val) if val else ""

    def _set_enc(self, name, value):
        from .encryption import encrypt_value
        setattr(self, name, encrypt_value((value or "").strip()))

    def _get_json(self, name, default=None):
        from .encryption import decrypt_json
        val = getattr(self, name, None)
        if not val:
            return default if default is not None else {}
        out = decrypt_json(val)
        if out is None:
            return default if default is not None else {}
        if default is not None and type(out) is not type(default):
            return default
        return out

    def _set_json(self, name, value):
        from .encryption import encrypt_json
        if value is None:
            value = {} if "contact" in name else []
        setattr(self, name, encrypt_json(value) if value else "")

    @property
    def first_name(self):
        return self._get_enc("_first_name")

    @first_name.setter
    def first_name(self, value):
        self._set_enc("_first_name", value)

    @property
    def last_name(self):
        return self._get_enc("_last_name")

    @last_name.setter
    def last_name(self, value):
        self._set_enc("_last_name", value)

    @property
    def date_of_birth(self):
        return self._get_enc("_date_of_birth")

    @date_of_birth.setter
    def date_of_birth(self, value):
        self._set_enc("_date_of_birth", value)

    @property
    def gender(self):
        return self._get_enc("_gender")

    @gender.setter
    def gender(self, value):
        self._set_enc("_gender", value)

    @property
    def blood_type(self):
        return self._get_enc("_blood_type")

    @blood_type.setter
    def blood_type(self, value):
        self._set_enc("_blood_type", value)

    @property
    def room(self):
        return self._get_enc("_room")

    @room.setter
    def room(self, value):
        self._set_enc("_room", value)

    @property
    def admission_date(self):
        return self._get_enc("_admission_date")

    @admission_date.setter
    def admission_date(self, value):
        self._set_enc("_admission_date", value)

    @property
    def primary_diagnosis(self):
        return self._get_enc("_primary_diagnosis")

    @primary_diagnosis.setter
    def primary_diagnosis(self, value):
        self._set_enc("_primary_diagnosis", value)

    @property
    def insurance_provider(self):
        return self._get_enc("_insurance_provider")

    @insurance_provider.setter
    def insurance_provider(self, value):
        self._set_enc("_insurance_provider", value)

    @property
    def insurance_id(self):
        return self._get_enc("_insurance_id")

    @insurance_id.setter
    def insurance_id(self, value):
        self._set_enc("_insurance_id", value)

    @property
    def alberta_health_card_number(self):
        return self._get_enc("_alberta_health_card_number")

    @alberta_health_card_number.setter
    def alberta_health_card_number(self, value):
        self._set_enc("_alberta_health_card_number", value)

    @property
    def emergency_contact(self):
        return self._get_json("_emergency_contact", {})

    @emergency_contact.setter
    def emergency_contact(self, value):
        self._set_json("_emergency_contact", value)

    @property
    def allergies(self):
        return self._get_json("_allergies", []) or []

    @allergies.setter
    def allergies(self, value):
        self._set_json("_allergies", value if isinstance(value, list) else [])

    @property
    def medications(self):
        return self._get_json("_medications", []) or []

    @medications.setter
    def medications(self, value):
        self._set_json("_medications", value if isinstance(value, list) else [])

    @property
    def current_prescriptions(self):
        return self._get_json("_current_prescriptions", []) or []

    @current_prescriptions.setter
    def current_prescriptions(self, value):
        self._set_json("_current_prescriptions", value if isinstance(value, list) else [])

    @property
    def medical_history(self):
        return self._get_json("_medical_history", []) or []

    @medical_history.setter
    def medical_history(self, value):
        self._set_json("_medical_history", value if isinstance(value, list) else [])

    @property
    def past_medical_history(self):
        return self._get_json("_past_medical_history", []) or []

    @past_medical_history.setter
    def past_medical_history(self, value):
        self._set_json("_past_medical_history", value if isinstance(value, list) else [])

    @property
    def important_test_results(self):
        return self._get_enc("_important_test_results")

    @important_test_results.setter
    def important_test_results(self, value):
        self._set_enc("_important_test_results", value)

    @property
    def notes(self):
        return self._get_json("_notes", []) or []

    @notes.setter
    def notes(self, value):
        self._set_json("_notes", value if isinstance(value, list) else [])

    @property
    def historical_blood_pressure(self):
        return self._get_json("_historical_blood_pressure", []) or []

    @historical_blood_pressure.setter
    def historical_blood_pressure(self, value):
        self._set_json("_historical_blood_pressure", value if isinstance(value, list) else [])

    @property
    def historical_heart_rate(self):
        return self._get_json("_historical_heart_rate", []) or []

    @historical_heart_rate.setter
    def historical_heart_rate(self, value):
        self._set_json("_historical_heart_rate", value if isinstance(value, list) else [])

    @property
    def historical_body_weight(self):
        return self._get_json("_historical_body_weight", []) or []

    @historical_body_weight.setter
    def historical_body_weight(self, value):
        self._set_json("_historical_body_weight", value if isinstance(value, list) else [])

    @property
    def family_history(self):
        return self._get_json("_family_history", []) or []

    @family_history.setter
    def family_history(self, value):
        self._set_json("_family_history", value if isinstance(value, list) else [])

    def to_api_dict(self):
        return {
            "id": self.id,
            "firstName": self.first_name,
            "lastName": self.last_name,
            "dateOfBirth": self.date_of_birth,
            "gender": self.gender,
            "bloodType": self.blood_type,
            "nfcId": self.nfc_id,
            "status": self.status,
            "room": self.room,
            "admissionDate": self.admission_date,
            "allergies": self.allergies or [],
            "primaryDiagnosis": self.primary_diagnosis,
            "insuranceProvider": self.insurance_provider or "",
            "insuranceId": self.insurance_id or "",
            "useAlbertaHealthCard": self.use_alberta_health_card,
            "albertaHealthCardNumber": self.alberta_health_card_number or "",
            "emergencyContact": self.emergency_contact or {},
            "medications": self.medications or [],
            "currentPrescriptions": self.current_prescriptions or [],
            "medicalHistory": self.medical_history or [],
            "pastMedicalHistory": self.past_medical_history or [],
            "importantTestResults": self.important_test_results or "",
            "notes": self.notes or [],
            "historicalBloodPressure": self.historical_blood_pressure or [],
            "historicalHeartRate": self.historical_heart_rate or [],
            "historicalBodyWeight": self.historical_body_weight or [],
            "familyHistory": self.family_history or [],
        }
