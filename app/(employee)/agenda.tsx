import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'expo-router'
import AsyncStorage from '@react-native-async-storage/async-storage'
import {
  View, Text, ScrollView, TouchableOpacity, TextInput,
  StyleSheet, ActivityIndicator, Alert, Platform, KeyboardAvoidingView,
} from 'react-native'
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { LinearGradient } from 'expo-linear-gradient'
import {
  loginEmploye, logoutEmploye, getMe, getDemandes, getStats,
  getGratifications, getRdv, getNotifications,
  markGratifRead, markNotifRead, updateProfile, changePassword, submitDemande,
} from '../../lib/employeAuth'
import type { EmployeProfile } from '../../lib/employeAuth'

// ── Types ──────────────────────────────────────────────────────────────────────

type Tab = 'accueil' | 'mesrdv' | 'demandes' | 'profil' | 'performances' | 'gratifications'

interface ResaToday {
  id: string; date_rdv: string; heure_rdv: string; service: string | null
  client_prenom: string | null; client_nom: string | null
  statut: string; prix: string | number | null; duree_rdv: number | null
}

interface DemandeRH {
  id: string; type_demande: string
  date_debut: string; heure_debut: string; date_fin: string; heure_fin: string
  motif: string | null; statut: 'en_attente' | 'approuve' | 'refuse'
  commentaire_manager: string | null; created_at: string
  type_document?: string | null; date_souhaitee?: string | null; note_manager?: string | null
}

interface Notif {
  id: string; type: string; titre: string; message: string; lu: boolean; created_at: string
}

interface Stats {
  rdv_completes: number; revenus_mois: number
  note_moyenne: number | null; nb_avis: number
  avis_recents: { id: string; note: number; commentaire: string | null; created_at: string }[]
}

interface Gratif {
  id: string; type_gratif: 'bonus' | 'felicitations' | 'prime'
  montant: number; message: string; lu: boolean; created_at: string
}

// ── Constants ──────────────────────────────────────────────────────────────────

const TYPE_DEMANDE_LABELS: Record<string, string> = {
  conge: 'Congé', maladie: 'Arrêt maladie', permission: 'Permission',
  changement_horaire: 'Changement horaire', extra_shift: 'Extra / Shift supplémentaire',
  document_administratif: 'Demande de document',
}

const TYPE_DOC_LABELS: Record<string, string> = {
  attestation_emploi: "Attestation d'emploi",
  certificat_travail: 'Certificat de travail',
  releve_salaire: 'Relevé de salaire',
  lettre_reference: 'Lettre de référence',
  autre: 'Autre document',
}

const STATUT_RDV_CFG: Record<string, { label: string; bg: string; color: string }> = {
  pending:   { label: 'En attente', bg: 'rgba(245,158,11,0.12)',  color: '#d97706' },
  confirmed: { label: 'Confirmé',   bg: 'rgba(16,185,129,0.12)',  color: '#059669' },
  completed: { label: 'Complété',   bg: 'rgba(59,130,246,0.12)',  color: '#1d4ed8' },
  cancelled: { label: 'Annulé',     bg: 'rgba(239,68,68,0.12)',   color: '#dc2626' },
  no_show:   { label: 'No-show',    bg: 'rgba(107,114,128,0.12)', color: '#6b7280' },
}

const STATUT_CFG: Record<string, { label: string; emoji: string }> = {
  travaille:    { label: 'Travaille',    emoji: '✅' },
  conge:        { label: 'Congé',        emoji: '🏖️' },
  maladie:      { label: 'Maladie',      emoji: '🤒' },
  permission:   { label: 'Permission',   emoji: '📋' },
  formation:    { label: 'Formation',    emoji: '📚' },
  indisponible: { label: 'Indisponible', emoji: '⛔' },
}

