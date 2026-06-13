import { useEffect, useState } from 'react'
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, ActivityIndicator,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { supabase } from '../../../lib/supabase'

// ── Types ─────────────────────────────────────────────────────────
interface ResaDetail {
  id: string
  company_id: string
  date_rdv: string
  heure_rdv: string
  service: string | null
  employee_id: string | null
  duree_rdv: number | null
  prix: number | null
  statut: string
  client_prenom: string | null
  client_nom: string | null
  client_email: string | null
  choix_direct?: boolean | null
  created_at?: string | null
}

interface HistoResa {
  id: string
  service: string | null
  date_rdv: string
  statut: string
}

// ── Constants ─────────────────────────────────────────────────────
const STATUS_COLOR: Record<string, { bg: string; color: string; label: string }> = {
  pending:   { bg: 'rgba(16,185,129,0.15)',  color: '#059669', label: 'Confirmé'   },
  confirmed: { bg: 'rgba(16,185,129,0.15)',  color: '#059669', label: 'Confirmé'   },
  completed: { bg: 'rgba(107,114,128,0.15)', color: '#6b7280', label: 'Passé'      },
  cancelled: { bg: 'rgba(239,68,68,0.15)',   color: '#dc2626', label: 'Annulé'     },
  no_show:   { bg: 'rgba(249,115,22,0.15)',  color: '#ea580c', label: 'Absent'     },
}

// ── Helpers ───────────────────────────────────────────────────────
function fmtDate(iso: string, heure: string) {
  const d = new Date(iso + 'T12:00:00')
  const dateLong = d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
  return `${dateLong} à ${heure?.slice(0, 5)}`
}
function fmtDateShort(iso: string) {
  return new Date(iso + 'T12:00:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })
}

// ── Main Component ────────────────────────────────────────────────
export default function ReservationDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const router = useRouter()

  const [resa, setResa] = useState<ResaDetail | null>(null)
  const [empName, setEmpName] = useState<string | null>(null)
  const [totalVisites, setTotalVisites] = useState(0)
  const [pointsFidelite, setPointsFidelite] = useState<number | null>(null)
  const [historiqueResas, setHistoriqueResas] = useState<HistoResa[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!id) return
    const load = async () => {
      // 1. Fetch réservation
      const { data: resaData } = await supabase
        .from('reservations')
        .select('id, company_id, date_rdv, heure_rdv, service, employee_id, duree_rdv, prix, statut, client_prenom, client_nom, client_email, choix_direct, created_at')
        .eq('id', id)
        .single()

      if (!resaData) { setLoading(false); return }
      setResa(resaData as ResaDetail)

      // 2. Fetch employé si present
      if (resaData.employee_id) {
        const { data: emp } = await supabase
          .from('employes')
          .select('prenom, nom')
          .eq('id', resaData.employee_id)
          .single()
        if (emp) setEmpName([emp.prenom, emp.nom].filter(Boolean).join(' '))
      }

      // 3. Historique client (par email + company_id)
      if (resaData.client_email && resaData.company_id) {
        const { data: histo, count } = await supabase
          .from('reservations')
          .select('id, service, date_rdv, statut', { count: 'exact' })
          .eq('company_id', resaData.company_id)
          .eq('client_email', resaData.client_email)
          .order('date_rdv', { ascending: false })
          .limit(3)

        setTotalVisites(count ?? 0)
        setHistoriqueResas((histo ?? []) as HistoResa[])

        // Points fidélité depuis la table clients
        const { data: client } = await supabase
          .from('clients')
          .select('points_fidelite')
          .eq('company_id', resaData.company_id)
          .eq('email', resaData.client_email)
          .single()
        if (client) setPointsFidelite(client.points_fidelite ?? 0)
      }

      setLoading(false)
    }
    load()
  }, [id])

  if (loading) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: '#f5f3ff' }} edges={['top']}>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator size="large" color="#7c3aed" />
        </View>
      </SafeAreaView>
    )
  }

  if (!resa) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: '#f5f3ff' }} edges={['top']}>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 }}>
          <Text style={{ color: '#6b7280', fontSize: 16 }}>Réservation introuvable</Text>
          <TouchableOpacity onPress={() => router.replace('/(owner)/(tabs)/dashboard')} style={s.backBtn}>
            <Text style={{ color: '#7c3aed', fontWeight: '600' }}>Retour</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    )
  }

  const sc = STATUS_COLOR[resa.statut] ?? STATUS_COLOR.pending
  const clientFullName = [resa.client_prenom, resa.client_nom].filter(Boolean).join(' ') || '—'
  const derniereVisite = historiqueResas.find(h => h.id !== id)?.date_rdv

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#f5f3ff' }} edges={['top']}>
      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.replace('/(owner)/(tabs)/dashboard')} style={s.backBtn}>
          <Ionicons name="chevron-back" size={22} color="#7c3aed" />
        </TouchableOpacity>
        <Text style={s.headerTitle}>Réservation</Text>
        <View style={{ width: 38 }} />
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 80 }}>

        {/* ── Section RÉSERVATION ── */}
        <View style={s.card}>
          <Text style={s.sectionLabel}>RÉSERVATION</Text>

          <Row icon="calendar-outline" label="Date">
            <Text style={s.rowValue}>{fmtDate(resa.date_rdv, resa.heure_rdv)}</Text>
          </Row>
          <Row icon="cut-outline" label="Service">
            <Text style={s.rowValue}>{resa.service || '—'}</Text>
          </Row>
          <Row icon="person-outline" label="Employé">
            <Text style={s.rowValue}>{empName || '—'}</Text>
          </Row>
          <Row icon="time-outline" label="Durée">
            <Text style={s.rowValue}>{resa.duree_rdv ? `${resa.duree_rdv} min` : '—'}</Text>
          </Row>
          <Row icon="cash-outline" label="Prix">
            <Text style={s.rowValue}>{resa.prix != null ? `${Number(resa.prix).toFixed(2)} $` : '—'}</Text>
          </Row>
          <Row icon="flag-outline" label="Statut">
            <View style={{ backgroundColor: sc.bg, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3 }}>
              <Text style={{ fontSize: 12, fontWeight: '700', color: sc.color }}>{sc.label}</Text>
            </View>
          </Row>
          {resa.created_at && <Row icon="calendar-outline" label="Réservé le" last>
            <Text style={s.rowValue}>{new Date(resa.created_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })} à {new Date(resa.created_at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</Text>
          </Row>}
        </View>

        {/* ── Section CLIENT ── */}
        <View style={s.card}>
          <Text style={s.sectionLabel}>CLIENT</Text>
          <Row icon="person-circle-outline" label="Nom">
            <Text style={s.rowValue}>{clientFullName}{resa.choix_direct ? ' ❤️' : ''}</Text>
          </Row>
          <Row icon="mail-outline" label="Email" last>
            <Text style={[s.rowValue, { color: '#7c3aed' }]} numberOfLines={1}>
              {resa.client_email || '—'}
            </Text>
          </Row>
        </View>

        {/* ── Section HISTORIQUE CLIENT ── */}
        {resa.client_email && (
          <View style={s.card}>
            <Text style={s.sectionLabel}>HISTORIQUE CLIENT</Text>

            {/* Badges stats */}
            <View style={{ flexDirection: 'row', gap: 8, marginBottom: 14 }}>
              <StatBadge label="Visites" value={String(totalVisites)} />
              {pointsFidelite != null && (
                <StatBadge label="Points" value={String(pointsFidelite)} color="#059669" />
              )}
              {derniereVisite && (
                <StatBadge label="Dernière visite" value={fmtDateShort(derniereVisite)} color="#d97706" />
              )}
            </View>

            {/* 3 dernières réservations */}
            {historiqueResas.length > 0 ? (
              historiqueResas.map((h, i) => {
                const hsc = STATUS_COLOR[h.statut] ?? STATUS_COLOR.pending
                return (
                  <View
                    key={h.id}
                    style={{
                      flexDirection: 'row', alignItems: 'center', gap: 10,
                      paddingVertical: 8,
                      borderBottomWidth: i < historiqueResas.length - 1 ? 1 : 0,
                      borderBottomColor: 'rgba(0,0,0,0.05)',
                    }}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 13, fontWeight: '600', color: '#111827' }} numberOfLines={1}>
                        {h.service || '—'}
                      </Text>
                      <Text style={{ fontSize: 11, color: '#9ca3af' }}>{fmtDateShort(h.date_rdv)}</Text>
                    </View>
                    <View style={{ backgroundColor: hsc.bg, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 }}>
                      <Text style={{ fontSize: 10, fontWeight: '600', color: hsc.color }}>{hsc.label}</Text>
                    </View>
                  </View>
                )
              })
            ) : (
              <Text style={{ fontSize: 13, color: '#9ca3af', textAlign: 'center', paddingVertical: 8 }}>
                Aucun historique
              </Text>
            )}
          </View>
        )}

      </ScrollView>
    </SafeAreaView>
  )
}

