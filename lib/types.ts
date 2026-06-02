// TODO: shared TypeScript types

export interface Company {
  id: string
  name: string
  slug: string
  owner_email: string
  plan: string
  status: string
  primary_color: string
  timezone: string
  trial_ends_at?: string | null
}

export interface Employee {
  id: string
  company_id: string
  name: string
  email?: string | null
  role: string
  actif: boolean
}

export interface Reservation {
  id: string
  company_id: string
  employee_id?: string | null
  client_name: string
  client_email?: string | null
  client_phone?: string | null
  date: string
  heure: string
  statut: string
  prix_total?: number | null
}
