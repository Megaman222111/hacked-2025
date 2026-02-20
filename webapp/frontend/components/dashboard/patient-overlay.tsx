"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import {
  X,
  ShieldCheck,
  Heart,
  Thermometer,
  Activity,
  Droplets,
  AlertCircle,
  Pill,
  Phone,
  Nfc,
  ExternalLink,
} from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import type { Patient } from "@/lib/api"

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

function getAge(dob: string) {
  const today = new Date()
  const birth = new Date(dob)
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

  useEffect(() => {
    // Trigger entrance animation
    const raf = requestAnimationFrame(() => setVisible(true))
    return () => cancelAnimationFrame(raf)
  }, [])

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
                  <span>Room: {patient.room}</span>
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
            {/* Vitals */}
            <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              Vital Signs
            </h3>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div className="flex items-center gap-2.5 rounded-xl border border-border bg-background p-3">
                <Heart className="h-4 w-4 text-primary" />
                <div>
                  <p className="text-[11px] text-muted-foreground">Heart Rate</p>
                  <p className="text-sm font-bold text-foreground">
                    {patient.vitalSigns.heartRate} <span className="text-[10px] font-normal text-muted-foreground">bpm</span>
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2.5 rounded-xl border border-border bg-background p-3">
                <Activity className="h-4 w-4 text-accent-foreground" />
                <div>
                  <p className="text-[11px] text-muted-foreground">BP</p>
                  <p className="text-sm font-bold text-foreground">
                    {patient.vitalSigns.bloodPressure}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2.5 rounded-xl border border-border bg-background p-3">
                <Thermometer className="h-4 w-4 text-primary" />
                <div>
                  <p className="text-[11px] text-muted-foreground">Temp</p>
                  <p className="text-sm font-bold text-foreground">
                    {patient.vitalSigns.temperature}{"\u00B0F"}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2.5 rounded-xl border border-border bg-background p-3">
                <Droplets className="h-4 w-4 text-accent-foreground" />
                <div>
                  <p className="text-[11px] text-muted-foreground">O2 Sat</p>
                  <p className="text-sm font-bold text-foreground">
                    {patient.vitalSigns.oxygenSaturation}%
                  </p>
                </div>
              </div>
            </div>

            <Separator className="my-5" />

            {/* Key Info Grid */}
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
                    {patient.primaryDiagnosis}
                  </p>
                </div>

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

            {/* Footer actions */}
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
