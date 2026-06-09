import { useEffect, useState, useCallback } from 'react'
import {
  View, Text, ScrollView, TouchableOpacity, TextInput,
  StyleSheet, ActivityIndicator, Modal, Share, Image,
  Platform, KeyboardAvoidingView,
} from 'react-native'
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { LinearGradient } from 'expo-linear-gradient'
import * as Clipboard from 'expo-clipboard'
import * as ImagePicker from 'expo-image-picker'
import { supabase } from '../../lib/supabase'
import {
  loginClient, signupClient, logout, getStoredToken, getMe,
  updateProfile, changePassword, requestPasswordReset, deleteAccount,
  fetchRDV, cancelRDV, submitAvis, fetchFidelite, fetchParrainage,
  fetchAvis, fetchNotifications, markNotifsRead, fetchMessages,
  markMessagesRead, fetchOffres, uploadAvatar,
} from '../../lib/clientAuth'
import type { ClientRecord } from '../../lib/clientAuth'
import type { Company } from '../../lib/types'

// ── Types ──────────────────────────────────────────────────────────────────────

interface ReservationItem {
  id: string; service: string; date_rdv: string; heure_rdv: string
  statut: string; prix: number | string
  avis_id?: string | null; avis_token?: string | null
  cancel_token?: string | null
}
type ViewState = 'loading' | 'login' | 'signup' | 'forgot' | 'reset_sent' | 'profile'
type ProfileTab = 'profil' | 'rdv' | 'fidelite' | 'parrainage' | 'avis' | 'notifications' | 'messages' | 'offres'
interface ClientNotification {
  id: string; type: string; titre: string; message: string
  data: Record<string, unknown>; lu: boolean; created_at: string
}
interface ClientMessage {
  id: string; canal: string; campagne_nom: string
  envoye_at: string | null; message_email: string | null; message_sms: string | null; vu: boolean
}
interface Offre {
  id: string; code: string; nom: string
  type_remise: 'pourcentage' | 'montant_fixe'; valeur_remise: number
  source: 'fidelite' | 'campagne' | 'parrainage' | 'promo'
  statut: 'actif' | 'utilise' | 'expire'; expire_at: string | null; created_at: string
}
interface FideliteData {
  points: number; seuil: number; valeur_cadeau: number
  cadeaux: { id: string; code: string; valeur: number; statut: string; expire_at: string | null }[]
  historique: { id: string; points: number; type: string; note: string | null; created_at: string }[]
}
interface ParrainageData {
  actif: boolean; eligible: boolean; code: string; lien: string
  remise_parrain: number; remise_filleul: number
  stats: { total: number; completes: number; gains: number }
  historique: { id: string; filleul_email: string | null; filleul_prenom: string | null; statut: string; created_at: string }[]
}
interface AvisData {
  soumis: { id: string; note: number; commentaire: string | null; created_at: string; reponse_admin: string | null; service?: string }[]
  a_evaluer: ReservationItem[]
}

// ── Constants ──────────────────────────────────────────────────────────────────

