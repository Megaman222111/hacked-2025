export interface Patient {
  id: string
  firstName: string
  lastName: string
  dateOfBirth: string
  gender: string
  bloodType: string
  nfcId: string
  status: "active" | "discharged" | "critical"
  room: string
  admissionDate: string
  allergies: string[]
  primaryDiagnosis: string
  insuranceProvider?: string
  insuranceId?: string
  useAlbertaHealthCard?: boolean
  albertaHealthCardNumber?: string
  emergencyContact: {
    name: string
    relationship: string
    phone: string
  }
  medications: {
    name: string
    dosage: string
    frequency: string
  }[]
  currentPrescriptions?: string[]
  medicalHistory: string[]
  pastMedicalHistory?: string[]
  importantTestResults?: string
  notes: string[]
  /** Historical BP: { date, systolic, diastolic } */
  historicalBloodPressure?: { date: string; systolic?: number; diastolic?: number }[]
  /** Historical HR: { date, bpm } */
  historicalHeartRate?: { date: string; bpm?: number }[]
  /** Historical weight: { date, valueKg } or { date, value, unit } */
  historicalBodyWeight?: { date: string; valueKg?: number; value?: number; unit?: string }[]
  /** Family history: { condition, relation } */
  familyHistory?: { condition?: string; relation?: string }[]
}

import { getAccessToken } from "./auth"

const API_BASE_URL =
  process.env.NEXT_PUBLIC_DJANGO_API_BASE_URL ||
  process.env.DJANGO_API_BASE_URL ||
  "http://127.0.0.1:8000"

async function fetchJson<T>(path: string, init?: RequestInit): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...((init?.headers as Record<string, string>) ?? {}),
  }
  const token = getAccessToken()
  if (token) headers.Authorization = `Bearer ${token}`

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    cache: "no-store",
    headers,
  })

  if (!response.ok) {
    throw new Error(`API request failed (${response.status}): ${path}`)
  }

  return (await response.json()) as T
}

export async function getPatients(): Promise<Patient[]> {
  return fetchJson<Patient[]>("/api/patients/")
}

export async function getPatientById(patientId: string): Promise<Patient | null> {
  try {
    return await fetchJson<Patient>(`/api/patients/${encodeURIComponent(patientId)}/`)
  } catch {
    return null
  }
}

/** Get patient by NFC tag ID (for edit page when tag is scanned). */
export async function getPatientByNfcId(nfcId: string): Promise<Patient | null> {
  try {
    return await fetchJson<Patient>(
      `/api/patients/by-nfc/${encodeURIComponent(nfcId.trim())}/`
    )
  } catch {
    return null
  }
}

/** Risk score from /api/patients/risk-score/ */
export interface PatientRiskScore {
  riskBand: "low" | "medium" | "high"
  riskProbability: number
  modelVersion: string
  topFactors: { feature: string; direction: string; contribution: number }[]
  scoringMode: "heuristic" | "supervised"
  seriousnessFactor: number
  seriousnessLevel: "low" | "moderate" | "high" | "critical"
  assessmentRecommendation: string
}

/** Normalize risk score response (camelCase + defaults for seriousness). */
function normalizePatientRiskScore(raw: Record<string, unknown>): PatientRiskScore {
  const get = (camel: string, snake: string) =>
    (raw[camel] ?? raw[snake]) as unknown
  const band = (get("riskBand", "risk_band") as string) || "low"
  const prob = Number(get("riskProbability", "risk_probability")) || 0
  let seriousnessFactor = Number(get("seriousnessFactor", "seriousness_factor"))
  let seriousnessLevel = String(get("seriousnessLevel", "seriousness_level") || "").toLowerCase()
  const assessmentRecommendation = (
    get("assessmentRecommendation", "assessment_recommendation") != null
      ? String(get("assessmentRecommendation", "assessment_recommendation")).trim()
      : ""
  )

  if (Number.isNaN(seriousnessFactor) || seriousnessFactor < 0 || seriousnessFactor > 100) {
    seriousnessFactor = Math.round(prob * 100 * 10) / 10
  }
  if (!["low", "moderate", "high", "critical"].includes(seriousnessLevel)) {
    if (band === "high") seriousnessLevel = "high"
    else if (band === "medium") seriousnessLevel = "moderate"
    else seriousnessLevel = "low"
  }
  const fallbackRecommendation =
    seriousnessLevel === "critical"
      ? "Immediate bedside assessment (target: within 15 minutes)."
      : seriousnessLevel === "high"
        ? "Urgent clinician assessment (target: within 30 minutes)."
        : seriousnessLevel === "moderate"
          ? "Priority reassessment and monitoring (target: within 4 hours)."
          : "Routine monitoring; reassess on any status change."

  return {
    riskBand: (band as "low" | "medium" | "high") || "low",
    riskProbability: prob,
    modelVersion: String(get("modelVersion", "model_version") ?? "unknown"),
    topFactors: Array.isArray(raw.topFactors)
      ? raw.topFactors
      : Array.isArray(raw.top_factors)
        ? raw.top_factors
        : [],
    scoringMode: (get("scoringMode", "scoring_mode") as string) || "heuristic",
    seriousnessFactor,
    seriousnessLevel: seriousnessLevel as "low" | "moderate" | "high" | "critical",
    assessmentRecommendation: assessmentRecommendation || fallbackRecommendation,
  }
}

