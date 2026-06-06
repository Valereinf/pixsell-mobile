import { useEffect, useState, useMemo } from 'react'
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, Dimensions, AppState, type AppStateStatus,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { supabase } from '../../lib/supabase'
import type { Company } from '../../lib/types'
import { useOwnerContext } from '../../lib/ownerContext'

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
}

// ── Constants ────────────────────────────────────────────────────
const STATUS_COLOR: Record<string, { bg: string; color: string }> = {
  pending:   { bg: 'rgba(245,158,11,0.15)',  color: '#d97706' },
  confirmed: { bg: 'rgba(16,185,129,0.15)',  color: '#059669' },
  completed: { bg: 'rgba(107,114,128,0.15)', color: '#6b7280' },
  cancelled: { bg: 'rgba(239,68,68,0.15)',   color: '#dc2626' },
  no_show:   { bg: 'rgba(249,115,22,0.15)',  color: '#ea580c' },
}
const STATUS_LABEL: Record<string, string> = {
  pending: 'En attente', confirmed: 'Confirmé', completed: 'Passé',
  cancelled: 'Annulé', no_show: 'Absent',
}

// ── Helpers ──────────────────────────────────────────────────────
function todayISO() { return new Date().toISOString().slice(0, 10) }
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

async function fetchRecent(companyId: string): Promise<Resa[]> {
  const { data } = await supabase
    .from('reservations')
    .select('id, client_prenom, client_nom, service, date_rdv, heure_rdv, statut, prix')
    .eq('company_id', companyId)
    .order('created_at', { ascending: false })
    .limit(10)
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
  const [recent, setRecent] = useState<Resa[]>([])
  const [rdvAujourdhui, setRdvAujourdhui] = useState(0)
  const [resaDates, setResaDates] = useState<Set<string>>(new Set())
  const [calYear, setCalYear] = useState(new Date().getFullYear())
  const [calMonth, setCalMonth] = useState(new Date().getMonth())
  const [weekData, setWeekData] = useState<number[]>(Array(7).fill(0))
  const [prevWeekData, setPrevWeekData] = useState<number[]>(Array(7).fill(0))

  // ── Load company ─────────────────────────────────────────────
  useEffect(() => {
    const load = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) { router.replace('/(auth)/login'); return }

        const { data, error } = await supabase
          .from('companies')
          .select('*')
          .eq('owner_email', user.email)
          .single()

        if (error || !data) {
          console.error('[Dashboard] company not found:', error?.message)
          router.replace('/(auth)/login')
          return
        }

        setCompany(data as Company)
        setContextCompany(data as Company)
        const meta = user.user_metadata ?? {}
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

  // ── Load stats ───────────────────────────────────────────────
  useEffect(() => {
    if (!company) return
    const load = async () => {
      const startOfMonth = new Date()
      startOfMonth.setDate(1)
      startOfMonth.setHours(0, 0, 0, 0)
      const isoMonth = startOfMonth.toISOString().slice(0, 10)

      const now = new Date()
      const weekStart = new Date(now)
      weekStart.setDate(now.getDate() - ((now.getDay() + 6) % 7))
      const weekStartISO = weekStart.toISOString().slice(0, 10)
      const prevWeekStartISO = addDays(weekStartISO, -7)
      const todayLocal = new Date().toLocaleDateString('en-CA')

      const [
        { count: monthResCount },
        { data: monthResas },
        { data: twoWeekResas },
      ] = await Promise.all([
        supabase.from('reservations')
          .select('*', { count: 'exact', head: true })
          .eq('company_id', company.id)
          .gte('date_rdv', isoMonth),
        supabase.from('reservations')
          .select('statut, prix')
          .eq('company_id', company.id)
          .gte('date_rdv', isoMonth),
        supabase.from('reservations')
          .select('date_rdv, prix, statut')
          .eq('company_id', company.id)
          .gte('date_rdv', prevWeekStartISO)
          .lte('date_rdv', addDays(weekStartISO, 6)),
      ])

      setResCount(monthResCount ?? 0)
      const allMonth = monthResas ?? []
      const rev = allMonth
        .filter(r => r.statut === 'completed')
        .reduce((s, r) => s + (Number(r.prix) || 0), 0)
      setRevenue(rev)
      const bad = allMonth.filter(r => r.statut === 'cancelled' || r.statut === 'no_show').length
      setCancelRate(allMonth.length > 0 ? Math.round((bad / allMonth.length) * 100) : 0)

      const rdvToday = (twoWeekResas ?? []).filter(r => r.date_rdv === todayLocal).length
      setRdvAujourdhui(rdvToday)

      const thisWeek = Array(7).fill(0)
      const prevWeek = Array(7).fill(0)
      const wsMs = new Date(weekStartISO + 'T00:00:00').getTime()
      for (const r of twoWeekResas ?? []) {
        if (r.statut !== 'completed' && r.statut !== 'confirmed') continue
        const diff = Math.round((new Date(r.date_rdv + 'T00:00:00').getTime() - wsMs) / 86_400_000)
        if (diff >= 0 && diff < 7) thisWeek[diff] += Number(r.prix) || 0
        else if (diff >= -7 && diff < 0) prevWeek[diff + 7] += Number(r.prix) || 0
      }
      setWeekData(thisWeek)
      setPrevWeekData(prevWeek)

      // Initial fetch des activités récentes
      setRecent(await fetchRecent(company.id))
    }
    load()
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
        }, () => { fetchRecent(company.id).then(setRecent) })
        .on('postgres_changes', {
          event: 'UPDATE',
          schema: 'public',
          table: 'reservations',
          filter: `company_id=eq.${company.id}`,
        }, () => { fetchRecent(company.id).then(setRecent) })
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
      }
    }
    const sub = AppState.addEventListener('change', handleAppStateChange)
    return () => sub.remove()
  }, [company?.id])

  // ── Calendar dates ───────────────────────────────────────────
  useEffect(() => {
    if (!company) return
    const m = calMonth + 1
    const y = calYear
    const nextY = m === 12 ? y + 1 : y
    const nextM = m === 12 ? 1 : m + 1
    const from = `${y}-${String(m).padStart(2, '0')}-01`
    const to = `${nextY}-${String(nextM).padStart(2, '0')}-01`
    supabase.from('reservations')
      .select('date_rdv')
      .eq('company_id', company.id)
      .gte('date_rdv', from)
      .lt('date_rdv', to)
      .then(({ data }) => {
        setResaDates(new Set((data ?? []).map(r => r.date_rdv as string)))
      })
  }, [company?.id, calYear, calMonth])

  // ── Calendar grid ────────────────────────────────────────────
  const calDays = useMemo(() => {
    const firstDay = new Date(calYear, calMonth, 1)
    const lastDay = new Date(calYear, calMonth + 1, 0)
    const offset = (firstDay.getDay() + 6) % 7
    const days: (number | null)[] = []
    for (let i = 0; i < offset; i++) days.push(null)
    for (let d = 1; d <= lastDay.getDate(); d++) days.push(d)
    return days
  }, [calYear, calMonth])

  const prevMonth = () => {
    if (calMonth === 0) { setCalYear(y => y - 1); setCalMonth(11) }
    else setCalMonth(m => m - 1)
  }
  const nextMonth = () => {
    if (calMonth === 11) { setCalYear(y => y + 1); setCalMonth(0) }
    else setCalMonth(m => m + 1)
  }

  const todayStr = todayISO()
  const monthLabel = new Date(calYear, calMonth).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })
  const ownerInitials = ownerName
    ? ownerName.split(' ').map(w => w[0] ?? '').join('').toUpperCase().slice(0, 2) || (company?.name ?? '??').slice(0, 2).toUpperCase()
    : (company?.name ?? '??').slice(0, 2).toUpperCase()
  const pct = Math.min(Math.round((rdvAujourdhui / 10) * 100), 100)

  const maxVal = Math.max(...weekData, ...prevWeekData, 1)
  const dayLabels = ['Lu', 'Ma', 'Me', 'Je', 'Ve', 'Sa', 'Di']

  if (!company) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#f5f3ff' }}>
        <Text style={{ color: '#7c3aed', fontSize: 16 }}>Chargement...</Text>
      </View>
    )
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#f5f3ff' }} edges={['top']}>
      <Text style={{ color: 'red', fontSize: 10 }}>v{require('../../app.json').expo.version}</Text>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 16, paddingBottom: 80 }}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Header ── */}
        <View style={[s.card, { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }]}>
          <View>
            <Text style={{ fontSize: 18, fontWeight: '700', color: '#111827' }}>
              Bonjour, {ownerName || company.name} 👋
            </Text>
            <Text style={{ color: '#9ca3af', fontSize: 13, marginTop: 2 }}>
              Bienvenue sur votre tableau de bord
            </Text>
          </View>
          <View style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: '#7c3aed', alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ color: 'white', fontSize: 13, fontWeight: '700' }}>{ownerInitials}</Text>
          </View>
        </View>

        {/* ── Activités récentes ── */}
        <View style={[s.card, { marginBottom: 16 }]}>
          <Text style={{ fontSize: 14, fontWeight: '600', color: '#111827', marginBottom: 12 }}>
            Activités récentes
          </Text>
          {recent.length === 0 ? (
            <Text style={{ fontSize: 13, color: '#9ca3af', textAlign: 'center', paddingVertical: 12 }}>
              Aucune activité
            </Text>
          ) : (
            recent.map((r, i) => {
              const sc = STATUS_COLOR[r.statut] ?? STATUS_COLOR.pending
              return (
                <TouchableOpacity
                  key={r.id}
                  onPress={() => router.push(`/(owner)/reservation/${r.id}` as Parameters<typeof router.push>[0])}
                  activeOpacity={0.7}
                  style={{
                    flexDirection: 'row', alignItems: 'center', gap: 10,
                    paddingVertical: 8,
                    borderBottomWidth: i < recent.length - 1 ? 1 : 0,
                    borderBottomColor: 'rgba(0,0,0,0.05)',
                  }}
                >
                  <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: '#7c3aed', alignItems: 'center', justifyContent: 'center' }}>
                    <Text style={{ color: 'white', fontSize: 12, fontWeight: '700' }}>
                      {inits(r.client_prenom, r.client_nom)}
                    </Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 13, fontWeight: '600', color: '#111827' }} numberOfLines={1}>
                      {clientName(r)}
                    </Text>
                    <Text style={{ fontSize: 11, color: '#9ca3af' }} numberOfLines={1}>
                      {r.service || '—'}
                    </Text>
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
            })
          )}
        </View>

        {/* ── KPI Cards ── */}
        <View style={{ flexDirection: 'row', gap: 12, marginBottom: 12 }}>
          <KpiCard label="Réservations" value={String(resCount)} sub="ce mois" />
          <KpiCard label="Revenus" value={`${revenue.toFixed(0)} $`} sub="complétées" />
        </View>

        {/* ── Taux annulation ── */}
        <View style={[s.card, { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }]}>
          <View>
            <Text style={{ fontSize: 11, color: '#9ca3af', fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 }}>
              Taux d'annulation
            </Text>
            <Text style={{ fontSize: 28, fontWeight: '800', color: cancelRate > 20 ? '#ef4444' : '#7c3aed', marginTop: 2 }}>
              {cancelRate}%
            </Text>
          </View>
          <Text style={{ fontSize: 12, color: '#9ca3af' }}>ce mois</Text>
        </View>

        {/* ── Cercle progression ── */}
        <View style={[s.card, { alignItems: 'center', marginBottom: 12 }]}>
          <Text style={{ fontSize: 14, fontWeight: '600', color: '#111827', marginBottom: 12 }}>
            Taux du jour
          </Text>
          <View style={{ position: 'relative', alignItems: 'center', justifyContent: 'center' }}>
            <ProgressRing pct={pct} size={120} />
            <View style={{ position: 'absolute' }}>
              <Text style={{ fontSize: 22, fontWeight: '800', color: '#7c3aed', textAlign: 'center' }}>
                {pct}%
              </Text>
            </View>
          </View>
          <Text style={{ fontSize: 12, color: '#9ca3af', marginTop: 8 }}>
            {rdvAujourdhui} RDV aujourd'hui
          </Text>
        </View>

        {/* ── Graphique revenus ── */}
        <View style={[s.card, { marginBottom: 12 }]}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <Text style={{ fontSize: 14, fontWeight: '600', color: '#111827' }}>Revenus 7 jours</Text>
            <View style={{ flexDirection: 'row', gap: 12 }}>
              <LegendDot color="#a855f7" label="Cette semaine" />
              <LegendDot color="#f9a8d4" label="Sem. précédente" />
            </View>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 4, height: 80 }}>
            {dayLabels.map((day, i) => (
              <View key={day} style={{ flex: 1, alignItems: 'center', gap: 2 }}>
                <View style={{ width: '100%', gap: 2, alignItems: 'center', justifyContent: 'flex-end', height: 64, flexDirection: 'row' }}>
                  <View style={{ width: '45%', height: Math.max(4, (weekData[i] / maxVal) * 60), backgroundColor: '#a855f7', borderRadius: 3 }} />
                  <View style={{ width: '45%', height: Math.max(4, (prevWeekData[i] / maxVal) * 60), backgroundColor: '#f9a8d4', borderRadius: 3 }} />
                </View>
                <Text style={{ fontSize: 10, color: '#9ca3af' }}>{day}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* ── Mini calendrier ── */}
        <View style={[s.card, { marginBottom: 12 }]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <Text style={{ fontSize: 13, fontWeight: '600', color: '#111827', textTransform: 'capitalize' }}>
              {monthLabel}
            </Text>
            <View style={{ flexDirection: 'row', gap: 6 }}>
              <TouchableOpacity onPress={prevMonth} style={s.calBtn}>
                <Ionicons name="chevron-back" size={14} color="#7c3aed" />
              </TouchableOpacity>
              <TouchableOpacity onPress={nextMonth} style={s.calBtn}>
                <Ionicons name="chevron-forward" size={14} color="#7c3aed" />
              </TouchableOpacity>
            </View>
          </View>

          <View style={{ flexDirection: 'row', marginBottom: 6 }}>
            {['Lu','Ma','Me','Je','Ve','Sa','Di'].map(d => (
              <Text key={d} style={{ flex: 1, fontSize: 11, color: '#9ca3af', fontWeight: '600', textAlign: 'center' }}>{d}</Text>
            ))}
          </View>

          <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
            {calDays.map((day, i) => {
              if (day === null) return <View key={`e-${i}`} style={{ width: `${100/7}%` }} />
              const iso = `${calYear}-${String(calMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
              const isToday = iso === todayStr
              const hasRdv = resaDates.has(iso)
              return (
                <View key={iso} style={{ width: `${100/7}%`, alignItems: 'center', marginBottom: 4 }}>
                  <View style={{
                    width: 28, height: 28, borderRadius: 14,
                    backgroundColor: isToday ? '#7c3aed' : hasRdv ? 'rgba(168,85,247,0.12)' : 'transparent',
                    alignItems: 'center', justifyContent: 'center',
                  }}>
                    <Text style={{
                      fontSize: 12,
                      fontWeight: isToday ? '700' : hasRdv ? '600' : '400',
                      color: isToday ? 'white' : hasRdv ? '#7c3aed' : '#4b5563',
                    }}>
                      {day}
                    </Text>
                  </View>
                </View>
              )
            })}
          </View>
        </View>

        {/* ── Accès rapide ── */}
        <View style={[s.card, { marginTop: 0 }]}>
          <Text style={{ fontSize: 12, fontWeight: '700', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 12 }}>
            Accès rapide
          </Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {[
              { icon: 'calendar-outline',  label: 'Réservations', route: '/(owner)/reservations' },
              { icon: 'people-outline',    label: 'Clients',       route: '/(owner)/clients' },
              { icon: 'person-outline',    label: 'Employés',      route: '/(owner)/employes' },
              { icon: 'cut-outline',       label: 'Services',      route: '/(owner)/services' },
              { icon: 'megaphone-outline', label: 'Marketing',     route: '/(owner)/marketing' },
              { icon: 'receipt-outline',   label: 'Comptabilité',  route: '/(owner)/comptabilite' },
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

function KpiCard({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <View style={{ flex: 1, backgroundColor: '#7c3aed', borderRadius: 20, padding: 18, shadowColor: '#7c3aed', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.3, shadowRadius: 16, elevation: 8 }}>
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
  calBtn: {
    width: 26, height: 26, borderRadius: 13,
    backgroundColor: 'rgba(124,58,237,0.1)',
    alignItems: 'center', justifyContent: 'center',
  },
})
