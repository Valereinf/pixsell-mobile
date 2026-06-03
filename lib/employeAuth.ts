import AsyncStorage from '@react-native-async-storage/async-storage'
import { supabase } from './supabase'

const NETLIFY_URL = 'https://app.pixsellmedia.ca'

export async function loginEmploye({ slug, email, password }: { slug: string; email: string; password: string }) {
  const cleanEmail = email.trim().toLowerCase()
  console.log('[loginEmploye] supabase direct:', { slug, email: cleanEmail })

  // 1. Trouver la company par slug
  const { data: company, error: compErr } = await supabase
    .from('companies').select('id').eq('slug', slug).single()
  if (compErr || !company) throw new Error('Salon introuvable')

  // 2. Vérifier que l'employé existe et est actif
  const { data: emp, error: empErr } = await supabase
    .from('employes')
    .select('id, nom, prenom, titre, photo_url, email, telephone, adresse, ville, code_postal, specialites, type_contrat, company_id')
    .eq('email', cleanEmail)
    .eq('company_id', company.id)
    .eq('actif', true)
    .single()
  if (empErr || !emp) throw new Error('Identifiants invalides')

  // 3. Authentifier via Supabase Auth (même méthode que login.tsx)
  const { data: authData, error: signInErr } = await supabase.auth.signInWithPassword({
    email: cleanEmail,
    password,
  })
  if (signInErr || !authData.session) throw new Error(signInErr?.message ?? 'Identifiants invalides')

  const token = authData.session.access_token
  await AsyncStorage.setItem(`employe_token_${company.id}`, token)

  return { token, company_id: company.id, employe: emp }
}

export async function getStoredToken(companyId: string): Promise<string | null> {
  return AsyncStorage.getItem(`employe_token_${companyId}`)
}

export async function logoutEmploye(companyId: string) {
  await AsyncStorage.removeItem(`employe_token_${companyId}`)
  await supabase.auth.signOut()
}

async function authFetch(path: string, token: string, options: RequestInit = {}) {
  const res = await fetch(`${NETLIFY_URL}/.netlify/functions/${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...(options.headers ?? {}) },
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error ?? 'Erreur API')
  return data
}

export interface EmployeProfile {
  id: string; nom: string; prenom: string | null; titre: string | null
  photo_url: string | null; email: string; telephone: string | null
  adresse: string | null; ville: string | null; code_postal: string | null
  specialites: string[] | null; type_contrat: string | null; company_id: string
}

export const getMe = (token: string) => authFetch('employe-me', token)
export const getDemandes = (token: string) => authFetch('employe-demandes', token)
export const getStats = (token: string) => authFetch('employe-stats', token)
export const getGratifications = (token: string) => authFetch('employe-gratifications', token)
export const getRdv = (token: string) => authFetch('employe-rdv', token)
export const getNotifications = (token: string) => authFetch('employe-notifications', token)

export const markGratifRead = (token: string) =>
  authFetch('employe-gratifications', token, { method: 'POST', body: JSON.stringify({ action: 'mark_read' }) })

export const markNotifRead = (token: string, id: string) =>
  authFetch('employe-notifications', token, { method: 'POST', body: JSON.stringify({ id }) })

export const updateProfile = (token: string, data: Partial<EmployeProfile>) =>
  authFetch('employe-profile', token, { method: 'POST', body: JSON.stringify(data) })

export const changePassword = (token: string, current: string, newPassword: string) =>
  authFetch('employe-change-password', token, { method: 'POST', body: JSON.stringify({ current_password: current, new_password: newPassword }) })

export const submitDemande = (token: string, data: Record<string, unknown>) =>
  authFetch('employe-demandes', token, { method: 'POST', body: JSON.stringify(data) })
