import { useEffect, useState } from 'react'
import {
  View, Text, ScrollView, TouchableOpacity, Image,
  StyleSheet, Dimensions, AppState, type AppStateStatus,
  useWindowDimensions,
} from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { supabase } from '../../../lib/supabase'
import type { Company } from '../../../lib/types'
import { useOwnerContext } from '../../../lib/ownerContext'

const { width } = Dimensions.get('window')

// ── Types ────────────────────────────────────────────────────────
interface Resa {
  id: string
  client_prenom: string | null
  client_nom: string | null
  service: string | null
  date_rdv: string
  heure_rdv: string
  statut: string
  prix: number | null
  choix_direct?: boolean | null
  employee_id?: string | null
  created_at?: string | null
}

// ── Constants ────────────────────────────────────────────────────
const STATUS_COLOR: Record<string, { bg: string; color: string }> = {
  pending:   { bg: 'rgba(16,185,129,0.15)',  color: '#059669' },
  confirmed: { bg: 'rgba(16,185,129,0.15)',  color: '#059669' },
  completed: { bg: 'rgba(107,114,128,0.15)', color: '#6b7280' },
  cancelled: { bg: 'rgba(239,68,68,0.15)',   color: '#dc2626' },
  no_show:   { bg: 'rgba(249,115,22,0.15)',  color: '#ea580c' },
}
const STATUS_LABEL: Record<string, string> = {
  pending: 'Confirmé', confirmed: 'Confirmé', completed: 'Passé',
  cancelled: 'Annulé', no_show: 'Absent',
}

// ── Helpers ──────────────────────────────────────────────────────
function addDays(iso: string, n: number) {
  const d = new Date(iso + 'T00:00:00')
  d.setDate(d.getDate() + n)
  return d.toISOString().slice(0, 10)
}
function clientName(r: Pick<Resa, 'client_prenom' | 'client_nom'>) {
  return [r.client_prenom, r.client_nom].filter(Boolean).join(' ') || '—'
}
function inits(prenom: string | null, nom: string | null) {
  return `${(prenom?.[0] ?? '').toUpperCase()}${(nom?.[0] ?? '').toUpperCase()}`
}

function getWeekBounds(timezone: string): { start: string; end: string } {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric', month: '2-digit', day: '2-digit',
  })
  const localStr = formatter.format(new Date())
  const [year, month, day] = localStr.split('-').map(Number)
  const localDate = new Date(year, month - 1, day)
  const dow = (localDate.getDay() + 6) % 7
  const monday = new Date(localDate)
  monday.setDate(localDate.getDate() - dow)
  const sunday = new Date(monday)
  sunday.setDate(monday.getDate() + 6)
  const toISO = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
  return { start: toISO(monday), end: toISO(sunday) }
}

async function fetchRecent(companyId: string): Promise<Resa[]> {
  const { data } = await supabase
    .from('reservations')
    .select('id, client_prenom, client_nom, service, date_rdv, heure_rdv, statut, prix, choix_direct, employee_id, created_at')
    .eq('company_id', companyId)
    .order('created_at', { ascending: false })
    .limit(30)
  return (data ?? []) as Resa[]
}