// ── Sub-components ─────────────────────────────────────────────────
function Row({
  icon, label, last = false, children,
}: {
  icon: React.ComponentProps<typeof Ionicons>['name']
  label: string
  last?: boolean
  children: React.ReactNode
}) {
  return (
    <View style={{
      flexDirection: 'row', alignItems: 'center', gap: 10,
      paddingVertical: 10,
      borderBottomWidth: last ? 0 : 1,
      borderBottomColor: 'rgba(0,0,0,0.05)',
    }}>
      <Ionicons name={icon} size={16} color="#7c3aed" />
      <Text style={{ width: 70, fontSize: 13, color: '#6b7280', fontWeight: '500' }}>{label}</Text>
      <View style={{ flex: 1, alignItems: 'flex-end' }}>{children}</View>
    </View>
  )
}

function StatBadge({ label, value, color = '#7c3aed' }: { label: string; value: string; color?: string }) {
  return (
    <View style={{ flex: 1, backgroundColor: `${color}12`, borderRadius: 12, padding: 10, alignItems: 'center', gap: 2 }}>
      <Text style={{ fontSize: 16, fontWeight: '800', color }}>{value}</Text>
      <Text style={{ fontSize: 10, color: '#9ca3af', textAlign: 'center' }}>{label}</Text>
    </View>
  )
}

// ── Styles ─────────────────────────────────────────────────────────
const s = StyleSheet.create({
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 10,
    backgroundColor: 'rgba(255,255,255,0.9)',
    borderBottomWidth: 1, borderBottomColor: 'rgba(124,58,237,0.08)',
  },
  headerTitle: { fontSize: 17, fontWeight: '700', color: '#111827' },
  backBtn: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: 'rgba(124,58,237,0.08)',
    alignItems: 'center', justifyContent: 'center',
  },
  card: {
    backgroundColor: 'rgba(255,255,255,0.9)',
    borderRadius: 20, padding: 16,
    shadowColor: '#7c3aed', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08, shadowRadius: 12, elevation: 3,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.8)',
  },
  sectionLabel: {
    fontSize: 11, fontWeight: '700', color: '#9ca3af',
    textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 4,
  },
  rowValue: { fontSize: 13, fontWeight: '600', color: '#111827', textAlign: 'right', flex: 1 },
})
