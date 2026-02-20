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
  insuranceProvider: string
  insuranceId: string
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
  vitalSigns: {
    heartRate: number
    bloodPressure: string
    temperature: number
    oxygenSaturation: number
  }
  medicalHistory: string[]
  notes: string[]
}

const API_BASE_URL =
  process.env.NEXT_PUBLIC_DJANGO_API_BASE_URL ||
  process.env.DJANGO_API_BASE_URL ||
  "http://127.0.0.1:8000"

async function fetchJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    cache: "no-store",
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
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

export async function scanNfcTag(tagId?: string): Promise<Patient | null> {
  const body = tagId ? { tag_id: tagId } : {}

  try {
    const result = await fetchJson<{ patient: Patient }>("/api/nfc/scan/", {
      method: "POST",
      body: JSON.stringify(body),
    })
    return result.patient
  } catch {
    return null
  }
}
