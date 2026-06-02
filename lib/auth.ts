import { supabase } from './supabase'

export async function loginOwner(email: string, password: string) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) throw error
  return data
}

export async function loginEmploye(email: string, password: string, companySlug: string) {
  const { data: company, error: companyErr } = await supabase
    .from('companies')
    .select('id')
    .eq('slug', companySlug)
    .single()
  if (companyErr || !company) throw new Error('Salon introuvable')

  const { data, error } = await supabase
    .from('employes')
    .select('*')
    .eq('email', email)
    .eq('company_id', company.id)
    .eq('actif', true)
    .single()
  if (error || !data) throw new Error('Identifiants invalides')
  return { employe: data, company_id: company.id }
}

export async function getCompanyByOwnerEmail(email: string) {
  const { data, error } = await supabase
    .from('companies')
    .select('*')
    .eq('owner_email', email)
    .single()
  if (error) throw error
  return data
}

export async function logout() {
  await supabase.auth.signOut()
}

export async function getSession() {
  return supabase.auth.getSession()
}
