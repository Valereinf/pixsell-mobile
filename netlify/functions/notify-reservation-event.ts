import { getSupabase, getOwnerTokens, getEmployeeTokens, sendPushNotifications, CORS_HEADERS } from './_shared'
import type { NetlifyEvent } from './_shared'

interface ReservationRecord {
  id: string
  company_id: string
  employee_id: string | null
  date_rdv: string
  heure_rdv: string
  client_prenom: string | null
  client_nom: string | null
  statut: string
}

// Accepts either a Supabase Database Webhook payload or a direct call:
// Direct:   { event: 'new_reservation'|'cancelled'|'no_show', reservation: ReservationRecord }
// Webhook:  { type: 'INSERT'|'UPDATE', table: 'reservations', record: ReservationRecord, old_record: ReservationRecord }
interface DirectPayload {
  event: 'new_reservation' | 'cancelled' | 'no_show'
  reservation: ReservationRecord
}
interface WebhookPayload {
  type: 'INSERT' | 'UPDATE' | 'DELETE'
  table: string
  record: ReservationRecord
  old_record: ReservationRecord | null
}

type Payload = DirectPayload | WebhookPayload

function clientName(r: ReservationRecord): string {
  return [r.client_prenom, r.client_nom].filter(Boolean).join(' ') || 'Client'
}

function fmtTime(heure: string): string {
  return heure?.slice(0, 5) ?? ''
}

function resolveEvent(payload: Payload): { event: 'new_reservation' | 'cancelled' | 'no_show'; resa: ReservationRecord } | null {
  if ('event' in payload) {
    return { event: payload.event, resa: payload.reservation }
  }

  const { type, record, old_record } = payload as WebhookPayload
  if (!record) return null

  if (type === 'INSERT') return { event: 'new_reservation', resa: record }

  if (type === 'UPDATE') {
    if (record.statut === 'cancelled' && old_record?.statut !== 'cancelled') {
      return { event: 'cancelled', resa: record }
    }
    if (record.statut === 'no_show' && old_record?.statut !== 'no_show') {
      return { event: 'no_show', resa: record }
    }
  }

  return null
}

export const handler = async (event: NetlifyEvent) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: CORS_HEADERS, body: '' }
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: CORS_HEADERS, body: JSON.stringify({ error: 'Method Not Allowed' }) }
  }

  const payload = JSON.parse(event.body ?? '{}') as Payload
  const resolved = resolveEvent(payload)
  if (!resolved) {
    return { statusCode: 200, headers: CORS_HEADERS, body: JSON.stringify({ skipped: true }) }
  }

  const { event: eventType, resa } = resolved
  const supabase = getSupabase()

  // Gather tokens
  const [ownerTokens, employeeTokens] = await Promise.all([
    getOwnerTokens(supabase, resa.company_id),
    resa.employee_id ? getEmployeeTokens(supabase, resa.employee_id) : Promise.resolve([]),
  ])

  let title: string
  let body: string
  let tokens: string[]

  const dateStr = resa.date_rdv
  const timeStr = fmtTime(resa.heure_rdv)
  const client  = clientName(resa)

  switch (eventType) {
    case 'new_reservation':
      title  = 'Nouvelle réservation 📅'
      body   = `RDV ${dateStr} à ${timeStr} avec ${client}`
      tokens = [...new Set([...ownerTokens, ...employeeTokens])]
      break

    case 'cancelled':
      title  = 'Réservation annulée ❌'
      body   = `RDV ${dateStr} à ${timeStr} annulé`
      tokens = [...new Set([...ownerTokens, ...employeeTokens])]
      break

    case 'no_show':
      title  = 'No-show signalé ⚠️'
      body   = `${client} ne s'est pas présenté`
      tokens = ownerTokens
      break
  }

  const result = await sendPushNotifications(supabase, tokens, title, body, {
    event: eventType,
    reservation_id: resa.id,
    company_id: resa.company_id,
  })

  return {
    statusCode: 200,
    headers: CORS_HEADERS,
    body: JSON.stringify({ event: eventType, ...result }),
  }
}
