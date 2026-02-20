import { notFound } from "next/navigation"
import { DashboardShell } from "@/components/dashboard/dashboard-shell"
import { PatientDetail } from "@/components/dashboard/patient-detail"
import { getPatientById } from "@/lib/api"

export default async function PatientPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const patient = await getPatientById(id)

  if (!patient) {
    notFound()
  }

  return (
    <DashboardShell>
      <PatientDetail patient={patient} />
    </DashboardShell>
  )
}