// ── Main Component ───────────────────────────────────────────────
export default function DashboardScreen() {
  const router = useRouter()
  const [company, setCompany] = useState<Company | null>(null)
  const { setCompany: setContextCompany } = useOwnerContext()
  const [ownerName, setOwnerName] = useState('')
  const [resCount, setResCount] = useState(0)
  const [revenue, setRevenue] = useState(0)
  const [cancelRate, setCancelRate] = useState(0)
  const [completedCount, setCompletedCount]         = useState(0)
  const [completedYesterday, setCompletedYesterday] = useState(0)
  const [cancelledCount, setCancelledCount]         = useState(0)
  const [noShowCount, setNoShowCount]               = useState(0)
  const [recent, setRecent] = useState<Resa[]>([])
  const [rdvAujourdhui, setRdvAujourdhui] = useState(0)
  const [weekData, setWeekData] = useState<number[]>(Array(7).fill(0))
  const [prevWeekData, setPrevWeekData] = useState<number[]>(Array(7).fill(0))
  const [growthRate, setGrowthRate] = useState<number | null>(null)
  const [tauxRemplissage, setTauxRemplissage] = useState(0)
  const [minutesOccupees, setMinutesOccupees] = useState(0)
  const [minutesDispo, setMinutesDispo] = useState(0)
  const [allEmployes, setAllEmployes] = useState<{ id: string; nom: string; prenom: string | null }[]>([])
  const [allServices, setAllServices] = useState<{ id: string; nom: string; couleur: string | null }[]>([])
  const { width: screenWidth } = useWindowDimensions()
  const isTablet = screenWidth >= 768

  // ── Load company ─────────────────────────────────────────────
  useEffect(() => {
    const load = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession()
        if (!session?.user) { router.replace('/(auth)/login'); return }

        const { data, error } = await supabase
          .from('companies')
          .select('*')
          .eq('owner_email', session.user.email)
          .single()

        if (error || !data) {
          console.error('[Dashboard] company not found:', error?.message)
          router.replace('/(auth)/login')
          return
        }

        setCompany(data as Company)
        setContextCompany(data as Company)
        const meta = session.user.user_metadata ?? {}
        const name = (meta.full_name as string | undefined)
          || (meta.name as string | undefined)
          || ''
        setOwnerName(name.trim() || data.name)
      } catch (e) {
        console.error('[Dashboard] crash:', e)
        router.replace('/(auth)/login')
      }
    }
    load()
  }, [])

  // ── loadStats — réutilisable (realtime + foreground) ────────
  const loadStats = async (companyId: string) => {
    const tz = company?.timezone ?? 'America/Toronto'
    const { start: weekStartISO, end: weekEnd } = getWeekBounds(tz)
    const prevWeekStartISO = addDays(weekStartISO, -7)
    const todayLocal = new Intl.DateTimeFormat('en-CA', {
      timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
    }).format(new Date())
    const yesterdayISO = (() => {
      const fmt = new Intl.DateTimeFormat('en-CA', {
        timeZone: company?.timezone ?? 'America/Toronto',
        year: 'numeric', month: '2-digit', day: '2-digit',
      })
      const local = fmt.format(new Date())
      const [y, m, day] = local.split('-').map(Number)
      const date = new Date(y, m - 1, day - 1)
      return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`
    })()

    const [
      { count: weekResCount },
      { data: weekResas },
      { data: twoWeekResas },
      { data: yesterdayResas },
    ] = await Promise.all([
      supabase.from('reservations')
        .select('*', { count: 'exact', head: true })
        .eq('company_id', companyId)
        .gte('date_rdv', weekStartISO)
        .lte('date_rdv', weekEnd),
      supabase.from('reservations')
        .select('statut, prix')
        .eq('company_id', companyId)
        .gte('date_rdv', weekStartISO)
        .lte('date_rdv', weekEnd),
      supabase.from('reservations')
        .select('date_rdv, prix, statut')
        .eq('company_id', companyId)
        .gte('date_rdv', prevWeekStartISO)
        .lte('date_rdv', weekEnd),
      supabase.from('reservations')
        .select('statut')
        .eq('company_id', companyId)
        .eq('date_rdv', yesterdayISO)
        .in('statut', ['completed','confirme','confirmee','terminee']),
    ])

    setResCount(weekResCount ?? 0)
    const allWeek = weekResas ?? []
    const rev = allWeek
      .filter(r => r.statut === 'completed')
      .reduce((s, r) => s + (Number(r.prix) || 0), 0)
    setRevenue(rev)
    const bad = allWeek.filter(r => r.statut === 'cancelled' || r.statut === 'no_show').length
    setCancelRate(allWeek.length > 0 ? Math.round((bad / allWeek.length) * 100) : 0)

    const completedWeek = allWeek.filter(r =>
      r.statut === 'completed' ||
      r.statut === 'confirme' ||
      r.statut === 'confirmee' ||
      r.statut === 'terminee'
    ).length
    setCompletedCount(completedWeek)

    const cancelled = allWeek.filter(r =>
      r.statut === 'cancelled' ||
      r.statut === 'annule' ||
      r.statut === 'annulee'
    ).length
    const noShows = allWeek.filter(r =>
      r.statut === 'no_show' ||
      r.statut === 'absent'
    ).length
    setCancelledCount(cancelled)
    setNoShowCount(noShows)

    setCompletedYesterday(yesterdayResas?.length ?? 0)

    // ── Taux de remplissage du jour ──────────────────────────
    const DAY_KEYS = ['dim', 'lun', 'mar', 'mer', 'jeu', 'ven', 'sam'] as const
    const dayKey = DAY_KEYS[new Date().getDay()]

    const { data: employes } = await supabase
      .from('employes')
      .select('id, nom, prenom')
      .eq('company_id', companyId)
      .eq('actif', true)

    setAllEmployes((employes ?? []) as { id: string; nom: string; prenom: string | null }[])
    const employeIds = (employes ?? []).map(e => e.id)
    let calcMinutesDispo = 0

    if (employeIds.length > 0) {
      const { data: horairesData } = await supabase
        .from('employe_horaires')
        .select('employe_id, horaires, exceptions')
        .in('employe_id', employeIds)

      for (const row of horairesData ?? []) {
        const exceptions: Array<{ debut: string; fin: string }> = row.exceptions ?? []
        if (exceptions.some(ex => todayLocal >= ex.debut && todayLocal <= ex.fin)) continue
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const daySchedule = (row.horaires as any)?.[dayKey]
        if (!daySchedule?.actif) continue
        const [hd, md] = (daySchedule.debut as string).split(':').map(Number)
        const [hf, mf] = (daySchedule.fin as string).split(':').map(Number)
        let mins = (hf * 60 + mf) - (hd * 60 + md)
        for (const pause of daySchedule.pauses ?? []) {
          const [phd, pmd] = (pause.debut as string).split(':').map(Number)
          const [phf, pmf] = (pause.fin as string).split(':').map(Number)
          mins -= (phf * 60 + pmf) - (phd * 60 + pmd)
        }
        calcMinutesDispo += Math.max(0, mins)
      }
    }

    const { data: resasToday } = await supabase
      .from('reservations')
      .select('duree_rdv, statut')
      .eq('company_id', companyId)
      .eq('date_rdv', todayLocal)
      .not('statut', 'in', '(cancelled,no_show)')

    const calcMinutesOccupees = (resasToday ?? []).reduce((total, r) => {
      return total + (Number(r.duree_rdv) || 0)
    }, 0)

    const calcTaux = calcMinutesDispo > 0
      ? Math.min(Math.round((calcMinutesOccupees / calcMinutesDispo) * 100), 100)
      : 0

    setRdvAujourdhui(resasToday?.length ?? 0)
    setMinutesDispo(calcMinutesDispo)
    setMinutesOccupees(calcMinutesOccupees)
    setTauxRemplissage(calcTaux)

    const thisWeek = Array(7).fill(0)
    const prevWeek = Array(7).fill(0)
    const wsMs = new Date(weekStartISO + 'T00:00:00').getTime()
    for (const r of twoWeekResas ?? []) {
      const diff = Math.round((new Date(r.date_rdv + 'T00:00:00').getTime() - wsMs) / 86_400_000)
      if (diff >= 0 && diff < 7) thisWeek[diff] += 1
      else if (diff >= -7 && diff < 0) prevWeek[diff + 7] += 1
    }
    setWeekData(thisWeek)
    setPrevWeekData(prevWeek)

    const thisWeekTotal = thisWeek.reduce((a, b) => a + b, 0)
    const prevWeekTotal = prevWeek.reduce((a, b) => a + b, 0)
    const growth = prevWeekTotal > 0
      ? Math.round(((thisWeekTotal - prevWeekTotal) / prevWeekTotal) * 100)
      : null
    setGrowthRate(growth)

    setRecent(await fetchRecent(companyId))
  }

  // ── Load stats ───────────────────────────────────────────────
  useEffect(() => {
    if (!company?.id) return
    loadStats(company.id)
  }, [company?.id])

  // ── Load services (couleur par service) ──────────────────────
  useEffect(() => {
    if (!company?.id) return
    supabase.from('services_catalogue')
      .select('id, nom, couleur')
      .eq('company_id', company.id)
      .then(({ data }) => setAllServices((data ?? []) as { id: string; nom: string; couleur: string | null }[]))
  }, [company?.id])

  // ── Realtime subscription — activités récentes + reconnexion foreground ──
  useEffect(() => {
    if (!company?.id) return

    let channel: ReturnType<typeof supabase.channel> | null = null

    const connectChannel = () => {
      if (channel) supabase.removeChannel(channel)
      channel = supabase
        .channel('dashboard-recent-' + company.id + '-' + Date.now())
        .on('postgres_changes', {
          event: 'INSERT',
          schema: 'public',
          table: 'reservations',
          filter: `company_id=eq.${company.id}`,
        }, () => { fetchRecent(company.id).then(setRecent); loadStats(company.id) })
        .on('postgres_changes', {
          event: 'UPDATE',
          schema: 'public',
          table: 'reservations',
          filter: `company_id=eq.${company.id}`,
        }, () => { fetchRecent(company.id).then(setRecent); loadStats(company.id) })
        .subscribe((status) => {
          console.log('[Realtime] dashboard status:', status)
        })
    }

    connectChannel()

    const handleForeground = (nextState: AppStateStatus) => {
      if (nextState === 'active') {
        console.log('[Realtime] dashboard foreground → reconnect')
        connectChannel()
      }
    }
    const sub = AppState.addEventListener('change', handleForeground)

    return () => {
      sub.remove()
      if (channel) supabase.removeChannel(channel)
    }
  }, [company?.id])

  // ── AppState — re-fetch activités récentes au retour foreground ──
  useEffect(() => {
    const handleAppStateChange = async (nextState: AppStateStatus) => {
      if (nextState === 'active' && company?.id) {
        fetchRecent(company.id).then(setRecent)
        loadStats(company.id)
      }
    }
    const sub = AppState.addEventListener('change', handleAppStateChange)
    return () => sub.remove()
  }, [company?.id])

  const ownerInitials = ownerName
    ? ownerName.split(' ').map(w => w[0] ?? '').join('').toUpperCase().slice(0, 2) || (company?.name ?? '??').slice(0, 2).toUpperCase()
    : (company?.name ?? '??').slice(0, 2).toUpperCase()
const maxVal = Math.max(...weekData, ...prevWeekData, 1)
  const dayLabels = ['Lu', 'Ma', 'Me', 'Je', 'Ve', 'Sa', 'Di']

  if (!company) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#f5f3ff' }}>
        <Text style={{ color: '#7c3aed', fontSize: 16 }}>Chargement...</Text>
      </View>
    )
  }

  // ── TABLET LAYOUT — 3 colonnes ─────────────────────────────
  if (isTablet) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: '#f5f3ff' }} edges={['top']}>
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingBottom: 32 }}
          showsVerticalScrollIndicator={false}
        >
          {/* ── TABLET: Header ── */}
          <View style={[s.card, { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', margin: 16, marginBottom: 0 }]}>
            <View>
              <Text style={{ fontSize: 20, fontWeight: '700', color: '#111827' }}>
                <Text style={{ color: '#F9A310' }}>Bonjour, </Text>{ownerName || company.name} 👋
              </Text>
              <Text style={{ color: '#9ca3af', fontSize: 13, marginTop: 2 }}>
                Bienvenue sur votre tableau de bord
              </Text>
            </View>
            {company?.logo_url ? (
              <Image source={{ uri: company.logo_url }} style={{ width: 42, height: 42, borderRadius: 21 }} />
            ) : (
              <View style={{ width: 42, height: 42, borderRadius: 21, backgroundColor: '#7c3aed', alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ color: 'white', fontSize: 13, fontWeight: '700' }}>{ownerInitials}</Text>
              </View>
            )}
          </View>

          {/* ── TABLET: Body 3 colonnes ── */}
          <View style={{ flexDirection: 'row', gap: 16, padding: 16 }}>

            {/* COLONNE GAUCHE flex:3 */}
            <View style={{ flex: 3 }}>
              {/* Carte salon */}
              <View style={[s.card, { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 }]}>
                {company?.logo_url ? (
                  <Image source={{ uri: company.logo_url }} style={{ width: 48, height: 48, borderRadius: 24 }} />
                ) : (
                  <View style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: '#7c3aed', alignItems: 'center', justifyContent: 'center' }}>
                    <Text style={{ color: 'white', fontWeight: '700', fontSize: 18 }}>{company?.name?.charAt(0) ?? 'P'}</Text>
                  </View>
                )}
                <View>
                  <Text style={{ fontSize: 16, fontWeight: '700', color: '#1f2937' }}>{company?.name ?? 'Salon'}</Text>
                  <Text style={{ fontSize: 12, color: '#9ca3af', marginTop: 2 }}>Tableau de bord</Text>
                </View>
              </View>

              {/* Activités récentes */}
              <View style={s.card}>
                <Text style={{ fontSize: 14, fontWeight: '600', color: '#111827', marginBottom: 12 }}>Activités récentes</Text>
                {recent.length === 0 ? (
                  <Text style={{ fontSize: 13, color: '#9ca3af', textAlign: 'center', paddingVertical: 12 }}>Aucune activité</Text>
                ) : (
                  <ScrollView nestedScrollEnabled={true} showsVerticalScrollIndicator={false}>
                    {recent.map((r, i) => {
                      const sc           = STATUS_COLOR[r.statut] ?? STATUS_COLOR.pending
                      const showSvcColor = company?.couleur_service_enabled !== false
                      const svcColor     = allServices.find(sv => sv.nom === r.service)?.couleur ?? null
                      return (
                        <TouchableOpacity
                          key={r.id}
                          onPress={() => router.push(`/(owner)/reservation/${r.id}` as Parameters<typeof router.push>[0])}
                          activeOpacity={0.7}
                          style={{
                            flexDirection: 'row', alignItems: 'center', gap: 10,
                            paddingVertical: 8,
                            paddingLeft: showSvcColor && svcColor ? 6 : 0,
                            borderBottomWidth: i < recent.length - 1 ? 1 : 0,
                            borderBottomColor: 'rgba(0,0,0,0.05)',
                            backgroundColor: showSvcColor && svcColor ? `${svcColor}18` : 'transparent',
                            borderLeftWidth: showSvcColor && svcColor ? 3 : 0,
                            borderLeftColor: svcColor ?? 'transparent',
                            borderRadius: 4,
                          }}
                        >
                          <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: '#7c3aed', alignItems: 'center', justifyContent: 'center' }}>
                            <Text style={{ color: 'white', fontSize: 12, fontWeight: '700' }}>{inits(r.client_prenom, r.client_nom)}</Text>
                          </View>
                          <View style={{ flex: 1 }}>
                            <Text style={{ fontSize: 13, fontWeight: '600', color: '#111827' }} numberOfLines={1}>
                              {clientName(r)}{r.choix_direct ? ' ❤️' : ''}
                            </Text>
                            <Text style={{ fontSize: 11, color: '#9ca3af' }} numberOfLines={1}>
                              {r.service || '—'}{r.employee_id ? ` • ✂️ ${(() => { const emp = allEmployes.find(e => e.id === r.employee_id); return emp ? [emp.prenom, emp.nom].filter(Boolean).join(' ') : '' })()}` : ''}
                            </Text>
                            {r.created_at && <Text style={{ fontSize: 10, color: '#c4b5fd' }} numberOfLines={1}>📅 {new Date(r.created_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}</Text>}
                          </View>
                          <View style={{ alignItems: 'flex-end' }}>
                            <Text style={{ fontSize: 11, color: '#9ca3af', marginBottom: 2 }}>{r.date_rdv} {r.heure_rdv?.slice(0, 5)}</Text>
                            <View style={{ backgroundColor: sc.bg, borderRadius: 999, paddingHorizontal: 6, paddingVertical: 2 }}>
                              <Text style={{ fontSize: 10, fontWeight: '600', color: sc.color }}>{STATUS_LABEL[r.statut] ?? r.statut}</Text>
                            </View>
                          </View>
                        </TouchableOpacity>
                      )
                    })}
                  </ScrollView>
                )}
              </View>
            </View>

            {/* COLONNE CENTRE flex:4.5 */}
            <View style={{ flex: 4.5 }}>
              {/* KPI row: Réservations + Revenus */}
              <View style={{ flexDirection: 'row', gap: 12, marginBottom: 12 }}>
                <LinearGradient
                  colors={['#a855f7', '#ec4899']}
                  start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                  style={{ flex: 1, borderRadius: 20, padding: 16 }}
                >
                  <Text style={{ fontSize: 10, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5, color: 'rgba(255,255,255,0.8)', marginBottom: 8 }}>Réservations</Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <View style={{ alignItems: 'center' }}>
                      <Text style={{ fontSize: 22, fontWeight: '800', color: 'white' }}>{resCount}</Text>
                      <Text style={{ fontSize: 10, color: 'rgba(255,255,255,0.75)', marginTop: 2 }}>reçues</Text>
                    </View>
                    <View style={{ width: 1.5, height: 36, backgroundColor: 'rgba(255,255,255,0.4)', borderRadius: 1 }} />
                    <View style={{ alignItems: 'center' }}>
                      <Text style={{ fontSize: 22, fontWeight: '800', color: 'white' }}>{completedCount}</Text>
                      <Text style={{ fontSize: 10, color: 'rgba(255,255,255,0.75)', marginTop: 2 }}>complétées</Text>
                    </View>
                  </View>
                  <Text style={{ fontSize: 10, color: 'rgba(255,255,255,0.65)', marginTop: 4 }}>cette semaine</Text>
                </LinearGradient>
                <KpiCard label="Revenus" value={`${revenue.toFixed(0)} $`} sub="cette semaine" />
              </View>

              {/* Taux de croissance */}
              <View style={[s.card, { marginBottom: 10, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }]}>
                <View>
                  <Text style={{ fontSize: 10, fontWeight: '700', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: 0.5 }}>Taux de croissance</Text>
                  <Text style={{ fontSize: 24, fontWeight: '800', marginTop: 4, color: growthRate !== null && growthRate >= 0 ? '#16a34a' : '#dc2626' }}>
                    {growthRate !== null ? (growthRate > 0 ? '+' : '') + growthRate + '%' : '—'}
                  </Text>
                  <Text style={{ fontSize: 10, color: '#9ca3af', marginTop: 2 }}>cette semaine</Text>
                </View>
                <View style={{ width: 1, alignSelf: 'stretch', backgroundColor: 'rgba(0,0,0,0.08)' }} />
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={{ fontSize: 10, fontWeight: '700', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: 0.5 }}>Complétées hier</Text>
                  <Text style={{ fontSize: 24, fontWeight: '800', color: '#7c3aed', marginTop: 4 }}>{completedYesterday}</Text>
                  <Text style={{ fontSize: 10, color: '#9ca3af', marginTop: 2 }}>hier</Text>
                </View>
              </View>

              {/* Annulations / Absents */}
              <View style={[s.card, { marginBottom: 10, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }]}>
                <View>
                  <Text style={{ fontSize: 10, fontWeight: '700', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: 0.5 }}>Annulations</Text>
                  <Text style={{ fontSize: 24, fontWeight: '800', color: '#dc2626', marginTop: 4 }}>{cancelledCount}</Text>
                  <Text style={{ fontSize: 10, color: '#9ca3af', marginTop: 2 }}>cette semaine</Text>
                </View>
                <View style={{ width: 1, alignSelf: 'stretch', backgroundColor: 'rgba(0,0,0,0.08)' }} />
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={{ fontSize: 10, fontWeight: '700', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: 0.5 }}>Absents</Text>
                  <Text style={{ fontSize: 24, fontWeight: '800', color: '#7c3aed', marginTop: 4 }}>{noShowCount}</Text>
                  <Text style={{ fontSize: 10, color: '#9ca3af', marginTop: 2 }}>cette semaine</Text>
                </View>
              </View>

              {/* Graphique barres 7 jours */}
              <View style={[s.card, { marginBottom: 12 }]}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                  <Text style={{ fontSize: 14, fontWeight: '600', color: '#111827' }}>Réservations 7 jours</Text>
                  <View style={{ flexDirection: 'row', gap: 12 }}>
                    <LegendDot color="#F9A310" label="Sem. précédente" />
                    <LegendDot color="#a855f7" label="Cette semaine" />
                  </View>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 4, height: 80 }}>
                  {dayLabels.map((day, i) => (
                    <View key={day} style={{ flex: 1, alignItems: 'center', gap: 2 }}>
                      <View style={{ width: '100%', gap: 2, alignItems: 'center', justifyContent: 'flex-end', height: 64, flexDirection: 'row' }}>
                        <View style={{ width: '45%', height: Math.max(4, (prevWeekData[i] / maxVal) * 60), backgroundColor: '#F9A310', borderRadius: 3 }} />
                        <View style={{ width: '45%', height: Math.max(4, (weekData[i] / maxVal) * 60), backgroundColor: '#a855f7', borderRadius: 3 }} />
                      </View>
                      <Text style={{ fontSize: 10, color: '#9ca3af' }}>{day}</Text>
                    </View>
                  ))}
                </View>
              </View>

              {/* Graphique revenus — placeholder */}
              <View style={[s.card, { alignItems: 'center', justifyContent: 'center', minHeight: 160 }]}>
                <Text style={{ color: '#9ca3af', fontSize: 13 }}>Graphique revenus — à venir</Text>
              </View>
            </View>

            {/* COLONNE DROITE flex:2.5 */}
            <View style={{ flex: 2.5 }}>
              {/* Taux de remplissage */}
              <View style={[s.card, { alignItems: 'center', marginBottom: 12 }]}>
                <Text style={{ fontSize: 14, fontWeight: '600', color: '#111827', marginBottom: 12 }}>Taux de Remplissage du jour</Text>
                <View style={{ position: 'relative', alignItems: 'center', justifyContent: 'center' }}>
                  <ProgressRing pct={tauxRemplissage} size={120} />
                  <View style={{ position: 'absolute' }}>
                    <Text style={{ fontSize: 22, fontWeight: '800', color: '#7c3aed', textAlign: 'center' }}>{tauxRemplissage}%</Text>
                  </View>
                </View>
                <Text style={{ fontSize: 12, color: '#9ca3af', marginTop: 8 }}>{minutesOccupees} min / {minutesDispo} min disponibles</Text>
              </View>

              {/* Calendrier — placeholder */}
              <View style={{
                backgroundColor: 'rgba(255,255,255,0.9)',
                borderRadius: 20, padding: 16, marginTop: 12,
                alignItems: 'center', justifyContent: 'center',
                minHeight: 200,
                shadowColor: '#7c3aed', shadowOffset: { width: 0, height: 4 },
                shadowOpacity: 0.1, shadowRadius: 16, elevation: 4,
                borderWidth: 1, borderColor: 'rgba(255,255,255,0.8)',
              }}>
                <Text style={{ color: '#9ca3af', fontSize: 13 }}>Calendrier — à venir</Text>
              </View>
            </View>

          </View>
        </ScrollView>
      </SafeAreaView>
    )
  }

  // ── PHONE LAYOUT — inchangé ──────────────────────────────────
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#f5f3ff' }} edges={['top']}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 16, paddingBottom: 80 }}
        showsVerticalScrollIndicator={false}
      >
        {/* ── 1. Header ── */}
        <View style={[s.card, { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }]}>
          <View>
            <Text style={{ fontSize: 18, fontWeight: '700', color: '#111827' }}>
              <Text style={{ color: '#F9A310' }}>Bonjour, </Text>{ownerName || company.name} 👋
            </Text>
            <Text style={{ color: '#9ca3af', fontSize: 13, marginTop: 2 }}>
              Bienvenue sur votre tableau de bord
            </Text>
          </View>
          {company?.logo_url ? (
            <Image
              source={{ uri: company.logo_url }}
              style={{ width: 42, height: 42, borderRadius: 21 }}
            />
          ) : (
            <View style={{ width: 42, height: 42, borderRadius: 21, backgroundColor: '#7c3aed', alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ color: 'white', fontSize: 13, fontWeight: '700' }}>{ownerInitials}</Text>
            </View>
          )}
        </View>

        {/* ── 2. Activités récentes ── */}
        <View style={[s.card, { marginBottom: 16 }]}>
          <Text style={{ fontSize: 14, fontWeight: '600', color: '#111827', marginBottom: 12 }}>
            Activités récentes
          </Text>
          {recent.length === 0 ? (
            <Text style={{ fontSize: 13, color: '#9ca3af', textAlign: 'center', paddingVertical: 12 }}>
              Aucune activité
            </Text>
          ) : (
            <ScrollView style={{ maxHeight: 420 }} nestedScrollEnabled={true} showsVerticalScrollIndicator={false}>
              {recent.map((r, i) => {
                const sc           = STATUS_COLOR[r.statut] ?? STATUS_COLOR.pending
                const showSvcColor = company?.couleur_service_enabled !== false
                const svcColor     = allServices.find(sv => sv.nom === r.service)?.couleur ?? null
                return (
                  <TouchableOpacity
                    key={r.id}
                    onPress={() => router.push(`/(owner)/reservation/${r.id}` as Parameters<typeof router.push>[0])}
                    activeOpacity={0.7}
                    style={{
                      flexDirection: 'row', alignItems: 'center', gap: 10,
                      paddingVertical: 8,
                      paddingLeft: showSvcColor && svcColor ? 6 : 0,
                      borderBottomWidth: i < recent.length - 1 ? 1 : 0,
                      borderBottomColor: 'rgba(0,0,0,0.05)',
                      backgroundColor: showSvcColor && svcColor ? `${svcColor}18` : 'transparent',
                      borderLeftWidth: showSvcColor && svcColor ? 3 : 0,
                      borderLeftColor: svcColor ?? 'transparent',
                      borderRadius: 4,
                    }}
                  >
                    <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: '#7c3aed', alignItems: 'center', justifyContent: 'center' }}>
                      <Text style={{ color: 'white', fontSize: 12, fontWeight: '700' }}>
                        {inits(r.client_prenom, r.client_nom)}
                      </Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 13, fontWeight: '600', color: '#111827' }} numberOfLines={1}>
                        {clientName(r)}{r.choix_direct ? ' ❤️' : ''}
                      </Text>
                      <Text style={{ fontSize: 11, color: '#9ca3af' }} numberOfLines={1}>
                        {r.service || '—'}{r.employee_id ? ` • ✂️ ${(() => { const emp = allEmployes.find(e => e.id === r.employee_id); return emp ? [emp.prenom, emp.nom].filter(Boolean).join(' ') : '' })()}` : ''}
                      </Text>
                      {r.created_at && <Text style={{ fontSize: 10, color: '#c4b5fd' }} numberOfLines={1}>📅 {new Date(r.created_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}</Text>}
                    </View>
                    <View style={{ alignItems: 'flex-end' }}>
                      <Text style={{ fontSize: 11, color: '#9ca3af', marginBottom: 2 }}>
                        {r.date_rdv} {r.heure_rdv?.slice(0, 5)}
                      </Text>
                      <View style={{ backgroundColor: sc.bg, borderRadius: 999, paddingHorizontal: 6, paddingVertical: 2 }}>
                        <Text style={{ fontSize: 10, fontWeight: '600', color: sc.color }}>
                          {STATUS_LABEL[r.statut] ?? r.statut}
                        </Text>
                      </View>
                    </View>
                  </TouchableOpacity>
                )
              })}
            </ScrollView>
          )}
        </View>

        {/* ── 3. KPI Cards ── */}
        <View style={{ flexDirection: 'row', gap: 12, marginBottom: 12 }}>
          <View style={{
            flex: 1,
            backgroundColor: '#F9A310',
            borderRadius: 20,
            padding: 14,
            shadowColor: '#F9A310',
            shadowOffset: { width: 0, height: 8 },
            shadowOpacity: 0.3,
            shadowRadius: 16,
            elevation: 8,
          }}>
            <Text style={{
              fontSize: 10, fontWeight: '600',
              textTransform: 'uppercase', letterSpacing: 0.5,
              color: 'rgba(255,255,255,0.8)', marginBottom: 8,
            }}>Réservations</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <View style={{ alignItems: 'center' }}>
                <Text style={{ fontSize: 22, fontWeight: '800', color: 'white' }}>{resCount}</Text>
                <Text style={{ fontSize: 10, color: 'rgba(255,255,255,0.75)', marginTop: 2 }}>reçues</Text>
              </View>
              <View style={{ width: 1.5, height: 36, backgroundColor: 'rgba(255,255,255,0.4)', borderRadius: 1 }} />
              <View style={{ alignItems: 'center' }}>
                <Text style={{ fontSize: 22, fontWeight: '800', color: 'white' }}>{completedCount}</Text>
                <Text style={{ fontSize: 10, color: 'rgba(255,255,255,0.75)', marginTop: 2 }}>complétées</Text>
              </View>
            </View>
            <Text style={{ fontSize: 10, color: 'rgba(255,255,255,0.65)', marginTop: 4 }}>cette semaine</Text>
          </View>
          <KpiCard label="Revenus" value={`${revenue.toFixed(0)} $`} sub="cette semaine" />
        </View>

        {/* ── 4. Graphique réservations 7 jours ── */}
        <View style={[s.card, { marginBottom: 12 }]}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <Text style={{ fontSize: 14, fontWeight: '600', color: '#111827' }}>Réservations 7 jours</Text>
            <View style={{ flexDirection: 'row', gap: 12 }}>
              <LegendDot color="#F9A310" label="Sem. précédente" />
              <LegendDot color="#a855f7" label="Cette semaine" />
            </View>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 4, height: 80 }}>
            {dayLabels.map((day, i) => (
              <View key={day} style={{ flex: 1, alignItems: 'center', gap: 2 }}>
                <View style={{ width: '100%', gap: 2, alignItems: 'center', justifyContent: 'flex-end', height: 64, flexDirection: 'row' }}>
                  <View style={{ width: '45%', height: Math.max(4, (prevWeekData[i] / maxVal) * 60), backgroundColor: '#F9A310', borderRadius: 3 }} />
                  <View style={{ width: '45%', height: Math.max(4, (weekData[i] / maxVal) * 60), backgroundColor: '#a855f7', borderRadius: 3 }} />
                </View>
                <Text style={{ fontSize: 10, color: '#9ca3af' }}>{day}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* ── 5. Taux de croissance ── */}
        <View style={[s.card, {
          marginTop: 8, marginBottom: 10,
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
        }]}>
          <View>
            <Text style={{ fontSize: 10, fontWeight: '700', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: 0.5 }}>
              Taux de croissance
            </Text>
            <Text style={{ fontSize: 24, fontWeight: '800', marginTop: 4, color: growthRate !== null && growthRate >= 0 ? '#16a34a' : '#dc2626' }}>
              {growthRate !== null ? (growthRate > 0 ? '+' : '') + growthRate + '%' : '—'}
            </Text>
            <Text style={{ fontSize: 10, color: '#9ca3af', marginTop: 2 }}>cette semaine</Text>
          </View>
          <View style={{ width: 1, alignSelf: 'stretch', backgroundColor: 'rgba(0,0,0,0.08)' }} />
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={{ fontSize: 10, fontWeight: '700', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: 0.5 }}>
              Complétées hier
            </Text>
            <Text style={{ fontSize: 24, fontWeight: '800', color: '#7c3aed', marginTop: 4 }}>
              {completedYesterday}
            </Text>
            <Text style={{ fontSize: 10, color: '#9ca3af', marginTop: 2 }}>hier</Text>
          </View>
        </View>

        {/* ── 6. Taux annulation ── */}
        <View style={[s.card, {
          marginBottom: 10,
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
        }]}>
          <View>
            <Text style={{ fontSize: 10, fontWeight: '700', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: 0.5 }}>
              Annulations
            </Text>
            <Text style={{ fontSize: 24, fontWeight: '800', color: '#dc2626', marginTop: 4 }}>
              {cancelledCount}
            </Text>
            <Text style={{ fontSize: 10, color: '#9ca3af', marginTop: 2 }}>cette semaine</Text>
          </View>
          <View style={{ width: 1, alignSelf: 'stretch', backgroundColor: 'rgba(0,0,0,0.08)' }} />
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={{ fontSize: 10, fontWeight: '700', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: 0.5 }}>
              Absents
            </Text>
            <Text style={{ fontSize: 24, fontWeight: '800', color: '#7c3aed', marginTop: 4 }}>
              {noShowCount}
            </Text>
            <Text style={{ fontSize: 10, color: '#9ca3af', marginTop: 2 }}>cette semaine</Text>
          </View>
        </View>

        {/* ── 7. Taux de Remplissage du jour ── */}
        <View style={[s.card, { alignItems: 'center', marginBottom: 12 }]}>
          <Text style={{ fontSize: 14, fontWeight: '600', color: '#111827', marginBottom: 12 }}>
            Taux de Remplissage du jour
          </Text>
          <View style={{ position: 'relative', alignItems: 'center', justifyContent: 'center' }}>
            <ProgressRing pct={tauxRemplissage} size={120} />
            <View style={{ position: 'absolute' }}>
              <Text style={{ fontSize: 22, fontWeight: '800', color: '#7c3aed', textAlign: 'center' }}>
                {tauxRemplissage}%
              </Text>
            </View>
          </View>
          <Text style={{ fontSize: 12, color: '#9ca3af', marginTop: 8 }}>
            {minutesOccupees} min / {minutesDispo} min disponibles
          </Text>
        </View>

        {/* ── 8. Accès rapide ── */}
        <View style={[s.card, { marginTop: 0 }]}>
          <Text style={{ fontSize: 12, fontWeight: '700', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 12 }}>
            Accès rapide
          </Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {[
              { icon: 'calendar-outline',  label: 'Agenda Collab.', route: '/(owner)/(tabs)/agenda-collab' },
              { icon: 'receipt-outline',   label: 'Comptabilité',   route: '/(owner)/(tabs)/comptabilite' },
              { icon: 'person-outline',    label: 'Employés',       route: '/(owner)/(tabs)/employes' },
              { icon: 'cut-outline',       label: 'Services',       route: '/(owner)/(tabs)/services' },
              { icon: 'bar-chart-outline', label: 'Statistiques',   route: '/(owner)/(tabs)/statistiques' },
              { icon: 'star-outline',      label: 'Avis clients',   route: '/(owner)/(tabs)/avis' },
            ].map(({ icon, label, route }) => (
              <TouchableOpacity
                key={route}
                onPress={() => router.push(route as Parameters<typeof router.push>[0])}
                style={{ width: (width - 80) / 3, backgroundColor: 'rgba(124,58,237,0.07)', borderRadius: 12, padding: 12, alignItems: 'center', gap: 6 }}
              >
                <Ionicons name={icon as React.ComponentProps<typeof Ionicons>['name']} size={20} color="#7c3aed" />
                <Text style={{ fontSize: 11, fontWeight: '600', color: '#7c3aed', textAlign: 'center' }}>{label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

      </ScrollView>
    </SafeAreaView>
  )
}

// ── Sub-components ───────────────────────────────────────────────

function KpiCard({ label, value, sub, color = '#7c3aed' }: { label: string; value: string; sub: string; color?: string }) {
  return (
    <View style={{ flex: 1, backgroundColor: color, borderRadius: 20, padding: 18, shadowColor: color, shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.3, shadowRadius: 16, elevation: 8 }}>
      <Text style={{ fontSize: 11, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5, color: 'rgba(255,255,255,0.8)', marginBottom: 8 }}>
        {label}
      </Text>
      <Text style={{ fontSize: 26, fontWeight: '800', color: 'white', marginBottom: 4 }}>{value}</Text>
      <Text style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)' }}>{sub}</Text>
    </View>
  )
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: color }} />
      <Text style={{ fontSize: 10, color: '#9ca3af' }}>{label}</Text>
    </View>
  )
}

function ProgressRing({ pct, size }: { pct: number; size: number }) {
  return (
    <View style={{
      width: size, height: size,
      borderRadius: size / 2,
      borderWidth: 8,
      borderColor: 'rgba(168,85,247,0.15)',
      alignItems: 'center',
      justifyContent: 'center',
    }}>
      <View style={{
        position: 'absolute',
        bottom: 0,
        width: size - 16,
        height: Math.max(4, ((size - 16) * pct) / 100),
        borderRadius: (size - 16) / 2,
        backgroundColor: 'rgba(168,85,247,0.2)',
      }} />
    </View>
  )
}

// ── Styles ───────────────────────────────────────────────────────
const s = StyleSheet.create({
  card: {
    backgroundColor: 'rgba(255,255,255,0.9)',
    borderRadius: 20,
    padding: 16,
    shadowColor: '#7c3aed',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 16,
    elevation: 4,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.8)',
  },
})
