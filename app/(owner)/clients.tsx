import { useEffect, useMemo, useRef, useState } from 'react'
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  Modal, TextInput, ActivityIndicator,
  KeyboardAvoidingView, Platform,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { supabase } from '../../lib/supabase'

const NETLIFY_URL = 'https://aesthetic-yeot-2d7094.netlify.app'

// ── Types ────────────────────────────────────────────────────────
type Segment = 'nouveau' | 'regulier' | 'frequent' | 'vip' | 'inactif'
type SortKey = 'derniere_visite' | 'total_visites' | 'total_depenses' | 'prenom'
type SortDir = 'asc' | 'desc'
type Tab = 'liste' | 'segmentation'

interface ClientRow {
  id: string
  company_id: string
  prenom: string
  nom: string
  email: string
  telephone: string
  points_fidelite: number
  est_bloque: boolean
  last_login: string | null
  note_salon: string | null
  note_client: string | null
  avatar_url?: string | null
  created_at: string
  date_naissance?: string | null
  adresse?: string | null
  ville?: string | null
  code_postal?: string | null
  total_visites?: number
  total_depenses?: number
  derniere_visite?: string | null
  premiere_visite?: string | null
}

type ClientWithSeg = ClientRow & { seg: Segment }

// ── Helpers ──────────────────────────────────────────────────────
function calcSegment(c: { derniere_visite?: string | null; total_visites?: number; total_depenses?: number }): Segment {
  if (!c.derniere_visite) return 'nouveau'
  const days = Math.floor((Date.now() - new Date(c.derniere_visite).getTime()) / 86_400_000)
  if (days > 60) return 'inactif'
  if ((c.total_visites ?? 0) >= 10 && (c.total_depenses ?? 0) >= 200) return 'vip'
  if ((c.total_visites ?? 0) >= 5) return 'frequent'
  if ((c.total_visites ?? 0) >= 2) return 'regulier'
  return 'nouveau'
}

function dateRel(dateStr: string | null | undefined): string {
  if (!dateStr) return '—'
  const days = Math.floor((Date.now() - new Date(dateStr).getTime()) / 86_400_000)
  if (days === 0) return "Aujourd'hui"
  if (days === 1) return 'Hier'
  if (days < 7) return `Il y a ${days} j`
  if (days < 30) return `Il y a ${Math.floor(days / 7)} sem`
  if (days < 365) return `Il y a ${Math.floor(days / 30)} mois`
  return `Il y a ${Math.floor(days / 365)} an${Math.floor(days / 365) > 1 ? 's' : ''}`
}

function formatDate(d: string | null): string {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })
}

const SEGMENT_COLOR: Record<Segment, { bg: string; color: string }> = {
  nouveau:  { bg: 'rgba(59,130,246,0.12)',  color: '#1d4ed8' },
  regulier: { bg: 'rgba(16,185,129,0.12)',  color: '#059669' },
  frequent: { bg: 'rgba(5,150,105,0.12)',   color: '#065f46' },
  vip:      { bg: 'rgba(245,158,11,0.12)',  color: '#b45309' },
  inactif:  { bg: 'rgba(239,68,68,0.12)',   color: '#dc2626' },
}
const SEGMENT_LABEL: Record<Segment, string> = {
  nouveau: 'Nouveau', regulier: 'Régulier', frequent: 'Fréquent', vip: '⭐ VIP', inactif: 'Inactif',
}

const SEGMENTS: Array<{ key: Segment | 'tous'; label: string }> = [
  { key: 'tous',     label: 'Tous' },
  { key: 'nouveau',  label: 'Nouveau' },
  { key: 'regulier', label: 'Régulier' },
  { key: 'frequent', label: 'Fréquent' },
  { key: 'vip',      label: '⭐ VIP' },
  { key: 'inactif',  label: 'Inactif' },
]

const SORT_KEYS: Array<{ key: SortKey; label: string }> = [
  { key: 'prenom',          label: 'Prénom' },
  { key: 'total_visites',   label: 'Visites' },
  { key: 'total_depenses',  label: 'Dépenses' },
  { key: 'derniere_visite', label: 'Dernière visite' },
]

const KPI_CONFIG = [
  { key: 'total',       label: 'Total clients',   color: '#3b82f6' },
  { key: 'nouveaux30j', label: 'Nouveaux 30j',    color: '#06b6d4' },
  { key: 'reguliers',   label: 'Réguliers',       color: '#10b981' },
  { key: 'vip',         label: 'VIP',             color: '#f59e0b' },
  { key: 'inactifs',    label: 'Inactifs (60j+)', color: '#ef4444' },
] as const

// ── Mini components ───────────────────────────────────────────────
function Avatar({ prenom, nom, size = 40 }: { prenom: string; nom: string; size?: number }) {
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: '#7c3aed', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
      <Text style={{ color: '#fff', fontSize: size * 0.35, fontWeight: '700' }}>
        {(prenom[0] ?? '').toUpperCase()}{(nom[0] ?? '').toUpperCase()}
      </Text>
    </View>
  )
}

function SegBadge({ seg }: { seg: Segment }) {
  const c = SEGMENT_COLOR[seg]
  return (
    <View style={{ backgroundColor: c.bg, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3, alignSelf: 'flex-start' }}>
      <Text style={{ fontSize: 11, fontWeight: '600', color: c.color }}>{SEGMENT_LABEL[seg]}</Text>
    </View>
  )
}

