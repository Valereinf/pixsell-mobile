import { useEffect, useState, useMemo } from 'react'
import {
  View, Text, FlatList, TouchableOpacity, TextInput, StyleSheet,
  ActivityIndicator, ScrollView,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { supabase } from '../../lib/supabase'
import type { Company } from '../../lib/types'
import { useOwnerContext } from '../../lib/ownerContext'

// ── Types ──────────────────────────────────────────────────────────────────────

type Statut = 'visible' | 'masque' | 'signale'

interface AvisRow {
  id: string; company_id: string; reservation_id: string | null
  employee_id: string | null; client_prenom: string | null; client_nom: string | null
  client_email: string | null; note: number; commentaire: string | null
  statut: Statut; reponse_admin: string | null; reponse_at: string | null; created_at: string
}

interface EmpRow { id: string; nom: string }

// ── Constants ──────────────────────────────────────────────────────────────────

const STATUT_META: Record<Statut, { label: string; bg: string; color: string }> = {
  visible: { label: 'Visible', bg: 'rgba(16,185,129,0.12)',  color: '#059669' },
  masque:  { label: 'Masqué',  bg: 'rgba(107,114,128,0.12)', color: '#6b7280' },
  signale: { label: 'Signalé', bg: 'rgba(239,68,68,0.12)',   color: '#dc2626' },
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function clientName(a: Pick<AvisRow, 'client_prenom' | 'client_nom' | 'client_email'>): string {
  return [a.client_prenom, a.client_nom].filter(Boolean).join(' ') || a.client_email || 'Anonyme'
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })
}

function Stars({ note, size = 14 }: { note: number; size?: number }) {
  return (
    <View style={{ flexDirection: 'row', gap: 1 }}>
      {[1, 2, 3, 4, 5].map(i => (
        <Ionicons key={i} name={i <= note ? 'star' : 'star-outline'} size={size} color={i <= note ? '#f59e0b' : '#d1d5db'} />
      ))}
    </View>
  )
}

// ── Main Component ─────────────────────────────────────────────────────────────

