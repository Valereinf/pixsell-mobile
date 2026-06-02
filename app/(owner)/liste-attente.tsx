import { useEffect, useState, useMemo } from 'react'
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  ActivityIndicator,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { supabase } from '../../lib/supabase'
import type { Company } from '../../lib/types'

const NETLIFY_URL = 'https://aesthetic-yeot-2d7094.netlify.app'

// ── Types ──────────────────────────────────────────────────────────────────────

type Statut = 'en_attente' | 'notifie' | 'contacte' | 'converti' | 'annule'

interface WaitlistRow {
  id: string; company_id: string
  client_prenom: string | null; client_nom: string | null
  client_email: string | null; client_telephone: string | null
  service_id: string | null; service_nom: string | null
  employee_id: string | null; employe_nom: string | null
  date_souhaitee: string | null; statut: Statut
  notifie_count: number; created_at: string
}

// ── Constants ──────────────────────────────────────────────────────────────────

const STATUT_META: Record<Statut, { label: string; bg: string; color: string }> = {
  en_attente: { label: 'En attente', bg: 'rgba(245,158,11,0.12)',  color: '#d97706' },
  notifie:    { label: 'Notifié',    bg: 'rgba(16,185,129,0.12)',  color: '#059669' },
  contacte:   { label: 'Contacté',   bg: 'rgba(124,58,237,0.12)', color: '#7c3aed' },
  converti:   { label: 'Réservé',    bg: 'rgba(16,185,129,0.12)',  color: '#059669' },
  annule:     { label: 'Expiré',     bg: 'rgba(107,114,128,0.12)', color: '#6b7280' },
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const h = Math.floor(diff / 3600000)
  if (h < 1) return 'il y a < 1h'
  if (h < 24) return `il y a ${h}h`
  const d = Math.floor(h / 24)
  if (d < 30) return `il y a ${d}j`
  return new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })
}

function clientName(r: Pick<WaitlistRow, 'client_prenom' | 'client_nom'>): string {
  return [r.client_prenom, r.client_nom].filter(Boolean).join(' ') || '—'
}

// ── Main Component ─────────────────────────────────────────────────────────────

