"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import {
  ArrowLeft,
  Nfc,
  ShieldCheck,
  Phone,
  User,
  Pill,
  FileText,
  AlertCircle,
  Calendar,
  Building,
  CreditCard,
  Activity,
  Loader2,
  Heart,
  Scale,
  Users,
} from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import type { Patient, PatientRiskScore } from "@/lib/api"
import { getPatientRiskScore } from "@/lib/api"

function getStatusColor(status: string) {
  switch (status) {
    case "active":
      return "bg-primary/10 text-primary border-primary/20"
    case "critical":
      return "bg-destructive/10 text-destructive border-destructive/20"
    case "discharged":
      return "bg-muted text-muted-foreground border-border"
    default:
      return "bg-muted text-muted-foreground border-border"
  }
}

function getInitials(first: string, last: string) {
  return `${first[0]}${last[0]}`
}

function parseLocalDate(dateStr: string) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr)
  if (m) {
    const year = Number(m[1])
    const month = Number(m[2]) - 1
    const day = Number(m[3])
    return new Date(year, month, day)
  }
  return new Date(dateStr)
}

function getSeriousnessColor(level: string) {
  switch (level) {
    case "critical":
      return "border-destructive/40 bg-destructive/10 text-destructive"
    case "high":
      return "border-rose-500/40 bg-rose-500/10 text-rose-600"
    case "moderate":
      return "border-amber-500/40 bg-amber-500/10 text-amber-600"
    default:
      return "border-primary/40 bg-primary/10 text-primary"
  }
}

function formatDate(dateStr: string) {
  return parseLocalDate(dateStr).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  })
}

function formatTableDate(dateStr: string) {
  if (!dateStr) return "—"
  const d = parseLocalDate(dateStr)
  return isNaN(d.getTime()) ? dateStr : d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
}

function getAge(dob: string) {
  const today = new Date()
  const birth = parseLocalDate(dob)
  let age = today.getFullYear() - birth.getFullYear()
  const m = today.getMonth() - birth.getMonth()
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) {
    age--
  }
  return age
}

