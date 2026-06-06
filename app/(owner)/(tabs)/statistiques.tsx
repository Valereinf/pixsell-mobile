import { useEffect, useState, useMemo } from 'react'
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { supabase } from '../../../lib/supabase'
import type { Company } from '../../../lib/types'
import { useOwnerContext } from '../../../lib/ownerContext'

// ── Types ──────────────────────────────────────────────────────────────────────

type Period = 'mois' | '3mois' | 'annee' | 'tout'

interface Rdv {
  id: string; date_rdv: string; heure_rdv: string | null
  service: string | null; prix: number | null; statut: string
  employee_id: string | null; client_email: string | null
}

interface EmpRow { id: string; nom: string; titre: string | null }

// ── Constants ──────────────────────────────────────────────────────────────────

const PERIOD_OPTIONS: { id: Period; label: string }[] = [
  { id: 'mois',   label: 'Ce mois' },
  { id: '3mois',  label: '3 mois' },
  { id: 'annee',  label: 'Cette année' },
  { id: 'tout',   label: 'Tout' },
]

const CANCELLED = ['cancelled', 'annule', 'annulee']
const COMPLETED  = ['completed', 'confirme', 'confirmee', 'terminee']
const NOSHOWS    = ['absent', 'no_show']
const DAY_LABELS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim']

// ── Helpers ────────────────────────────────────────────────────────────────────

