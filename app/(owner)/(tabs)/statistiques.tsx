import { useEffect, useState, useMemo } from 'react'
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { supabase } from '../../../lib/supabase'
import { useOwnerContext } from '../../../lib/ownerContext'

// ── Types ──────────────────────────────────────────────────────────────────────

type Period = 'mois' | '3mois' | 'annee' | 'tout'
type BucketMode = 'day' | 'week' | 'month'

interface EmpRow { id: string; nom: string; titre: string | null }

// Forme du JSONB retourne par get_dashboard_statistiques (meme RPC que le
// dashboard web, voir C:\PixsellSaaS\supabase\migrations\088-090). Seuls les
// champs utilises par cet ecran sont types ici.
interface StatsKpis {
  completed_count: number
  total_rev: number
  noshow_count: number
  filtered_count: number
  unique_clients: number
}
interface StatsLoyalty {
  regular_2plus: number
  loyal_3plus: number
  single_visit: number
  occasional_2: number
  inactive_60d: number
}
interface ByEmployee { employee_id: string; cnt: number; rev: number }
interface ByHour { hour: string; cnt: number }
interface ByDow { dow: number; cnt: number }
interface TopService { service: string; cnt: number }
interface Month12 { month: string; cnt: number; rev: number }

interface StatsResult {
  kpis: StatsKpis
  loyalty: StatsLoyalty
  by_employee: ByEmployee[]
  by_hour: ByHour[]
  by_dow: ByDow[]
  top_services: TopService[]
  months12: Month12[]
}

// ── Constants ──────────────────────────────────────────────────────────────────

const PERIOD_OPTIONS: { id: Period; label: string }[] = [
  { id: 'mois',   label: 'Ce mois' },
  { id: '3mois',  label: '3 mois' },
  { id: 'annee',  label: 'Cette année' },
  { id: 'tout',   label: 'Tout' },
]

const DAY_LABELS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim']

// ── Helpers ────────────────────────────────────────────────────────────────────