/** Get risk score for a patient (trained model or heuristic). */
export async function getPatientRiskScore(patientId: string): Promise<PatientRiskScore> {
  const res = await fetch(`${API_BASE_URL}/api/patients/risk-score/`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(getAccessToken() ? { Authorization: `Bearer ${getAccessToken()}` } : {}),
    },
    body: JSON.stringify({ patient_id: patientId }),
    cache: "no-store",
  })
  const body = await res.json().catch(() => ({})) as Record<string, unknown>
  if (!res.ok) {
    const message =
      typeof body.detail === "string" ? body.detail : `Risk score failed (${res.status})`
    throw new Error(message)
  }
  return normalizePatientRiskScore(body)
}

/** Get AI-generated clinical overview for a patient (Ark Labs). */
export async function getPatientAiOverview(patientId: string): Promise<string> {
  const res = await fetch(`${API_BASE_URL}/api/patients/ai-overview/`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(getAccessToken() ? { Authorization: `Bearer ${getAccessToken()}` } : {}),
    },
    body: JSON.stringify({ patient_id: patientId }),
    cache: "no-store",
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) {
    const message =
      typeof body.error === "string"
        ? body.error
        : typeof body.detail === "string"
          ? body.detail
          : `AI overview failed (${res.status})`
    throw new Error(message)
  }
  return typeof body.overview === "string" ? body.overview : ""
}

/** Look up patient by NFC tag id read from Arduino. tagId must come from the reader; backend only returns patients that exist for that nfc_id. */
export async function scanNfcTag(tagId: string): Promise<Patient | null> {
  try {
    const result = await fetchJson<{ patient: Patient }>("/api/nfc/scan/", {
      method: "POST",
      body: JSON.stringify({ tag_id: tagId }),
    })
    return result.patient
  } catch {
    return null
  }
}

/** Create a patient linked to an NFC tag (minimal or full payload). */
export async function createPatient(data: {
  nfcId: string
  firstName: string
  lastName: string
  room?: string
  dateOfBirth?: string
  gender?: string
  bloodType?: string
  status?: string
  admissionDate?: string
  allergies?: string[]
  primaryDiagnosis?: string
  insuranceProvider?: string
  insuranceId?: string
  emergencyContact?: Patient["emergencyContact"]
  medications?: Patient["medications"]
  currentPrescriptions?: string[]
  medicalHistory?: string[]
  pastMedicalHistory?: string[]
  importantTestResults?: string
  useAlbertaHealthCard?: boolean
  albertaHealthCardNumber?: string
  notes?: string[]
  historicalBloodPressure?: { date: string; systolic?: number; diastolic?: number }[]
  historicalHeartRate?: { date: string; bpm?: number }[]
  historicalBodyWeight?: { date: string; valueKg?: number; value?: number; unit?: string }[]
  familyHistory?: { condition?: string; relation?: string }[]
}): Promise<Patient> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  }
  const token = getAccessToken()
  if (token) headers.Authorization = `Bearer ${token}`

  const res = await fetch(`${API_BASE_URL}/api/patients/create/`, {
    method: "POST",
    headers,
    body: JSON.stringify(data),
    cache: "no-store",
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) {
    const message =
      typeof body.detail === "string" ? body.detail : `Failed to add patient (${res.status})`
    throw new Error(message)
  }
  return body as Patient
}

/** Update patient (full or partial). */
export async function updatePatient(
  patientId: string,
  data: Partial<Omit<Patient, "id" | "nfcId">> & { nfcId?: string }
): Promise<Patient> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  }
  const token = getAccessToken()
  if (token) headers.Authorization = `Bearer ${token}`

  const res = await fetch(
    `${API_BASE_URL}/api/patients/${encodeURIComponent(patientId)}/`,
    {
      method: "PATCH",
      headers,
      body: JSON.stringify(data),
      cache: "no-store",
    }
  )
  const body = await res.json().catch(() => ({}))
  if (!res.ok) {
    const message =
      typeof body.detail === "string" ? body.detail : `Failed to update (${res.status})`
    throw new Error(message)
  }
  return body as Patient
}