const GRATIF_CFG: Record<string, { icon: string; label: string; color: string }> = {
  bonus:         { icon: '🎁', label: 'Bonus',        color: '#059669' },
  felicitations: { icon: '⭐', label: 'Félicitations', color: '#d97706' },
  prime:         { icon: '🏆', label: 'Prime',         color: '#7c3aed' },
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function initiales(prenom: string | null, nom: string) {
  return `${prenom?.[0] ?? ''}${nom[0] ?? ''}`.toUpperCase() || '?'
}
function dateFR(d: string) {
  return new Date(d + 'T12:00').toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' })
}
function relativeTime(d: string) {
  const days = Math.floor((Date.now() - new Date(d).getTime()) / 86_400_000)
  if (days === 0) return "Aujourd'hui"
  if (days === 1) return 'Hier'
  if (days < 7) return `Il y a ${days}j`
  return `Il y a ${Math.floor(days / 7)} sem.`
}
function groupByDate(resas: ResaToday[]): [string, ResaToday[]][] {
  const map = new Map<string, ResaToday[]>()
  for (const r of resas) {
    if (!map.has(r.date_rdv)) map.set(r.date_rdv, [])
    map.get(r.date_rdv)!.push(r)
  }
  return [...map.entries()]
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function AvatarCircle({ employe }: { employe: EmployeProfile | null }) {
  if (!employe) return null
  return (
    <LinearGradient colors={['#7c3aed', '#ec4899']} style={s.avatarCircle}>
      <Text style={s.avatarText}>{initiales(employe.prenom, employe.nom)}</Text>
    </LinearGradient>
  )
}

function BadgeDot() {
  return <View style={s.badgeDot} />
}

function StatutBadge({ statut }: { statut: string }) {
  const cfg = STATUT_RDV_CFG[statut] ?? { label: statut, bg: '#f3f4f6', color: '#374151' }
  return (
    <View style={[s.badge, { backgroundColor: cfg.bg }]}>
      <Text style={[s.badgeText, { color: cfg.color }]}>{cfg.label}</Text>
    </View>
  )
}

function Stars({ note }: { note: number }) {
  return (
    <View style={{ flexDirection: 'row', gap: 2 }}>
      {[1, 2, 3, 4, 5].map(i => (
        <Ionicons key={i} name={i <= note ? 'star' : 'star-outline'} size={14} color="#f59e0b" />
      ))}
    </View>
  )
}

function RdvCard({ r }: { r: ResaToday }) {
  const clientName = [r.client_prenom, r.client_nom].filter(Boolean).join(' ') || 'Client'
  return (
    <View style={s.rdvCard}>
      <View style={s.rdvTimeBox}>
        <Text style={s.rdvTime}>{r.heure_rdv?.slice(0, 5)}</Text>
        {r.duree_rdv ? <Text style={s.rdvDuree}>{r.duree_rdv}min</Text> : null}
      </View>
      <View style={{ flex: 1, gap: 4 }}>
        <Text style={s.rdvClient}>{clientName}</Text>
        {r.service ? <Text style={s.rdvService}>{r.service}</Text> : null}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <StatutBadge statut={r.statut} />
          {r.prix != null && <Text style={s.rdvPrix}>{Number(r.prix).toFixed(2)} €</Text>}
        </View>
      </View>
    </View>
  )
}

function SectionTitle({ title }: { title: string }) {
  return <Text style={s.sectionTitle}>{title}</Text>
}

function Card({ children, style }: { children: React.ReactNode; style?: object }) {
  return <View style={[s.card, style]}>{children}</View>
}

// ── Main Component ─────────────────────────────────────────────────────────────

export default function EmployePortal() {
  const insets = useSafeAreaInsets()
  const router = useRouter()
  const [view, setView] = useState<'loading' | 'login' | 'portal'>('loading')
  const [tab, setTab] = useState<Tab>('accueil')

  // Auth
  const [slug, setSlug] = useState('')
  const [loginEmail, setLoginEmail] = useState('')
  const [loginPwd, setLoginPwd] = useState('')
  const [showPwd, setShowPwd] = useState(false)
  const [loggingIn, setLoggingIn] = useState(false)
  const [loginErr, setLoginErr] = useState('')
  const [token, setToken] = useState('')

  // Portal data
  const [employe, setEmploye] = useState<EmployeProfile | null>(null)
  const [resasToday, setResasToday] = useState<ResaToday[]>([])
  const [rdvUpcoming, setRdvUpcoming] = useState<ResaToday[]>([])
  const [rdvHistory, setRdvHistory] = useState<ResaToday[]>([])
  const [statutToday, setStatutToday] = useState<string | null>(null)
  const [unreadGratif, setUnreadGratif] = useState(0)
  const [unreadNotif, setUnreadNotif] = useState(0)
  const [soldeVacances, setSoldeVacances] = useState<{ jours_vacances_annuels: number; jours_restants: number } | null>(null)
  const [notifs, setNotifs] = useState<Notif[]>([])
  const [demandes, setDemandes] = useState<DemandeRH[]>([])
  const [stats, setStats] = useState<Stats | null>(null)
  const [gratifs, setGratifs] = useState<Gratif[]>([])

  // Profil edit
  const [editPrenom, setEditPrenom] = useState('')
  const [editNom, setEditNom] = useState('')
  const [editTel, setEditTel] = useState('')
  const [editAdresse, setEditAdresse] = useState('')
  const [editVille, setEditVille] = useState('')
  const [editCP, setEditCP] = useState('')
  const [savingProfil, setSavingProfil] = useState(false)
  const [profilSaved, setProfilSaved] = useState(false)

  // Mot de passe
  const [showPwdSection, setShowPwdSection] = useState(false)
  const [currentPwd, setCurrentPwd] = useState('')
  const [newPwd, setNewPwd] = useState('')
  const [confirmPwd, setConfirmPwd] = useState('')
  const [pwdErr, setPwdErr] = useState('')
  const [pwdOk, setPwdOk] = useState(false)
  const [savingPwd, setSavingPwd] = useState(false)

  // Demandes form
  const [typeDemande, setTypeDemande] = useState<string>('conge')
  const [typeDoc, setTypeDoc] = useState<string>('attestation_emploi')
  const [dateDebut, setDateDebut] = useState('')
  const [heureDebut, setHeureDebut] = useState('09:00')
  const [dateFin, setDateFin] = useState('')
  const [heureFin, setHeureFin] = useState('18:00')
  const [dateSouhaitee, setDateSouhaitee] = useState('')
  const [motif, setMotif] = useState('')
  const [submittingDemande, setSubmittingDemande] = useState(false)
  const [demandeErr, setDemandeErr] = useState('')

  // ── Init ────────────────────────────────────────────────────────────────────

  useEffect(() => {
    async function init() {
      const keys = await AsyncStorage.getAllKeys()
      const tokenKey = keys.find(k => k.startsWith('employe_token_'))
      if (tokenKey) {
        const tok = await AsyncStorage.getItem(tokenKey)
        if (tok) {
          setToken(tok)
          try {
            const data = await getMe(tok)
            applyMeData(data)
            await loadTabData(tok, 'accueil')
            setView('portal')
            return
          } catch {
            await AsyncStorage.removeItem(tokenKey)
          }
        }
      }
      setView('login')
    }
    init()
  }, [])

  function applyMeData(data: Record<string, unknown>) {
    const emp = (data.employe ?? data) as EmployeProfile
    setEmploye(emp)
    setResasToday((data.reservations_today as ResaToday[]) ?? [])
    setStatutToday((data.statut_today as { statut: string } | null)?.statut ?? null)
    setUnreadGratif((data.unread_gratif_count as number) ?? 0)
    setUnreadNotif((data.unread_notif_count as number) ?? 0)
    setSoldeVacances(data.solde_vacances as { jours_vacances_annuels: number; jours_restants: number } | null)
    setEditPrenom(emp.prenom ?? '')
    setEditNom(emp.nom ?? '')
    setEditTel(emp.telephone ?? '')
    setEditAdresse(emp.adresse ?? '')
    setEditVille(emp.ville ?? '')
    setEditCP(emp.code_postal ?? '')
  }

  // ── Auth ────────────────────────────────────────────────────────────────────

  async function handleLogin() {
    setLoggingIn(true)
    setLoginErr('')
    try {
      const cleanSlug = slug
        .trim()
        .toLowerCase()
        .replace(/^https?:\/\/[^/]+\//, '')
        .replace(/^\/+/, '')
        .replace(/\/+$/, '')
        .split('/')[0]
      const data = await loginEmploye({ slug: cleanSlug, email: loginEmail, password: loginPwd })
      const tok = data.token as string
      setToken(tok)
      applyMeData(data)
      await loadTabData(tok, 'accueil')
      setView('portal')
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Erreur de connexion'
      console.log('[handleLogin] error:', msg)
      setLoginErr(msg)
    } finally {
      setLoggingIn(false)
    }
  }

  async function handleLogout() {
    if (employe) await logoutEmploye(employe.company_id)
    setToken('')
    setEmploye(null)
    setView('login')
  }

  // ── Data loading ────────────────────────────────────────────────────────────

  const loadTabData = useCallback(async (tok: string, t: Tab) => {
    try {
      if (t === 'accueil') {
        const [notifData, meData] = await Promise.all([getNotifications(tok), getMe(tok)])
        setNotifs((notifData.notifications as Notif[]) ?? [])
        applyMeData(meData)
      } else if (t === 'mesrdv') {
        const data = await getRdv(tok)
        setRdvUpcoming((data.upcoming as ResaToday[]) ?? [])
        setRdvHistory((data.history as ResaToday[]) ?? [])
      } else if (t === 'demandes') {
        const data = await getDemandes(tok)
        setDemandes((data.demandes as DemandeRH[]) ?? [])
      } else if (t === 'performances') {
        const data = await getStats(tok)
        setStats(data as Stats)
      } else if (t === 'gratifications') {
        const data = await getGratifications(tok)
        setGratifs((data.gratifications as Gratif[]) ?? [])
        if ((data.unread_count as number) > 0) {
          await markGratifRead(tok)
          setUnreadGratif(0)
        }
      }
    } catch { /* ignore */ }
  }, [])

  function switchTab(t: Tab) {
    setTab(t)
    loadTabData(token, t)
  }

  async function handleMarkNotifRead(id: string) {
    try {
      await markNotifRead(token, id)
      setNotifs(prev => prev.map(n => n.id === id ? { ...n, lu: true } : n))
      setUnreadNotif(prev => Math.max(0, prev - 1))
    } catch { /* ignore */ }
  }

  async function handleSaveProfil() {
    setSavingProfil(true)
    try {
      await updateProfile(token, {
        prenom: editPrenom, nom: editNom,
        telephone: editTel, adresse: editAdresse, ville: editVille, code_postal: editCP,
      })
      setEmploye(prev => prev ? { ...prev, prenom: editPrenom, nom: editNom, telephone: editTel, adresse: editAdresse, ville: editVille, code_postal: editCP } : prev)
      setProfilSaved(true)
      setTimeout(() => setProfilSaved(false), 2500)
    } catch { /* ignore */ }
    setSavingProfil(false)
  }

  async function handleChangePwd() {
    setPwdErr('')
    if (newPwd !== confirmPwd) { setPwdErr('Les mots de passe ne correspondent pas'); return }
    if (newPwd.length < 6) { setPwdErr('Minimum 6 caractères'); return }
    setSavingPwd(true)
    try {
      await changePassword(token, currentPwd, newPwd)
      setPwdOk(true)
      setCurrentPwd(''); setNewPwd(''); setConfirmPwd('')
      setTimeout(() => { setPwdOk(false); setShowPwdSection(false) }, 2500)
    } catch (e) {
      setPwdErr(e instanceof Error ? e.message : 'Erreur')
    }
    setSavingPwd(false)
  }

  async function handleSubmitDemande() {
    setDemandeErr('')
    if (!dateDebut) { setDemandeErr('Date requise'); return }
    setSubmittingDemande(true)
    try {
      const body: Record<string, unknown> = {
        type_demande: typeDemande,
        date_debut: dateDebut, heure_debut: heureDebut,
        date_fin: typeDemande === 'document_administratif' ? dateDebut : (dateFin || dateDebut),
        heure_fin: heureFin, motif,
      }
      if (typeDemande === 'document_administratif') {
        body.type_document = typeDoc
        body.date_souhaitee = dateSouhaitee || dateDebut
      }
      await submitDemande(token, body)
      setDateDebut(''); setDateFin(''); setMotif(''); setDateSouhaitee('')
      const data = await getDemandes(token)
      setDemandes((data.demandes as DemandeRH[]) ?? [])
    } catch (e) {
      setDemandeErr(e instanceof Error ? e.message : 'Erreur')
    }
    setSubmittingDemande(false)
  }

  // ── Screens ─────────────────────────────────────────────────────────────────

  if (view === 'loading') {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: '#f5f3ff', alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator size="large" color="#7c3aed" />
      </SafeAreaView>
    )
  }

  if (view === 'login') {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: '#f5f3ff' }}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', padding: 24 }}>
            <View style={{ alignItems: 'center', marginBottom: 40 }}>
              <LinearGradient colors={['#7c3aed', '#ec4899']} style={s.loginLogo}>
                <Ionicons name="people-outline" size={32} color="#fff" />
              </LinearGradient>
              <Text style={{ fontSize: 22, fontWeight: '800', color: '#7c3aed', marginTop: 16 }}>Espace Équipe</Text>
              <Text style={{ color: '#9ca3af', marginTop: 4 }}>Portail collaborateur</Text>
            </View>

            <Text style={{ color: '#374151', fontWeight: '600', fontSize: 13, marginBottom: 4 }}>Identifiant de l'établissement</Text>
            <TextInput
              value={slug}
              onChangeText={setSlug}
              placeholder="ex: king-cuts"
              autoCapitalize="none"
              style={s.input}
              placeholderTextColor="#9ca3af"
            />
            <Text style={{ fontSize: 12, color: '#9ca3af', marginTop: -8, marginBottom: 12 }}>Fourni par votre responsable</Text>
            <TextInput
              value={loginEmail}
              onChangeText={setLoginEmail}
              placeholder="votre@email.com"
              keyboardType="email-address"
              autoCapitalize="none"
              style={s.input}
              placeholderTextColor="#9ca3af"
            />
            <View style={{ position: 'relative' }}>
              <TextInput
                value={loginPwd}
                onChangeText={setLoginPwd}
                placeholder="Mot de passe"
                secureTextEntry={!showPwd}
                style={s.input}
                placeholderTextColor="#9ca3af"
              />
              <TouchableOpacity
                style={{ position: 'absolute', right: 14, top: 14 }}
                onPress={() => setShowPwd(p => !p)}
              >
                <Ionicons name={showPwd ? 'eye-off-outline' : 'eye-outline'} size={20} color="#9ca3af" />
              </TouchableOpacity>
            </View>

            {loginErr ? <Text style={s.errText}>{loginErr}</Text> : null}

            <TouchableOpacity
              onPress={handleLogin}
              disabled={loggingIn || !loginEmail || !loginPwd || !slug}
              style={{ opacity: loggingIn || !loginEmail || !loginPwd || !slug ? 0.5 : 1, marginTop: 8 }}
            >
              <LinearGradient colors={['#7c3aed', '#ec4899']} style={s.loginBtn}>
                {loggingIn
                  ? <ActivityIndicator color="#fff" />
                  : <Text style={{ color: '#fff', fontWeight: '700', fontSize: 16 }}>Se connecter</Text>
                }
              </LinearGradient>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => router.replace('/(auth)/login')}
              style={{ marginTop: 16, alignItems: 'center' }}
            >
              <Text style={{ fontSize: 13, color: '#9ca3af' }}>
                Connexion Owner / Admin →
              </Text>
            </TouchableOpacity>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    )
  }

  // ── Portal ───────────────────────────────────────────────────────────────────

  const todayLabel = new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })

  function AccueilTab() {
    const statutInfo = statutToday ? (STATUT_CFG[statutToday] ?? null) : null
    const todayCount = resasToday.length
    const soldeUsed = soldeVacances ? soldeVacances.jours_vacances_annuels - soldeVacances.jours_restants : 0
    const soldePct = soldeVacances && soldeVacances.jours_vacances_annuels > 0
      ? Math.round((soldeUsed / soldeVacances.jours_vacances_annuels) * 100)
      : 0

    return (
      <View style={{ padding: 16, gap: 16, paddingBottom: 24 }}>
        {/* Greeting */}
        <View>
          <Text style={{ fontSize: 22, fontWeight: '800', color: '#111827' }}>
            Bonjour {employe?.prenom} 👋
          </Text>
          <Text style={{ color: '#6b7280', marginTop: 2, textTransform: 'capitalize' }}>{todayLabel}</Text>
        </View>

        {/* Status + RDV count */}
        <View style={{ flexDirection: 'row', gap: 12 }}>
          <Card style={{ flex: 1, alignItems: 'center', gap: 6 }}>
            <Text style={{ fontSize: 28 }}>{statutInfo?.emoji ?? '❓'}</Text>
            <Text style={{ fontSize: 13, fontWeight: '700', color: '#374151' }}>
              {statutInfo?.label ?? 'Inconnu'}
            </Text>
            <Text style={{ fontSize: 11, color: '#9ca3af' }}>Statut du jour</Text>
          </Card>
          <Card style={{ flex: 1, alignItems: 'center', gap: 6 }}>
            <Text style={{ fontSize: 28, fontWeight: '800', color: '#7c3aed' }}>{todayCount}</Text>
            <Text style={{ fontSize: 13, fontWeight: '700', color: '#374151' }}>RDV</Text>
            <Text style={{ fontSize: 11, color: '#9ca3af' }}>Aujourd'hui</Text>
          </Card>
        </View>

        {/* Gratif banner */}
        {unreadGratif > 0 && (
          <TouchableOpacity onPress={() => switchTab('gratifications')}>
            <LinearGradient colors={['#7c3aed', '#ec4899']} style={s.gratifBanner}>
              <Text style={{ fontSize: 20 }}>🎁</Text>
              <Text style={{ color: '#fff', fontWeight: '700', flex: 1 }}>
                {unreadGratif} nouvelle{unreadGratif > 1 ? 's' : ''} gratification{unreadGratif > 1 ? 's' : ''}
              </Text>
              <Ionicons name="chevron-forward" size={18} color="rgba(255,255,255,0.8)" />
            </LinearGradient>
          </TouchableOpacity>
        )}

        {/* Notifications */}
        {notifs.length > 0 && (
          <Card>
            <Text style={s.cardTitle}>Notifications</Text>
            <View style={{ gap: 8, marginTop: 8 }}>
              {notifs.slice(0, 5).map(n => (
                <View key={n.id} style={[s.notifRow, { opacity: n.lu ? 0.6 : 1 }]}>
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text style={{ fontSize: 13, fontWeight: '700', color: '#111827' }}>{n.titre}</Text>
                    <Text style={{ fontSize: 12, color: '#6b7280' }}>{n.message}</Text>
                    <Text style={{ fontSize: 11, color: '#9ca3af' }}>{relativeTime(n.created_at)}</Text>
                  </View>
                  {!n.lu && (
                    <TouchableOpacity style={s.luBtn} onPress={() => handleMarkNotifRead(n.id)}>
                      <Text style={{ fontSize: 11, color: '#7c3aed', fontWeight: '600' }}>Lu</Text>
                    </TouchableOpacity>
                  )}
                </View>
              ))}
            </View>
          </Card>
        )}

        {/* Solde vacances */}
        {soldeVacances && (
          <Card>
            <LinearGradient colors={['#7c3aed', '#ec4899']} style={s.soldeGradient}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <View>
                  <Text style={{ color: 'rgba(255,255,255,0.8)', fontSize: 12 }}>Congés restants</Text>
                  <Text style={{ color: '#fff', fontSize: 28, fontWeight: '800' }}>
                    {Number(soldeVacances.jours_restants).toFixed(1)}j
                  </Text>
                  <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 12 }}>
                    / {Number(soldeVacances.jours_vacances_annuels).toFixed(1)}j annuels
                  </Text>
                </View>
                <Text style={{ fontSize: 36 }}>🏖️</Text>
              </View>
              <View style={s.soldeBarBg}>
                <View style={[s.soldeBarFill, { width: `${100 - soldePct}%` }]} />
              </View>
            </LinearGradient>
          </Card>
        )}

        {/* RDV du jour */}
        {resasToday.length > 0 && (
          <Card>
            <Text style={s.cardTitle}>RDV du jour</Text>
            <View style={{ gap: 8, marginTop: 8 }}>
              {resasToday.map(r => <RdvCard key={r.id} r={r} />)}
            </View>
          </Card>
        )}
      </View>
    )
  }

  function MesRdvTab() {
    const upGroups = groupByDate(rdvUpcoming)
    const histGroups = groupByDate(rdvHistory)
    return (
      <View style={{ padding: 16, gap: 16, paddingBottom: 24 }}>
        {resasToday.length > 0 && (
          <Card>
            <SectionTitle title="Aujourd'hui" />
            <View style={{ gap: 8, marginTop: 8 }}>
              {resasToday.map(r => <RdvCard key={r.id} r={r} />)}
            </View>
          </Card>
        )}

        {upGroups.length > 0 && (
          <Card>
            <SectionTitle title="À venir — 7 jours" />
            {upGroups.map(([date, items]) => (
              <View key={date} style={{ marginTop: 8 }}>
                <Text style={s.dateGroupLabel}>{dateFR(date)}</Text>
                <View style={{ gap: 6, marginTop: 4 }}>
                  {items.map(r => <RdvCard key={r.id} r={r} />)}
                </View>
              </View>
            ))}
          </Card>
        )}

        {histGroups.length > 0 && (
          <Card>
            <SectionTitle title="Historique — 30 jours" />
            {histGroups.map(([date, items]) => (
              <View key={date} style={{ marginTop: 8 }}>
                <Text style={s.dateGroupLabel}>{dateFR(date)}</Text>
                <View style={{ gap: 6, marginTop: 4 }}>
                  {items.map(r => <RdvCard key={r.id} r={r} />)}
                </View>
              </View>
            ))}
          </Card>
        )}

        {resasToday.length === 0 && upGroups.length === 0 && histGroups.length === 0 && (
          <View style={s.emptyState}>
            <Ionicons name="calendar-outline" size={48} color="#c4b5fd" />
            <Text style={s.emptyText}>Aucun rendez-vous</Text>
          </View>
        )}
      </View>
    )
  }

  function DemandesTab() {
    const isDoc = typeDemande === 'document_administratif'
    const demandeStatutCfg: Record<string, { label: string; bg: string; color: string }> = {
      en_attente: { label: 'En attente', bg: 'rgba(245,158,11,0.12)', color: '#d97706' },
      approuve:   { label: 'Approuvé',   bg: 'rgba(16,185,129,0.12)', color: '#059669' },
      refuse:     { label: 'Refusé',     bg: 'rgba(239,68,68,0.12)',  color: '#dc2626' },
    }

    return (
      <View style={{ padding: 16, gap: 16, paddingBottom: 24 }}>
        {/* Formulaire */}
        <Card>
          <Text style={s.cardTitle}>Nouvelle demande</Text>
          <View style={{ gap: 12, marginTop: 12 }}>
            {/* Type demande chips */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -4 }}>
              <View style={{ flexDirection: 'row', gap: 8, paddingHorizontal: 4 }}>
                {Object.entries(TYPE_DEMANDE_LABELS).map(([k, v]) => (
                  <TouchableOpacity
                    key={k}
                    onPress={() => setTypeDemande(k)}
                    style={[s.chip, typeDemande === k && s.chipActive]}
                  >
                    <Text style={[s.chipText, typeDemande === k && s.chipTextActive]}>{v}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>

            {isDoc ? (
              <>
                {/* Type document */}
                <View>
                  <Text style={s.fieldLabel}>Type de document</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 6 }}>
                    <View style={{ flexDirection: 'row', gap: 8 }}>
                      {Object.entries(TYPE_DOC_LABELS).map(([k, v]) => (
                        <TouchableOpacity
                          key={k}
                          onPress={() => setTypeDoc(k)}
                          style={[s.chip, typeDoc === k && s.chipActive]}
                        >
                          <Text style={[s.chipText, typeDoc === k && s.chipTextActive]}>{v}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </ScrollView>
                </View>
                <View>
                  <Text style={s.fieldLabel}>Date souhaitée</Text>
                  <TextInput
                    value={dateSouhaitee}
                    onChangeText={setDateSouhaitee}
                    placeholder="AAAA-MM-JJ"
                    style={s.input}
                    placeholderTextColor="#9ca3af"
                  />
                </View>
              </>
            ) : (
              <>
                <View style={{ flexDirection: 'row', gap: 12 }}>
                  <View style={{ flex: 1 }}>
                    <Text style={s.fieldLabel}>Date début</Text>
                    <TextInput
                      value={dateDebut}
                      onChangeText={setDateDebut}
                      placeholder="AAAA-MM-JJ"
                      style={s.input}
                      placeholderTextColor="#9ca3af"
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.fieldLabel}>Heure</Text>
                    <TextInput
                      value={heureDebut}
                      onChangeText={setHeureDebut}
                      placeholder="09:00"
                      style={s.input}
                      placeholderTextColor="#9ca3af"
                    />
                  </View>
                </View>
                <View style={{ flexDirection: 'row', gap: 12 }}>
                  <View style={{ flex: 1 }}>
                    <Text style={s.fieldLabel}>Date fin</Text>
                    <TextInput
                      value={dateFin}
                      onChangeText={setDateFin}
                      placeholder="AAAA-MM-JJ"
                      style={s.input}
                      placeholderTextColor="#9ca3af"
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.fieldLabel}>Heure</Text>
                    <TextInput
                      value={heureFin}
                      onChangeText={setHeureFin}
                      placeholder="18:00"
                      style={s.input}
                      placeholderTextColor="#9ca3af"
                    />
                  </View>
                </View>
              </>
            )}

            <View>
              <Text style={s.fieldLabel}>Motif (optionnel)</Text>
              <TextInput
                value={motif}
                onChangeText={setMotif}
                placeholder="Précisez si nécessaire…"
                multiline
                numberOfLines={3}
                style={[s.input, { height: 70, textAlignVertical: 'top' }]}
                placeholderTextColor="#9ca3af"
              />
            </View>

            {demandeErr ? <Text style={s.errText}>{demandeErr}</Text> : null}

            <TouchableOpacity
              onPress={handleSubmitDemande}
              disabled={submittingDemande}
              style={{ opacity: submittingDemande ? 0.6 : 1 }}
            >
              <LinearGradient colors={['#7c3aed', '#ec4899']} style={[s.loginBtn, { paddingVertical: 12 }]}>
                {submittingDemande
                  ? <ActivityIndicator color="#fff" />
                  : <Text style={{ color: '#fff', fontWeight: '700' }}>Soumettre la demande</Text>
                }
              </LinearGradient>
            </TouchableOpacity>
          </View>
        </Card>

        {/* Historique */}
        {demandes.length > 0 && (
          <Card>
            <Text style={s.cardTitle}>Mes demandes</Text>
            <View style={{ gap: 10, marginTop: 12 }}>
              {demandes.map(d => {
                const cfg = demandeStatutCfg[d.statut]
                return (
                  <View key={d.id} style={s.demandeRow}>
                    <View style={{ flex: 1, gap: 4 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                        <Text style={{ fontSize: 13, fontWeight: '700', color: '#111827' }}>
                          {TYPE_DEMANDE_LABELS[d.type_demande] ?? d.type_demande}
                        </Text>
                        <View style={[s.badge, { backgroundColor: cfg.bg }]}>
                          <Text style={[s.badgeText, { color: cfg.color }]}>{cfg.label}</Text>
                        </View>
                      </View>
                      {d.type_demande === 'document_administratif' && d.type_document ? (
                        <Text style={{ fontSize: 12, color: '#6b7280' }}>
                          {TYPE_DOC_LABELS[d.type_document] ?? d.type_document}
                        </Text>
                      ) : (
                        <Text style={{ fontSize: 12, color: '#6b7280' }}>
                          {dateFR(d.date_debut)} → {dateFR(d.date_fin)}
                        </Text>
                      )}
                      {d.commentaire_manager ? (
                        <Text style={{ fontSize: 12, color: '#7c3aed', fontStyle: 'italic' }}>
                          Manager : {d.commentaire_manager}
                        </Text>
                      ) : null}
                      <Text style={{ fontSize: 11, color: '#9ca3af' }}>{relativeTime(d.created_at)}</Text>
                    </View>
                  </View>
                )
              })}
            </View>
          </Card>
        )}
      </View>
    )
  }

  function ProfilTab() {
    return (
      <View style={{ padding: 16, gap: 16, paddingBottom: 24 }}>
        {/* Avatar card */}
        <Card style={{ alignItems: 'center', gap: 8 }}>
          <AvatarCircle employe={employe} />
          <Text style={{ fontSize: 18, fontWeight: '800', color: '#111827', marginTop: 4 }}>
            {employe?.prenom} {employe?.nom}
          </Text>
          {employe?.titre ? <Text style={{ color: '#7c3aed', fontWeight: '600' }}>{employe.titre}</Text> : null}
          {employe?.type_contrat ? (
            <View style={[s.badge, { backgroundColor: '#ede9fe' }]}>
              <Text style={[s.badgeText, { color: '#7c3aed' }]}>{employe.type_contrat}</Text>
            </View>
          ) : null}
        </Card>

        {/* Infos editables */}
        <Card>
          <Text style={s.cardTitle}>Mes informations</Text>
          <View style={{ gap: 10, marginTop: 12 }}>
            <View style={{ flexDirection: 'row', gap: 12 }}>
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
              <Text style={s.fieldLabel}>Téléphone</Text>
              <TextInput value={editTel} onChangeText={setEditTel} keyboardType="phone-pad" style={s.input} placeholderTextColor="#9ca3af" />
            </View>
            <View>
              <Text style={s.fieldLabel}>Adresse</Text>
              <TextInput value={editAdresse} onChangeText={setEditAdresse} style={s.input} placeholderTextColor="#9ca3af" />
            </View>
            <View style={{ flexDirection: 'row', gap: 12 }}>
              <View style={{ flex: 1 }}>
                <Text style={s.fieldLabel}>Ville</Text>
                <TextInput value={editVille} onChangeText={setEditVille} style={s.input} placeholderTextColor="#9ca3af" />
              </View>
              <View style={{ width: 100 }}>
                <Text style={s.fieldLabel}>Code postal</Text>
                <TextInput value={editCP} onChangeText={setEditCP} keyboardType="numeric" style={s.input} placeholderTextColor="#9ca3af" />
              </View>
            </View>

            {/* Spécialités read-only */}
            {employe?.specialites && employe.specialites.length > 0 && (
              <View>
                <Text style={s.fieldLabel}>Spécialités</Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
                  {employe.specialites.map((sp, i) => (
                    <View key={i} style={[s.badge, { backgroundColor: '#ede9fe' }]}>
                      <Text style={[s.badgeText, { color: '#7c3aed' }]}>{sp}</Text>
                    </View>
                  ))}
                </View>
              </View>
            )}

            {profilSaved && (
              <View style={[s.badge, { backgroundColor: '#d1fae5', alignSelf: 'flex-start' }]}>
                <Text style={[s.badgeText, { color: '#059669' }]}>✓ Sauvegardé</Text>
              </View>
            )}

            <TouchableOpacity
              onPress={handleSaveProfil}
              disabled={savingProfil}
              style={{ opacity: savingProfil ? 0.6 : 1 }}
            >
              <LinearGradient colors={['#7c3aed', '#ec4899']} style={[s.loginBtn, { paddingVertical: 12 }]}>
                {savingProfil
                  ? <ActivityIndicator color="#fff" />
                  : <Text style={{ color: '#fff', fontWeight: '700' }}>Sauvegarder</Text>
                }
              </LinearGradient>
            </TouchableOpacity>
          </View>
        </Card>

        {/* Changer mot de passe */}
        <Card>
          <TouchableOpacity
            onPress={() => setShowPwdSection(p => !p)}
            style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}
          >
            <Text style={s.cardTitle}>Changer le mot de passe</Text>
            <Ionicons name={showPwdSection ? 'chevron-up' : 'chevron-down'} size={18} color="#9ca3af" />
          </TouchableOpacity>

          {showPwdSection && (
            <View style={{ gap: 10, marginTop: 12 }}>
              <View>
                <Text style={s.fieldLabel}>Mot de passe actuel</Text>
                <TextInput value={currentPwd} onChangeText={setCurrentPwd} secureTextEntry style={s.input} placeholderTextColor="#9ca3af" />
              </View>
              <View>
                <Text style={s.fieldLabel}>Nouveau mot de passe</Text>
                <TextInput value={newPwd} onChangeText={setNewPwd} secureTextEntry style={s.input} placeholderTextColor="#9ca3af" />
              </View>
              <View>
                <Text style={s.fieldLabel}>Confirmer</Text>
                <TextInput value={confirmPwd} onChangeText={setConfirmPwd} secureTextEntry style={s.input} placeholderTextColor="#9ca3af" />
              </View>
              {pwdErr ? <Text style={s.errText}>{pwdErr}</Text> : null}
              {pwdOk && (
                <View style={[s.badge, { backgroundColor: '#d1fae5', alignSelf: 'flex-start' }]}>
                  <Text style={[s.badgeText, { color: '#059669' }]}>✓ Mot de passe modifié</Text>
                </View>
              )}
              <TouchableOpacity
                onPress={handleChangePwd}
                disabled={savingPwd || !currentPwd || !newPwd || !confirmPwd}
                style={{ opacity: savingPwd || !currentPwd || !newPwd || !confirmPwd ? 0.5 : 1 }}
              >
                <LinearGradient colors={['#7c3aed', '#ec4899']} style={[s.loginBtn, { paddingVertical: 12 }]}>
                  {savingPwd
                    ? <ActivityIndicator color="#fff" />
                    : <Text style={{ color: '#fff', fontWeight: '700' }}>Mettre à jour</Text>
                  }
                </LinearGradient>
              </TouchableOpacity>
            </View>
          )}
        </Card>
      </View>
    )
  }

  function PerformancesTab() {
    if (!stats) {
      return (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 60 }}>
          <ActivityIndicator color="#7c3aed" />
        </View>
      )
    }
    return (
      <View style={{ padding: 16, gap: 16, paddingBottom: 24 }}>
        {/* KPI cards */}
        <View style={{ flexDirection: 'row', gap: 12 }}>
          <Card style={{ flex: 1, alignItems: 'center', gap: 4 }}>
            <Text style={{ fontSize: 28, fontWeight: '800', color: '#7c3aed' }}>{stats.rdv_completes}</Text>
            <Text style={{ fontSize: 12, color: '#6b7280', textAlign: 'center' }}>RDV complétés</Text>
          </Card>
          <Card style={{ flex: 1, alignItems: 'center', gap: 4 }}>
            <Text style={{ fontSize: 22, fontWeight: '800', color: '#059669' }}>
              {stats.revenus_mois.toFixed(0)}€
            </Text>
            <Text style={{ fontSize: 12, color: '#6b7280', textAlign: 'center' }}>Revenus mois</Text>
          </Card>
          <Card style={{ flex: 1, alignItems: 'center', gap: 4 }}>
            <Text style={{ fontSize: 28, fontWeight: '800', color: '#f59e0b' }}>
              {stats.note_moyenne != null ? stats.note_moyenne.toFixed(1) : '—'}
            </Text>
            <Text style={{ fontSize: 12, color: '#6b7280', textAlign: 'center' }}>Note ★</Text>
          </Card>
        </View>

        {/* Avis récents */}
        {stats.avis_recents.length > 0 && (
          <Card>
            <Text style={s.cardTitle}>Avis récents</Text>
            <View style={{ gap: 12, marginTop: 12 }}>
              {stats.avis_recents.map(a => (
                <View key={a.id} style={{ gap: 4 }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Stars note={a.note} />
                    <Text style={{ fontSize: 11, color: '#9ca3af' }}>{relativeTime(a.created_at)}</Text>
                  </View>
                  {a.commentaire ? (
                    <Text style={{ fontSize: 13, color: '#374151', fontStyle: 'italic' }}>"{a.commentaire}"</Text>
                  ) : null}
                  <View style={s.divider} />
                </View>
              ))}
            </View>
          </Card>
        )}

        {stats.avis_recents.length === 0 && (
          <View style={s.emptyState}>
            <Ionicons name="star-outline" size={48} color="#c4b5fd" />
            <Text style={s.emptyText}>Aucun avis pour le moment</Text>
          </View>
        )}
      </View>
    )
  }

  function GratificationsTab() {
    return (
      <View style={{ padding: 16, gap: 12, paddingBottom: 24 }}>
        {gratifs.length === 0 ? (
          <View style={s.emptyState}>
            <Text style={{ fontSize: 48 }}>🎁</Text>
            <Text style={s.emptyText}>Aucune gratification pour l'instant</Text>
          </View>
        ) : (
          gratifs.map(g => {
            const cfg = GRATIF_CFG[g.type_gratif] ?? { icon: '🎁', label: g.type_gratif, color: '#7c3aed' }
            return (
              <Card key={g.id}>
                <View style={{ flexDirection: 'row', gap: 12, alignItems: 'flex-start' }}>
                  <Text style={{ fontSize: 32 }}>{cfg.icon}</Text>
                  <View style={{ flex: 1, gap: 4 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <View style={[s.badge, { backgroundColor: cfg.color + '20' }]}>
                        <Text style={[s.badgeText, { color: cfg.color }]}>{cfg.label}</Text>
                      </View>
                      {!g.lu && (
                        <View style={[s.badge, { backgroundColor: 'rgba(239,68,68,0.12)' }]}>
                          <Text style={[s.badgeText, { color: '#dc2626' }]}>Nouveau</Text>
                        </View>
                      )}
                      {g.montant > 0 && (
                        <Text style={{ fontSize: 14, fontWeight: '800', color: '#059669' }}>
                          +{g.montant.toFixed(2)} €
                        </Text>
                      )}
                    </View>
                    <Text style={{ fontSize: 14, color: '#374151' }}>{g.message}</Text>
                    <Text style={{ fontSize: 11, color: '#9ca3af' }}>{relativeTime(g.created_at)}</Text>
                  </View>
                </View>
              </Card>
            )
          })
        )}
      </View>
    )
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#f5f3ff' }} edges={['top']}>
      {/* Header */}
      <View style={s.portalHeader}>
        <AvatarCircle employe={employe} />
        <View style={{ flex: 1, marginLeft: 10 }}>
          <Text style={{ fontSize: 15, fontWeight: '800', color: '#111827' }}>
            {employe?.prenom} {employe?.nom}
          </Text>
          <Text style={{ fontSize: 12, color: '#9ca3af' }}>{employe?.titre ?? 'Collaborateur'}</Text>
        </View>
        {unreadGratif > 0 && (
          <TouchableOpacity
            style={s.gratifHeaderBtn}
            onPress={() => switchTab('gratifications')}
          >
            <Text style={{ fontSize: 14 }}>🎁</Text>
            <Text style={{ fontSize: 11, color: '#7c3aed', fontWeight: '700' }}>{unreadGratif}</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity style={s.logoutBtn} onPress={handleLogout}>
          <Ionicons name="log-out-outline" size={18} color="#ef4444" />
        </TouchableOpacity>
      </View>

      {/* Content */}
      <ScrollView style={{ flex: 1 }} keyboardShouldPersistTaps="handled">
        {tab === 'accueil'        && <AccueilTab />}
        {tab === 'mesrdv'         && <MesRdvTab />}
        {tab === 'demandes'       && <DemandesTab />}
        {tab === 'profil'         && <ProfilTab />}
        {tab === 'performances'   && <PerformancesTab />}
        {tab === 'gratifications' && <GratificationsTab />}
      </ScrollView>

      {/* Bottom tab bar */}
      <View style={[s.tabBar, { paddingBottom: insets.bottom > 0 ? insets.bottom : 8 }]}>
        {([
          { id: 'accueil',        icon: 'home-outline',         label: 'Accueil',   badge: unreadNotif },
          { id: 'mesrdv',         icon: 'calendar-outline',     label: 'Mes RDV',   badge: 0 },
          { id: 'demandes',       icon: 'document-text-outline', label: 'Demandes', badge: 0 },
          { id: 'profil',         icon: 'person-outline',       label: 'Profil',    badge: 0 },
          { id: 'performances',   icon: 'stats-chart-outline',  label: 'Perfs',     badge: 0 },
          { id: 'gratifications', icon: 'gift-outline',         label: 'Gratifs',   badge: unreadGratif },
        ] as { id: Tab; icon: string; label: string; badge: number }[]).map(t => (
          <TouchableOpacity
            key={t.id}
            onPress={() => switchTab(t.id)}
            style={s.tabItem}
          >
            <View style={{ position: 'relative' }}>
              <Ionicons
                name={t.icon as 'home-outline'}
                size={22}
                color={tab === t.id ? '#7c3aed' : '#9ca3af'}
              />
              {t.badge > 0 && <BadgeDot />}
            </View>
            <Text style={{ fontSize: 9, color: tab === t.id ? '#7c3aed' : '#9ca3af', fontWeight: '600', marginTop: 2 }}>
              {t.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    </SafeAreaView>
  )
}

// ── Styles ─────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  // Login
  loginLogo: {
    width: 72, height: 72, borderRadius: 24,
    alignItems: 'center', justifyContent: 'center',
  },
  loginBtn: {
    borderRadius: 14, paddingVertical: 16,
    alignItems: 'center', justifyContent: 'center',
  },
  input: {
    backgroundColor: '#fff', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12,
    fontSize: 15, color: '#111827',
    borderWidth: 1, borderColor: '#e5e7eb', marginTop: 8,
  },
  errText: { color: '#ef4444', fontSize: 13, textAlign: 'center', marginTop: 4 },

  // Portal header
  portalHeader: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 10,
    backgroundColor: '#fff',
    shadowColor: '#7c3aed', shadowOpacity: 0.06, shadowRadius: 8, elevation: 2,
  },
  avatarCircle: {
    width: 40, height: 40, borderRadius: 20,
    alignItems: 'center', justifyContent: 'center',
  },
  avatarText: { color: '#fff', fontWeight: '800', fontSize: 14 },
  gratifHeaderBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: '#ede9fe', borderRadius: 12,
    paddingHorizontal: 10, paddingVertical: 6, marginRight: 8,
  },
  logoutBtn: {
    width: 36, height: 36, borderRadius: 10, backgroundColor: '#fef2f2',
    alignItems: 'center', justifyContent: 'center',
  },

  // Cards
  card: {
    backgroundColor: 'rgba(255,255,255,0.92)', borderRadius: 20, padding: 16,
    shadowColor: '#7c3aed', shadowOpacity: 0.08, shadowRadius: 10, elevation: 3,
  },
  cardTitle: { fontSize: 15, fontWeight: '800', color: '#111827' },

  // Badges
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
  badgeText: { fontSize: 11, fontWeight: '700' },
  badgeDot: {
    position: 'absolute', top: -2, right: -2,
    width: 8, height: 8, borderRadius: 4, backgroundColor: '#ef4444',
  },

  // Tab bar
  tabBar: {
    flexDirection: 'row', backgroundColor: '#fff',
    borderTopLeftRadius: 20, borderTopRightRadius: 20,
    shadowColor: '#7c3aed', shadowOpacity: 0.1, shadowRadius: 16,
    shadowOffset: { width: 0, height: -4 }, elevation: 16,
    paddingBottom: Platform.OS === 'ios' ? 20 : 8, paddingTop: 8,
  },
  tabItem: { flex: 1, alignItems: 'center', gap: 2 },

  // Gratif banner
  gratifBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    borderRadius: 16, padding: 14,
  },

  // Solde vacances
  soldeGradient: { borderRadius: 16, padding: 16, gap: 12 },
  soldeBarBg: {
    height: 6, backgroundColor: 'rgba(255,255,255,0.3)', borderRadius: 3, overflow: 'hidden',
  },
  soldeBarFill: {
    height: '100%', backgroundColor: '#fff', borderRadius: 3,
  },

  // Notif
  notifRow: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 10,
    paddingBottom: 8, borderBottomWidth: 1, borderBottomColor: '#f3f4f6',
  },
  luBtn: {
    backgroundColor: '#ede9fe', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4,
  },

  // RDV card
  rdvCard: {
    flexDirection: 'row', gap: 12, alignItems: 'flex-start',
    backgroundColor: '#f9f9fc', borderRadius: 12, padding: 10,
  },
  rdvTimeBox: { width: 52, alignItems: 'center', gap: 2 },
  rdvTime: { fontSize: 14, fontWeight: '800', color: '#7c3aed' },
  rdvDuree: { fontSize: 10, color: '#9ca3af' },
  rdvClient: { fontSize: 14, fontWeight: '700', color: '#111827' },
  rdvService: { fontSize: 12, color: '#6b7280' },
  rdvPrix: { fontSize: 12, color: '#059669', fontWeight: '600' },

  // Demandes
  demandeRow: {
    flexDirection: 'row', alignItems: 'flex-start',
    paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: '#f3f4f6',
  },

  // Misc
  sectionTitle: { fontSize: 14, fontWeight: '800', color: '#374151', marginBottom: 4 },
  dateGroupLabel: { fontSize: 12, fontWeight: '700', color: '#7c3aed', textTransform: 'capitalize' },
  fieldLabel: { fontSize: 12, fontWeight: '600', color: '#6b7280', marginBottom: 2 },
  chip: {
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20,
    backgroundColor: '#f3f4f6', borderWidth: 1, borderColor: '#e5e7eb',
  },
  chipActive: { backgroundColor: '#7c3aed', borderColor: '#7c3aed' },
  chipText: { fontSize: 12, color: '#374151', fontWeight: '500' },
  chipTextActive: { color: '#fff', fontWeight: '700' },
  emptyState: { alignItems: 'center', paddingTop: 60, gap: 12 },
  emptyText: { color: '#6b7280', fontSize: 15, fontWeight: '600' },
  divider: { height: 1, backgroundColor: '#f3f4f6', marginTop: 8 },
})