export default function AvisScreen() {
  const { company } = useOwnerContext()
  const [avis, setAvis]         = useState<AvisRow[]>([])
  const [employes, setEmployes] = useState<EmpRow[]>([])
  const [loading, setLoading]   = useState(true)
  const [saving, setSaving]     = useState<string | null>(null)

  // Filters
  const [filterNote, setFilterNote]     = useState<number | null>(null)
  const [filterEmp, setFilterEmp]       = useState('')
  const [filterStatut, setFilterStatut] = useState<Statut | ''>('')

  // Inline reply state per avis
  const [replyOpen, setReplyOpen]   = useState<Record<string, boolean>>({})
  const [replyText, setReplyText]   = useState<Record<string, string>>({})
  const [confirmDel, setConfirmDel] = useState<string | null>(null)

  useEffect(() => { if (company) load() }, [company?.id])

  async function load() {
    setLoading(true)
    const cid = company!.id
    const [avisRes, empRes] = await Promise.all([
      supabase.from('avis_clients').select('*').eq('company_id', cid).order('created_at', { ascending: false }),
      supabase.from('employes').select('id,nom').eq('company_id', cid),
    ])
    const rows = (avisRes.data ?? []) as AvisRow[]
    setAvis(rows)
    setEmployes((empRes.data ?? []) as EmpRow[])
    // Init reply state
    const rt: Record<string, string> = {}
    rows.forEach(a => { rt[a.id] = a.reponse_admin ?? '' })
    setReplyText(rt)
    setLoading(false)
  }

  // ── Actions ──────────────────────────────────────────────────────────

  async function toggleStatut(a: AvisRow) {
    const next: Statut = a.statut === 'visible' ? 'masque' : 'visible'
    setSaving(a.id)
    await supabase.from('avis_clients').update({ statut: next }).eq('id', a.id)
    setAvis(prev => prev.map(r => r.id === a.id ? { ...r, statut: next } : r))
    setSaving(null)
  }

  async function handleSignaler(a: AvisRow) {
    setSaving(a.id)
    await supabase.from('avis_clients').update({ statut: 'signale' as Statut }).eq('id', a.id)
    setAvis(prev => prev.map(r => r.id === a.id ? { ...r, statut: 'signale' as Statut } : r))
    setSaving(null)
  }

  async function handleDelete(id: string) {
    await supabase.from('avis_clients').delete().eq('id', id)
    setAvis(prev => prev.filter(a => a.id !== id))
    setConfirmDel(null)
  }

  async function handleReply(a: AvisRow) {
    const text = replyText[a.id] ?? ''
    if (!text.trim()) return
    setSaving(a.id)
    await supabase.from('avis_clients').update({ reponse_admin: text, reponse_at: new Date().toISOString() }).eq('id', a.id)
    setAvis(prev => prev.map(r => r.id === a.id ? { ...r, reponse_admin: text, reponse_at: new Date().toISOString() } : r))
    setReplyOpen(prev => ({ ...prev, [a.id]: false }))
    setSaving(null)
  }

  // ── Computed ─────────────────────────────────────────────────────────

  const visibles = useMemo(() => avis.filter(a => a.statut === 'visible'), [avis])
  const moyGlobal = useMemo(() => {
    if (visibles.length === 0) return 0
    return visibles.reduce((s, a) => s + a.note, 0) / visibles.length
  }, [visibles])
  const cinqEtoiles = useMemo(() => avis.filter(a => a.note === 5).length, [avis])
  const negatifs = useMemo(() => avis.filter(a => a.note <= 2).length, [avis])

  const noteDist = useMemo(() => {
    const counts = [0, 0, 0, 0, 0]
    avis.forEach(a => { if (a.note >= 1 && a.note <= 5) counts[a.note - 1]++ })
    return counts.reverse()
  }, [avis])

  const byEmp = useMemo(() => {
    const map: Record<string, { nom: string; total: number; count: number }> = {}
    avis.forEach(a => {
      if (!a.employee_id) return
      const emp = employes.find(e => e.id === a.employee_id)
      if (!emp) return
      if (!map[a.employee_id]) map[a.employee_id] = { nom: emp.nom, total: 0, count: 0 }
      map[a.employee_id].total += a.note
      map[a.employee_id].count++
    })
    return Object.values(map).map(e => ({ ...e, avg: e.total / e.count })).sort((a, b) => b.avg - a.avg)
  }, [avis, employes])

  const filtered = useMemo(() => avis.filter(a => {
    if (filterNote !== null && a.note !== filterNote) return false
    if (filterEmp && a.employee_id !== filterEmp) return false
    if (filterStatut && a.statut !== filterStatut) return false
    return true
  }), [avis, filterNote, filterEmp, filterStatut])

  const maxDist = Math.max(1, ...noteDist)

  // ── Render avis card ──────────────────────────────────────────────────

  function renderAvis({ item: a }: { item: AvisRow }) {
    const meta = STATUT_META[a.statut]
    const emp = employes.find(e => e.id === a.employee_id)
    const isReplyOpen = replyOpen[a.id] ?? false
    return (
      <View style={s.card}>
        {/* Header */}
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
          <View style={{ flex: 1 }}>
            <Text style={s.clientName}>{clientName(a)}</Text>
            <Text style={s.sub}>{formatDate(a.created_at)}{emp ? ` · ${emp.nom}` : ''}</Text>
          </View>
          <View style={{ alignItems: 'flex-end', gap: 4 }}>
            <Stars note={a.note} />
            <View style={[s.badge, { backgroundColor: meta.bg }]}>
              <Text style={[s.badgeText, { color: meta.color }]}>{meta.label}</Text>
            </View>
          </View>
        </View>

        {/* Commentaire */}
        {a.commentaire ? (
          <Text style={s.commentaire}>« {a.commentaire} »</Text>
        ) : null}

        {/* Réponse existante */}
        {a.reponse_admin ? (
          <View style={s.reponseBox}>
            <Text style={{ fontSize: 11, color: '#7c3aed', fontWeight: '700', marginBottom: 4 }}>
              Votre réponse · {a.reponse_at ? formatDate(a.reponse_at) : ''}
            </Text>
            <Text style={{ fontSize: 13, color: '#374151' }}>{a.reponse_admin}</Text>
          </View>
        ) : null}

        {/* Zone réponse inline */}
        {isReplyOpen && (
          <View style={{ marginTop: 8 }}>
            <TextInput
              style={[s.input, { height: 72, textAlignVertical: 'top' }]}
              multiline
              placeholder="Votre réponse publique..."
              value={replyText[a.id] ?? ''}
              onChangeText={v => setReplyText(prev => ({ ...prev, [a.id]: v }))}
            />
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <TouchableOpacity style={[s.smallBtn, { flex: 1, backgroundColor: '#f3f4f6' }]} onPress={() => setReplyOpen(prev => ({ ...prev, [a.id]: false }))}>
                <Text style={{ color: '#374151', fontWeight: '600', fontSize: 13 }}>Annuler</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[s.smallBtn, { flex: 1, backgroundColor: '#7c3aed' }]} onPress={() => handleReply(a)} disabled={saving === a.id}>
                {saving === a.id ? <ActivityIndicator color="#fff" size="small" /> : <Text style={{ color: '#fff', fontWeight: '700', fontSize: 13 }}>Publier</Text>}
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Actions */}
        <View style={s.actionsRow}>
          <TouchableOpacity style={s.actionChip} onPress={() => toggleStatut(a)} disabled={saving === a.id}>
            <Ionicons name={a.statut === 'visible' ? 'eye-off-outline' : 'eye-outline'} size={14} color="#7c3aed" />
            <Text style={s.actionChipText}>{a.statut === 'visible' ? 'Masquer' : 'Afficher'}</Text>
          </TouchableOpacity>

          <TouchableOpacity style={s.actionChip} onPress={() => setReplyOpen(prev => ({ ...prev, [a.id]: !isReplyOpen }))}>
            <Ionicons name="chatbubble-outline" size={14} color="#7c3aed" />
            <Text style={s.actionChipText}>{a.reponse_admin ? 'Modifier' : 'Répondre'}</Text>
          </TouchableOpacity>

          {a.statut !== 'signale' && (
            <TouchableOpacity style={[s.actionChip, { borderColor: '#f59e0b' }]} onPress={() => handleSignaler(a)}>
              <Ionicons name="flag-outline" size={14} color="#d97706" />
              <Text style={[s.actionChipText, { color: '#d97706' }]}>Signaler</Text>
            </TouchableOpacity>
          )}

          {confirmDel === a.id ? (
            <View style={{ flexDirection: 'row', gap: 4 }}>
              <TouchableOpacity style={[s.iconBtn, { backgroundColor: 'rgba(239,68,68,0.1)' }]} onPress={() => handleDelete(a.id)}>
                <Ionicons name="checkmark" size={14} color="#dc2626" />
              </TouchableOpacity>
              <TouchableOpacity style={s.iconBtn} onPress={() => setConfirmDel(null)}>
                <Ionicons name="close" size={14} color="#6b7280" />
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity style={[s.iconBtn, { backgroundColor: 'rgba(239,68,68,0.08)' }]} onPress={() => setConfirmDel(a.id)}>
              <Ionicons name="trash-outline" size={14} color="#ef4444" />
            </TouchableOpacity>
          )}
        </View>
      </View>
    )
  }

  // ── Render ────────────────────────────────────────────────────────────

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#f5f3ff' }} edges={['top']}>
      <FlatList
        data={filtered}
        keyExtractor={a => a.id}
        renderItem={renderAvis}
        contentContainerStyle={{ padding: 16, paddingBottom: 40, gap: 12 }}
        ListHeaderComponent={
          <View style={{ gap: 12, marginBottom: 4 }}>
            {/* Header */}
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <View>
                <Text style={s.headerTitle}>Avis clients</Text>
                <Text style={s.headerSub}>{visibles.length} avis visible{visibles.length !== 1 ? 's' : ''}</Text>
              </View>
            </View>

            {/* KPI cards */}
            {loading ? <ActivityIndicator color="#7c3aed" /> : (
              <>
                <View style={s.kpiGrid}>
                  <View style={s.kpiCard}>
                    <Text style={s.kpiLabel}>Total avis</Text>
                    <Text style={[s.kpiValue, { color: '#7c3aed' }]}>{avis.length}</Text>
                  </View>
                  <View style={s.kpiCard}>
                    <Text style={s.kpiLabel}>Note moy.</Text>
                    <Text style={[s.kpiValue, { color: '#f59e0b' }]}>{moyGlobal.toFixed(1)} ★</Text>
                  </View>
                  <View style={s.kpiCard}>
                    <Text style={s.kpiLabel}>5 étoiles</Text>
                    <Text style={[s.kpiValue, { color: '#059669' }]}>{cinqEtoiles}</Text>
                  </View>
                  <View style={s.kpiCard}>
                    <Text style={s.kpiLabel}>Négatifs</Text>
                    <Text style={[s.kpiValue, { color: '#dc2626' }]}>{negatifs}</Text>
                  </View>
                </View>

                {/* Stats row */}
                <View style={[s.card, { flexDirection: 'row', gap: 12 }]}>
                  {/* Note globale */}
                  <View style={{ flex: 1, alignItems: 'center' }}>
                    <Text style={{ fontSize: 36, fontWeight: '900', color: '#f59e0b' }}>{moyGlobal.toFixed(1)}</Text>
                    <Stars note={Math.round(moyGlobal)} size={16} />
                    <Text style={{ fontSize: 11, color: '#9ca3af', marginTop: 4 }}>{visibles.length} avis</Text>
                  </View>
                  {/* Distribution */}
                  <View style={{ flex: 2 }}>
                    {[5, 4, 3, 2, 1].map((n, i) => (
                      <View key={n} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                        <Text style={{ fontSize: 11, color: '#6b7280', width: 10 }}>{n}</Text>
                        <View style={{ flex: 1, height: 6, borderRadius: 3, backgroundColor: '#e5e7eb' }}>
                          <View style={{ height: 6, borderRadius: 3, backgroundColor: '#f59e0b', width: `${(noteDist[i] / maxDist) * 100}%` }} />
                        </View>
                        <Text style={{ fontSize: 11, color: '#9ca3af', width: 14, textAlign: 'right' }}>{noteDist[i]}</Text>
                      </View>
                    ))}
                  </View>
                </View>

                {/* Par employé */}
                {byEmp.length > 0 && (
                  <View style={s.card}>
                    <Text style={s.sectionTitle}>Note par employé</Text>
                    {byEmp.map(e => (
                      <View key={e.nom} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6, borderBottomWidth: 1, borderColor: '#f3f4f6' }}>
                        <Text style={{ color: '#374151', fontWeight: '600' }}>{e.nom}</Text>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                          <Stars note={Math.round(e.avg)} size={12} />
                          <Text style={{ color: '#f59e0b', fontWeight: '700', fontSize: 13 }}>{e.avg.toFixed(1)}</Text>
                          <Text style={{ color: '#9ca3af', fontSize: 11 }}>({e.count})</Text>
                        </View>
                      </View>
                    ))}
                  </View>
                )}

                {/* Filtres */}
                <View style={s.card}>
                  <Text style={[s.sectionTitle, { marginBottom: 8 }]}>Filtres</Text>
                  <Text style={s.fieldLabel}>Note</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, marginBottom: 10 }}>
                    <TouchableOpacity onPress={() => setFilterNote(null)} style={[s.chip, filterNote === null && s.chipActive]}>
                      <Text style={[s.chipText, filterNote === null && s.chipTextActive]}>Toutes</Text>
                    </TouchableOpacity>
                    {[5, 4, 3, 2, 1].map(n => (
                      <TouchableOpacity key={n} onPress={() => setFilterNote(filterNote === n ? null : n)} style={[s.chip, filterNote === n && s.chipActive]}>
                        <Text style={[s.chipText, filterNote === n && s.chipTextActive]}>{n} ★</Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                  <Text style={s.fieldLabel}>Employé</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, marginBottom: 10 }}>
                    <TouchableOpacity onPress={() => setFilterEmp('')} style={[s.chip, !filterEmp && s.chipActive]}>
                      <Text style={[s.chipText, !filterEmp && s.chipTextActive]}>Tous</Text>
                    </TouchableOpacity>
                    {employes.map(e => (
                      <TouchableOpacity key={e.id} onPress={() => setFilterEmp(filterEmp === e.id ? '' : e.id)} style={[s.chip, filterEmp === e.id && s.chipActive]}>
                        <Text style={[s.chipText, filterEmp === e.id && s.chipTextActive]}>{e.nom}</Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                  <Text style={s.fieldLabel}>Statut</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
                    <TouchableOpacity onPress={() => setFilterStatut('')} style={[s.chip, !filterStatut && s.chipActive]}>
                      <Text style={[s.chipText, !filterStatut && s.chipTextActive]}>Tous</Text>
                    </TouchableOpacity>
                    {(Object.entries(STATUT_META) as [Statut, typeof STATUT_META[Statut]][]).map(([k, m]) => (
                      <TouchableOpacity key={k} onPress={() => setFilterStatut(filterStatut === k ? '' : k)} style={[s.chip, filterStatut === k && s.chipActive]}>
                        <Text style={[s.chipText, filterStatut === k && s.chipTextActive]}>{m.label}</Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </View>

                <Text style={{ fontSize: 15, fontWeight: '800', color: '#374151', marginTop: 4 }}>
                  {filtered.length} avis
                </Text>
              </>
            )}
          </View>
        }
        ListEmptyComponent={
          !loading ? (
            <View style={{ alignItems: 'center', paddingTop: 40, gap: 12 }}>
              <Ionicons name="star-outline" size={56} color="#c4b5fd" />
              <Text style={{ color: '#6b7280', fontSize: 16, fontWeight: '600' }}>Aucun avis</Text>
            </View>
          ) : null
        }
      />
    </SafeAreaView>
  )
}

// ── Styles ─────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  headerTitle: { fontSize: 24, fontWeight: '800', color: '#111827' },
  headerSub: { fontSize: 13, color: '#7c3aed', fontWeight: '600', marginTop: 2 },
  kpiGrid: { flexDirection: 'row', gap: 8 },
  kpiCard: {
    flex: 1, backgroundColor: '#fff', borderRadius: 12, padding: 10,
    shadowColor: '#7c3aed', shadowOpacity: 0.07, shadowRadius: 6, elevation: 2,
  },
  kpiLabel: { fontSize: 11, color: '#6b7280', marginBottom: 4 },
  kpiValue: { fontSize: 18, fontWeight: '900' },
  card: {
    backgroundColor: 'rgba(255,255,255,0.92)', borderRadius: 16, padding: 14,
    shadowColor: '#7c3aed', shadowOpacity: 0.08, shadowRadius: 8, elevation: 3,
  },
  sectionTitle: { fontSize: 14, fontWeight: '800', color: '#7c3aed', marginBottom: 10 },
  clientName: { fontSize: 14, fontWeight: '800', color: '#111827' },
  sub: { fontSize: 12, color: '#6b7280', marginTop: 1 },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
  badgeText: { fontSize: 11, fontWeight: '700' },
  commentaire: {
    fontSize: 13, color: '#374151', fontStyle: 'italic',
    backgroundColor: '#f9fafb', borderRadius: 8, padding: 10, marginBottom: 8,
  },
  reponseBox: {
    backgroundColor: '#ede9fe', borderRadius: 8, padding: 10, marginBottom: 8,
  },
  actionsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10 },
  actionChip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 10, paddingVertical: 5, borderRadius: 10,
    borderWidth: 1, borderColor: '#ddd6fe', backgroundColor: '#faf5ff',
  },
  actionChipText: { fontSize: 12, color: '#7c3aed', fontWeight: '600' },
  iconBtn: {
    width: 30, height: 30, borderRadius: 8, alignItems: 'center', justifyContent: 'center',
  },
  smallBtn: {
    paddingVertical: 8, borderRadius: 8, alignItems: 'center', justifyContent: 'center',
  },
  input: {
    borderWidth: 1, borderColor: '#ddd6fe', borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 10, fontSize: 14,
    backgroundColor: '#faf5ff', color: '#111827', marginBottom: 8,
  },
  chip: {
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16,
    backgroundColor: '#f3f4f6', borderWidth: 1, borderColor: '#e5e7eb',
  },
  chipActive: { backgroundColor: '#ede9fe', borderColor: '#7c3aed' },
  chipText: { fontSize: 13, color: '#6b7280', fontWeight: '500' },
  chipTextActive: { color: '#7c3aed', fontWeight: '700' },
  fieldLabel: { fontSize: 13, fontWeight: '600', color: '#374151', marginBottom: 6 },
})