export default function ListeAttenteScreen() {
  const [company, setCompany]     = useState<Company | null>(null)
  const [rows, setRows]           = useState<WaitlistRow[]>([])
  const [loading, setLoading]     = useState(true)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  const [notifying, setNotifying] = useState<string | null>(null)

  useEffect(() => {
    ;(async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return
      const { data } = await supabase.from('companies').select('*').eq('owner_id', session.user.id).single()
      if (data) setCompany(data)
    })()
  }, [])

  useEffect(() => { if (company) load() }, [company])

  async function load() {
    setLoading(true)
    const { data } = await supabase
      .from('v_liste_attente_dashboard')
      .select('*')
      .eq('company_id', company!.id)
      .order('created_at', { ascending: true })
    setRows((data ?? []) as WaitlistRow[])
    setLoading(false)
  }

  const enAttenteCount = useMemo(() => rows.filter(r => r.statut === 'en_attente').length, [rows])

  async function handleDelete(id: string) {
    await supabase.from('liste_attente').delete().eq('id', id)
    setRows(prev => prev.filter(r => r.id !== id))
    setConfirmDelete(null)
  }

  async function handleNotify(row: WaitlistRow) {
    if (!company) return
    setNotifying(row.id)
    try {
      const c = company as Company & { slug?: string; nom?: string; primary_color?: string }
      await fetch(`${NETLIFY_URL}/.netlify/functions/waitlist-notify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          company_id: company.id,
          service_id: row.service_id,
          employee_id: row.employee_id,
          cancelled_date: '', cancelled_heure: '',
          slug: c.slug ?? '', company_name: c.nom ?? '', primary_color: c.primary_color ?? '#7c3aed',
        }),
      })
      setRows(prev => prev.map(r => r.id === row.id ? { ...r, statut: 'notifie' as Statut, notifie_count: r.notifie_count + 1 } : r))
    } catch { /* ignore */ }
    setNotifying(null)
  }

  // ── Render card ──────────────────────────────────────────────────────

  function renderRow({ item, index }: { item: WaitlistRow; index: number }) {
    const meta = STATUT_META[item.statut]
    return (
      <View style={s.card}>
        <View style={{ flexDirection: 'row', gap: 12 }}>
          {/* FIFO position */}
          <View style={s.fifoBox}>
            <Text style={s.fifoText}>#{index + 1}</Text>
          </View>

          <View style={{ flex: 1, gap: 6 }}>
            {/* Client */}
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <View>
                <Text style={s.clientName}>{clientName(item)}</Text>
                {item.client_email ? <Text style={s.sub}>{item.client_email}</Text> : null}
                {item.client_telephone ? <Text style={s.sub}>{item.client_telephone}</Text> : null}
              </View>
              <View style={{ alignItems: 'flex-end', gap: 4 }}>
                <View style={[s.badge, { backgroundColor: meta.bg }]}>
                  <Text style={[s.badgeText, { color: meta.color }]}>{meta.label}</Text>
                </View>
                <Text style={s.relTime}>{relativeTime(item.created_at)}</Text>
              </View>
            </View>

            {/* Service / Employé / Date */}
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              <View style={s.infoChip}>
                <Ionicons name="cut-outline" size={12} color="#7c3aed" />
                <Text style={s.infoChipText}>{item.service_nom ?? 'Peu importe'}</Text>
              </View>
              <View style={s.infoChip}>
                <Ionicons name="person-outline" size={12} color="#7c3aed" />
                <Text style={s.infoChipText}>{item.employe_nom ?? 'Peu importe'}</Text>
              </View>
              {item.date_souhaitee ? (
                <View style={s.infoChip}>
                  <Ionicons name="calendar-outline" size={12} color="#7c3aed" />
                  <Text style={s.infoChipText}>{item.date_souhaitee}</Text>
                </View>
              ) : (
                <View style={s.infoChip}>
                  <Ionicons name="calendar-outline" size={12} color="#9ca3af" />
                  <Text style={[s.infoChipText, { color: '#9ca3af' }]}>Date flexible</Text>
                </View>
              )}
              {item.notifie_count > 0 && (
                <View style={[s.infoChip, { backgroundColor: '#d1fae5' }]}>
                  <Ionicons name="mail-outline" size={12} color="#059669" />
                  <Text style={[s.infoChipText, { color: '#059669' }]}>{item.notifie_count}× notifié</Text>
                </View>
              )}
            </View>

            {/* Actions */}
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 4 }}>
              {item.statut === 'en_attente' && (
                <TouchableOpacity
                  style={[s.actionBtn, { opacity: notifying === item.id ? 0.6 : 1 }]}
                  onPress={() => handleNotify(item)}
                  disabled={notifying === item.id}
                >
                  {notifying === item.id
                    ? <ActivityIndicator size="small" color="#fff" />
                    : <>
                        <Ionicons name="mail-outline" size={14} color="#fff" />
                        <Text style={{ color: '#fff', fontSize: 12, fontWeight: '700' }}>Notifier</Text>
                      </>
                  }
                </TouchableOpacity>
              )}

              {confirmDelete === item.id ? (
                <View style={{ flexDirection: 'row', gap: 6 }}>
                  <TouchableOpacity style={[s.iconBtn, { backgroundColor: 'rgba(239,68,68,0.1)' }]} onPress={() => handleDelete(item.id)}>
                    <Ionicons name="checkmark" size={16} color="#ef4444" />
                  </TouchableOpacity>
                  <TouchableOpacity style={s.iconBtn} onPress={() => setConfirmDelete(null)}>
                    <Ionicons name="close" size={16} color="#6b7280" />
                  </TouchableOpacity>
                </View>
              ) : (
                <TouchableOpacity style={[s.iconBtn, { backgroundColor: 'rgba(239,68,68,0.08)' }]} onPress={() => setConfirmDelete(item.id)}>
                  <Ionicons name="trash-outline" size={16} color="#ef4444" />
                </TouchableOpacity>
              )}
            </View>
          </View>
        </View>
      </View>
    )
  }

  // ── Render ────────────────────────────────────────────────────────────

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#f5f3ff' }} edges={['top']}>
      {/* Header */}
      <View style={s.header}>
        <View>
          <Text style={s.headerTitle}>Liste d'attente</Text>
          <Text style={s.headerSub}>{enAttenteCount} client{enAttenteCount !== 1 ? 's' : ''} en attente</Text>
        </View>
        <TouchableOpacity style={s.refreshBtn} onPress={load}>
          <Ionicons name="refresh-outline" size={20} color="#7c3aed" />
        </TouchableOpacity>
      </View>

      {loading ? (
        <ActivityIndicator style={{ marginTop: 40 }} size="large" color="#7c3aed" />
      ) : (
        <FlatList
          data={rows}
          keyExtractor={r => r.id}
          renderItem={renderRow}
          contentContainerStyle={{ padding: 16, paddingBottom: 40, gap: 12 }}
          ListEmptyComponent={
            <View style={{ alignItems: 'center', paddingTop: 60, gap: 12 }}>
              <Ionicons name="time-outline" size={56} color="#c4b5fd" />
              <Text style={{ color: '#6b7280', fontSize: 16, fontWeight: '600' }}>Aucun client en attente</Text>
              <Text style={{ color: '#9ca3af', fontSize: 14, textAlign: 'center' }}>
                Les clients qui rejoignent votre liste d'attente apparaîtront ici.
              </Text>
            </View>
          }
        />
      )}
    </SafeAreaView>
  )
}

// ── Styles ─────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 20, paddingTop: 8, paddingBottom: 12,
  },
  headerTitle: { fontSize: 24, fontWeight: '800', color: '#111827' },
  headerSub: { fontSize: 13, color: '#7c3aed', fontWeight: '600', marginTop: 2 },
  refreshBtn: {
    width: 40, height: 40, borderRadius: 20, backgroundColor: '#ede9fe',
    alignItems: 'center', justifyContent: 'center',
  },
  card: {
    backgroundColor: 'rgba(255,255,255,0.92)', borderRadius: 16, padding: 14,
    shadowColor: '#7c3aed', shadowOpacity: 0.08, shadowRadius: 8, elevation: 3,
  },
  fifoBox: {
    width: 36, height: 36, borderRadius: 10, backgroundColor: '#ede9fe',
    alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 2,
  },
  fifoText: { fontSize: 13, fontWeight: '800', color: '#7c3aed' },
  clientName: { fontSize: 15, fontWeight: '800', color: '#111827' },
  sub: { fontSize: 12, color: '#6b7280', marginTop: 1 },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
  badgeText: { fontSize: 11, fontWeight: '700' },
  relTime: { fontSize: 11, color: '#9ca3af' },
  infoChip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: '#f3f4f6', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8,
  },
  infoChipText: { fontSize: 12, color: '#374151', fontWeight: '500' },
  actionBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: '#7c3aed', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8,
  },
  iconBtn: {
    width: 32, height: 32, borderRadius: 8, backgroundColor: '#f3f4f6',
    alignItems: 'center', justifyContent: 'center',
  },
})