function getPeriodStart(p: Period): string | null {
  const now = new Date()
  if (p === 'mois')  return new Date(now.getFullYear(), now.getMonth(), 1).toLocaleDateString('en-CA')
  if (p === '3mois') { const d = new Date(now); d.setMonth(d.getMonth() - 3); return d.toLocaleDateString('en-CA') }
  if (p === 'annee') return new Date(now.getFullYear(), 0, 1).toLocaleDateString('en-CA')
  return null
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
  const [rdvs, setRdvs]         = useState<Rdv[]>([])
  const [employes, setEmployes] = useState<EmpRow[]>([])
  const [loading, setLoading]   = useState(true)
  const [period, setPeriod]     = useState<Period>('mois')

  useEffect(() => { if (company) load() }, [company?.id])

  async function load() {
    setLoading(true)
    const [rdvRes, empRes] = await Promise.all([
      supabase.from('reservations')
        .select('id,date_rdv,heure_rdv,service,prix,statut,employee_id,client_email')
        .eq('company_id', company!.id),
      supabase.from('employes').select('id,nom,titre').eq('company_id', company!.id).eq('actif', true),
    ])
    setRdvs((rdvRes.data ?? []) as Rdv[])
    setEmployes((empRes.data ?? []) as EmpRow[])
    setLoading(false)
  }

  // ── Filtered data ──────────────────────────────────────────────────────

  const filtered = useMemo(() => {
    const start = getPeriodStart(period)
    if (!start) return rdvs
    return rdvs.filter(r => r.date_rdv >= start)
  }, [rdvs, period])

  const completed  = useMemo(() => filtered.filter(r => COMPLETED.includes(r.statut)), [filtered])
  const cancelled  = useMemo(() => filtered.filter(r => CANCELLED.includes(r.statut)), [filtered])
  const noshows    = useMemo(() => filtered.filter(r => NOSHOWS.includes(r.statut)), [filtered])
  const revenues   = useMemo(() => completed.reduce((s, r) => s + Number(r.prix ?? 0), 0), [completed])

  const uniqueClients = useMemo(() => new Set(completed.map(r => r.client_email).filter(Boolean)).size, [completed])
  const clientVisits  = useMemo(() => {
    const map: Record<string, number> = {}
    completed.forEach(r => { if (r.client_email) map[r.client_email] = (map[r.client_email] ?? 0) + 1 })
    return map
  }, [completed])
  const reguliers = useMemo(() => Object.values(clientVisits).filter(v => v >= 3).length, [clientVisits])
  const inactifs  = useMemo(() => {
    const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - 60)
    const cutoffStr = cutoff.toLocaleDateString('en-CA')
    const lastVisit: Record<string, string> = {}
    completed.forEach(r => { if (r.client_email && r.date_rdv > (lastVisit[r.client_email] ?? '')) lastVisit[r.client_email] = r.date_rdv })
    return Object.values(lastVisit).filter(d => d < cutoffStr).length
  }, [completed])

  // Barres par employé
  const empStats = useMemo(() => {
    const map: Record<string, { nom: string; count: number; rev: number }> = {}
    completed.forEach(r => {
      if (!r.employee_id) return
      const emp = employes.find(e => e.id === r.employee_id)
      if (!emp) return
      if (!map[r.employee_id]) map[r.employee_id] = { nom: emp.nom, count: 0, rev: 0 }
      map[r.employee_id].count++
      map[r.employee_id].rev += Number(r.prix ?? 0)
    })
    return Object.values(map).sort((a, b) => b.rev - a.rev)
  }, [completed, employes])

  // Heures
  const heureStats = useMemo(() => {
    const arr = Array.from({ length: 24 }, (_, i) => ({ label: `${i}h`, value: 0 }))
    completed.forEach(r => { if (r.heure_rdv) arr[parseInt(r.heure_rdv.slice(0, 2))].value++ })
    return arr.filter(h => h.value > 0).sort((a, b) => b.value - a.value).slice(0, 8)
  }, [completed])

  // Jours de la semaine
  const jourStats = useMemo(() => {
    const arr = [0, 0, 0, 0, 0, 0, 0]
    completed.forEach(r => { const d = new Date(r.date_rdv + 'T12:00:00'); const dow = d.getDay(); arr[dow === 0 ? 6 : dow - 1]++ })
    return DAY_LABELS.map((label, i) => ({ label, value: arr[i] }))
  }, [completed])

  // Services populaires
  const svcStats = useMemo(() => {
    const map: Record<string, number> = {}
    completed.forEach(r => { if (r.service) map[r.service] = (map[r.service] ?? 0) + 1 })
    return Object.entries(map).map(([nom, count]) => ({ nom, count })).sort((a, b) => b.count - a.count).slice(0, 8)
  }, [completed])

  // 12 derniers mois
  const months = useMemo(() => last12Months(), [])
  const monthData = useMemo(() => {
    const rdvByM: Record<string, number> = {}
    const revByM: Record<string, number> = {}
    completed.forEach(r => {
      const ym = r.date_rdv.slice(0, 7)
      rdvByM[ym] = (rdvByM[ym] ?? 0) + 1
      revByM[ym] = (revByM[ym] ?? 0) + Number(r.prix ?? 0)
    })
    return months.map(m => ({ ...m, rdv: rdvByM[m.ym] ?? 0, rev: revByM[m.ym] ?? 0 }))
  }, [completed, months])

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
              <KpiCard label="RDV confirmés" value={`${completed.length}`}  color="#7c3aed" />
              <KpiCard label="Revenus"       value={`${fmt(revenues)} $`}   color="#059669" />
              <KpiCard label="Clients"       value={`${uniqueClients}`}     color="#2563eb" />
              <KpiCard label="No-shows"      value={`${noshows.length}`}    color="#dc2626" />
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
                ['RDV total',          `${filtered.length}`],
                ['RDV complétés',       `${completed.length}`],
                ['RDV annulés',         `${cancelled.length}`],
                ['No-shows',            `${noshows.length}`],
                ['Taux annulation',     filtered.length > 0 ? `${((cancelled.length / filtered.length) * 100).toFixed(1)} %` : '—'],
                ['Revenus totaux',      `${fmt(revenues)} $`],
                ['Revenu moyen / RDV',  completed.length > 0 ? `${fmt(revenues / completed.length)} $` : '—'],
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
