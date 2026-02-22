"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import {
  X,
  ShieldCheck,
  AlertCircle,
  Pill,
  Phone,
  Nfc,
  ExternalLink,
  Sparkles,
  Loader2,
  Activity,
} from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import type { Patient, PatientRiskScore } from "@/lib/api"
import { getPatientAiOverview, getPatientRiskScore } from "@/lib/api"

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

export function PatientOverlay({
  patient,
  onClose,
}: {
  patient: Patient
  onClose: () => void
}) {
  const [visible, setVisible] = useState(false)
  const [riskScore, setRiskScore] = useState<PatientRiskScore | null>(null)
  const [riskScoreLoading, setRiskScoreLoading] = useState(true)
  const [riskScoreError, setRiskScoreError] = useState<string | null>(null)
  const [aiOverview, setAiOverview] = useState<string | null>(null)
  const [aiOverviewLoading, setAiOverviewLoading] = useState(true)
  const [aiOverviewError, setAiOverviewError] = useState<string | null>(null)

  useEffect(() => {
    // Trigger entrance animation
    const raf = requestAnimationFrame(() => setVisible(true))
    return () => cancelAnimationFrame(raf)
  }, [])

  useEffect(() => {
    let cancelled = false
    setRiskScoreLoading(true)
    setRiskScoreError(null)
    setRiskScore(null)
    getPatientRiskScore(patient.id)
      .then((data) => {
        if (!cancelled) {
          setRiskScore(data)
          setRiskScoreError(null)
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setRiskScoreError(err instanceof Error ? err.message : "Failed to load risk score")
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

  useEffect(() => {
    let cancelled = false
    setAiOverviewLoading(true)
    setAiOverviewError(null)
    setAiOverview(null)
    getPatientAiOverview(patient.id)
      .then((text) => {
        if (!cancelled) {
          setAiOverview(text)
          setAiOverviewError(null)
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setAiOverviewError(err instanceof Error ? err.message : "Failed to load AI overview")
          setAiOverview(null)
        }
      })
      .finally(() => {
        if (!cancelled) setAiOverviewLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [patient.id])

  const handleClose = () => {
    setVisible(false)
    setTimeout(onClose, 300)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto">
      {/* Backdrop */}
      <div
        className={`fixed inset-0 bg-foreground/20 backdrop-blur-sm transition-opacity duration-300 ${
          visible ? "opacity-100" : "opacity-0"
        }`}
        onClick={handleClose}
      />

      {/* Panel */}
      <div
        className={`relative z-10 mx-4 my-8 w-full max-w-2xl transition-all duration-300 ${
          visible ? "translate-y-0 opacity-100" : "translate-y-8 opacity-0"
        }`}
      >
        <div className="rounded-2xl border border-border bg-card shadow-2xl">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-border p-6">
            <div className="flex items-center gap-4">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-accent text-lg font-bold text-accent-foreground">
                {getInitials(patient.firstName, patient.lastName)}
              </div>
              <div>
                <div className="flex items-center gap-3">
                  <h2 className="text-xl font-bold font-[family-name:var(--font-heading)] text-foreground">
                    {patient.firstName} {patient.lastName}
                  </h2>
                  <Badge
                    variant="outline"
                    className={`capitalize ${getStatusColor(patient.status)}`}
                  >
                    {patient.status}
                  </Badge>
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <Nfc className="h-3.5 w-3.5" />
                    {patient.nfcId}
                  </span>
                  <span>{patient.gender}, {getAge(patient.dateOfBirth)} yrs</span>
                </div>
              </div>
            </div>
            <button
              onClick={handleClose}
              className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              aria-label="Close patient overlay"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Verified badge */}
          <div className="mx-6 mt-4 flex items-center gap-2 rounded-lg bg-primary/5 px-4 py-2.5">
            <ShieldCheck className="h-4 w-4 text-primary" />
            <span className="text-sm font-medium text-primary">
              Identity Verified via NFC
            </span>
          </div>

          {/* Content */}
          <div className="p-6">
            {/* Risk score */}
            <div className="mb-5 rounded-xl border border-border bg-muted/30 px-4 py-3">
              <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                <Activity className="h-4 w-4 text-primary" />
                Seriousness
              </div>
              {riskScoreLoading && (
                <div className="mt-2 flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Calculating…
                </div>
              )}
              {!riskScoreLoading && riskScore && (
                <div className="mt-2 space-y-2">
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
                        .slice(0, 3)
                        .map(
                          (f) =>
                            `${String(f?.feature ?? "")} (${(f?.contribution ?? 0) >= 0 ? "+" : ""}${Number(f?.contribution ?? 0).toFixed(3)})`
                        )
                        .join(", ")}
                    </p>
                  )}
                </div>
              )}
              {!riskScoreLoading && !riskScore && riskScoreError && (
                <p className="mt-2 text-sm text-destructive">{riskScoreError}</p>
              )}
            </div>

            {/* AI Overview – only show when we have content or are loading */}
            <div className="mb-5 rounded-xl border border-border bg-muted/30 px-4 py-3">
              <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                <Sparkles className="h-4 w-4 text-primary" />
                AI Overview
              </div>
              {aiOverviewLoading && (
                <div className="mt-2 flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Generating overview…
                </div>
              )}
              {!aiOverviewLoading && aiOverview && (
                <p className="mt-2 text-sm leading-relaxed text-foreground">{aiOverview}</p>
              )}
              {!aiOverviewLoading && !aiOverview && aiOverviewError && (
                <p className="mt-2 text-sm text-destructive">{aiOverviewError}</p>
              )}
              {!aiOverviewLoading && !aiOverview && !aiOverviewError && (
                <p className="mt-2 text-sm text-muted-foreground">Overview unavailable</p>
              )}
            </div>

            <Separator className="mb-5" />

            {/* Patient information overview */}
            <p className="mb-3 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              Patient information
            </p>
            <div className="grid gap-5 sm:grid-cols-2">
              {/* Left */}
              <div className="flex flex-col gap-4">
                <div>
                  <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                    Blood Type
                  </p>
                  <p className="mt-0.5 text-xl font-bold text-primary">
                    {patient.bloodType}
                  </p>
                </div>
                <div>
                  <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                    Primary Diagnosis
                  </p>
                  <p className="mt-0.5 text-sm font-medium text-foreground">
                    {patient.primaryDiagnosis || "Not specified"}
                  </p>
                </div>
                {(patient.importantTestResults ?? "").trim() && (
                  <div>
                    <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                      Important Test Results
                    </p>
                    <p className="mt-0.5 text-sm text-foreground whitespace-pre-wrap">
                      {patient.importantTestResults}
                    </p>
                  </div>
                )}

                {/* Allergies */}
                <div>
                  <div className="flex items-center gap-1.5">
                    <AlertCircle className="h-3.5 w-3.5 text-destructive" />
                    <p className="text-[11px] font-medium uppercase tracking-wider text-destructive">
                      Allergies
                    </p>
                  </div>
                  {patient.allergies.length > 0 ? (
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      {patient.allergies.map((allergy) => (
                        <Badge
                          key={allergy}
                          variant="outline"
                          className="border-destructive/20 bg-destructive/5 text-destructive text-xs"
                        >
                          {allergy}
                        </Badge>
                      ))}
                    </div>
                  ) : (
                    <p className="mt-1 text-sm text-muted-foreground">
                      No known allergies
                    </p>
                  )}
                </div>
              </div>

              {/* Right */}
              <div className="flex flex-col gap-4">
                {/* Medications */}
                <div>
                  <div className="flex items-center gap-1.5">
                    <Pill className="h-3.5 w-3.5 text-primary" />
                    <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                      Medications
                    </p>
                  </div>
                  <div className="mt-1.5 flex flex-col gap-1.5">
                    {patient.medications.map((med, i) => (
                      <div
                        key={i}
                        className="flex items-center justify-between rounded-lg bg-muted/50 px-3 py-2"
                      >
                        <span className="text-sm text-foreground">{med.name}</span>
                        <span className="text-xs text-muted-foreground">{med.dosage}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Emergency Contact */}
                <div>
                  <div className="flex items-center gap-1.5">
                    <Phone className="h-3.5 w-3.5 text-primary" />
                    <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                      Emergency Contact
                    </p>
                  </div>
                  <div className="mt-1.5 rounded-lg bg-muted/50 px-3 py-2">
                    <p className="text-sm font-medium text-foreground">
                      {patient.emergencyContact.name}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {patient.emergencyContact.relationship} &middot; {patient.emergencyContact.phone}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <Separator className="my-5" />

            {/* Footer */}
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground">
                Scanned at {new Date().toLocaleTimeString()}
              </p>
              <Button size="sm" variant="outline" className="gap-2" asChild>
                <Link href={`/dashboard/patient/${patient.id}`}>
                  View Full Record
                  <ExternalLink className="h-3.5 w-3.5" />
                </Link>
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