// ── Main component ────────────────────────────────────────────────
export default function ClientsScreen() {
  const [company, setCompany]     = useState<{ id: string } | null>(null)
  const [clients, setClients]     = useState<ClientRow[]>([])
  const [loading, setLoading]     = useState(true)
  const [tab, setTab]             = useState<Tab>('liste')

  // Liste tab
  const [search, setSearch]           = useState('')
  const [expandedId, setExpandedId]   = useState<string | null>(null)
  const [noteValues, setNoteValues]   = useState<Record<string, string>>({})
  const [savingNoteId, setSavingNoteId] = useState<string | null>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Segmentation tab
  const [segFilter, setSegFilter]   = useState<Segment | 'tous'>('tous')
  const [searchSeg, setSearchSeg]   = useState('')
  const [sortKey, setSortKey]       = useState<SortKey>('derniere_visite')
  const [sortDir, setSortDir]       = useState<SortDir>('desc')

  // Add client modal
  const EMPTY_ADD = { prenom: '', nom: '', email: '', telephone: '', date_naissance: '', adresse: '', ville: '', code_postal: '' }
  const [showAdd, setShowAdd]     = useState(false)
  const [addForm, setAddForm]     = useState(EMPTY_ADD)
  const [addSaving, setAddSaving] = useState(false)
  const [addError, setAddError]   = useState('')

  // Edit client modal
  const [editingClient, setEditingClient] = useState<ClientRow | null>(null)
  const [editForm, setEditForm] = useState({
    prenom: '', nom: '', email: '', telephone: '', date_naissance: '',
    adresse: '', ville: '', code_postal: '', note_salon: '',
    new_password: '', new_password_confirm: '',
  })
  const [editSaving, setEditSaving] = useState(false)
  const [editError, setEditError]   = useState('')

  // ── Load company ───────────────────────────────────────────────
  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return
      supabase.from('companies').select('id').eq('owner_email', user.email).single()
        .then(({ data }) => { if (data) setCompany(data as { id: string }) })
    })
  }, [])

  // ── Load clients ───────────────────────────────────────────────
  useEffect(() => {
    if (!company) return
    supabase
      .from('clients')
      .select('id, company_id, prenom, nom, email, telephone, points_fidelite, est_bloque, last_login, note_salon, note_client, avatar_url, created_at, date_naissance, adresse, ville, code_postal, total_visites, total_depenses, derniere_visite, premiere_visite')
      .eq('company_id', company.id)
      .order('created_at', { ascending: false })
      .then(({ data }) => {
        const rows = (data ?? []) as ClientRow[]
        setClients(rows)
        const notes: Record<string, string> = {}
        rows.forEach(c => { notes[c.id] = c.note_salon ?? '' })
        setNoteValues(notes)
        setLoading(false)
      })
  }, [company?.id])

  // ── Note autosave (debounce 1.2s) ─────────────────────────────
  const saveNote = async (clientId: string, value: string) => {
    setSavingNoteId(clientId)
    await supabase.from('clients').update({ note_salon: value || null }).eq('id', clientId)
    setClients(prev => prev.map(c => c.id === clientId ? { ...c, note_salon: value || null } : c))
    setSavingNoteId(null)
  }

  const handleNoteChange = (clientId: string, value: string) => {
    setNoteValues(prev => ({ ...prev, [clientId]: value }))
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => saveNote(clientId, value), 1200)
  }

  // ── Toggle bloqué ──────────────────────────────────────────────
  const toggleBlocked = async (c: ClientRow) => {
    const next = !c.est_bloque
    await supabase.from('clients').update({ est_bloque: next }).eq('id', c.id)
    setClients(prev => prev.map(r => r.id === c.id ? { ...r, est_bloque: next } : r))
  }

  // ── Open edit ──────────────────────────────────────────────────
  const openEdit = (c: ClientRow) => {
    setEditForm({
      prenom: c.prenom, nom: c.nom, email: c.email, telephone: c.telephone ?? '',
      date_naissance: c.date_naissance ?? '', adresse: c.adresse ?? '',
      ville: c.ville ?? '', code_postal: c.code_postal ?? '',
      note_salon: noteValues[c.id] ?? c.note_salon ?? '',
      new_password: '', new_password_confirm: '',
    })
    setEditError('')
    setEditingClient(c)
  }

  // ── Save edit ──────────────────────────────────────────────────
  const handleSaveEdit = async () => {
    if (!editingClient || !company) return
    if (!editForm.prenom || !editForm.nom || !editForm.email) {
      setEditError('Prénom, nom et email sont obligatoires')
      return
    }
    if (editForm.new_password && editForm.new_password !== editForm.new_password_confirm) {
      setEditError('Les mots de passe ne correspondent pas')
      return
    }
    setEditSaving(true); setEditError('')
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { setEditError('Session expirée'); return }
      const payload: Record<string, string> = {
        client_id: editingClient.id, company_id: company.id,
        prenom: editForm.prenom, nom: editForm.nom, email: editForm.email,
        telephone: editForm.telephone, date_naissance: editForm.date_naissance,
        adresse: editForm.adresse, ville: editForm.ville, code_postal: editForm.code_postal,
        note_salon: editForm.note_salon,
      }
      if (editForm.new_password) payload['new_password'] = editForm.new_password
      const res = await fetch(`${NETLIFY_URL}/.netlify/functions/admin-update-client`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const json = await res.json()
      if (!res.ok) { setEditError(json.error ?? 'Erreur lors de la sauvegarde'); return }
      setClients(prev => prev.map(cl => cl.id === editingClient.id ? {
        ...cl, prenom: editForm.prenom, nom: editForm.nom, email: editForm.email,
        telephone: editForm.telephone, date_naissance: editForm.date_naissance || null,
        adresse: editForm.adresse || null, ville: editForm.ville || null,
        code_postal: editForm.code_postal || null, note_salon: editForm.note_salon || null,
      } : cl))
      setNoteValues(prev => ({ ...prev, [editingClient.id]: editForm.note_salon }))
      setEditingClient(null)
    } catch {
      setEditError('Erreur lors de la sauvegarde')
    } finally {
      setEditSaving(false)
    }
  }

  // ── Add client ─────────────────────────────────────────────────
  const handleAddClient = async () => {
    if (!addForm.prenom.trim() || !addForm.nom.trim()) { setAddError('Prénom et nom sont obligatoires'); return }
    setAddSaving(true); setAddError('')
    try {
      const { data: newClient, error } = await supabase.from('clients').insert({
        company_id: company!.id,
        prenom: addForm.prenom.trim(), nom: addForm.nom.trim(),
        email: addForm.email || null, telephone: addForm.telephone || null,
        date_naissance: addForm.date_naissance || null,
        adresse: addForm.adresse || null, ville: addForm.ville || null,
        code_postal: addForm.code_postal || null,
        actif: true, total_visites: 0, total_depenses: 0,
      }).select('id').single()
      if (error) { setAddError(error.message); return }
      if (newClient) {
        const newRow: ClientRow = {
          id: newClient.id, company_id: company!.id,
          prenom: addForm.prenom.trim(), nom: addForm.nom.trim(),
          email: addForm.email || '', telephone: addForm.telephone || '',
          points_fidelite: 0, est_bloque: false, last_login: null,
          note_salon: null, note_client: null, avatar_url: null,
          created_at: new Date().toISOString(),
          date_naissance: addForm.date_naissance || null,
          adresse: addForm.adresse || null, ville: addForm.ville || null,
          code_postal: addForm.code_postal || null,
          total_visites: 0, total_depenses: 0, derniere_visite: null, premiere_visite: null,
        }
        setClients(prev => [newRow, ...prev])
        setNoteValues(prev => ({ ...prev, [newRow.id]: '' }))
      }
      setShowAdd(false)
      setAddForm(EMPTY_ADD)
    } catch {
      setAddError('Erreur lors de la création du client')
    } finally {
      setAddSaving(false)
    }
  }

  // ── Computed ───────────────────────────────────────────────────
  const filteredListe = clients.filter(c => {
    const q = search.toLowerCase()
    return (
      c.prenom.toLowerCase().includes(q) ||
      c.nom.toLowerCase().includes(q) ||
      (c.email ?? '').toLowerCase().includes(q) ||
      (c.telephone ?? '').includes(q)
    )
  })

  const clientsWithSeg = useMemo<ClientWithSeg[]>(
    () => clients.map(c => ({ ...c, seg: calcSegment(c) })),
    [clients]
  )

  const kpi = useMemo(() => {
    const now = Date.now()
    return {
      total:       clientsWithSeg.length,
      nouveaux30j: clientsWithSeg.filter(c => c.premiere_visite && (now - new Date(c.premiere_visite).getTime()) < 30 * 86_400_000).length,
      reguliers:   clientsWithSeg.filter(c => c.seg === 'regulier' || c.seg === 'frequent').length,
      vip:         clientsWithSeg.filter(c => c.seg === 'vip').length,
      inactifs:    clientsWithSeg.filter(c => c.seg === 'inactif').length,
    }
  }, [clientsWithSeg])

  const filteredSeg = useMemo(() => {
    let list = clientsWithSeg
    if (segFilter !== 'tous') list = list.filter(c => c.seg === segFilter)
    if (searchSeg.trim()) {
      const q = searchSeg.toLowerCase()
      list = list.filter(c =>
        `${c.prenom} ${c.nom}`.toLowerCase().includes(q) ||
        (c.email ?? '').toLowerCase().includes(q) ||
        (c.telephone ?? '').includes(q)
      )
    }
    list = [...list].sort((a, b) => {
      let va: number | string = 0, vb: number | string = 0
      if (sortKey === 'prenom')         { va = `${a.prenom} ${a.nom}`;   vb = `${b.prenom} ${b.nom}` }
      else if (sortKey === 'derniere_visite') { va = a.derniere_visite ?? ''; vb = b.derniere_visite ?? '' }
      else if (sortKey === 'total_visites')   { va = a.total_visites ?? 0;   vb = b.total_visites ?? 0 }
      else if (sortKey === 'total_depenses')  { va = a.total_depenses ?? 0;  vb = b.total_depenses ?? 0 }
      const cmp = va < vb ? -1 : va > vb ? 1 : 0
      return sortDir === 'asc' ? cmp : -cmp
    })
    return list
  }, [clientsWithSeg, segFilter, searchSeg, sortKey, sortDir])

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(key); setSortDir('desc') }
  }

  const setAF = (k: keyof typeof EMPTY_ADD, v: string) => setAddForm(f => ({ ...f, [k]: v }))
  const setEF = (k: keyof typeof editForm, v: string) => setEditForm(f => ({ ...f, [k]: v }))

  if (!company || loading) return (
    <View style={{ flex: 1, backgroundColor: '#f5f3ff', alignItems: 'center', justifyContent: 'center' }}>
      <ActivityIndicator size="large" color="#7c3aed" />
    </View>
  )

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#f5f3ff' }} edges={['top']}>

      {/* ── Header ── */}
      <View style={s.header}>
        <View>
          <Text style={{ fontSize: 20, fontWeight: '700', color: '#111827' }}>Clients</Text>
          <Text style={{ fontSize: 12, color: '#9ca3af', marginTop: 2 }}>{clients.length} client{clients.length !== 1 ? 's' : ''}</Text>
        </View>
        <TouchableOpacity
          style={s.addBtn}
          onPress={() => { setShowAdd(true); setAddForm(EMPTY_ADD); setAddError('') }}
        >
          <Ionicons name="add" size={16} color="#fff" />
          <Text style={{ fontSize: 13, fontWeight: '600', color: '#fff' }}>Ajouter</Text>
        </TouchableOpacity>
      </View>

      {/* ── Tabs ── */}
      <View style={s.tabs}>
        {(['liste', 'segmentation'] as Tab[]).map(t => (
          <TouchableOpacity key={t} onPress={() => setTab(t)} style={[s.tabBtn, tab === t && s.tabBtnActive]}>
            <Text style={[s.tabLabel, tab === t && s.tabLabelActive]}>
              {t === 'liste' ? 'Liste' : 'Segmentation'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* ── Search bar (liste) ── */}
      {tab === 'liste' ? (
        <View style={[s.searchBar, { marginHorizontal: 16, marginTop: 10, marginBottom: 4 }]}>
          <Ionicons name="search-outline" size={16} color="#9ca3af" />
          <TextInput
            style={{ flex: 1, fontSize: 14, color: '#374151', marginLeft: 8 }}
            placeholder="Rechercher..."
            placeholderTextColor="#9ca3af"
            value={search}
            onChangeText={setSearch}
          />
          {search ? (
            <TouchableOpacity onPress={() => setSearch('')}>
              <Ionicons name="close-circle" size={16} color="#9ca3af" />
            </TouchableOpacity>
          ) : null}
        </View>
      ) : null}

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 100 }}>

        {/* ══ LISTE TAB ══ */}
        {tab === 'liste' && (
          filteredListe.length === 0 ? (
            <View style={{ alignItems: 'center', paddingVertical: 64 }}>
              <Text style={{ fontSize: 40, marginBottom: 12 }}>👥</Text>
              <Text style={{ fontSize: 15, fontWeight: '600', color: '#374151' }}>
                {search ? 'Aucun résultat' : 'Aucun client pour le moment'}
              </Text>
              <Text style={{ fontSize: 13, color: '#9ca3af', marginTop: 4 }}>
                {search ? 'Essayez un autre terme' : 'Les clients apparaîtront ici après leur inscription'}
              </Text>
            </View>
          ) : (
            <View style={{ padding: 16, gap: 10 }}>
              {filteredListe.map(c => (
                <View key={c.id} style={s.card}>

                  {/* ── Header row ── */}
                  <TouchableOpacity
                    onPress={() => setExpandedId(expandedId === c.id ? null : c.id)}
                    activeOpacity={0.8}
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}
                  >
                    <Avatar prenom={c.prenom} nom={c.nom} />
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={{ fontSize: 15, fontWeight: '700', color: '#111827' }} numberOfLines={1}>
                        {c.prenom} {c.nom}
                      </Text>
                      <Text style={{ fontSize: 11, color: '#9ca3af' }}>Depuis le {formatDate(c.created_at)}</Text>
                      {c.email ? <Text style={{ fontSize: 12, color: '#6b7280' }} numberOfLines={1}>{c.email}</Text> : null}
                      {c.telephone ? <Text style={{ fontSize: 12, color: '#6b7280' }}>{c.telephone}</Text> : null}
                    </View>
                    <View style={{ alignItems: 'flex-end', gap: 4 }}>
                      <Text style={{ fontSize: 13, fontWeight: '700', color: '#7c3aed' }}>{c.points_fidelite} pts</Text>
                      <View style={{
                        backgroundColor: c.est_bloque ? 'rgba(239,68,68,0.1)' : 'rgba(16,185,129,0.1)',
                        borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2,
                      }}>
                        <Text style={{ fontSize: 11, fontWeight: '600', color: c.est_bloque ? '#dc2626' : '#059669' }}>
                          {c.est_bloque ? 'Bloqué' : 'Actif'}
                        </Text>
                      </View>
                      <Text style={{ fontSize: 11, color: '#9ca3af' }}>{dateRel(c.last_login)}</Text>
                    </View>
                    <Ionicons name={expandedId === c.id ? 'chevron-up' : 'chevron-down'} size={16} color="#9ca3af" />
                  </TouchableOpacity>

                  {/* ── Expanded section ── */}
                  {expandedId === c.id && (
                    <View style={{ marginTop: 14, paddingTop: 14, borderTopWidth: 1, borderTopColor: 'rgba(0,0,0,0.06)', gap: 12 }}>

                      {/* Note privée */}
                      <View>
                        <Text style={s.noteLabel}>
                          NOTE PRIVÉE{' '}
                          <Text style={{ fontWeight: '400', color: '#9ca3af' }}>(visible uniquement par vous)</Text>
                        </Text>
                        <TextInput
                          style={s.noteInput}
                          multiline
                          numberOfLines={3}
                          textAlignVertical="top"
                          value={noteValues[c.id] ?? ''}
                          onChangeText={v => handleNoteChange(c.id, v)}
                          placeholder="Préférences, remarques, habitudes..."
                          placeholderTextColor="#9ca3af"
                        />
                        {savingNoteId === c.id ? (
                          <Text style={{ fontSize: 11, color: '#9ca3af', marginTop: 2 }}>Enregistrement...</Text>
                        ) : null}
                      </View>

                      {/* Note client (read-only) */}
                      <View>
                        <Text style={s.noteLabel}>
                          NOTE DU CLIENT{' '}
                          <Text style={{ fontWeight: '400', color: '#9ca3af' }}>(rédigé par le client)</Text>
                        </Text>
                        <View style={[s.noteInput, { borderStyle: c.note_client ? 'solid' : 'dashed', justifyContent: 'center', minHeight: 60 }]}>
                          <Text style={{ fontSize: 13, color: c.note_client ? '#374151' : '#9ca3af', fontStyle: c.note_client ? 'italic' : 'normal' }}>
                            {c.note_client || 'Aucune note du client pour le moment.'}
                          </Text>
                        </View>
                      </View>

                      {/* Action buttons */}
                      <View style={{ flexDirection: 'row', gap: 8 }}>
                        <TouchableOpacity
                          onPress={() => toggleBlocked(c)}
                          style={[s.actionChip, {
                            backgroundColor: c.est_bloque ? 'rgba(16,185,129,0.08)' : 'rgba(239,68,68,0.08)',
                            borderColor:     c.est_bloque ? 'rgba(16,185,129,0.3)'  : 'rgba(239,68,68,0.3)',
                          }]}
                        >
                          <Ionicons
                            name={c.est_bloque ? 'lock-open-outline' : 'lock-closed-outline'}
                            size={13}
                            color={c.est_bloque ? '#059669' : '#dc2626'}
                          />
                          <Text style={{ fontSize: 12, fontWeight: '600', color: c.est_bloque ? '#059669' : '#dc2626' }}>
                            {c.est_bloque ? 'Débloquer' : 'Bloquer'}
                          </Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          onPress={() => openEdit(c)}
                          style={[s.actionChip, { backgroundColor: 'rgba(124,58,237,0.08)', borderColor: 'rgba(124,58,237,0.3)' }]}
                        >
                          <Ionicons name="pencil-outline" size={13} color="#7c3aed" />
                          <Text style={{ fontSize: 12, fontWeight: '600', color: '#7c3aed' }}>Modifier</Text>
                        </TouchableOpacity>
                      </View>

                    </View>
                  )}
                </View>
              ))}
            </View>
          )
        )}

        {/* ══ SEGMENTATION TAB ══ */}
        {tab === 'segmentation' && (
          <View style={{ paddingBottom: 16 }}>

            {/* KPI cards */}
            <ScrollView
              horizontal showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ padding: 16, gap: 12 }}
            >
              {KPI_CONFIG.map(k => (
                <View key={k.key} style={[s.kpiCard, { borderLeftColor: k.color, borderLeftWidth: 4 }]}>
                  <Text style={s.kpiCardLabel}>{k.label}</Text>
                  <Text style={[s.kpiCardValue, { color: k.color }]}>{kpi[k.key]}</Text>
                </View>
              ))}
            </ScrollView>

            {/* Search seg */}
            <View style={[s.searchBar, { marginHorizontal: 16, marginBottom: 10 }]}>
              <Ionicons name="search-outline" size={16} color="#9ca3af" />
              <TextInput
                style={{ flex: 1, fontSize: 14, color: '#374151', marginLeft: 8 }}
                placeholder="Nom, email, téléphone..."
                placeholderTextColor="#9ca3af"
                value={searchSeg}
                onChangeText={setSearchSeg}
              />
              {searchSeg ? (
                <TouchableOpacity onPress={() => setSearchSeg('')}>
                  <Ionicons name="close-circle" size={16} color="#9ca3af" />
                </TouchableOpacity>
              ) : null}
            </View>

            {/* Segment filter pills */}
            <ScrollView
              horizontal showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ paddingHorizontal: 16, gap: 8, paddingBottom: 8 }}
            >
              {SEGMENTS.map(sg => {
                const active = segFilter === sg.key
                return (
                  <TouchableOpacity
                    key={sg.key}
                    onPress={() => setSegFilter(sg.key as Segment | 'tous')}
                    style={[s.filterChip, active && s.filterChipActive]}
                  >
                    <Text style={[s.filterLabel, active && s.filterLabelActive]}>{sg.label}</Text>
                  </TouchableOpacity>
                )
              })}
            </ScrollView>

            {/* Sort pills */}
            <ScrollView
              horizontal showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ paddingHorizontal: 16, gap: 8, paddingVertical: 8 }}
            >
              {SORT_KEYS.map(sk => {
                const active = sortKey === sk.key
                return (
                  <TouchableOpacity
                    key={sk.key}
                    onPress={() => toggleSort(sk.key)}
                    style={[s.sortChip, active && { borderColor: '#7c3aed', backgroundColor: 'rgba(124,58,237,0.08)' }]}
                  >
                    <Text style={{ fontSize: 12, fontWeight: '600', color: active ? '#7c3aed' : '#6b7280' }}>
                      {sk.label}
                    </Text>
                    <Ionicons
                      name={active ? (sortDir === 'desc' ? 'chevron-down' : 'chevron-up') : 'chevron-down'}
                      size={12}
                      color={active ? '#7c3aed' : '#d1d5db'}
                    />
                  </TouchableOpacity>
                )
              })}
            </ScrollView>

            {/* Result count */}
            <Text style={{ fontSize: 12, color: '#9ca3af', marginHorizontal: 16, marginBottom: 8 }}>
              {filteredSeg.length} client{filteredSeg.length !== 1 ? 's' : ''}
            </Text>

            {/* Seg list */}
            {filteredSeg.length === 0 ? (
              <View style={{ alignItems: 'center', paddingVertical: 48 }}>
                <Ionicons name="people-outline" size={32} color="#d1d5db" />
                <Text style={{ fontSize: 14, color: '#6b7280', fontWeight: '500', marginTop: 8 }}>Aucun client</Text>
                <Text style={{ fontSize: 12, color: '#9ca3af', marginTop: 4 }}>Modifiez le filtre ou la recherche</Text>
              </View>
            ) : (
              <View style={{ paddingHorizontal: 16, gap: 8 }}>
                {filteredSeg.map(c => (
                  <View key={c.id} style={s.segCard}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                      <Avatar prenom={c.prenom} nom={c.nom} size={36} />
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text style={{ fontSize: 14, fontWeight: '700', color: '#111827' }} numberOfLines={1}>
                          {c.prenom} {c.nom}
                        </Text>
                        {c.email ? <Text style={{ fontSize: 11, color: '#9ca3af' }} numberOfLines={1}>{c.email}</Text> : null}
                      </View>
                      <SegBadge seg={c.seg} />
                    </View>
                    <View style={{ flexDirection: 'row' }}>
                      <View style={s.segStat}>
                        <Text style={s.segStatValue}>{c.total_visites ?? 0}</Text>
                        <Text style={s.segStatLabel}>visites</Text>
                      </View>
                      <View style={s.segStat}>
                        <Text style={s.segStatValue}>
                          {c.total_depenses != null ? `${Number(c.total_depenses).toFixed(0)} $` : '—'}
                        </Text>
                        <Text style={s.segStatLabel}>dépenses</Text>
                      </View>
                      <View style={s.segStat}>
                        <Text style={s.segStatValue}>{dateRel(c.derniere_visite)}</Text>
                        <Text style={s.segStatLabel}>dernière visite</Text>
                      </View>
                      <View style={s.segStat}>
                        <Text style={[s.segStatValue, { color: '#7c3aed' }]}>⭐ {c.points_fidelite ?? 0}</Text>
                        <Text style={s.segStatLabel}>points</Text>
                      </View>
                    </View>
                  </View>
                ))}
              </View>
            )}
          </View>
        )}
      </ScrollView>

      {/* ── FAB ── */}
      <TouchableOpacity
        style={s.fab}
        onPress={() => { setShowAdd(true); setAddForm(EMPTY_ADD); setAddError('') }}
      >
        <Ionicons name="add" size={28} color="#fff" />
      </TouchableOpacity>

      {/* ══ Add Client Modal ══ */}
      <Modal
        visible={showAdd}
        animationType="slide"
        presentationStyle={Platform.OS === 'ios' ? 'pageSheet' : 'overFullScreen'}
        onRequestClose={() => setShowAdd(false)}
      >
        <SafeAreaView style={{ flex: 1, backgroundColor: '#fff' }} edges={['top', 'bottom']}>
          <View style={s.modalHeader}>
            <Text style={s.modalTitle}>Nouveau client</Text>
            <TouchableOpacity onPress={() => setShowAdd(false)}>
              <Ionicons name="close" size={22} color="#6b7280" />
            </TouchableOpacity>
          </View>
          <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 32 }} showsVerticalScrollIndicator={false}>
              <View style={{ gap: 14 }}>
                <View style={{ flexDirection: 'row', gap: 10 }}>
                  <View style={{ flex: 1 }}>
                    <Text style={s.fieldLabel}>Prénom *</Text>
                    <TextInput style={s.input} value={addForm.prenom} onChangeText={v => setAF('prenom', v)} placeholderTextColor="#9ca3af" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.fieldLabel}>Nom *</Text>
                    <TextInput style={s.input} value={addForm.nom} onChangeText={v => setAF('nom', v)} placeholderTextColor="#9ca3af" />
                  </View>
                </View>
                <View>
                  <Text style={s.fieldLabel}>Email</Text>
                  <TextInput style={s.input} value={addForm.email} onChangeText={v => setAF('email', v)} keyboardType="email-address" autoCapitalize="none" placeholderTextColor="#9ca3af" />
                </View>
                <View style={{ flexDirection: 'row', gap: 10 }}>
                  <View style={{ flex: 1 }}>
                    <Text style={s.fieldLabel}>Téléphone</Text>
                    <TextInput style={s.input} value={addForm.telephone} onChangeText={v => setAF('telephone', v)} keyboardType="phone-pad" placeholderTextColor="#9ca3af" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.fieldLabel}>Date de naissance</Text>
                    <TextInput style={s.input} value={addForm.date_naissance} onChangeText={v => setAF('date_naissance', v)} placeholder="YYYY-MM-DD" placeholderTextColor="#9ca3af" />
                  </View>
                </View>
                <View>
                  <Text style={s.fieldLabel}>Adresse</Text>
                  <TextInput style={s.input} value={addForm.adresse} onChangeText={v => setAF('adresse', v)} placeholder="123 rue Principale" placeholderTextColor="#9ca3af" />
                </View>
                <View style={{ flexDirection: 'row', gap: 10 }}>
                  <View style={{ flex: 1 }}>
                    <Text style={s.fieldLabel}>Ville</Text>
                    <TextInput style={s.input} value={addForm.ville} onChangeText={v => setAF('ville', v)} placeholder="Québec" placeholderTextColor="#9ca3af" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.fieldLabel}>Code postal</Text>
                    <TextInput style={s.input} value={addForm.code_postal} onChangeText={v => setAF('code_postal', v)} placeholder="G1A 1A1" placeholderTextColor="#9ca3af" />
                  </View>
                </View>
                {addError ? <Text style={{ color: '#dc2626', fontSize: 13 }}>{addError}</Text> : null}
                <View style={{ flexDirection: 'row', gap: 10 }}>
                  <TouchableOpacity style={[s.dialogBtn, { flex: 1 }]} onPress={() => setShowAdd(false)}>
                    <Text style={{ fontSize: 14, fontWeight: '600', color: '#374151' }}>Annuler</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[s.dialogBtn, { flex: 1, backgroundColor: '#7c3aed', borderColor: '#7c3aed', opacity: (addSaving || !addForm.prenom.trim() || !addForm.nom.trim()) ? 0.5 : 1 }]}
                    disabled={addSaving || !addForm.prenom.trim() || !addForm.nom.trim()}
                    onPress={handleAddClient}
                  >
                    {addSaving
                      ? <ActivityIndicator size="small" color="#fff" />
                      : <Text style={{ fontSize: 14, fontWeight: '600', color: '#fff' }}>Créer le client</Text>}
                  </TouchableOpacity>
                </View>
              </View>
            </ScrollView>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </Modal>

      {/* ══ Edit Client Modal ══ */}
      <Modal
        visible={!!editingClient}
        animationType="slide"
        presentationStyle={Platform.OS === 'ios' ? 'pageSheet' : 'overFullScreen'}
        onRequestClose={() => setEditingClient(null)}
      >
        <SafeAreaView style={{ flex: 1, backgroundColor: '#fff' }} edges={['top', 'bottom']}>

          {/* Header with avatar */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, padding: 16, borderBottomWidth: 1, borderBottomColor: '#f3f4f6' }}>
            {editingClient ? (
              <Avatar
                prenom={editForm.prenom || editingClient.prenom}
                nom={editForm.nom || editingClient.nom}
                size={46}
              />
            ) : null}
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={{ fontSize: 16, fontWeight: '700', color: '#111827' }} numberOfLines={1}>
                {editForm.prenom || editingClient?.prenom} {editForm.nom || editingClient?.nom}
              </Text>
              {editingClient ? <SegBadge seg={calcSegment(editingClient)} /> : null}
            </View>
            <TouchableOpacity onPress={() => setEditingClient(null)}>
              <Ionicons name="close" size={22} color="#6b7280" />
            </TouchableOpacity>
          </View>

          <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <ScrollView contentContainerStyle={{ paddingBottom: 32 }} showsVerticalScrollIndicator={false}>

              {/* ── Informations personnelles ── */}
              <View style={{ padding: 16, gap: 12 }}>
                <Text style={s.sectionTitle}>📋 Informations personnelles</Text>
                <View style={{ flexDirection: 'row', gap: 10 }}>
                  <View style={{ flex: 1 }}>
                    <Text style={s.fieldLabel}>Prénom *</Text>
                    <TextInput style={s.input} value={editForm.prenom} onChangeText={v => setEF('prenom', v)} placeholderTextColor="#9ca3af" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.fieldLabel}>Nom *</Text>
                    <TextInput style={s.input} value={editForm.nom} onChangeText={v => setEF('nom', v)} placeholderTextColor="#9ca3af" />
                  </View>
                </View>
                <View>
                  <Text style={s.fieldLabel}>Email *</Text>
                  <TextInput style={s.input} value={editForm.email} onChangeText={v => setEF('email', v)} keyboardType="email-address" autoCapitalize="none" placeholderTextColor="#9ca3af" />
                </View>
                <View style={{ flexDirection: 'row', gap: 10 }}>
                  <View style={{ flex: 1 }}>
                    <Text style={s.fieldLabel}>Téléphone</Text>
                    <TextInput style={s.input} value={editForm.telephone} onChangeText={v => setEF('telephone', v)} keyboardType="phone-pad" placeholderTextColor="#9ca3af" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.fieldLabel}>Date de naissance</Text>
                    <TextInput style={s.input} value={editForm.date_naissance} onChangeText={v => setEF('date_naissance', v)} placeholder="YYYY-MM-DD" placeholderTextColor="#9ca3af" />
                  </View>
                </View>
                <View>
                  <Text style={s.fieldLabel}>Adresse</Text>
                  <TextInput style={s.input} value={editForm.adresse} onChangeText={v => setEF('adresse', v)} placeholder="123 rue Principale" placeholderTextColor="#9ca3af" />
                </View>
                <View style={{ flexDirection: 'row', gap: 10 }}>
                  <View style={{ flex: 1 }}>
                    <Text style={s.fieldLabel}>Ville</Text>
                    <TextInput style={s.input} value={editForm.ville} onChangeText={v => setEF('ville', v)} placeholder="Québec" placeholderTextColor="#9ca3af" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.fieldLabel}>Code postal</Text>
                    <TextInput style={s.input} value={editForm.code_postal} onChangeText={v => setEF('code_postal', v)} placeholder="G1A 1A1" placeholderTextColor="#9ca3af" />
                  </View>
                </View>
              </View>

              {/* ── Note interne ── */}
              <View style={{ padding: 16, borderTopWidth: 1, borderTopColor: 'rgba(124,58,237,0.06)', gap: 8 }}>
                <Text style={s.sectionTitle}>📝 Note interne</Text>
                <Text style={s.fieldLabel}>
                  Note <Text style={{ fontWeight: '400', color: '#9ca3af' }}>(non visible par le client)</Text>
                </Text>
                <TextInput
                  style={[s.input, { height: 90, textAlignVertical: 'top' }]}
                  value={editForm.note_salon}
                  onChangeText={v => setEF('note_salon', v)}
                  multiline
                  placeholder="Préférences, remarques, habitudes..."
                  placeholderTextColor="#9ca3af"
                />
              </View>

              {/* ── Sécurité ── */}
              <View style={{ padding: 16, borderTopWidth: 1, borderTopColor: 'rgba(124,58,237,0.06)', gap: 8 }}>
                <Text style={s.sectionTitle}>🔒 Sécurité</Text>
                <Text style={{ fontSize: 12, color: '#9ca3af' }}>Laisser vide pour ne pas modifier le mot de passe.</Text>
                <View style={{ flexDirection: 'row', gap: 10 }}>
                  <View style={{ flex: 1 }}>
                    <Text style={s.fieldLabel}>Nouveau mot de passe</Text>
                    <TextInput style={s.input} value={editForm.new_password} onChangeText={v => setEF('new_password', v)} secureTextEntry placeholder="Min. 6 caractères" placeholderTextColor="#9ca3af" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.fieldLabel}>Confirmer</Text>
                    <TextInput style={s.input} value={editForm.new_password_confirm} onChangeText={v => setEF('new_password_confirm', v)} secureTextEntry placeholder="Confirmer" placeholderTextColor="#9ca3af" />
                  </View>
                </View>
              </View>

              {/* ── Footer ── */}
              <View style={{ padding: 16, borderTopWidth: 1, borderTopColor: 'rgba(124,58,237,0.06)' }}>
                {editError ? <Text style={{ color: '#dc2626', fontSize: 13, marginBottom: 12 }}>{editError}</Text> : null}
                <View style={{ flexDirection: 'row', gap: 10 }}>
                  <TouchableOpacity style={[s.dialogBtn, { flex: 1 }]} onPress={() => setEditingClient(null)}>
                    <Text style={{ fontSize: 14, fontWeight: '600', color: '#374151' }}>Annuler</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[s.dialogBtn, { flex: 1, backgroundColor: '#7c3aed', borderColor: '#7c3aed', opacity: editSaving ? 0.6 : 1 }]}
                    disabled={editSaving}
                    onPress={handleSaveEdit}
                  >
                    {editSaving
                      ? <ActivityIndicator size="small" color="#fff" />
                      : <Text style={{ fontSize: 14, fontWeight: '600', color: '#fff' }}>Sauvegarder</Text>}
                  </TouchableOpacity>
                </View>
              </View>

            </ScrollView>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </Modal>

    </SafeAreaView>
  )
}

