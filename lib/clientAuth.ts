import AsyncStorage from '@react-native-async-storage/async-storage'

const NETLIFY_URL = 'https://aesthetic-yeot-2d7094.netlify.app'

export interface ClientRecord {
  id: string; prenom: string; nom: string; email: string
  telephone: string | null; date_naissance: string | null
  adresse: string | null; ville: string | null; code_postal: string | null
  avatar_url: string | null; points_fidelite: number | null
  segment: string | null; company_id: string
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

export async function loginClient({ company_id, email, password }: { company_id: string; email: string; password: string }) {
  const res = await fetch(`${NETLIFY_URL}/.netlify/functions/client-login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ company_id, email, password }),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error ?? 'Identifiants invalides')
  await AsyncStorage.setItem(`client_token_${company_id}`, data.token)
  return { client: data.client as ClientRecord, token: data.token as string }
}

export async function signupClient(payload: {
  company_id: string; prenom: string; nom: string; email: string
  telephone: string; password: string; date_naissance?: string
  adresse?: string; ville?: string; code_postal?: string
}) {
  const res = await fetch(`${NETLIFY_URL}/.netlify/functions/client-signup`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error ?? 'Erreur inscription')
  await AsyncStorage.setItem(`client_token_${payload.company_id}`, data.token)
  return { client: data.client as ClientRecord, token: data.token as string }
}

export async function getStoredToken(companyId: string) {
  return AsyncStorage.getItem(`client_token_${companyId}`)
}

export async function logout(companyId: string) {
  await AsyncStorage.removeItem(`client_token_${companyId}`)
}

export const getMe = (token: string) => authFetch('client-me', token)
export const updateProfile = (token: string, data: Partial<ClientRecord>) =>
  authFetch('client-profile', token, { method: 'POST', body: JSON.stringify(data) })
export const changePassword = (token: string, current: string, newPassword: string) =>
  authFetch('client-change-password', token, { method: 'POST', body: JSON.stringify({ current_password: current, new_password: newPassword }) })
export const requestPasswordReset = (companyId: string, email: string) =>
  fetch(`${NETLIFY_URL}/.netlify/functions/client-reset-password`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'request', company_id: companyId, email }),
  }).then(r => r.json())
export const deleteAccount = (token: string, password: string) =>
  authFetch('client-delete-account', token, { method: 'POST', body: JSON.stringify({ password }) })
export const fetchRDV = (token: string) => authFetch('client-reservations', token)
export const cancelRDV = (token: string, reservation_id: string) =>
  authFetch('client-cancel-reservation', token, { method: 'POST', body: JSON.stringify({ reservation_id }) })
export const submitAvis = (token: string, payload: { avis_token: string; note: number; commentaire?: string; client_prenom?: string }) =>
  fetch(`${NETLIFY_URL}/.netlify/functions/avis-submit`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  }).then(r => r.json())
export const fetchFidelite = (token: string) => authFetch('client-fidelite', token)
export const fetchParrainage = (token: string) => authFetch('client-parrainage', token)
export const fetchAvis = (token: string) => authFetch('client-avis', token)
export const fetchNotifications = (token: string) => authFetch('client-notifications', token)
export const markNotifsRead = (token: string) =>
  authFetch('client-notifications', token, { method: 'POST', body: JSON.stringify({ all: true }) })
export const fetchMessages = (token: string) => authFetch('client-messages', token)
export const markMessagesRead = (token: string) =>
  authFetch('client-messages', token, { method: 'POST', body: JSON.stringify({ all: true }) })
export const fetchOffres = (token: string) => authFetch('client-offres', token)
export const uploadAvatar = (token: string, dataUrl: string) =>
  authFetch('client-avatar', token, { method: 'POST', body: JSON.stringify({ data_url: dataUrl }) })
    .then((d: { avatar_url: string }) => d.avatar_url)