function getPeriodStart(p: Period, tz: string): string | null {
  const localStr = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date())
  const [year, month] = localStr.split('-').map(Number)

  if (p === 'mois')
    return `${year}-${String(month).padStart(2, '0')}-01`

  if (p === '3mois') {
    const d = new Date(year, month - 1, 1)
    d.setMonth(d.getMonth() - 3)
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-01`
  }

  if (p === 'annee')
    return `${year}-01-01`

  return null
}

function getBucketMode(p: Period): BucketMode {
  if (p === 'mois') return 'day'
  if (p === '3mois') return 'week'
  return 'month'
}

function fmt(n: number): string { return n.toFixed(2) }

function last12Months(): { ym: string; label: string }[] {
  return Array.from({ length: 12 }, (_, i) => {
    const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - 11 + i)
    return {
      ym: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
      label: d.toLocaleDateString('fr-FR', { month: 'short' }),
    }
  })
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function HBar({ label, value, max, color, suffix = '' }: { label: string; value: number; max: number; color: string; suffix?: string }) {
  const pct = max > 0 ? Math.max(0.02, value / max) : 0.02
  return (
    <View style={{ marginBottom: 10 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 3 }}>
        <Text style={{ fontSize: 13, color: '#374151' }} numberOfLines={1}>{label}</Text>
        <Text style={{ fontSize: 13, fontWeight: '700', color }}>{value > 0 ? (suffix === '$' ? fmt(value) : value) : 0}{suffix}</Text>
      </View>
      <View style={{ height: 8, borderRadius: 4, backgroundColor: '#e5e7eb' }}>
        <View style={{ height: 8, borderRadius: 4, backgroundColor: color, width: `${Math.round(pct * 100)}%` }} />
      </View>
    </View>
  )
}

function KpiCard({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <View style={[s.kpiCard, { borderLeftColor: color }]}>
      <Text style={s.kpiLabel}>{label}</Text>
      <Text style={[s.kpiValue, { color }]}>{value}</Text>
    </View>
  )
}

// ── Main Component ─────────────────────────────────────────────────────────────

export default function StatistiquesScreen() {
  const { company } = useOwnerContext()
  const [stats, setStats]       = useState<StatsResult | null>(null)
  const [employes, setEmployes] = useState<EmpRow[]>([])
  const [loading, setLoading]   = useState(true)
  const [period, setPeriod]     = useState<Period>('mois')

  const today = new Intl.DateTimeFormat('en-CA', {
    timeZone: company?.timezone ?? 'America/Toronto',
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date())

  const twelveAgo = useMemo(() => {
    const d = new Date(); d.setMonth(d.getMonth() - 11)
    return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10)
  }, [])

  // Employes (liste bornee, independante de la periode) ──────────────────
  useEffect(() => {
    if (!company) return
    supabase.from('employes').select('id,nom,titre').eq('company_id', company.id).eq('actif', true)
      .then(({ data }) => setEmployes((data ?? []) as EmpRow[]))
  }, [company?.id])

  // Stats agregees cote serveur — meme RPC que le dashboard web, remplace
  // le fetch complet de `reservations` qui plafonnait a 1000 lignes ──────
  useEffect(() => {
    if (!company) return
    setLoading(true)
    const periodStart = getPeriodStart(period, company.timezone ?? 'America/Toronto')
    supabase.rpc('get_dashboard_statistiques', {
      p_company_id: company.id,
      p_period_start: periodStart,
      p_today: today,
      p_bucket_mode: getBucketMode(period),
      p_twelve_ago: twelveAgo,
    }).then(({ data, error }) => {
      if (error) {
        console.error('[statistiques] RPC get_dashboard_statistiques a échoué:', error.message)
        setStats(null)
      } else {
        setStats(data as StatsResult)
      }
      setLoading(false)
    })
  }, [company?.id, period, today])

  // ── Derived data (issue du JSON du RPC, plus de calcul cote client) ────

  const kpis          = stats?.kpis
  const loyalty       = stats?.loyalty
  const completedCount = kpis?.completed_count ?? 0
  const noshowCount    = kpis?.noshow_count ?? 0
  const filteredCount  = kpis?.filtered_count ?? 0
  const revenues       = kpis?.total_rev ?? 0
  const uniqueClients  = kpis?.unique_clients ?? 0
  const reguliers      = loyalty?.loyal_3plus ?? 0
  const inactifs       = loyalty?.inactive_60d ?? 0

  // Barres par employé
  const empStats = useMemo(() => (stats?.by_employee ?? [])
    .map(e => {
      const emp = employes.find(x => x.id === e.employee_id)
      return emp ? { nom: emp.nom, count: e.cnt, rev: e.rev } : null
    })
    .filter((e): e is { nom: string; count: number; rev: number } => !!e)
    .sort((a, b) => b.rev - a.rev), [stats, employes])

  // Heures
  const heureStats = useMemo(() => {
    const arr = Array.from({ length: 24 }, (_, i) => ({ label: `${i}h`, value: 0 }))
    for (const h of stats?.by_hour ?? []) {
      const i = parseInt(h.hour, 10)
      if (i >= 0 && i < 24) arr[i].value = h.cnt
    }
    return arr.filter(h => h.value > 0).sort((a, b) => b.value - a.value).slice(0, 8)
  }, [stats])

  // Jours de la semaine
  const jourStats = useMemo(() => {
    const arr = [0, 0, 0, 0, 0, 0, 0]
    for (const d of stats?.by_dow ?? []) arr[d.dow === 0 ? 6 : d.dow - 1] = d.cnt
    return DAY_LABELS.map((label, i) => ({ label, value: arr[i] }))
  }, [stats])

  // Services populaires
  const svcStats = useMemo(() =>
    (stats?.top_services ?? []).map(s => ({ nom: s.service, count: s.cnt })), [stats])

  // 12 derniers mois
  const months = useMemo(() => last12Months(), [])
  const monthData = useMemo(() => {
    const map: Record<string, { cnt: number; rev: number }> = {}
    for (const m of stats?.months12 ?? []) map[m.month] = { cnt: m.cnt, rev: m.rev }
    return months.map(m => ({ ...m, rdv: map[m.ym]?.cnt ?? 0, rev: map[m.ym]?.rev ?? 0 }))
  }, [stats, months])

  const maxRdv = Math.max(1, ...monthData.map(m => m.rdv))
  const maxRev = Math.max(1, ...monthData.map(m => m.rev))
  const maxEmpCount = Math.max(1, ...empStats.map(e => e.count))
  const maxEmpRev = Math.max(1, ...empStats.map(e => e.rev))
  const maxHeure = Math.max(1, ...heureStats.map(h => h.value))
  const maxJour = Math.max(1, ...jourStats.map(j => j.value))
  const maxSvc = Math.max(1, ...svcStats.map(s => s.count))

  // ── Render ────────────────────────────────────────────────────────────

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#f5f3ff' }} edges={['top']}>
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40, gap: 16 }}>
        {/* Header + période */}
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <View>
            <Text style={s.headerTitle}>Statistiques</Text>
          </View>
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
          {PERIOD_OPTIONS.map(p => (
            <TouchableOpacity key={p.id} onPress={() => setPeriod(p.id)} style={[s.chip, period === p.id && s.chipActive]}>
              <Text style={[s.chipText, period === p.id && s.chipTextActive]}>{p.label}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {loading ? <ActivityIndicator color="#7c3aed" /> : (
          <>
            {/* KPIs */}
            <View style={s.kpiGrid}>
              <KpiCard label="RDV confirmés" value={`${completedCount}`}   color="#7c3aed" />
              <KpiCard label="Revenus"       value={`${fmt(revenues)} $`}   color="#059669" />
              <KpiCard label="Clients"       value={`${uniqueClients}`}     color="#2563eb" />
              <KpiCard label="No-shows"      value={`${noshowCount}`}       color="#dc2626" />
              <KpiCard label="Réguliers 3+"  value={`${reguliers}`}         color="#d97706" />
              <KpiCard label="Inactifs 60j"  value={`${inactifs}`}          color="#6b7280" />
            </View>

            {/* Par employé */}
            {empStats.length > 0 && (
              <View style={s.section}>
                <Text style={s.sectionTitle}>RDV par employé</Text>
                {empStats.map(e => <HBar key={e.nom + '_c'} label={e.nom} value={e.count} max={maxEmpCount} color="#7c3aed" />)}
                <Text style={[s.sectionTitle, { marginTop: 12 }]}>Revenus par employé</Text>
                {empStats.map(e => <HBar key={e.nom + '_r'} label={e.nom} value={e.rev} max={maxEmpRev} color="#059669" suffix="$" />)}
              </View>
            )}

            {/* Heures occupées */}
            {heureStats.length > 0 && (
              <View style={s.section}>
                <Text style={s.sectionTitle}>Heures les plus occupées</Text>
                {heureStats.map(h => <HBar key={h.label} label={h.label} value={h.value} max={maxHeure} color="#db2777" />)}
              </View>
            )}

            {/* Jours de semaine */}
            <View style={s.section}>
              <Text style={s.sectionTitle}>Jours de la semaine</Text>
              <View style={{ flexDirection: 'row', alignItems: 'flex-end', height: 120, gap: 4 }}>
                {jourStats.map((j, i) => (
                  <View key={i} style={{ flex: 1, alignItems: 'center' }}>
                    <Text style={{ fontSize: 9, color: '#059669', marginBottom: 2, fontWeight: '700' }}>
                      {j.value > 0 ? j.value : ''}
                    </Text>
                    <View style={{ width: '80%', height: Math.max(4, (j.value / maxJour) * 90), backgroundColor: '#059669', borderRadius: 4 }} />
                    <Text style={{ fontSize: 10, color: '#6b7280', marginTop: 4 }}>{j.label}</Text>
                  </View>
                ))}
              </View>
            </View>

            {/* Services populaires */}
            {svcStats.length > 0 && (
              <View style={s.section}>
                <Text style={s.sectionTitle}>Services populaires</Text>
                {svcStats.map(s => <HBar key={s.nom} label={s.nom} value={s.count} max={maxSvc} color="#ec4899" />)}
              </View>
            )}

            {/* 12 derniers mois */}
            <View style={s.section}>
              <Text style={s.sectionTitle}>Évolution 12 mois</Text>
              <View style={{ flexDirection: 'row', gap: 12, marginBottom: 8 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                  <View style={{ width: 12, height: 12, borderRadius: 2, backgroundColor: '#f59e0b' }} />
                  <Text style={{ fontSize: 12, color: '#6b7280' }}>RDV</Text>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                  <View style={{ width: 12, height: 12, borderRadius: 2, backgroundColor: '#059669' }} />
                  <Text style={{ fontSize: 12, color: '#6b7280' }}>Revenus</Text>
                </View>
              </View>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <View style={{ flexDirection: 'row', alignItems: 'flex-end', height: 130, gap: 2 }}>
                  {monthData.map((m, i) => (
                    <View key={i} style={{ alignItems: 'center', width: 38 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 2, height: 100 }}>
                        <View style={{ width: 14, backgroundColor: '#f59e0b', borderRadius: 3, height: Math.max(2, (m.rdv / maxRdv) * 100) }} />
                        <View style={{ width: 14, backgroundColor: '#059669', borderRadius: 3, height: Math.max(2, (m.rev / maxRev) * 100) }} />
                      </View>
                      <Text style={{ fontSize: 9, color: '#6b7280', marginTop: 4 }} numberOfLines={1}>{m.label}</Text>
                    </View>
                  ))}
                </View>
              </ScrollView>
            </View>

            {/* Résumé période */}
            <View style={s.section}>
              <Text style={s.sectionTitle}>Résumé de la période</Text>
              {[
                ['RDV total',          `${filteredCount}`],
                ['RDV complétés',       `${completedCount}`],
                ['No-shows',            `${noshowCount}`],
                ['Revenus totaux',      `${fmt(revenues)} $`],
                ['Revenu moyen / RDV',  completedCount > 0 ? `${fmt(revenues / completedCount)} $` : '—'],
                ['Clients uniques',     `${uniqueClients}`],
              ].map(([label, value]) => (
                <View key={label} style={s.tableRow}>
                  <Text style={s.tdLabel}>{label}</Text>
                  <Text style={s.tdValue}>{value}</Text>
                </View>
              ))}
            </View>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  )
}

// ── Styles ─────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  headerTitle: { fontSize: 24, fontWeight: '800', color: '#111827' },
  chip: {
    paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20,
    backgroundColor: '#fff', borderWidth: 1, borderColor: '#e5e7eb',
  },
  chipActive: { backgroundColor: '#7c3aed', borderColor: '#7c3aed' },
  chipText: { fontSize: 13, color: '#6b7280', fontWeight: '500' },
  chipTextActive: { color: '#fff', fontWeight: '700' },
  kpiGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  kpiCard: {
    flex: 1, minWidth: '45%', backgroundColor: '#fff', borderRadius: 12,
    padding: 12, borderLeftWidth: 4,
    shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 6, elevation: 2,
  },
  kpiLabel: { fontSize: 11, color: '#6b7280', marginBottom: 4 },
  kpiValue: { fontSize: 18, fontWeight: '900' },
  section: {
    backgroundColor: '#fff', borderRadius: 16, padding: 16,
    shadowColor: '#7c3aed', shadowOpacity: 0.06, shadowRadius: 8, elevation: 2,
  },
  sectionTitle: { fontSize: 14, fontWeight: '800', color: '#374151', marginBottom: 12 },
  tableRow: {
    flexDirection: 'row', justifyContent: 'space-between',
    paddingVertical: 7, borderBottomWidth: 1, borderColor: '#f3f4f6',
  },
  tdLabel: { fontSize: 13, color: '#6b7280' },
  tdValue: { fontSize: 13, fontWeight: '700', color: '#111827' },
})