// ── Styles ────────────────────────────────────────────────────────
const s = StyleSheet.create({
  header:           { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 14, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: 'rgba(0,0,0,0.06)' },
  addBtn:           { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#7c3aed', borderRadius: 999, paddingHorizontal: 14, paddingVertical: 9, shadowColor: '#7c3aed', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 4 },
  tabs:             { flexDirection: 'row', paddingHorizontal: 16, paddingTop: 4, borderBottomWidth: 1, borderBottomColor: 'rgba(124,58,237,0.08)', backgroundColor: '#fff' },
  tabBtn:           { paddingHorizontal: 4, paddingBottom: 10, marginRight: 24, borderBottomWidth: 2, borderBottomColor: 'transparent' },
  tabBtnActive:     { borderBottomColor: '#7c3aed' },
  tabLabel:         { fontSize: 14, fontWeight: '500', color: '#9ca3af' },
  tabLabelActive:   { color: '#7c3aed', fontWeight: '700' },
  searchBar:        { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(124,58,237,0.06)', borderRadius: 999, paddingHorizontal: 14, paddingVertical: 10, borderWidth: 1, borderColor: 'rgba(124,58,237,0.12)' },
  card:             { backgroundColor: 'rgba(255,255,255,0.9)', borderRadius: 20, padding: 14, shadowColor: '#7c3aed', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.08, shadowRadius: 12, elevation: 4 },
  segCard:          { backgroundColor: 'rgba(255,255,255,0.9)', borderRadius: 16, padding: 14, shadowColor: '#7c3aed', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 3 },
  kpiCard:          { width: 140, backgroundColor: '#fff', borderRadius: 16, padding: 14, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 3 },
  kpiCardLabel:     { fontSize: 11, fontWeight: '600', color: '#6b7280', marginBottom: 6 },
  kpiCardValue:     { fontSize: 28, fontWeight: '800', lineHeight: 34 },
  filterChip:       { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 999, backgroundColor: '#fff', borderWidth: 1, borderColor: 'rgba(124,58,237,0.2)' },
  filterChipActive: { backgroundColor: '#7c3aed', borderColor: '#7c3aed' },
  filterLabel:      { fontSize: 13, color: '#6b7280', fontWeight: '500' },
  filterLabelActive:{ color: '#fff', fontWeight: '600' },
  sortChip:         { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, backgroundColor: '#fff', borderWidth: 1, borderColor: '#e5e7eb' },
  noteLabel:        { fontSize: 11, fontWeight: '700', color: '#6b7280', letterSpacing: 0.5, marginBottom: 6 },
  noteInput:        { backgroundColor: '#f9fafb', borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 10, padding: 10, fontSize: 13, color: '#374151', minHeight: 72 },
  actionChip:       { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 10, borderWidth: 1 },
  segStat:          { flex: 1, alignItems: 'center' },
  segStatValue:     { fontSize: 13, fontWeight: '700', color: '#374151' },
  segStatLabel:     { fontSize: 10, color: '#9ca3af', marginTop: 2 },
  fab:              { position: 'absolute', right: 18, bottom: 18, width: 56, height: 56, borderRadius: 28, backgroundColor: '#7c3aed', alignItems: 'center', justifyContent: 'center', shadowColor: '#7c3aed', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.35, shadowRadius: 12, elevation: 8 },
  modalHeader:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, borderBottomWidth: 1, borderBottomColor: '#f3f4f6' },
  modalTitle:       { fontSize: 16, fontWeight: '700', color: '#111827' },
  sectionTitle:     { fontSize: 14, fontWeight: '700', color: '#7c3aed' },
  fieldLabel:       { fontSize: 12, fontWeight: '500', color: '#6b7280', marginBottom: 6 },
  input:            { backgroundColor: '#f9fafb', borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 10, paddingVertical: 11, paddingHorizontal: 14, fontSize: 14, color: '#111827' },
  dialogBtn:        { padding: 13, borderRadius: 12, alignItems: 'center', borderWidth: 1, borderColor: '#e5e7eb' },
})