const STATUT_LABEL: Record<string, string> = {
  pending: 'En attente', en_attente: 'En attente',
  confirmed: 'Confirmé', confirmé: 'Confirmé',
  completed: 'Terminé', passé: 'Terminé', passed: 'Terminé',
  cancelled: 'Annulé', annulé: 'Annulé', absent: 'Absent',
}
const STATUT_BG: Record<string, string> = {
  pending: '#fef3c7', en_attente: '#fef3c7',
  confirmed: '#dbeafe', confirmé: '#dbeafe',
  completed: '#dcfce7', passé: '#dcfce7', passed: '#dcfce7',
  cancelled: '#f3f4f6', annulé: '#f3f4f6', absent: '#fee2e2',
}
const STATUT_COLOR: Record<string, string> = {
  pending: '#92400e', en_attente: '#92400e',
  confirmed: '#1e40af', confirmé: '#1e40af',
  completed: '#065f46', passé: '#065f46', passed: '#065f46',
  cancelled: '#6b7280', annulé: '#6b7280', absent: '#c2410c',
}
const SEGMENT_LABEL: Record<string, string> = {
  nouveau: 'Nouveau', regulier: 'Régulier', frequent: 'Fréquent', vip: 'VIP ⭐', inactif: 'Inactif',
}
const OFFRE_SOURCE_CFG: Record<string, { label: string; color: string; bg: string }> = {
  fidelite:   { label: 'Fidélité',   color: '#7c3aed', bg: '#ede9fe' },
  campagne:   { label: 'Campagne',   color: '#1d4ed8', bg: '#dbeafe' },
  parrainage: { label: 'Parrainage', color: '#059669', bg: '#d1fae5' },
  promo:      { label: 'Promo',      color: '#d97706', bg: '#fef3c7' },
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function initiales(prenom: string, nom: string) {
  return `${prenom[0] ?? ''}${nom[0] ?? ''}`.toUpperCase()
}
function formatDateFR(dateStr: string) {
  return new Date(dateStr + 'T12:00:00Z').toLocaleDateString('fr-CA', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  })
}
function dateRelative(dateStr: string) {
  const days = Math.floor((Date.now() - new Date(dateStr).getTime()) / 86_400_000)
  if (days === 0) return "Aujourd'hui"
  if (days === 1) return 'Hier'
  if (days < 7) return `Il y a ${days} jours`
  if (days < 30) { const w = Math.floor(days / 7); return `Il y a ${w} semaine${w > 1 ? 's' : ''}` }
  if (days < 365) { const m = Math.floor(days / 30); return `Il y a ${m} mois` }
  const y = Math.floor(days / 365); return `Il y a ${y} an${y > 1 ? 's' : ''}`
}
function canCancel(r: ReservationItem) {
  if (!['pending', 'confirmed', 'en_attente', 'confirmé'].includes(r.statut)) return false
  return new Date(`${r.date_rdv}T${r.heure_rdv}:00`).getTime() > Date.now() + 3 * 60 * 60 * 1000
}
function pwdStrength(pwd: string): { label: string; color: string; pct: number } {
  if (!pwd) return { label: '', color: '#e5e7eb', pct: 0 }
  if (pwd.length < 6) return { label: 'Trop court', color: '#ef4444', pct: 20 }
  const score = [/[A-Z]/.test(pwd), /[a-z]/.test(pwd), /\d/.test(pwd), /[^a-zA-Z0-9]/.test(pwd), pwd.length >= 10].filter(Boolean).length
  if (score <= 2) return { label: 'Faible', color: '#f97316', pct: 33 }
  if (score <= 3) return { label: 'Moyen', color: '#eab308', pct: 60 }
  return { label: 'Fort', color: '#22c55e', pct: 100 }
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function GradientAvatar({ prenom, nom, size = 48 }: { prenom: string; nom: string; size?: number }) {
  return (
    <LinearGradient colors={['#7c3aed', '#ec4899']} style={{ width: size, height: size, borderRadius: size, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ color: '#fff', fontWeight: '800', fontSize: size * 0.33 }}>{initiales(prenom, nom)}</Text>
    </LinearGradient>
  )
}

function PasswordStrengthBar({ pwd }: { pwd: string }) {
  const str = pwdStrength(pwd)
  if (!str.label) return null
  return (
    <View style={{ marginTop: 4, gap: 4 }}>
      <View style={{ height: 4, backgroundColor: '#e5e7eb', borderRadius: 2, overflow: 'hidden' }}>
        <View style={{ width: `${str.pct}%` as `${number}%`, height: '100%', backgroundColor: str.color, borderRadius: 2 }} />
      </View>
      <Text style={{ fontSize: 11, color: str.color, fontWeight: '600' }}>{str.label}</Text>
    </View>
  )
}

function Card({ children, style }: { children: React.ReactNode; style?: object }) {
  return <View style={[s.card, style]}>{children}</View>
}

function StatutBadge({ statut }: { statut: string }) {
  return (
    <View style={[s.badge, { backgroundColor: STATUT_BG[statut] ?? '#f3f4f6' }]}>
      <Text style={[s.badgeText, { color: STATUT_COLOR[statut] ?? '#374151' }]}>
        {STATUT_LABEL[statut] ?? statut}
      </Text>
    </View>
  )
}

function Stars({ note, size = 16 }: { note: number; size?: number }) {
  return (
    <View style={{ flexDirection: 'row', gap: 2 }}>
      {[1, 2, 3, 4, 5].map(i => (
        <Ionicons key={i} name={i <= note ? 'star' : 'star-outline'} size={size} color="#f59e0b" />
      ))}
    </View>
  )
}

// ── Main Component ─────────────────────────────────────────────────────────────

export default function ClientPortal() {
  const insets = useSafeAreaInsets()
  const [view, setView] = useState<ViewState>('loading')
  const [slug, setSlug] = useState('')
  const [company, setCompany] = useState<Company | null>(null)
  const [client, setClient] = useState<ClientRecord | null>(null)
  const [token, setToken] = useState('')
  const [profileTab, setProfileTab] = useState<ProfileTab>('profil')

  // Auth states
  const [loginEmail, setLoginEmail] = useState('')
  const [loginPwd, setLoginPwd] = useState('')
  const [signupPrenom, setSignupPrenom] = useState('')
  const [signupNom, setSignupNom] = useState('')
  const [signupEmail, setSignupEmail] = useState('')
  const [signupTel, setSignupTel] = useState('')
  const [signupDate, setSignupDate] = useState('')
  const [signupPwd, setSignupPwd] = useState('')
  const [signupConfirm, setSignupConfirm] = useState('')
  const [forgotEmail, setForgotEmail] = useState('')
  const [authError, setAuthError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  // Profile edit
  const [editPrenom, setEditPrenom] = useState('')
  const [editNom, setEditNom] = useState('')
  const [editTel, setEditTel] = useState('')
  const [editDate, setEditDate] = useState('')
  const [editAdresse, setEditAdresse] = useState('')
  const [editVille, setEditVille] = useState('')
  const [editCodePostal, setEditCodePostal] = useState('')
  const [savingProfil, setSavingProfil] = useState(false)
  const [profilSaved, setProfilSaved] = useState(false)

  // Security
  const [showSecurity, setShowSecurity] = useState(false)
  const [currentPwd, setCurrentPwd] = useState('')
  const [newPwd, setNewPwd] = useState('')
  const [confirmPwd, setConfirmPwd] = useState('')
  const [pwdError, setPwdError] = useState('')
  const [pwdSaved, setPwdSaved] = useState(false)
  const [savingPwd, setSavingPwd] = useState(false)

  // Danger zone
  const [showDanger, setShowDanger] = useState(false)
  const [deleteConfirmPwd, setDeleteConfirmPwd] = useState('')
  const [deleteConfirmText, setDeleteConfirmText] = useState('')
  const [deletingAccount, setDeletingAccount] = useState(false)
  const [deleteError, setDeleteError] = useState('')

  // RDV
  const [reservations, setReservations] = useState<ReservationItem[]>([])
  const [loadingRdv, setLoadingRdv] = useState(false)
  const [cancelModalId, setCancelModalId] = useState<string | null>(null)
  const [cancelling, setCancelling] = useState(false)
  const [cancelError, setCancelError] = useState('')
  const [showAllHistory, setShowAllHistory] = useState(false)

  // Avis modal
  const [avisModalRdv, setAvisModalRdv] = useState<ReservationItem | null>(null)
  const [avisNote, setAvisNote] = useState(0)
  const [avisComment, setAvisComment] = useState('')
  const [avisMsg, setAvisMsg] = useState('')
  const [submittingAvis, setSubmittingAvis] = useState(false)

  // Tab data
  const [fidelite, setFidelite] = useState<FideliteData | null>(null)
  const [parrainage, setParrainage] = useState<ParrainageData | null>(null)
  const [avisData, setAvisData] = useState<AvisData | null>(null)
  const [notifs, setNotifs] = useState<ClientNotification[]>([])
  const [messages, setMessages] = useState<ClientMessage[]>([])
  const [offres, setOffres] = useState<Offre[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [unreadMessages, setUnreadMessages] = useState(0)
  const [expandedMsg, setExpandedMsg] = useState<string | null>(null)
  const [offreFilter, setOffreFilter] = useState<'all' | 'actif' | 'utilise' | 'expire'>('all')
  const [copiedCode, setCopiedCode] = useState<string | null>(null)
  const [uploadingAvatar, setUploadingAvatar] = useState(false)

  // ── Init ──────────────────────────────────────────────────────────────────

  useEffect(() => { setView('login') }, [])

  async function loadCompanyBySlug(s: string) {
    if (!s.trim()) return
    const { data } = await supabase.from('companies').select('*').eq('slug', s.trim()).eq('status', 'active').single()
    if (data) {
      setCompany(data as Company)
      const tok = await getStoredToken(data.id)
      if (tok) {
        try {
          const me = await getMe(tok)
          if (me?.client) { setToken(tok); applyMeData(me); return }
        } catch { /* expired */ }
      }
      setView('login')
    }
  }

  function applyMeData(data: Record<string, unknown>) {
    const c = data.client as ClientRecord
    setClient(c)
    setReservations((data.reservations as ReservationItem[]) ?? [])
    setEditPrenom(c.prenom); setEditNom(c.nom)
    setEditTel(c.telephone ?? ''); setEditDate(c.date_naissance ?? '')
    setEditAdresse(c.adresse ?? ''); setEditVille(c.ville ?? ''); setEditCodePostal(c.code_postal ?? '')
    setUnreadCount((data.unread_notif_count as number) ?? 0)
    setView('profile')
  }

  // ── Auth handlers ─────────────────────────────────────────────────────────

  async function handleLogin() {
    if (!company) { await loadCompanyBySlug(slug); return }
    setSubmitting(true); setAuthError('')
    try {
      const { client: c, token: tok } = await loginClient({ company_id: company.id, email: loginEmail, password: loginPwd })
      setToken(tok); setClient(c)
      setEditPrenom(c.prenom); setEditNom(c.nom)
      setEditTel(c.telephone ?? ''); setEditDate(c.date_naissance ?? '')
      setEditAdresse(c.adresse ?? ''); setEditVille(c.ville ?? ''); setEditCodePostal(c.code_postal ?? '')
      setView('profile')
    } catch (e) {
      setAuthError(e instanceof Error ? e.message : 'Erreur de connexion')
    }
    setSubmitting(false)
  }

  async function handleSignup() {
    if (!company) return
    if (!signupPrenom || !signupNom || !signupEmail || !signupPwd) { setAuthError('Champs requis manquants'); return }
    if (signupPwd !== signupConfirm) { setAuthError('Les mots de passe ne correspondent pas'); return }
    if (signupPwd.length < 8) { setAuthError('Mot de passe trop court (min. 8 caractères)'); return }
    setSubmitting(true); setAuthError('')
    try {
      const { client: c, token: tok } = await signupClient({
        company_id: company.id, prenom: signupPrenom, nom: signupNom,
        email: signupEmail, telephone: signupTel, password: signupPwd,
        date_naissance: signupDate || undefined,
      })
      setToken(tok); setClient(c)
      setEditPrenom(c.prenom); setEditNom(c.nom); setEditTel(c.telephone ?? '')
      setView('profile')
    } catch (e) {
      setAuthError(e instanceof Error ? e.message : 'Erreur inscription')
    }
    setSubmitting(false)
  }

  async function handleForgot() {
    if (!company || !forgotEmail) return
    setSubmitting(true)
    await requestPasswordReset(company.id, forgotEmail).catch(() => null)
    setView('reset_sent')
    setSubmitting(false)
  }

  async function handleLogout() {
    if (company) await logout(company.id)
    setToken(''); setClient(null); setView('login')
  }

  // ── Tab loading ───────────────────────────────────────────────────────────

  const loadTab = useCallback(async (t: ProfileTab) => {
    if (!token) return
    try {
      if (t === 'rdv') {
        setLoadingRdv(true)
        const data = await fetchRDV(token)
        setReservations((data.reservations as ReservationItem[]) ?? [])
        setLoadingRdv(false)
      } else if (t === 'fidelite') {
        const data = await fetchFidelite(token)
        setFidelite(data as FideliteData)
      } else if (t === 'parrainage') {
        const data = await fetchParrainage(token)
        setParrainage(data as ParrainageData)
      } else if (t === 'avis') {
        const data = await fetchAvis(token)
        setAvisData(data as AvisData)
      } else if (t === 'notifications') {
        const data = await fetchNotifications(token)
        setNotifs((data.notifications as ClientNotification[]) ?? [])
        setUnreadCount(0)
        await markNotifsRead(token).catch(() => null)
      } else if (t === 'messages') {
        const data = await fetchMessages(token)
        setMessages((data.messages as ClientMessage[]) ?? [])
        setUnreadMessages(0)
        await markMessagesRead(token).catch(() => null)
      } else if (t === 'offres') {
        const data = await fetchOffres(token)
        setOffres((data.offres as Offre[]) ?? [])
      }
    } catch { /* ignore */ }
  }, [token])

  function switchTab(t: ProfileTab) {
    setProfileTab(t)
    loadTab(t)
  }

  // ── RDV handlers ──────────────────────────────────────────────────────────

  async function handleCancelRDV() {
    if (!cancelModalId) return
    setCancelling(true); setCancelError('')
    try {
      await cancelRDV(token, cancelModalId)
      setReservations(prev => prev.map(r => r.id === cancelModalId ? { ...r, statut: 'cancelled' } : r))
      setCancelModalId(null)
    } catch (e) {
      setCancelError(e instanceof Error ? e.message : 'Erreur annulation')
    }
    setCancelling(false)
  }

  async function handleSubmitAvis() {
    if (!avisModalRdv || !avisNote) return
    setSubmittingAvis(true); setAvisMsg('')
    try {
      await submitAvis(token, {
        avis_token: avisModalRdv.avis_token ?? '',
        note: avisNote, commentaire: avisComment,
        client_prenom: client?.prenom,
      })
      setAvisMsg('Merci pour votre avis !')
      setTimeout(() => { setAvisModalRdv(null); setAvisNote(0); setAvisComment(''); setAvisMsg('') }, 1500)
    } catch (e) {
      setAvisMsg(e instanceof Error ? e.message : 'Erreur')
    }
    setSubmittingAvis(false)
  }

  async function handleSaveProfil() {
    setSavingProfil(true)
    try {
      await updateProfile(token, { prenom: editPrenom, nom: editNom, telephone: editTel, date_naissance: editDate || null, adresse: editAdresse, ville: editVille, code_postal: editCodePostal })
      setClient(prev => prev ? { ...prev, prenom: editPrenom, nom: editNom, telephone: editTel, date_naissance: editDate || null, adresse: editAdresse, ville: editVille, code_postal: editCodePostal } : prev)
      setProfilSaved(true)
      setTimeout(() => setProfilSaved(false), 2500)
    } catch { /* ignore */ }
    setSavingProfil(false)
  }

  async function handleChangePwd() {
    setPwdError('')
    if (newPwd !== confirmPwd) { setPwdError('Les mots de passe ne correspondent pas'); return }
    if (newPwd.length < 6) { setPwdError('Minimum 6 caractères'); return }
    setSavingPwd(true)
    try {
      await changePassword(token, currentPwd, newPwd)
      setPwdSaved(true)
      setCurrentPwd(''); setNewPwd(''); setConfirmPwd('')
      setTimeout(() => { setPwdSaved(false); setShowSecurity(false) }, 2500)
    } catch (e) {
      setPwdError(e instanceof Error ? e.message : 'Erreur')
    }
    setSavingPwd(false)
  }

  async function handleDeleteAccount() {
    if (deleteConfirmText !== 'SUPPRIMER') { setDeleteError('Tapez SUPPRIMER pour confirmer'); return }
    setDeletingAccount(true); setDeleteError('')
    try {
      await deleteAccount(token, deleteConfirmPwd)
      if (company) await logout(company.id)
      setClient(null); setToken(''); setView('login')
    } catch (e) {
      setDeleteError(e instanceof Error ? e.message : 'Erreur')
    }
    setDeletingAccount(false)
  }

  async function handleAvatarChange() {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync()
    if (!perm.granted) return
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, allowsEditing: true, aspect: [1, 1], quality: 0.8 })
    if (!result.canceled && result.assets[0]) {
      setUploadingAvatar(true)
      try {
        const uri = result.assets[0].uri
        const response = await fetch(uri)
        const blob = await response.blob()
        const reader = new FileReader()
        reader.readAsDataURL(blob)
        reader.onload = async () => {
          if (reader.result) {
            const url = await uploadAvatar(token, reader.result as string)
            setClient(c => c ? { ...c, avatar_url: url } : c)
          }
          setUploadingAvatar(false)
        }
      } catch { setUploadingAvatar(false) }
    }
  }

  async function handleCopyCode(code: string) {
    await Clipboard.setStringAsync(code)
    setCopiedCode(code)
    setTimeout(() => setCopiedCode(null), 2000)
  }

  // ── Screens ───────────────────────────────────────────────────────────────

  if (view === 'loading') {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: '#f5f3ff', alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator size="large" color="#7c3aed" />
      </SafeAreaView>
    )
  }

  if (view !== 'profile') {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: '#f5f3ff' }}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView contentContainerStyle={{ padding: 24, flexGrow: 1, justifyContent: 'center' }} keyboardShouldPersistTaps="handled">

            {/* Logo */}
            <View style={{ alignItems: 'center', marginBottom: 32 }}>
              {company?.logo_url
                ? <Image source={{ uri: company.logo_url }} style={{ height: 56, width: 120, resizeMode: 'contain' }} />
                : (
                  <LinearGradient colors={['#7c3aed', '#ec4899']} style={s.loginLogo}>
                    <Text style={{ color: '#fff', fontWeight: '800', fontSize: 22 }}>
                      {company?.name?.[0] ?? '✂'}
                    </Text>
                  </LinearGradient>
                )
              }
              <Text style={{ fontSize: 22, fontWeight: '800', color: '#1e1b4b', marginTop: 12 }}>
                {company?.name ?? 'Espace client'}
              </Text>
              <Text style={{ color: '#9ca3af', fontSize: 13 }}>Espace client</Text>
            </View>

            {/* Slug input */}
            {!company && (
              <>
                <TextInput
                  value={slug} onChangeText={setSlug}
                  placeholder="Identifiant du salon"
                  autoCapitalize="none" style={s.input}
                  placeholderTextColor="#9ca3af"
                  returnKeyType="search"
                  onSubmitEditing={() => loadCompanyBySlug(slug)}
                />
                <TouchableOpacity
                  onPress={() => loadCompanyBySlug(slug)}
                  style={{ opacity: slug ? 1 : 0.5, marginBottom: 16 }}
                >
                  <LinearGradient colors={['#7c3aed', '#ec4899']} style={s.btnGrad}>
                    <Text style={s.btnText}>Trouver mon salon</Text>
                  </LinearGradient>
                </TouchableOpacity>
              </>
            )}

            {/* Tab switcher */}
            {view !== 'forgot' && view !== 'reset_sent' && company && (
              <View style={s.authTabs}>
                {(['login', 'signup'] as const).map(t => (
                  <TouchableOpacity key={t} onPress={() => { setView(t); setAuthError('') }} style={[s.authTab, view === t && s.authTabActive]}>
                    <Text style={[s.authTabText, view === t && s.authTabTextActive]}>
                      {t === 'login' ? 'Connexion' : 'Créer un compte'}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}

            {/* Login */}
            {view === 'login' && company && (
              <View style={{ gap: 0 }}>
                <TextInput value={loginEmail} onChangeText={setLoginEmail} placeholder="Email" keyboardType="email-address" autoCapitalize="none" style={s.input} placeholderTextColor="#9ca3af" />
                <TextInput value={loginPwd} onChangeText={setLoginPwd} placeholder="Mot de passe" secureTextEntry style={s.input} placeholderTextColor="#9ca3af" />
                {authError ? <Text style={s.errText}>{authError}</Text> : null}
                <TouchableOpacity onPress={handleLogin} disabled={submitting} style={{ opacity: submitting ? 0.6 : 1, marginTop: 4 }}>
                  <LinearGradient colors={['#7c3aed', '#ec4899']} style={s.btnGrad}>
                    {submitting ? <ActivityIndicator color="#fff" /> : <Text style={s.btnText}>Se connecter</Text>}
                  </LinearGradient>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => { setView('forgot'); setAuthError('') }} style={{ marginTop: 12, alignSelf: 'center' }}>
                  <Text style={{ color: '#7c3aed', fontSize: 13, fontWeight: '600' }}>Mot de passe oublié ?</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* Signup */}
            {view === 'signup' && company && (
              <View style={{ gap: 0 }}>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <TextInput value={signupPrenom} onChangeText={setSignupPrenom} placeholder="Prénom *" style={[s.input, { flex: 1 }]} placeholderTextColor="#9ca3af" />
                  <TextInput value={signupNom} onChangeText={setSignupNom} placeholder="Nom *" style={[s.input, { flex: 1 }]} placeholderTextColor="#9ca3af" />
                </View>
                <TextInput value={signupEmail} onChangeText={setSignupEmail} placeholder="Email *" keyboardType="email-address" autoCapitalize="none" style={s.input} placeholderTextColor="#9ca3af" />
                <TextInput value={signupTel} onChangeText={setSignupTel} placeholder="Téléphone" keyboardType="phone-pad" style={s.input} placeholderTextColor="#9ca3af" />
                <Text style={{ fontSize: 12, color: '#6b7280', marginTop: 8, marginBottom: 2 }}>Date de naissance (offre anniversaire 🎂)</Text>
                <TextInput value={signupDate} onChangeText={setSignupDate} placeholder="AAAA-MM-JJ" style={s.input} placeholderTextColor="#9ca3af" />
                <TextInput value={signupPwd} onChangeText={setSignupPwd} placeholder="Mot de passe * (min. 8 car.)" secureTextEntry style={s.input} placeholderTextColor="#9ca3af" />
                {signupPwd.length > 0 && <PasswordStrengthBar pwd={signupPwd} />}
                <TextInput value={signupConfirm} onChangeText={setSignupConfirm} placeholder="Confirmer le mot de passe *" secureTextEntry style={s.input} placeholderTextColor="#9ca3af" />
                {authError ? <Text style={s.errText}>{authError}</Text> : null}
                <TouchableOpacity onPress={handleSignup} disabled={submitting} style={{ opacity: submitting ? 0.6 : 1, marginTop: 4 }}>
                  <LinearGradient colors={['#7c3aed', '#ec4899']} style={s.btnGrad}>
                    {submitting ? <ActivityIndicator color="#fff" /> : <Text style={s.btnText}>Créer mon compte</Text>}
                  </LinearGradient>
                </TouchableOpacity>
              </View>
            )}

            {/* Forgot */}
            {view === 'forgot' && (
              <View style={{ gap: 12 }}>
                <Text style={{ fontSize: 18, fontWeight: '800', color: '#111827', textAlign: 'center' }}>Mot de passe oublié</Text>
                <Text style={{ color: '#6b7280', textAlign: 'center', fontSize: 13 }}>Entrez votre email pour recevoir un lien de réinitialisation.</Text>
                <TextInput value={forgotEmail} onChangeText={setForgotEmail} placeholder="Votre email" keyboardType="email-address" style={s.input} placeholderTextColor="#9ca3af" />
                {authError ? <Text style={s.errText}>{authError}</Text> : null}
                <TouchableOpacity onPress={handleForgot} disabled={submitting || !forgotEmail} style={{ opacity: submitting || !forgotEmail ? 0.5 : 1 }}>
                  <LinearGradient colors={['#7c3aed', '#ec4899']} style={s.btnGrad}>
                    {submitting ? <ActivityIndicator color="#fff" /> : <Text style={s.btnText}>Envoyer le lien</Text>}
                  </LinearGradient>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => { setView('login'); setAuthError('') }} style={{ alignSelf: 'center' }}>
                  <Text style={{ color: '#7c3aed', fontSize: 13, fontWeight: '600' }}>← Retour à la connexion</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* Reset sent */}
            {view === 'reset_sent' && (
              <View style={{ alignItems: 'center', gap: 16 }}>
                <Text style={{ fontSize: 56, textAlign: 'center' }}>📧</Text>
                <Text style={{ fontSize: 20, fontWeight: '800', color: '#111827' }}>Email envoyé !</Text>
                <Text style={{ color: '#6b7280', textAlign: 'center' }}>Si un compte correspond à cette adresse, vous recevrez un lien de réinitialisation.</Text>
                <TouchableOpacity onPress={() => setView('login')}>
                  <LinearGradient colors={['#7c3aed', '#ec4899']} style={s.btnGrad}>
                    <Text style={s.btnText}>Retour à la connexion</Text>
                  </LinearGradient>
                </TouchableOpacity>
              </View>
            )}
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    )
  }

  // ── Profile portal ─────────────────────────────────────────────────────────

  const upcoming = reservations.filter(r => ['pending', 'confirmed', 'en_attente', 'confirmé'].includes(r.statut))
  const history = reservations.filter(r => !['pending', 'confirmed', 'en_attente', 'confirmé'].includes(r.statut))
  const historyShown = showAllHistory ? history : history.slice(0, 10)

  const PROFILE_TABS: { id: ProfileTab; label: string; badge?: number }[] = [
    { id: 'profil',        label: '👤 Profil' },
    { id: 'rdv',           label: '📅 Mes RDV' },
    { id: 'fidelite',      label: '⭐ Fidélité' },
    { id: 'parrainage',    label: '🤝 Parrainage' },
    { id: 'avis',          label: '💬 Mes avis' },
    { id: 'notifications', label: '🔔 Notifs', badge: unreadCount },
    { id: 'messages',      label: '✉️ Messages', badge: unreadMessages },
    { id: 'offres',        label: '🎟️ Offres' },
  ]

  function ProfilTab() {
    return (
      <View style={{ padding: 16, gap: 16, paddingBottom: 40 }}>
        <Card>
          <Text style={s.cardTitle}>Mes informations</Text>
          <View style={{ gap: 10, marginTop: 12 }}>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <View style={{ flex: 1 }}>
                <Text style={s.fieldLabel}>Prénom</Text>
                <TextInput value={editPrenom} onChangeText={setEditPrenom} style={s.input} placeholderTextColor="#9ca3af" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.fieldLabel}>Nom</Text>
                <TextInput value={editNom} onChangeText={setEditNom} style={s.input} placeholderTextColor="#9ca3af" />
              </View>
            </View>
            <View>
              <Text style={s.fieldLabel}>Email</Text>
              <TextInput value={client?.email ?? ''} editable={false} style={[s.input, { backgroundColor: '#f9fafb', color: '#9ca3af' }]} placeholderTextColor="#9ca3af" />
            </View>
            <View>
              <Text style={s.fieldLabel}>Téléphone</Text>
              <TextInput value={editTel} onChangeText={setEditTel} keyboardType="phone-pad" style={s.input} placeholderTextColor="#9ca3af" />
            </View>
            <View>
              <Text style={s.fieldLabel}>Date de naissance</Text>
              <TextInput value={editDate} onChangeText={setEditDate} placeholder="AAAA-MM-JJ" style={s.input} placeholderTextColor="#9ca3af" />
            </View>
            <View>
              <Text style={s.fieldLabel}>Adresse</Text>
              <TextInput value={editAdresse} onChangeText={setEditAdresse} style={s.input} placeholderTextColor="#9ca3af" />
            </View>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <View style={{ flex: 1 }}>
                <Text style={s.fieldLabel}>Ville</Text>
                <TextInput value={editVille} onChangeText={setEditVille} style={s.input} placeholderTextColor="#9ca3af" />
              </View>
              <View style={{ width: 100 }}>
                <Text style={s.fieldLabel}>Code postal</Text>
                <TextInput value={editCodePostal} onChangeText={setEditCodePostal} keyboardType="numeric" style={s.input} placeholderTextColor="#9ca3af" />
              </View>
            </View>
            {profilSaved && (
              <View style={[s.badge, { backgroundColor: '#d1fae5', alignSelf: 'flex-start' }]}>
                <Text style={[s.badgeText, { color: '#059669' }]}>✓ Sauvegardé</Text>
              </View>
            )}
            <TouchableOpacity onPress={handleSaveProfil} disabled={savingProfil} style={{ opacity: savingProfil ? 0.6 : 1 }}>
              <LinearGradient colors={['#7c3aed', '#ec4899']} style={s.btnGrad}>
                {savingProfil ? <ActivityIndicator color="#fff" /> : <Text style={s.btnText}>Sauvegarder</Text>}
              </LinearGradient>
            </TouchableOpacity>
          </View>
        </Card>

        {/* Sécurité */}
        <Card>
          <TouchableOpacity onPress={() => setShowSecurity(p => !p)} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text style={s.cardTitle}>🔒 Sécurité</Text>
            <Ionicons name={showSecurity ? 'chevron-up' : 'chevron-down'} size={18} color="#9ca3af" />
          </TouchableOpacity>
          {showSecurity && (
            <View style={{ gap: 10, marginTop: 12 }}>
              <View>
                <Text style={s.fieldLabel}>Mot de passe actuel</Text>
                <TextInput value={currentPwd} onChangeText={setCurrentPwd} secureTextEntry style={s.input} placeholderTextColor="#9ca3af" />
              </View>
              <View>
                <Text style={s.fieldLabel}>Nouveau mot de passe</Text>
                <TextInput value={newPwd} onChangeText={setNewPwd} secureTextEntry style={s.input} placeholderTextColor="#9ca3af" />
              </View>
              {newPwd.length > 0 && <PasswordStrengthBar pwd={newPwd} />}
              <View>
                <Text style={s.fieldLabel}>Confirmer</Text>
                <TextInput value={confirmPwd} onChangeText={setConfirmPwd} secureTextEntry style={s.input} placeholderTextColor="#9ca3af" />
              </View>
              {pwdError ? <Text style={s.errText}>{pwdError}</Text> : null}
              {pwdSaved && <View style={[s.badge, { backgroundColor: '#d1fae5', alignSelf: 'flex-start' }]}><Text style={[s.badgeText, { color: '#059669' }]}>✓ Mot de passe mis à jour</Text></View>}
              <TouchableOpacity onPress={handleChangePwd} disabled={savingPwd || !currentPwd || !newPwd || !confirmPwd} style={{ opacity: savingPwd || !currentPwd || !newPwd || !confirmPwd ? 0.5 : 1 }}>
                <LinearGradient colors={['#7c3aed', '#ec4899']} style={[s.btnGrad, { paddingVertical: 12 }]}>
                  {savingPwd ? <ActivityIndicator color="#fff" /> : <Text style={s.btnText}>Mettre à jour</Text>}
                </LinearGradient>
              </TouchableOpacity>
            </View>
          )}
        </Card>

        {/* Zone danger */}
        <Card style={{ borderColor: '#fca5a5', borderWidth: 1 }}>
          <TouchableOpacity onPress={() => setShowDanger(p => !p)} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text style={[s.cardTitle, { color: '#dc2626' }]}>⚠️ Zone de danger</Text>
            <Ionicons name={showDanger ? 'chevron-up' : 'chevron-down'} size={18} color="#dc2626" />
          </TouchableOpacity>
          {showDanger && (
            <View style={{ gap: 10, marginTop: 12 }}>
              <Text style={{ color: '#6b7280', fontSize: 13 }}>Cette action est irréversible. Votre compte et vos données seront définitivement supprimés.</Text>
              <View>
                <Text style={s.fieldLabel}>Mot de passe actuel</Text>
                <TextInput value={deleteConfirmPwd} onChangeText={setDeleteConfirmPwd} secureTextEntry style={s.input} placeholderTextColor="#9ca3af" />
              </View>
              <View>
                <Text style={s.fieldLabel}>Tapez SUPPRIMER pour confirmer</Text>
                <TextInput value={deleteConfirmText} onChangeText={setDeleteConfirmText} style={s.input} placeholderTextColor="#9ca3af" />
              </View>
              {deleteError ? <Text style={s.errText}>{deleteError}</Text> : null}
              <TouchableOpacity
                onPress={handleDeleteAccount}
                disabled={deletingAccount || deleteConfirmText !== 'SUPPRIMER' || !deleteConfirmPwd}
                style={{ opacity: deletingAccount || deleteConfirmText !== 'SUPPRIMER' || !deleteConfirmPwd ? 0.5 : 1 }}
              >
                <View style={{ backgroundColor: '#dc2626', borderRadius: 12, paddingVertical: 12, alignItems: 'center' }}>
                  {deletingAccount ? <ActivityIndicator color="#fff" /> : <Text style={{ color: '#fff', fontWeight: '700' }}>Supprimer mon compte</Text>}
                </View>
              </TouchableOpacity>
            </View>
          )}
        </Card>
      </View>
    )
  }

  function RdvTab() {
    if (loadingRdv) return <ActivityIndicator style={{ marginTop: 40 }} color="#7c3aed" />
    return (
      <View style={{ padding: 16, gap: 16, paddingBottom: 40 }}>
        {upcoming.length > 0 && (
          <Card>
            <Text style={s.cardTitle}>À venir</Text>
            <View style={{ gap: 10, marginTop: 12 }}>
              {upcoming.map(r => (
                <View key={r.id} style={s.rdvRow}>
                  <View style={{ flex: 1, gap: 4 }}>
                    <Text style={{ fontSize: 14, fontWeight: '700', color: '#111827' }}>{r.service}</Text>
                    <Text style={{ fontSize: 13, color: '#6b7280' }}>{formatDateFR(r.date_rdv)} à {r.heure_rdv?.slice(0, 5)}</Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <StatutBadge statut={r.statut} />
                      <Text style={{ fontSize: 13, color: '#059669', fontWeight: '600' }}>{Number(r.prix).toFixed(2)} $ CAD</Text>
                    </View>
                  </View>
                  {canCancel(r) && (
                    <TouchableOpacity style={s.cancelBtn} onPress={() => { setCancelModalId(r.id); setCancelError('') }}>
                      <Text style={{ color: '#dc2626', fontSize: 12, fontWeight: '600' }}>Annuler</Text>
                    </TouchableOpacity>
                  )}
                </View>
              ))}
            </View>
          </Card>
        )}

        {historyShown.length > 0 && (
          <Card>
            <Text style={s.cardTitle}>Historique</Text>
            <View style={{ gap: 10, marginTop: 12 }}>
              {historyShown.map(r => (
                <View key={r.id} style={s.rdvRow}>
                  <View style={{ flex: 1, gap: 4 }}>
                    <Text style={{ fontSize: 14, fontWeight: '700', color: '#111827' }}>{r.service}</Text>
                    <Text style={{ fontSize: 13, color: '#6b7280' }}>{formatDateFR(r.date_rdv)} à {r.heure_rdv?.slice(0, 5)}</Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <StatutBadge statut={r.statut} />
                      <Text style={{ fontSize: 13, color: '#059669', fontWeight: '600' }}>{Number(r.prix).toFixed(2)} $ CAD</Text>
                    </View>
                    {r.avis_token && !r.avis_id && (
                      <TouchableOpacity
                        onPress={() => { setAvisModalRdv(r); setAvisNote(0); setAvisComment(''); setAvisMsg('') }}
                        style={s.avisBtn}
                      >
                        <Ionicons name="star-outline" size={13} color="#f59e0b" />
                        <Text style={{ color: '#f59e0b', fontSize: 12, fontWeight: '700' }}>Laisser un avis</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                </View>
              ))}
              {history.length > 10 && !showAllHistory && (
                <TouchableOpacity onPress={() => setShowAllHistory(true)} style={{ alignSelf: 'center', paddingVertical: 8 }}>
                  <Text style={{ color: '#7c3aed', fontWeight: '600', fontSize: 13 }}>Voir plus ({history.length - 10} RDV)</Text>
                </TouchableOpacity>
              )}
            </View>
          </Card>
        )}

        {upcoming.length === 0 && history.length === 0 && (
          <View style={{ alignItems: 'center', paddingTop: 60, gap: 12 }}>
            <Ionicons name="calendar-outline" size={48} color="#c4b5fd" />
            <Text style={{ color: '#6b7280', fontSize: 15, fontWeight: '600' }}>Aucun rendez-vous</Text>
          </View>
        )}
      </View>
    )
  }

  function FideliteTab() {
    if (!fidelite) return <ActivityIndicator style={{ marginTop: 40 }} color="#7c3aed" />
    const pct = fidelite.seuil > 0 ? Math.min(100, Math.round((fidelite.points / fidelite.seuil) * 100)) : 0
    return (
      <View style={{ padding: 16, gap: 16, paddingBottom: 40 }}>
        <LinearGradient colors={['#7c3aed', '#ec4899']} style={[s.card, { gap: 12 }]}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <View>
              <Text style={{ color: 'rgba(255,255,255,0.8)', fontSize: 12 }}>Mes points</Text>
              <Text style={{ color: '#fff', fontSize: 36, fontWeight: '800' }}>{fidelite.points}</Text>
              <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 12 }}>
                Prochain cadeau à {fidelite.seuil} pts ({fidelite.valeur_cadeau} $ CAD)
              </Text>
            </View>
            <Text style={{ fontSize: 40 }}>⭐</Text>
          </View>
          <View style={s.progressBg}>
            <View style={[s.progressFill, { width: `${pct}%` as `${number}%` }]} />
          </View>
          <Text style={{ color: 'rgba(255,255,255,0.8)', fontSize: 12, textAlign: 'right' }}>{pct}%</Text>
        </LinearGradient>

        {fidelite.cadeaux.filter(c => c.statut === 'actif').length > 0 && (
          <Card>
            <Text style={s.cardTitle}>🎁 Cadeaux disponibles</Text>
            <View style={{ gap: 10, marginTop: 12 }}>
              {fidelite.cadeaux.filter(c => c.statut === 'actif').map(c => (
                <View key={c.id} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#f0fdf4', borderRadius: 12, padding: 12 }}>
                  <View>
                    <Text style={{ fontSize: 14, fontWeight: '700', color: '#065f46' }}>{c.valeur} $ CAD de réduction</Text>
                    <Text style={{ fontSize: 12, color: '#6b7280', fontFamily: 'monospace' }}>{c.code}</Text>
                    {c.expire_at && <Text style={{ fontSize: 11, color: '#9ca3af' }}>Expire : {c.expire_at.slice(0, 10)}</Text>}
                  </View>
                  <TouchableOpacity style={s.copyBtn} onPress={() => handleCopyCode(c.code)}>
                    <Ionicons name={copiedCode === c.code ? 'checkmark' : 'copy-outline'} size={16} color="#7c3aed" />
                    <Text style={{ fontSize: 12, color: '#7c3aed', fontWeight: '600' }}>{copiedCode === c.code ? 'Copié' : 'Copier'}</Text>
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          </Card>
        )}

        {fidelite.historique.length > 0 && (
          <Card>
            <Text style={s.cardTitle}>Historique des points</Text>
            <View style={{ gap: 8, marginTop: 12 }}>
              {fidelite.historique.slice(0, 8).map(h => (
                <View key={h.id} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <View>
                    <Text style={{ fontSize: 13, color: '#374151' }}>{h.note ?? h.type}</Text>
                    <Text style={{ fontSize: 11, color: '#9ca3af' }}>{dateRelative(h.created_at)}</Text>
                  </View>
                  <Text style={{ fontSize: 14, fontWeight: '700', color: h.points >= 0 ? '#059669' : '#dc2626' }}>
                    {h.points >= 0 ? '+' : ''}{h.points} pts
                  </Text>
                </View>
              ))}
            </View>
          </Card>
        )}

        <Card>
          <Text style={s.cardTitle}>Comment ça marche ?</Text>
          <View style={{ gap: 8, marginTop: 12 }}>
            {[
              { icon: '📅', text: `Gagnez des points à chaque rendez-vous complété` },
              { icon: '⭐', text: `Accumulez ${fidelite.seuil} points pour un cadeau de ${fidelite.valeur_cadeau} $ CAD` },
              { icon: '🎁', text: 'Un code de réduction vous est automatiquement envoyé' },
            ].map((item, i) => (
              <View key={i} style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-start' }}>
                <Text style={{ fontSize: 20 }}>{item.icon}</Text>
                <Text style={{ flex: 1, fontSize: 13, color: '#374151' }}>{item.text}</Text>
              </View>
            ))}
          </View>
        </Card>
      </View>
    )
  }

  function ParrainageTab() {
    if (!parrainage) return <ActivityIndicator style={{ marginTop: 40 }} color="#7c3aed" />
    if (!parrainage.actif) {
      return (
        <View style={{ alignItems: 'center', paddingTop: 60, gap: 12, padding: 16 }}>
          <Text style={{ fontSize: 48 }}>🤝</Text>
          <Text style={{ fontSize: 16, fontWeight: '700', color: '#374151', textAlign: 'center' }}>Programme de parrainage non activé</Text>
          <Text style={{ color: '#9ca3af', textAlign: 'center' }}>Ce salon n'a pas encore activé le programme de parrainage.</Text>
        </View>
      )
    }
    if (!parrainage.eligible) {
      return (
        <View style={{ alignItems: 'center', paddingTop: 60, gap: 12, padding: 16 }}>
          <Ionicons name="lock-closed-outline" size={56} color="#c4b5fd" />
          <Text style={{ fontSize: 16, fontWeight: '700', color: '#374151', textAlign: 'center' }}>Complétez votre premier RDV</Text>
          <Text style={{ color: '#9ca3af', textAlign: 'center' }}>Parrainez vos proches après votre premier rendez-vous complété.</Text>
        </View>
      )
    }

    const lien = parrainage.lien

    return (
      <View style={{ padding: 16, gap: 16, paddingBottom: 40 }}>
        <LinearGradient colors={['#7c3aed', '#ec4899']} style={[s.card, { gap: 12 }]}>
          <Text style={{ color: 'rgba(255,255,255,0.8)', fontSize: 13 }}>Mon code de parrainage</Text>
          <Text style={{ color: '#fff', fontSize: 32, fontWeight: '800', letterSpacing: 4 }}>{parrainage.code}</Text>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <TouchableOpacity onPress={() => handleCopyCode(parrainage.code)} style={[s.copyBtn, { backgroundColor: 'rgba(255,255,255,0.2)', flex: 1, justifyContent: 'center' }]}>
              <Ionicons name={copiedCode === parrainage.code ? 'checkmark' : 'copy-outline'} size={16} color="#fff" />
              <Text style={{ color: '#fff', fontWeight: '600', fontSize: 13 }}>{copiedCode === parrainage.code ? 'Copié !' : 'Copier'}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => Share.share({ title: `Rejoignez ${company?.name}`, message: `Prenez RDV avec mon code et recevez ${parrainage.remise_filleul}$ CAD de réduction ! ${lien}` })}
              style={[s.copyBtn, { backgroundColor: 'rgba(255,255,255,0.2)', flex: 1, justifyContent: 'center' }]}
            >
              <Ionicons name="share-social-outline" size={16} color="#fff" />
              <Text style={{ color: '#fff', fontWeight: '600', fontSize: 13 }}>Partager</Text>
            </TouchableOpacity>
          </View>
        </LinearGradient>

        <View style={{ flexDirection: 'row', gap: 12 }}>
          {[
            { label: 'Invités', value: parrainage.stats.total },
            { label: 'Complétés', value: parrainage.stats.completes },
            { label: `Gains`, value: `${parrainage.stats.gains} $ CAD` },
          ].map((k, i) => (
            <Card key={i} style={{ flex: 1, alignItems: 'center', gap: 4 }}>
              <Text style={{ fontSize: 22, fontWeight: '800', color: '#7c3aed' }}>{k.value}</Text>
              <Text style={{ fontSize: 11, color: '#6b7280', textAlign: 'center' }}>{k.label}</Text>
            </Card>
          ))}
        </View>

        {parrainage.historique.length > 0 && (
          <Card>
            <Text style={s.cardTitle}>Historique</Text>
            <View style={{ gap: 8, marginTop: 12 }}>
              {parrainage.historique.map(h => (
                <View key={h.id} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Text style={{ fontSize: 13, color: '#374151' }}>{h.filleul_prenom ?? h.filleul_email ?? '—'}</Text>
                  <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
                    <View style={[s.badge, { backgroundColor: h.statut === 'complete' ? '#dcfce7' : '#fef3c7' }]}>
                      <Text style={[s.badgeText, { color: h.statut === 'complete' ? '#065f46' : '#92400e' }]}>
                        {h.statut === 'complete' ? 'Complété' : 'En attente'}
                      </Text>
                    </View>
                    <Text style={{ fontSize: 11, color: '#9ca3af' }}>{dateRelative(h.created_at)}</Text>
                  </View>
                </View>
              ))}
            </View>
          </Card>
        )}

        <Card>
          <Text style={s.cardTitle}>Comment ça marche ?</Text>
          <View style={{ gap: 8, marginTop: 12 }}>
            {[
              { icon: '🔗', text: `Partagez votre code ou lien unique` },
              { icon: '🎁', text: `Votre filleul reçoit ${parrainage.remise_filleul} $ CAD de réduction sur son premier RDV` },
              { icon: '💰', text: `Vous recevez ${parrainage.remise_parrain} $ CAD de réduction après son RDV` },
            ].map((item, i) => (
              <View key={i} style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-start' }}>
                <Text style={{ fontSize: 20 }}>{item.icon}</Text>
                <Text style={{ flex: 1, fontSize: 13, color: '#374151' }}>{item.text}</Text>
              </View>
            ))}
          </View>
        </Card>
      </View>
    )
  }

  function AvisTab() {
    if (!avisData) return <ActivityIndicator style={{ marginTop: 40 }} color="#7c3aed" />
    return (
      <View style={{ padding: 16, gap: 16, paddingBottom: 40 }}>
        {avisData.a_evaluer.length > 0 && (
          <Card style={{ borderColor: '#fbbf24', borderWidth: 1 }}>
            <Text style={s.cardTitle}>⭐ À évaluer</Text>
            <View style={{ gap: 8, marginTop: 12 }}>
              {avisData.a_evaluer.map(r => (
                <TouchableOpacity
                  key={r.id}
                  onPress={() => { setAvisModalRdv(r); setAvisNote(0); setAvisComment(''); setAvisMsg('') }}
                  style={[s.rdvRow, { backgroundColor: '#fefce8' }]}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 14, fontWeight: '700', color: '#111827' }}>{r.service}</Text>
                    <Text style={{ fontSize: 12, color: '#6b7280' }}>{formatDateFR(r.date_rdv)}</Text>
                  </View>
                  <Ionicons name="star-outline" size={20} color="#f59e0b" />
                </TouchableOpacity>
              ))}
            </View>
          </Card>
        )}

        {avisData.soumis.length > 0 && (
          <Card>
            <Text style={s.cardTitle}>Mes avis</Text>
            <View style={{ gap: 12, marginTop: 12 }}>
              {avisData.soumis.map(a => (
                <View key={a.id} style={{ gap: 6, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: '#f3f4f6' }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Stars note={a.note} />
                    <Text style={{ fontSize: 11, color: '#9ca3af' }}>{dateRelative(a.created_at)}</Text>
                  </View>
                  {a.service && <Text style={{ fontSize: 12, color: '#7c3aed', fontWeight: '600' }}>{a.service}</Text>}
                  {a.commentaire && <Text style={{ fontSize: 13, color: '#374151', fontStyle: 'italic' }}>"{a.commentaire}"</Text>}
                  {a.reponse_admin && (
                    <View style={{ backgroundColor: '#f5f3ff', borderRadius: 8, padding: 8, marginTop: 4 }}>
                      <Text style={{ fontSize: 11, fontWeight: '700', color: '#7c3aed' }}>Réponse du salon :</Text>
                      <Text style={{ fontSize: 12, color: '#374151', marginTop: 2 }}>{a.reponse_admin}</Text>
                    </View>
                  )}
                </View>
              ))}
            </View>
          </Card>
        )}

        {avisData.soumis.length === 0 && avisData.a_evaluer.length === 0 && (
          <View style={{ alignItems: 'center', paddingTop: 60, gap: 12 }}>
            <Ionicons name="star-outline" size={48} color="#c4b5fd" />
            <Text style={{ color: '#6b7280', fontSize: 15, fontWeight: '600' }}>Aucun avis</Text>
          </View>
        )}
      </View>
    )
  }

  function NotifsTab() {
    return (
      <View style={{ padding: 16, gap: 12, paddingBottom: 40 }}>
        {notifs.length === 0 ? (
          <View style={{ alignItems: 'center', paddingTop: 60, gap: 12 }}>
            <Ionicons name="notifications-outline" size={48} color="#c4b5fd" />
            <Text style={{ color: '#6b7280', fontSize: 15, fontWeight: '600' }}>Aucune notification</Text>
          </View>
        ) : notifs.map(n => (
          <Card key={n.id} style={{ flexDirection: 'row', gap: 12, alignItems: 'flex-start' }}>
            <View style={[s.notifDot, { backgroundColor: n.lu ? '#e5e7eb' : '#7c3aed' }]} />
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={{ fontSize: 14, fontWeight: '700', color: '#111827' }}>{n.titre}</Text>
              <Text style={{ fontSize: 13, color: '#6b7280' }}>{n.message}</Text>
              <Text style={{ fontSize: 11, color: '#9ca3af' }}>{dateRelative(n.created_at)}</Text>
            </View>
          </Card>
        ))}
      </View>
    )
  }

  function MessagesTab() {
    return (
      <View style={{ padding: 16, gap: 12, paddingBottom: 40 }}>
        {messages.length === 0 ? (
          <View style={{ alignItems: 'center', paddingTop: 60, gap: 12 }}>
            <Ionicons name="mail-outline" size={48} color="#c4b5fd" />
            <Text style={{ color: '#6b7280', fontSize: 15, fontWeight: '600' }}>Aucun message</Text>
          </View>
        ) : messages.map(m => {
          const body = m.message_email ?? m.message_sms ?? ''
          const isExpanded = expandedMsg === m.id
          const truncated = body.length > 200 && !isExpanded
          return (
            <Card key={m.id} style={{ gap: 8 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Ionicons
                  name={m.canal === 'sms' ? 'chatbubble-outline' : 'mail-outline'}
                  size={16} color="#7c3aed"
                />
                <Text style={{ flex: 1, fontSize: 13, fontWeight: '700', color: '#111827' }}>{m.campagne_nom}</Text>
                {!m.vu && <View style={[s.badge, { backgroundColor: '#dbeafe' }]}><Text style={[s.badgeText, { color: '#1d4ed8' }]}>Nouveau</Text></View>}
              </View>
              {body.length > 0 && (
                <>
                  <Text style={{ fontSize: 13, color: '#374151', lineHeight: 20 }}>
                    {truncated ? body.slice(0, 200) + '…' : body}
                  </Text>
                  {body.length > 200 && (
                    <TouchableOpacity onPress={() => setExpandedMsg(isExpanded ? null : m.id)}>
                      <Text style={{ color: '#7c3aed', fontSize: 12, fontWeight: '600' }}>
                        {isExpanded ? 'Voir moins' : 'Voir plus'}
                      </Text>
                    </TouchableOpacity>
                  )}
                </>
              )}
              {m.envoye_at && <Text style={{ fontSize: 11, color: '#9ca3af' }}>{dateRelative(m.envoye_at)}</Text>}
            </Card>
          )
        })}
      </View>
    )
  }

  function OffresTab() {
    const filtered = offreFilter === 'all' ? offres : offres.filter(o => o.statut === offreFilter)
    const stats = { actif: offres.filter(o => o.statut === 'actif').length, utilise: offres.filter(o => o.statut === 'utilise').length, expire: offres.filter(o => o.statut === 'expire').length }

    return (
      <View style={{ padding: 16, gap: 16, paddingBottom: 40 }}>
        {/* KPI */}
        <View style={{ flexDirection: 'row', gap: 10 }}>
          {[
            { label: 'Actives', value: stats.actif, color: '#059669' },
            { label: 'Utilisées', value: stats.utilise, color: '#7c3aed' },
            { label: 'Expirées', value: stats.expire, color: '#9ca3af' },
          ].map((k, i) => (
            <Card key={i} style={{ flex: 1, alignItems: 'center', gap: 4 }}>
              <Text style={{ fontSize: 22, fontWeight: '800', color: k.color }}>{k.value}</Text>
              <Text style={{ fontSize: 11, color: '#6b7280' }}>{k.label}</Text>
            </Card>
          ))}
        </View>

        {/* Filtres */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {(['all', 'actif', 'utilise', 'expire'] as const).map(f => (
              <TouchableOpacity key={f} onPress={() => setOffreFilter(f)} style={[s.chip, offreFilter === f && s.chipActive]}>
                <Text style={[s.chipText, offreFilter === f && s.chipTextActive]}>
                  {f === 'all' ? 'Toutes' : f === 'actif' ? 'Actives' : f === 'utilise' ? 'Utilisées' : 'Expirées'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </ScrollView>

        {filtered.length === 0 ? (
          <View style={{ alignItems: 'center', paddingTop: 40, gap: 12 }}>
            <Ionicons name="ticket-outline" size={48} color="#c4b5fd" />
            <Text style={{ color: '#6b7280', fontSize: 14, fontWeight: '600' }}>Aucune offre</Text>
          </View>
        ) : filtered.map(o => {
          const srcCfg = OFFRE_SOURCE_CFG[o.source] ?? { label: o.source, color: '#374151', bg: '#f3f4f6' }
          const isExpire = o.statut !== 'actif'
          return (
            <Card key={o.id} style={{ opacity: isExpire ? 0.7 : 1 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                <View style={{ flex: 1, gap: 4 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Text style={{ fontSize: 14, fontWeight: '800', color: '#111827' }}>{o.nom}</Text>
                    <View style={[s.badge, { backgroundColor: srcCfg.bg }]}>
                      <Text style={[s.badgeText, { color: srcCfg.color }]}>{srcCfg.label}</Text>
                    </View>
                  </View>
                  <Text style={{ fontSize: 13, color: '#374151' }}>
                    {o.type_remise === 'pourcentage' ? `${o.valeur_remise}% de réduction` : `${o.valeur_remise} $ CAD de réduction`}
                  </Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                    <Text style={{ fontSize: 12, fontFamily: 'monospace', color: '#7c3aed', fontWeight: '700' }}>{o.code}</Text>
                  </View>
                  {o.expire_at && <Text style={{ fontSize: 11, color: '#9ca3af' }}>Expire : {o.expire_at.slice(0, 10)}</Text>}
                </View>
                {o.statut === 'actif' && (
                  <TouchableOpacity style={s.copyBtn} onPress={() => handleCopyCode(o.code)}>
                    <Ionicons name={copiedCode === o.code ? 'checkmark' : 'copy-outline'} size={16} color="#7c3aed" />
                    <Text style={{ fontSize: 11, color: '#7c3aed', fontWeight: '600' }}>{copiedCode === o.code ? 'Copié' : 'Copier'}</Text>
                  </TouchableOpacity>
                )}
              </View>
            </Card>
          )
        })}
      </View>
    )
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#f5f3ff' }} edges={['top']}>
      {/* Header */}
      <View style={s.portalHeader}>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 16, fontWeight: '800', color: '#1e1b4b' }} numberOfLines={1}>{company?.name}</Text>
          <Text style={{ fontSize: 12, color: '#9ca3af' }}>Espace client</Text>
        </View>
        <TouchableOpacity onPress={() => switchTab('notifications')} style={s.headerIconBtn}>
          <Ionicons name="notifications-outline" size={20} color="#7c3aed" />
          {unreadCount > 0 && (
            <View style={s.headerBadge}>
              <Text style={{ color: '#fff', fontSize: 9, fontWeight: '800' }}>{unreadCount}</Text>
            </View>
          )}
        </TouchableOpacity>
        <TouchableOpacity onPress={handleLogout} style={[s.headerIconBtn, { backgroundColor: '#fef2f2', marginLeft: 6 }]}>
          <Ionicons name="log-out-outline" size={20} color="#ef4444" />
        </TouchableOpacity>
      </View>

      {/* Hero card */}
      <View style={s.heroCard}>
        <TouchableOpacity onPress={handleAvatarChange} style={{ position: 'relative' }}>
          {uploadingAvatar
            ? <View style={s.avatarLarge}><ActivityIndicator color="#7c3aed" /></View>
            : client?.avatar_url
              ? <Image source={{ uri: client.avatar_url }} style={s.avatarLarge} />
              : <GradientAvatar prenom={client?.prenom ?? ''} nom={client?.nom ?? ''} size={64} />
          }
          <View style={s.cameraOverlay}><Ionicons name="camera" size={13} color="#fff" /></View>
        </TouchableOpacity>
        <View style={{ flex: 1, marginLeft: 12 }}>
          <Text style={{ fontSize: 17, fontWeight: '800', color: '#1e1b4b' }}>
            {client?.prenom} {client?.nom}
          </Text>
          <Text style={{ fontSize: 12, color: '#9ca3af' }} numberOfLines={1}>{client?.email}</Text>
          <View style={{ flexDirection: 'row', gap: 6, marginTop: 4, flexWrap: 'wrap' }}>
            {client?.segment && (
              <View style={[s.badge, { backgroundColor: '#ede9fe' }]}>
                <Text style={[s.badgeText, { color: '#7c3aed' }]}>{SEGMENT_LABEL[client.segment] ?? client.segment}</Text>
              </View>
            )}
            {(client?.points_fidelite ?? 0) > 0 && (
              <View style={[s.badge, { backgroundColor: '#fef3c7' }]}>
                <Text style={[s.badgeText, { color: '#92400e' }]}>⭐ {client!.points_fidelite} pts</Text>
              </View>
            )}
          </View>
        </View>
      </View>

      {/* Tab bar horizontal */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.tabScrollView} contentContainerStyle={{ paddingHorizontal: 12, paddingVertical: 8, gap: 8, paddingBottom: insets.bottom > 0 ? insets.bottom : 8 }}>
        {PROFILE_TABS.map(t => (
          <TouchableOpacity key={t.id} onPress={() => switchTab(t.id)} style={[s.tabChip, profileTab === t.id && s.tabChipActive]}>
            <Text style={[s.tabChipText, profileTab === t.id && s.tabChipTextActive]}>{t.label}</Text>
            {(t.badge ?? 0) > 0 && (
              <View style={s.tabBadge}>
                <Text style={{ color: '#fff', fontSize: 9, fontWeight: '800' }}>{t.badge}</Text>
              </View>
            )}
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Content */}
      <ScrollView style={{ flex: 1 }} keyboardShouldPersistTaps="handled">
        {profileTab === 'profil'        && <ProfilTab />}
        {profileTab === 'rdv'           && <RdvTab />}
        {profileTab === 'fidelite'      && <FideliteTab />}
        {profileTab === 'parrainage'    && <ParrainageTab />}
        {profileTab === 'avis'          && <AvisTab />}
        {profileTab === 'notifications' && <NotifsTab />}
        {profileTab === 'messages'      && <MessagesTab />}
        {profileTab === 'offres'        && <OffresTab />}
      </ScrollView>

      {/* Modal: annuler RDV */}
      <Modal visible={!!cancelModalId} transparent animationType="slide">
        <View style={s.modalOverlay}>
          <View style={s.modalBox}>
            <Text style={s.modalTitle}>Annuler ce rendez-vous ?</Text>
            <Text style={{ color: '#6b7280', fontSize: 13, textAlign: 'center', marginTop: 4 }}>Cette action est irréversible.</Text>
            {cancelError ? <Text style={s.errText}>{cancelError}</Text> : null}
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 16 }}>
              <TouchableOpacity style={[s.modalBtn, { backgroundColor: '#f3f4f6' }]} onPress={() => setCancelModalId(null)}>
                <Text style={{ color: '#374151', fontWeight: '600' }}>Garder</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[s.modalBtn, { backgroundColor: '#fee2e2' }]} onPress={handleCancelRDV} disabled={cancelling}>
                {cancelling ? <ActivityIndicator color="#dc2626" /> : <Text style={{ color: '#dc2626', fontWeight: '700' }}>Oui, annuler</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Modal: laisser un avis */}
      <Modal visible={!!avisModalRdv} transparent animationType="slide">
        <View style={s.modalOverlay}>
          <View style={s.modalBox}>
            <Text style={s.modalTitle}>Laisser un avis</Text>
            {avisModalRdv && <Text style={{ color: '#6b7280', fontSize: 13, textAlign: 'center', marginTop: 4 }}>{avisModalRdv.service}</Text>}
            <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 8, marginTop: 16 }}>
              {[1, 2, 3, 4, 5].map(n => (
                <TouchableOpacity key={n} onPress={() => setAvisNote(n)}>
                  <Text style={{ fontSize: 36, color: n <= avisNote ? '#f59e0b' : '#e5e7eb' }}>★</Text>
                </TouchableOpacity>
              ))}
            </View>
            <TextInput
              value={avisComment} onChangeText={setAvisComment}
              placeholder="Commentaire (optionnel)"
              multiline numberOfLines={3}
              style={[s.input, { height: 70, textAlignVertical: 'top', marginTop: 12 }]}
              placeholderTextColor="#9ca3af"
            />
            {avisMsg ? <Text style={[s.errText, avisMsg.startsWith('Merci') && { color: '#059669' }]}>{avisMsg}</Text> : null}
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 12 }}>
              <TouchableOpacity style={[s.modalBtn, { backgroundColor: '#f3f4f6' }]} onPress={() => setAvisModalRdv(null)}>
                <Text style={{ color: '#374151', fontWeight: '600' }}>Annuler</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.modalBtn, { flex: 1 }]}
                onPress={handleSubmitAvis}
                disabled={!avisNote || submittingAvis}
              >
                <LinearGradient colors={['#7c3aed', '#ec4899']} style={{ flex: 1, borderRadius: 10, alignItems: 'center', justifyContent: 'center', paddingVertical: 10 }}>
                  {submittingAvis ? <ActivityIndicator color="#fff" /> : <Text style={{ color: '#fff', fontWeight: '700' }}>Envoyer</Text>}
                </LinearGradient>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  )
}

// ── Styles ─────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  // Auth
  loginLogo: { width: 72, height: 72, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  authTabs: { flexDirection: 'row', backgroundColor: '#e5e7eb', borderRadius: 12, padding: 3, marginBottom: 16 },
  authTab: { flex: 1, paddingVertical: 8, borderRadius: 10, alignItems: 'center' },
  authTabActive: { backgroundColor: '#fff' },
  authTabText: { fontSize: 13, color: '#6b7280', fontWeight: '600' },
  authTabTextActive: { color: '#111827', fontWeight: '800' },

  // Portal
  portalHeader: {
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10,
    backgroundColor: '#fff', shadowColor: '#7c3aed', shadowOpacity: 0.06, shadowRadius: 8, elevation: 2,
  },
  headerIconBtn: {
    width: 36, height: 36, borderRadius: 10, backgroundColor: '#ede9fe',
    alignItems: 'center', justifyContent: 'center',
  },
  headerBadge: {
    position: 'absolute', top: -4, right: -4, backgroundColor: '#ef4444',
    borderRadius: 8, minWidth: 16, height: 16, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3,
  },
  heroCard: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#fff', paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: '#f3f4f6',
  },
  avatarLarge: { width: 64, height: 64, borderRadius: 32, backgroundColor: '#ede9fe' },
  cameraOverlay: {
    position: 'absolute', bottom: 0, right: 0,
    width: 22, height: 22, borderRadius: 11, backgroundColor: '#7c3aed',
    alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: '#fff',
  },

  // Tabs
  tabScrollView: { backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#f3f4f6', maxHeight: 56 },
  tabChip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20,
    backgroundColor: '#f3f4f6', borderWidth: 1, borderColor: '#e5e7eb',
  },
  tabChipActive: { backgroundColor: '#7c3aed', borderColor: '#7c3aed' },
  tabChipText: { fontSize: 12, color: '#374151', fontWeight: '600' },
  tabChipTextActive: { color: '#fff', fontWeight: '700' },
  tabBadge: {
    backgroundColor: '#ef4444', borderRadius: 8, minWidth: 16, height: 16,
    alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3,
  },

  // Cards
  card: {
    backgroundColor: 'rgba(255,255,255,0.92)', borderRadius: 20, padding: 16,
    shadowColor: '#7c3aed', shadowOpacity: 0.07, shadowRadius: 10, elevation: 3,
  },
  cardTitle: { fontSize: 15, fontWeight: '800', color: '#111827' },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
  badgeText: { fontSize: 11, fontWeight: '700' },

  // Forms
  input: {
    backgroundColor: '#fff', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12,
    fontSize: 14, color: '#111827', borderWidth: 1, borderColor: '#e5e7eb', marginTop: 8,
  },
  fieldLabel: { fontSize: 12, fontWeight: '600', color: '#6b7280', marginBottom: 2 },
  errText: { color: '#ef4444', fontSize: 13, textAlign: 'center', marginTop: 6 },
  btnGrad: { borderRadius: 14, paddingVertical: 14, alignItems: 'center', justifyContent: 'center' },
  btnText: { color: '#fff', fontWeight: '700', fontSize: 15 },

  // RDV
  rdvRow: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 10,
    backgroundColor: '#f9f9fc', borderRadius: 12, padding: 12,
  },
  cancelBtn: {
    backgroundColor: '#fee2e2', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6,
    alignSelf: 'flex-start',
  },
  avisBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: '#fef3c7', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5, alignSelf: 'flex-start',
  },

  // Fidélité
  progressBg: { height: 8, backgroundColor: 'rgba(255,255,255,0.3)', borderRadius: 4, overflow: 'hidden' },
  progressFill: { height: '100%', backgroundColor: '#fff', borderRadius: 4 },

  // Notifs
  notifDot: { width: 10, height: 10, borderRadius: 5, marginTop: 4 },

  // Copy
  copyBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#ede9fe', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 },

  // Chips
  chip: {
    paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20,
    backgroundColor: '#f3f4f6', borderWidth: 1, borderColor: '#e5e7eb',
  },
  chipActive: { backgroundColor: '#7c3aed', borderColor: '#7c3aed' },
  chipText: { fontSize: 12, color: '#374151', fontWeight: '600' },
  chipTextActive: { color: '#fff', fontWeight: '700' },

  // Modals
  modalOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center', alignItems: 'center', padding: 24,
  },
  modalBox: {
    backgroundColor: '#fff', borderRadius: 24, padding: 24, width: '100%',
    shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 20, elevation: 10,
  },
  modalTitle: { fontSize: 17, fontWeight: '800', color: '#111827', textAlign: 'center' },
  modalBtn: { flex: 1, borderRadius: 10, paddingVertical: 10, alignItems: 'center', justifyContent: 'center' },
})
