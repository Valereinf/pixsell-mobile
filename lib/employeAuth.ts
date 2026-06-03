import AsyncStorage from '@react-native-async-storage/async-storage'

const NETLIFY_URL = 'https://app.pixsellmedia.ca'

export async function loginEmploye({ slug, email, password }: { slug: string; email: string; password: string }) {
  const res = await fetch(`${NETLIFY_URL}/.netlify/functions/employe-login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ slug, email: email.trim().toLowerCase(), password }),
  })
  const data = await res.json()
  console.log('[loginEmploye] status:', res.status, 'body:', JSON.stringify(data))
  if (!res.ok) throw new Error(data.error ?? `Erreur ${res.status}`)
  if (!data.token) throw new Error('Token manquant')
  await AsyncStorage.setItem(`employe_token_${data.company_id}`, data.token)
  return data
}

export async function getStoredToken(companyId: string): Promise<string | null> {
  return AsyncStorage.getItem(`employe_token_${companyId}`)
}

export async function logoutEmploye(companyId: string) {
  await AsyncStorage.removeItem(`employe_token_${companyId}`)
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
