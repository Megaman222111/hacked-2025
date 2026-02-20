"use client"

import { useState, useCallback, useEffect, useRef } from "react"
import { Nfc } from "lucide-react"
import type { Patient } from "@/lib/api"
import { PatientOverlay } from "@/components/dashboard/patient-overlay"
import { scanNfcTag } from "@/lib/api"

// Ambient concentric rings config
const AMBIENT_RINGS = [
  { size: "120%", opacity: 0.22, scale: 1.12, duration: 3, delay: 0 },
  { size: "155%", opacity: 0.16, scale: 1.14, duration: 3.4, delay: 0.3 },
  { size: "195%", opacity: 0.11, scale: 1.16, duration: 3.8, delay: 0.6 },
  { size: "240%", opacity: 0.07, scale: 1.18, duration: 4.2, delay: 0.9 },
]

export function NfcScanView() {
  const [scannedPatient, setScannedPatient] = useState<Patient | null>(null)
  const [isScanning, setIsScanning] = useState(false)
  const [scanError, setScanError] = useState<string | null>(null)
  const [ripples, setRipples] = useState<number[]>([])
  const rippleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const handleScan = useCallback(async () => {
    if (isScanning || scannedPatient) return

    setScanError(null)
    setIsScanning(true)

    try {
      const patient = await scanNfcTag()
      await new Promise((resolve) => setTimeout(resolve, 800))

      if (!patient) {
        setScanError("Scan failed. Confirm the Django backend is running and reachable.")
        return
      }

      setScannedPatient(patient)
    } finally {
      setIsScanning(false)
    }
  }, [isScanning, scannedPatient])

  const handleClose = useCallback(() => {
    setScannedPatient(null)
  }, [])

  // Occasional sonar ripple on a random 3-6s interval
  useEffect(() => {
    function scheduleRipple() {
      const delay = 3000 + Math.random() * 3000
      rippleTimerRef.current = setTimeout(() => {
        setRipples((prev) => [...prev, Date.now()])
        scheduleRipple()
      }, delay)
    }
    scheduleRipple()
    return () => {
      if (rippleTimerRef.current) clearTimeout(rippleTimerRef.current)
    }
  }, [])

  // Clean up old ripples after animation ends
  useEffect(() => {
    if (ripples.length === 0) return
    const cleanup = setTimeout(() => {
      setRipples((prev) => prev.slice(1))
    }, 2200)
    return () => clearTimeout(cleanup)
  }, [ripples])

  return (
    <div className="relative flex min-h-[calc(100vh-4rem)] flex-col items-center justify-center overflow-hidden">
      {/* Subtle background glow */}
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute left-1/2 top-1/2 h-[600px] w-[600px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary/3 blur-3xl" />
      </div>

      {/* Status text */}
      <p className="mb-2 text-sm font-medium uppercase tracking-widest text-muted-foreground">
        {isScanning ? "Scanning..." : "Ready to Scan"}
      </p>

      <h2 className="mb-10 text-center text-2xl font-bold font-[family-name:var(--font-heading)] text-foreground md:text-3xl text-balance">
        Tap NFC Wristband to Identify Patient
      </h2>

      {/* Scanner button with animated rings behind it */}
      <div className="relative flex items-center justify-center">
        {/* Ambient concentric outlines -- stroke only, no fill */}
        {AMBIENT_RINGS.map((ring, i) => (
          <span
            key={i}
            className="pointer-events-none absolute rounded-full border border-primary"
            style={
              {
                width: ring.size,
                height: ring.size,
                "--ring-opacity": ring.opacity,
                "--ring-scale": ring.scale,
                opacity: ring.opacity,
                filter: "blur(0.5px)",
                animation: `ring-breathe ${ring.duration}s ease-in-out infinite ${ring.delay}s`,
              } as React.CSSProperties
            }
          />
        ))}

        {/* Sonar ripples -- appear randomly, expand outward, fade out */}
        {ripples.map((id) => (
          <span
            key={id}
            className="pointer-events-none absolute rounded-full border-2 border-primary/30"
            style={{
              width: "100%",
              height: "100%",
              animation: "sonar-ripple 2s ease-out forwards",
              filter: "blur(1px)",
            }}
          />
        ))}

        {/* The scanner button itself -- completely static */}
        <button
          onClick={handleScan}
          disabled={isScanning || !!scannedPatient}
          className="group relative z-10 flex h-56 w-56 cursor-pointer items-center justify-center rounded-full focus:outline-none md:h-64 md:w-64"
          aria-label="Scan NFC wristband"
        >
          {/* Outer glow ring on hover/scan */}
          <div
            className={`absolute inset-0 rounded-full transition-shadow duration-500 ${
              isScanning
                ? "shadow-[0_0_60px_rgba(74,222,128,0.15)]"
                : "group-hover:shadow-[0_0_40px_rgba(74,222,128,0.1)]"
            }`}
          />

          {/* Scanning spinner overlay */}
          {isScanning && (
            <div
              className="absolute inset-0 rounded-full border-2 border-transparent border-t-primary"
              style={{ animation: "scan-spin 1s linear infinite" }}
            />
          )}

          {/* Main circle face */}
          <div
            className={`relative flex h-44 w-44 flex-col items-center justify-center rounded-full border-2 transition-all duration-300 md:h-52 md:w-52 ${
              isScanning
                ? "border-primary bg-primary/10"
                : "border-primary/30 bg-card shadow-lg group-hover:border-primary group-hover:bg-primary/5"
            }`}
          >
            <Nfc
              className={`mb-3 h-12 w-12 transition-colors md:h-14 md:w-14 ${
                isScanning
                  ? "text-primary"
                  : "text-primary/60 group-hover:text-primary"
              }`}
            />
            <span
              className={`text-sm font-semibold tracking-wide transition-colors ${
                isScanning
                  ? "text-primary"
                  : "text-muted-foreground group-hover:text-foreground"
              }`}
            >
              {isScanning ? "Reading..." : "Scan Here"}
            </span>
          </div>
        </button>
      </div>

      {/* Helper text */}
      <p className="mt-10 max-w-xs text-center text-sm leading-relaxed text-muted-foreground">
        Hold the patient&apos;s NFC wristband near this device to retrieve
        their medical records securely.
      </p>

      {scanError && (
        <p className="mt-3 text-center text-sm text-destructive">{scanError}</p>
      )}

      {/* Patient data overlay */}
      {scannedPatient && (
        <PatientOverlay patient={scannedPatient} onClose={handleClose} />
      )}
    </div>
  )
}
