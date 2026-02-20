"use client"

import Link from "next/link"
import {
  ArrowLeft,
  Nfc,
  ShieldCheck,
  Heart,
  Thermometer,
  Activity,
  Droplets,
  Phone,
  User,
  Pill,
  FileText,
  AlertCircle,
  Calendar,
  Building,
  CreditCard,
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

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  })
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

export function PatientDetail({ patient }: { patient: Patient }) {
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
              <span>Room: {patient.room}</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 rounded-lg bg-primary/5 px-4 py-2">
          <ShieldCheck className="h-4 w-4 text-primary" />
          <span className="text-sm font-medium text-primary">NFC Verified</span>
        </div>
      </div>

      {/* Vital signs */}
      <div>
        <h2 className="mb-3 text-lg font-semibold font-[family-name:var(--font-heading)] text-foreground">
          Vital Signs
        </h2>
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <div className="flex items-center gap-3 rounded-xl border border-border bg-card p-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
              <Heart className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Heart Rate</p>
              <p className="text-lg font-bold text-foreground">
                {patient.vitalSigns.heartRate}{" "}
                <span className="text-xs font-normal text-muted-foreground">bpm</span>
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3 rounded-xl border border-border bg-card p-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent">
              <Activity className="h-5 w-5 text-accent-foreground" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Blood Pressure</p>
              <p className="text-lg font-bold text-foreground">
                {patient.vitalSigns.bloodPressure}{" "}
                <span className="text-xs font-normal text-muted-foreground">mmHg</span>
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3 rounded-xl border border-border bg-card p-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
              <Thermometer className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Temperature</p>
              <p className="text-lg font-bold text-foreground">
                {patient.vitalSigns.temperature}
                <span className="text-xs font-normal text-muted-foreground">{" \u00B0F"}</span>
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3 rounded-xl border border-border bg-card p-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent">
              <Droplets className="h-5 w-5 text-accent-foreground" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">O2 Saturation</p>
              <p className="text-lg font-bold text-foreground">
                {patient.vitalSigns.oxygenSaturation}
                <span className="text-xs font-normal text-muted-foreground">%</span>
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Left column */}
        <div className="flex flex-col gap-6">
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

            <div>
              <p className="text-xs text-muted-foreground">Primary Diagnosis</p>
              <p className="mt-1 text-sm font-medium text-foreground">
                {patient.primaryDiagnosis}
              </p>
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
              {patient.medications.map((med, index) => (
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

          {/* Insurance */}
          <div className="rounded-xl border border-border bg-card p-6">
            <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold font-[family-name:var(--font-heading)] text-foreground">
              <CreditCard className="h-5 w-5 text-primary" />
              Insurance Information
            </h2>
            <div className="flex flex-col gap-3">
              <div className="flex items-start gap-3">
                <Building className="mt-0.5 h-4 w-4 text-muted-foreground" />
                <div>
                  <p className="text-xs text-muted-foreground">Provider</p>
                  <p className="text-sm font-medium text-foreground">
                    {patient.insuranceProvider}
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <CreditCard className="mt-0.5 h-4 w-4 text-muted-foreground" />
                <div>
                  <p className="text-xs text-muted-foreground">Policy ID</p>
                  <p className="text-sm font-medium text-foreground">
                    {patient.insuranceId}
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Medical history */}
          <div className="rounded-xl border border-border bg-card p-6">
            <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold font-[family-name:var(--font-heading)] text-foreground">
              <FileText className="h-5 w-5 text-primary" />
              Medical History
            </h2>
            <ul className="flex flex-col gap-2">
              {patient.medicalHistory.map((item, index) => (
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

          {/* Clinical notes */}
          <div className="rounded-xl border border-border bg-card p-6">
            <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold font-[family-name:var(--font-heading)] text-foreground">
              <FileText className="h-5 w-5 text-primary" />
              Clinical Notes
            </h2>
            <div className="flex flex-col gap-3">
              {patient.notes.map((note, index) => (
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
