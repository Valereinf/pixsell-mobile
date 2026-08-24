import { supabase } from './supabase'

function maskEmail(email: string | null | undefined): string | null {
  if (!email) return null
  const [user, domain] = email.split('@')
  if (!domain) return null
  return `${user.slice(0, 2)}***@${domain}`
}

interface LogBookingDiagnosticParams {
  company_id: string
  reservation_id?: string | null
  employe_id: string | null
  employee_data_found: boolean
  duree_base: number | null
  duree_ajustement: number | null
  duree_calculee: number | null
  prix_base: number | null
  prix_serveur: number | null
  prix_final_recu_client: number | null
  prix_insere: number | null
  champs_vides: string[]
  client_email?: string | null
}

export async function logBookingDiagnostic(params: LogBookingDiagnosticParams) {
  try {
    await supabase.from('booking_diagnostics').insert({
      company_id: params.company_id,
      reservation_id: params.reservation_id ?? null,
      employe_id: params.employe_id,
      employee_data_found: params.employee_data_found,
      duree_base: params.duree_base,
      duree_ajustement: params.duree_ajustement,
      duree_calculee: params.duree_calculee,
      prix_base: params.prix_base,
      prix_serveur: params.prix_serveur,
      prix_final_recu_client: params.prix_final_recu_client,
      prix_insere: params.prix_insere,
      champs_vides: params.champs_vides,
      client_email_masque: maskEmail(params.client_email),
    })
  } catch (e) {
    console.error('[booking_diagnostics] échec insertion (non bloquant):', e)
  }
}