export function PatientDetail({ patient }: { patient: Patient }) {
  const [riskScore, setRiskScore] = useState<PatientRiskScore | null>(null)
  const [riskScoreLoading, setRiskScoreLoading] = useState(true)
  const [riskScoreError, setRiskScoreError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setRiskScoreLoading(true)
    setRiskScoreError(null)
    getPatientRiskScore(patient.id)
      .then((data) => {
        if (!cancelled) {
          setRiskScore(data)
          setRiskScoreError(null)
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setRiskScoreError(err instanceof Error ? err.message : "Failed to load")
          setRiskScore(null)
        }
      })
      .finally(() => {
        if (!cancelled) setRiskScoreLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [patient.id])

  return (
    <div className="flex flex-col gap-6">
      {/* Back button */}
      <div>
        <Button variant="ghost" size="sm" className="gap-2" asChild>
          <Link href="/dashboard">
            <ArrowLeft className="h-4 w-4" />
            Back to Patients
          </Link>
        </Button>
      </div>

      {/* Patient header */}
      <div className="flex flex-col gap-4 rounded-xl border border-border bg-card p-6 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-accent text-xl font-bold text-accent-foreground">
            {getInitials(patient.firstName, patient.lastName)}
          </div>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold font-[family-name:var(--font-heading)] text-foreground">
                {patient.firstName} {patient.lastName}
              </h1>
              <Badge
                variant="outline"
                className={`capitalize ${getStatusColor(patient.status)}`}
              >
                {patient.status}
              </Badge>
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
              <span className="flex items-center gap-1">
                <Nfc className="h-3.5 w-3.5" />
                {patient.nfcId}
              </span>
              <span>ID: {patient.id}</span>
              <span>{patient.gender}, {getAge(patient.dateOfBirth)} yrs</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 rounded-lg bg-primary/5 px-4 py-2">
          <ShieldCheck className="h-4 w-4 text-primary" />
          <span className="text-sm font-medium text-primary">NFC Verified</span>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Left column */}
        <div className="flex flex-col gap-6">
          {/* Risk score */}
          <div className="rounded-xl border border-border bg-card p-6">
            <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold font-[family-name:var(--font-heading)] text-foreground">
              <Activity className="h-5 w-5 text-primary" />
              Seriousness
            </h2>
            {riskScoreLoading && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Calculating…
              </div>
            )}
            {!riskScoreLoading && riskScore && (
              <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge
                    variant="outline"
                    className={`capitalize ${getSeriousnessColor(riskScore.seriousnessLevel ?? "low")}`}
                  >
                    {riskScore.seriousnessLevel ?? "low"}
                  </Badge>
                  <span className="text-sm text-muted-foreground">
                    {(riskScore.seriousnessFactor ?? riskScore.riskProbability * 100).toFixed(1)}/100 seriousness
                  </span>
                  <span className="text-xs text-muted-foreground">
                    ({riskScore.scoringMode ?? "heuristic"})
                  </span>
                </div>
                <p className="text-xs text-muted-foreground">
                  {riskScore.assessmentRecommendation ?? "—"}
                </p>
                {(riskScore.topFactors?.length ?? 0) > 0 && (
                  <p className="text-xs text-muted-foreground">
                    Top factors:{" "}
                    {(riskScore.topFactors ?? [])
                      .slice(0, 5)
                      .map(
                        (f) =>
                          `${String(f?.feature ?? "")} (${(f?.contribution ?? 0) >= 0 ? "+" : ""}${Number(f?.contribution ?? 0).toFixed(3)})`
                      )
                      .join(", ")}
                  </p>
                )}
                <p className="text-xs text-muted-foreground">
                  Model: {riskScore.modelVersion ?? "unknown"}
                </p>
              </div>
            )}
            {!riskScoreLoading && !riskScore && riskScoreError && (
              <p className="text-sm text-destructive">{riskScoreError}</p>
            )}
          </div>

          {/* Personal information */}
          <div className="rounded-xl border border-border bg-card p-6">
            <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold font-[family-name:var(--font-heading)] text-foreground">
              <User className="h-5 w-5 text-primary" />
              Personal Information
            </h2>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-xs text-muted-foreground">Full Name</p>
                <p className="text-sm font-medium text-foreground">
                  {patient.firstName} {patient.lastName}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Date of Birth</p>
                <p className="text-sm font-medium text-foreground">
                  {formatDate(patient.dateOfBirth)}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Gender</p>
                <p className="text-sm font-medium text-foreground">{patient.gender}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Blood Type</p>
                <p className="text-sm font-bold text-primary">{patient.bloodType}</p>
              </div>
            </div>

            <Separator className="my-4" />

            <div className="flex items-start gap-3">
              <Calendar className="mt-0.5 h-4 w-4 text-muted-foreground" />
              <div>
                <p className="text-xs text-muted-foreground">Admission Date</p>
                <p className="text-sm font-medium text-foreground">
                  {formatDate(patient.admissionDate)}
                </p>
              </div>
            </div>
            <div className="mt-4">
              <p className="text-xs text-muted-foreground">Primary Diagnosis</p>
              <p className="text-sm font-medium text-foreground">
                {patient.primaryDiagnosis || "Not specified"}
              </p>
            </div>
            {(patient.importantTestResults ?? "").trim() && (
              <div className="mt-4">
                <p className="text-xs text-muted-foreground">Important Test Results</p>
                <p className="text-sm text-foreground whitespace-pre-wrap">
                  {patient.importantTestResults}
                </p>
              </div>
            )}
          </div>

          {/* Allergies */}
          <div className="rounded-xl border border-border bg-card p-6">
            <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold font-[family-name:var(--font-heading)] text-foreground">
              <AlertCircle className="h-5 w-5 text-destructive" />
              Allergies
            </h2>
            {patient.allergies.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {patient.allergies.map((allergy) => (
                  <Badge
                    key={allergy}
                    variant="outline"
                    className="border-destructive/20 bg-destructive/5 text-destructive"
                  >
                    {allergy}
                  </Badge>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No known allergies</p>
            )}
          </div>

          {/* Emergency contact */}
          <div className="rounded-xl border border-border bg-card p-6">
            <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold font-[family-name:var(--font-heading)] text-foreground">
              <Phone className="h-5 w-5 text-primary" />
              Emergency Contact
            </h2>
            <div className="flex flex-col gap-3">
              <div>
                <p className="text-xs text-muted-foreground">Name</p>
                <p className="text-sm font-medium text-foreground">
                  {patient.emergencyContact.name}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Relationship</p>
                <p className="text-sm font-medium text-foreground">
                  {patient.emergencyContact.relationship}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Phone</p>
                <p className="text-sm font-medium text-foreground">
                  {patient.emergencyContact.phone}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Right column */}
        <div className="flex flex-col gap-6">
          {/* Medications */}
          <div className="rounded-xl border border-border bg-card p-6">
            <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold font-[family-name:var(--font-heading)] text-foreground">
              <Pill className="h-5 w-5 text-primary" />
              Current Medications
            </h2>
            <div className="flex flex-col gap-3">
              {(patient.medications ?? []).map((med, index) => (
                <div
                  key={index}
                  className="flex items-center justify-between rounded-lg bg-muted/50 p-3"
                >
                  <div>
                    <p className="text-sm font-medium text-foreground">{med.name}</p>
                    <p className="text-xs text-muted-foreground">{med.frequency}</p>
                  </div>
                  <Badge variant="secondary">{med.dosage}</Badge>
                </div>
              ))}
            </div>
          </div>

          {/* Insurance (optional) */}
          <div className="rounded-xl border border-border bg-card p-6">
            <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold font-[family-name:var(--font-heading)] text-foreground">
              <CreditCard className="h-5 w-5 text-primary" />
              Insurance
            </h2>
            <div className="flex flex-col gap-3">
              {patient.useAlbertaHealthCard ? (
                <div className="flex flex-col gap-1">
                  <p className="text-sm font-medium text-foreground">Alberta Health Card</p>
                  {patient.albertaHealthCardNumber && (
                    <p className="text-sm text-muted-foreground">{patient.albertaHealthCardNumber}</p>
                  )}
                </div>
              ) : (patient.insuranceProvider || patient.insuranceId) ? (
                <>
                  {patient.insuranceProvider && (
                    <div className="flex items-start gap-3">
                      <Building className="mt-0.5 h-4 w-4 text-muted-foreground" />
                      <div>
                        <p className="text-xs text-muted-foreground">Provider</p>
                        <p className="text-sm font-medium text-foreground">{patient.insuranceProvider}</p>
                      </div>
                    </div>
                  )}
                  {patient.insuranceId && (
                    <div className="flex items-start gap-3">
                      <CreditCard className="mt-0.5 h-4 w-4 text-muted-foreground" />
                      <div>
                        <p className="text-xs text-muted-foreground">Policy ID</p>
                        <p className="text-sm font-medium text-foreground">{patient.insuranceId}</p>
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <p className="text-sm text-muted-foreground">No insurance on file</p>
              )}
            </div>
          </div>

          {/* Current prescriptions */}
          {(patient.currentPrescriptions?.length ?? 0) > 0 && (
            <div className="rounded-xl border border-border bg-card p-6">
              <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold font-[family-name:var(--font-heading)] text-foreground">
                <Pill className="h-5 w-5 text-primary" />
                Current Prescriptions
              </h2>
              <ul className="flex flex-col gap-2">
                {(patient.currentPrescriptions ?? []).map((item, index) => (
                  <li key={index} className="rounded-lg bg-muted/50 px-3 py-2 text-sm text-foreground">{item}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Medical history */}
          <div className="rounded-xl border border-border bg-card p-6">
            <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold font-[family-name:var(--font-heading)] text-foreground">
              <FileText className="h-5 w-5 text-primary" />
              Medical History
            </h2>
            <ul className="flex flex-col gap-2">
              {(patient.medicalHistory ?? []).map((item, index) => (
                <li
                  key={index}
                  className="flex items-start gap-2 text-sm text-foreground"
                >
                  <span className="mt-2 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-primary" />
                  {item}
                </li>
              ))}
            </ul>
          </div>

          {/* Past medical history */}
          {(patient.pastMedicalHistory?.length ?? 0) > 0 && (
            <div className="rounded-xl border border-border bg-card p-6">
              <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold font-[family-name:var(--font-heading)] text-foreground">
                <FileText className="h-5 w-5 text-primary" />
                Past Medical History
              </h2>
              <ul className="flex flex-col gap-2">
                {(patient.pastMedicalHistory ?? []).map((item, index) => (
                  <li key={index} className="flex items-start gap-2 text-sm text-foreground">
                    <span className="mt-2 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-primary" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Historical blood pressure */}
          <div className="rounded-xl border border-border bg-card p-6">
            <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold font-[family-name:var(--font-heading)] text-foreground">
              <Heart className="h-5 w-5 text-primary" />
              Historical Blood Pressure
            </h2>
            {(patient.historicalBloodPressure?.length ?? 0) > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Systolic</TableHead>
                    <TableHead>Diastolic</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(patient.historicalBloodPressure ?? []).map((row, i) => (
                    <TableRow key={i}>
                      <TableCell>{formatTableDate((row as { date?: string }).date ?? "")}</TableCell>
                      <TableCell>{(row as { systolic?: number }).systolic ?? "—"}</TableCell>
                      <TableCell>{(row as { diastolic?: number }).diastolic ?? "—"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <p className="text-sm text-muted-foreground">No blood pressure history recorded</p>
            )}
          </div>

          {/* Historical heart rate */}
          <div className="rounded-xl border border-border bg-card p-6">
            <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold font-[family-name:var(--font-heading)] text-foreground">
              <Activity className="h-5 w-5 text-primary" />
              Historical Heart Rate
            </h2>
            {(patient.historicalHeartRate?.length ?? 0) > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>BPM</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(patient.historicalHeartRate ?? []).map((row, i) => (
                    <TableRow key={i}>
                      <TableCell>{formatTableDate((row as { date?: string }).date ?? "")}</TableCell>
                      <TableCell>{(row as { bpm?: number }).bpm ?? "—"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <p className="text-sm text-muted-foreground">No heart rate history recorded</p>
            )}
          </div>

          {/* Historical body weight */}
          <div className="rounded-xl border border-border bg-card p-6">
            <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold font-[family-name:var(--font-heading)] text-foreground">
              <Scale className="h-5 w-5 text-primary" />
              Historical Body Weight
            </h2>
            {(patient.historicalBodyWeight?.length ?? 0) > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Weight</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(patient.historicalBodyWeight ?? []).map((row, i) => {
                    const r = row as { date?: string; valueKg?: number; value?: number; unit?: string }
                    const val = r.valueKg ?? r.value
                    const unit = r.unit ?? "kg"
                    return (
                      <TableRow key={i}>
                        <TableCell>{formatTableDate(r.date ?? "")}</TableCell>
                        <TableCell>{val != null ? `${val} ${unit}` : "—"}</TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            ) : (
              <p className="text-sm text-muted-foreground">No body weight history recorded</p>
            )}
          </div>

          {/* Family history */}
          <div className="rounded-xl border border-border bg-card p-6">
            <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold font-[family-name:var(--font-heading)] text-foreground">
              <Users className="h-5 w-5 text-primary" />
              Family History
            </h2>
            {(patient.familyHistory?.length ?? 0) > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Condition</TableHead>
                    <TableHead>Relation</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(patient.familyHistory ?? []).map((row, i) => (
                    <TableRow key={i}>
                      <TableCell>{(row as { condition?: string }).condition ?? "—"}</TableCell>
                      <TableCell>{(row as { relation?: string }).relation ?? "—"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <p className="text-sm text-muted-foreground">No family history recorded</p>
            )}
          </div>

          {/* Clinical notes */}
          <div className="rounded-xl border border-border bg-card p-6">
            <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold font-[family-name:var(--font-heading)] text-foreground">
              <FileText className="h-5 w-5 text-primary" />
              Clinical Notes
            </h2>
            <div className="flex flex-col gap-3">
              {(patient.notes ?? []).map((note, index) => (
                <div
                  key={index}
                  className="rounded-lg border border-border bg-background p-3 text-sm text-foreground"
                >
                  {note}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
