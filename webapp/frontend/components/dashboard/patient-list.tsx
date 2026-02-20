"use client"

import Link from "next/link"
import { useState, useMemo, useEffect } from "react"
import {
  Search,
  ChevronRight,
  Users,
  AlertTriangle,
  Activity,
  LogOut as LogOutIcon,
  Nfc,
} from "lucide-react"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import type { Patient } from "@/lib/api"
import { getPatients } from "@/lib/api"

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

export function PatientList() {
  const [patients, setPatients] = useState<Patient[]>([])
  const [search, setSearch] = useState("")
  const [statusFilter, setStatusFilter] = useState<string>("all")
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true

    async function loadPatients() {
      setLoading(true)
      setError(null)

      try {
        const data = await getPatients()
        if (active) {
          setPatients(data)
        }
      } catch {
        if (active) {
          setError("Could not load patients from the backend API.")
        }
      } finally {
        if (active) {
          setLoading(false)
        }
      }
    }

    loadPatients()
    return () => {
      active = false
    }
  }, [])

  const filteredPatients = useMemo(() => {
    return patients.filter((p) => {
      const matchesSearch =
        `${p.firstName} ${p.lastName}`.toLowerCase().includes(search.toLowerCase()) ||
        p.nfcId.toLowerCase().includes(search.toLowerCase()) ||
        p.id.toLowerCase().includes(search.toLowerCase())
      const matchesStatus = statusFilter === "all" || p.status === statusFilter
      return matchesSearch && matchesStatus
    })
  }, [patients, search, statusFilter])

  const activeCount = patients.filter((p) => p.status === "active").length
  const criticalCount = patients.filter((p) => p.status === "critical").length
  const dischargedCount = patients.filter((p) => p.status === "discharged").length

  return (
    <div className="flex flex-col gap-6">
      {/* Stats row */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="flex items-center gap-4 rounded-xl border border-border bg-card p-5">
          <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-primary/10">
            <Users className="h-5 w-5 text-primary" />
          </div>
          <div>
            <p className="text-2xl font-bold text-foreground">{patients.length}</p>
            <p className="text-sm text-muted-foreground">Total Patients</p>
          </div>
        </div>
        <div className="flex items-center gap-4 rounded-xl border border-border bg-card p-5">
          <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-primary/10">
            <Activity className="h-5 w-5 text-primary" />
          </div>
          <div>
            <p className="text-2xl font-bold text-foreground">{activeCount}</p>
            <p className="text-sm text-muted-foreground">Active</p>
          </div>
        </div>
        <div className="flex items-center gap-4 rounded-xl border border-border bg-card p-5">
          <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-destructive/10">
            <AlertTriangle className="h-5 w-5 text-destructive" />
          </div>
          <div>
            <p className="text-2xl font-bold text-foreground">{criticalCount}</p>
            <p className="text-sm text-muted-foreground">Critical</p>
          </div>
        </div>
        <div className="flex items-center gap-4 rounded-xl border border-border bg-card p-5">
          <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-muted">
            <LogOutIcon className="h-5 w-5 text-muted-foreground" />
          </div>
          <div>
            <p className="text-2xl font-bold text-foreground">{dischargedCount}</p>
            <p className="text-sm text-muted-foreground">Discharged</p>
          </div>
        </div>
      </div>

      {/* Header and search */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold font-[family-name:var(--font-heading)] text-foreground">
            Patients
          </h1>
          <p className="text-sm text-muted-foreground">Manage and view patient records</p>
        </div>

        <div className="relative w-full sm:w-72">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search by name or NFC ID..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-2">
        {[
          { value: "all", label: "All" },
          { value: "active", label: "Active" },
          { value: "critical", label: "Critical" },
          { value: "discharged", label: "Discharged" },
        ].map((filter) => (
          <button
            key={filter.value}
            onClick={() => setStatusFilter(filter.value)}
            className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
              statusFilter === filter.value
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:bg-muted/80"
            }`}
          >
            {filter.label}
          </button>
        ))}
      </div>

      {/* Patient list */}
      <div className="flex flex-col gap-3">
        {loading && (
          <div className="rounded-xl border border-border bg-card p-5 text-sm text-muted-foreground">
            Loading patients...
          </div>
        )}

        {error && (
          <div className="rounded-xl border border-destructive/20 bg-destructive/5 p-5 text-sm text-destructive">
            {error}
          </div>
        )}

        {filteredPatients.map((patient) => (
          <Link
            key={patient.id}
            href={`/dashboard/patient/${patient.id}`}
            className="group flex items-center justify-between rounded-xl border border-border bg-card p-5 transition-all hover:border-primary/30 hover:shadow-md"
          >
            <div className="flex items-center gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-accent text-sm font-bold text-accent-foreground">
                {getInitials(patient.firstName, patient.lastName)}
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <p className="font-semibold text-foreground">
                    {patient.firstName} {patient.lastName}
                  </p>
                  <Badge
                    variant="outline"
                    className={`text-xs capitalize ${getStatusColor(patient.status)}`}
                  >
                    {patient.status}
                  </Badge>
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <Nfc className="h-3 w-3" />
                    {patient.nfcId}
                  </span>
                  <span>Room: {patient.room}</span>
                  <span>{patient.primaryDiagnosis}</span>
                </div>
              </div>
            </div>

            <ChevronRight className="h-5 w-5 text-muted-foreground transition-transform group-hover:translate-x-1" />
          </Link>
        ))}

        {!loading && !error && filteredPatients.length === 0 && (
          <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border py-16">
            <Users className="mb-3 h-10 w-10 text-muted-foreground/40" />
            <p className="text-sm font-medium text-muted-foreground">No patients found</p>
            <p className="text-xs text-muted-foreground">Try adjusting your search or filters</p>
          </div>
        )}
      </div>
    </div>
  )
}
