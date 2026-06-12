import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  Modal, TextInput, ActivityIndicator, Share,
  KeyboardAvoidingView, Platform,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { supabase } from '../../../lib/supabase'

const NETLIFY_URL = 'https://app.pixsellmedia.ca'

// ── Types ────────────────────────────────────────────────────────
type Statut = 'pending' | 'confirmed' | 'completed' | 'cancelled' | 'no_show'
type QuickFilter = 'aujourd_hui' | 'confirmé' | 'cette_semaine' | 'ce_mois' | 'en_attente' | 'passé' | 'annulé' | 'absent' | 'tous'

interface ReservationRow {
  id: string
  client_id: string | null
  client_prenom: string | null
  client_nom: string | null
  client_email: string | null
  client_telephone: string | null
  service: string | null
  employee_id: string | null
  date_rdv: string
  heure_rdv: string
  prix: number | null
  statut: Statut
  cancel_token: string | null
  duree_rdv: number | null
  note_interne: string | null
  employes: { nom: string }[] | null
}

interface ClientRow {
  id: string
  prenom: string
  nom: string
  email: string
  telephone: string
  points_fidelite: number
  est_bloque: boolean
  note_salon?: string | null
}

interface ServiceRow {
  id: string
  nom: string
  prix: number
  duree_minutes: number
}

interface EmployeRow {
  id: string
  nom: string
  duree_ajustement_pct?: number | null
}

type HoraireDay = { ouvert: boolean; debut: string; fin: string }
type Company = { id: string; horaires?: Record<string, HoraireDay> | null }

// ── Helpers ──────────────────────────────────────────────────────
function isInNoShowWindow(dateRdv: string, heureRdv: string, dureeMinutes: number | null): boolean {
  const now = new Date()
  const [h, m] = heureRdv.split(':').map(Number)
  const rdvDate = new Date(dateRdv + 'T00:00:00')
  rdvDate.setHours(h, m, 0, 0)
  const duree = dureeMinutes ?? 60
  const finService = new Date(rdvDate.getTime() + duree * 60 * 1000)
  const fenetreNoShow = new Date(finService.getTime() + 60 * 60 * 1000)
  return now >= rdvDate && now <= fenetreNoShow
}

// ── Constants ────────────────────────────────────────────────────
const STATUS: Record<Statut, { label: string; bg: string; color: string }> = {
  pending:   { label: 'Confirmé',   bg: 'rgba(16,185,129,0.15)',  color: '#059669' },
  confirmed: { label: 'Confirmé',   bg: 'rgba(16,185,129,0.15)',  color: '#059669' },
  completed: { label: 'Passé',      bg: 'rgba(107,114,128,0.15)', color: '#6b7280' },
  cancelled: { label: 'Annulé',     bg: 'rgba(239,68,68,0.15)',   color: '#dc2626' },
  no_show:   { label: 'Absent',     bg: 'rgba(239,68,68,0.1)',    color: '#ef4444' },
}

const QUICK_FILTERS: { value: QuickFilter; label: string }[] = [
  { value: 'aujourd_hui',   label: "Aujourd'hui" },
  { value: 'confirmé',      label: 'Confirmé' },
  { value: 'cette_semaine', label: 'Cette semaine' },
  { value: 'ce_mois',       label: 'Ce mois' },
  { value: 'en_attente',    label: 'En attente' },
  { value: 'passé',         label: 'Passé' },
  { value: 'annulé',        label: 'Annulé' },
  { value: 'absent',        label: 'Absent' },
  { value: 'tous',          label: 'Tous' },
]

// ── Helpers ──────────────────────────────────────────────────────
function todayISO() { return new Date().toLocaleDateString('en-CA') }

function startOfWeekISO() {
  const d = new Date()
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7))
  return d.toLocaleDateString('en-CA')
}

function startOfMonthISO() {
  const d = new Date(); d.setDate(1)
  return d.toLocaleDateString('en-CA')
}

function formatDate(d: string) {
  return new Date(d + 'T00:00:00').toLocaleDateString('fr-FR', {
    weekday: 'short', day: 'numeric', month: 'short',
  })
}

function formatDateLong(d: string) {
  return new Date(d + 'T00:00:00').toLocaleDateString('fr-FR', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  })
}

function clientName(r: Pick<ReservationRow, 'client_prenom' | 'client_nom'>) {
  return [r.client_prenom, r.client_nom].filter(Boolean).join(' ') || '—'
}

function simpleUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16)
  })
}

function toMins(t: string) { const [h, m] = (t || '0:0').split(':').map(Number); return h * 60 + m }
function toTime(m: number) {
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
}
function generateSlots(debut: string, fin: string, duree: number): string[] {
  const start = toMins(debut), end = toMins(fin) - duree
  const out: string[] = []
  for (let m = start; m <= end; m += 15) out.push(toTime(m))
  return out
}

async function shareCSV(rows: ReservationRow[]) {
  const headers = ['Client', 'Téléphone', 'Service', 'Employé', 'Date', 'Heure', 'Prix', 'Statut']
  const esc = (v: string) => `"${v.replace(/"/g, '""')}"`
  const lines = rows.map(r => [
    clientName(r), r.client_telephone ?? '', r.service ?? '',
    r.employes?.[0]?.nom ?? '', r.date_rdv, r.heure_rdv?.slice(0, 5) ?? '',
    r.prix != null ? `${r.prix}` : '', STATUS[r.statut]?.label ?? r.statut,
  ].map(v => esc(String(v))).join(','))
  const csv = [headers.join(','), ...lines].join('\n')
  await Share.share({ message: csv, title: `reservations-${todayISO()}.csv` })
}

// ── InfoRow ───────────────────────────────────────────────────────
function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
      <Text style={{ fontSize: 13, color: '#6b7280', flexShrink: 0, marginRight: 8 }}>{label}</Text>
      <Text style={{ fontSize: 13, fontWeight: '600', color: '#374151', flex: 1, textAlign: 'right' }} numberOfLines={1}>{value}</Text>
    </View>
  )
}

// ── StatusBadge ───────────────────────────────────────────────────
function StatusBadge({ statut }: { statut: Statut }) {
  const st = STATUS[statut]
  return (
    <View style={{ backgroundColor: st.bg, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3 }}>
      <Text style={{ fontSize: 11, fontWeight: '600', color: st.color }}>{st.label}</Text>
    </View>
  )
}

// ── DetailModal ───────────────────────────────────────────────────
interface DetailModalProps {
  row: ReservationRow
  companyId: string
  onClose: () => void
  onStatusChange: (id: string, statut: Statut) => Promise<void>
  onUpdate: (id: string, patch: Partial<ReservationRow>) => void
}

function DetailModal({ row, companyId, onClose, onStatusChange, onUpdate }: DetailModalProps) {
  const [client, setClient] = useState<ClientRow | null>(null)
  const [history, setHistory] = useState<{ id: string; date_rdv: string; service: string | null; statut: string }[]>([])
  const [note, setNote] = useState('')
  const [savingNote, setSavingNote] = useState(false)
  const [loadingClient, setLoadingClient] = useState(false)

  const [editing, setEditing] = useState(false)
  const [editDate, setEditDate] = useState(row.date_rdv)
  const [editTime, setEditTime] = useState(row.heure_rdv?.slice(0, 5) ?? '')
  const [editEmpId, setEditEmpId] = useState(row.employee_id ?? '')
  const [editSvcId, setEditSvcId] = useState('')
  const [editPrix, setEditPrix] = useState(row.prix != null ? String(row.prix) : '')
  const [editNoteInterne, setEditNoteInterne] = useState(row.note_interne ?? '')
  const [editServices, setEditServices] = useState<ServiceRow[]>([])
  const [editEmployes, setEditEmployes] = useState<EmployeRow[]>([])
  const [editDataLoaded, setEditDataLoaded] = useState(false)
  const [editSaving, setEditSaving] = useState(false)
  const [messageClient, setMessageClient] = useState('')

  const isActive = row.statut === 'pending' || row.statut === 'confirmed'
  const canEdit  = row.statut !== 'cancelled' && row.statut !== 'completed'

  useEffect(() => {
    if (!row.client_id) return
    setLoadingClient(true)
    Promise.all([
      supabase.from('clients').select('*').eq('id', row.client_id!).single(),
      supabase.from('reservations')
        .select('id, date_rdv, service, statut')
        .eq('client_id', row.client_id!).eq('company_id', companyId)
        .order('date_rdv', { ascending: false }).limit(10),
    ]).then(([{ data: c }, { data: h }]) => {
      if (c) { setClient(c as ClientRow); setNote((c as ClientRow).note_salon ?? '') }
      setHistory((h ?? []) as typeof history)
      setLoadingClient(false)
    })
  }, [row.client_id, companyId])

  const saveNote = async () => {
    if (!row.client_id) return
    setSavingNote(true)
    await supabase.from('clients').update({ note_salon: note }).eq('id', row.client_id)
    setSavingNote(false)
  }

  const enterEdit = () => {
    setEditDate(row.date_rdv)
    setEditTime(row.heure_rdv?.slice(0, 5) ?? '')
    setEditEmpId(row.employee_id ?? '')
    setEditSvcId('')
    setEditPrix(row.prix != null ? String(row.prix) : '')
    setEditNoteInterne(row.note_interne ?? '')
    if (!editDataLoaded) {
      Promise.all([
        supabase.from('services_catalogue').select('id, nom, prix, duree_minutes').eq('company_id', companyId).eq('actif', true).order('ordre', { ascending: true }),
        supabase.from('employes').select('id, nom, duree_ajustement_pct').eq('company_id', companyId).eq('actif', true).order('nom'),
      ]).then(([{ data: s }, { data: e }]) => {
        const svcs = (s ?? []) as ServiceRow[]
        setEditServices(svcs)
        setEditEmployes((e ?? []) as EmployeRow[])
        const found = svcs.find(sv => sv.nom === row.service)
        if (found) { setEditSvcId(found.id); setEditPrix(String(found.prix)) }
        setEditDataLoaded(true)
      })
    } else {
      const found = editServices.find(sv => sv.nom === row.service)
      if (found) { setEditSvcId(found.id); setEditPrix(String(found.prix)) }
    }
    setMessageClient('')
    setEditing(true)
  }

  const handleSave = async () => {
    setEditSaving(true)
    const svc = editServices.find(s => s.id === editSvcId)
    const emp = editEmployes.find(e => e.id === editEmpId)
    const updates: Record<string, unknown> = {
      date_rdv: editDate,
      heure_rdv: editTime,
      employee_id: editEmpId || null,
      prix: editPrix !== '' ? parseFloat(editPrix) : null,
      note_interne: editNoteInterne || null,
    }
    if (svc) { updates.service = svc.nom; updates.duree_rdv = svc.duree_minutes }
    const { error } = await supabase.from('reservations').update(updates).eq('id', row.id)
    if (!error) {
      onUpdate(row.id, {
        date_rdv: editDate,
        heure_rdv: editTime,
        employee_id: editEmpId || null,
        prix: editPrix !== '' ? parseFloat(editPrix) : null,
        note_interne: editNoteInterne || null,
        ...(svc ? { service: svc.nom, duree_rdv: svc.duree_minutes } : {}),
        employes: emp ? [{ nom: emp.nom }] : row.employes,
      })
      setEditing(false)
      fetch(`${NETLIFY_URL}/.netlify/functions/send-confirmation`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type:           'admin-modify',
          reservation_id: row.id,
          message_client: messageClient.trim() || null,
        }),
      }).catch(e => console.error('[send-confirmation] failed:', e))
    }
    setEditSaving(false)
  }

  const pastVisits  = history.filter(h => h.id !== row.id)
  const lastVisit   = pastVisits.find(h => h.statut === 'completed' || h.statut === 'confirmed')

  return (
    <Modal visible animationType="slide" presentationStyle={Platform.OS === 'ios' ? 'pageSheet' : 'overFullScreen'} onRequestClose={onClose}>
      <SafeAreaView style={{ flex: 1, backgroundColor: '#fff' }} edges={['top', 'bottom']}>

        {/* Header */}
        <View style={s.modalHeader}>
          <Text style={s.modalTitle}>{editing ? 'Modifier la réservation' : 'Détail réservation'}</Text>
          <TouchableOpacity onPress={editing ? () => setEditing(false) : onClose}>
            <Ionicons name="close" size={22} color="#6b7280" />
          </TouchableOpacity>
        </View>

        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 80 }} showsVerticalScrollIndicator={false}>

            {editing ? (
              /* ── Edit mode ──────────────────────────────────── */
              <View style={{ gap: 16 }}>
                <View>
                  <Text style={s.sectionLabel}>DATE</Text>
                  <TextInput style={s.input} value={editDate} onChangeText={setEditDate} placeholder="YYYY-MM-DD" placeholderTextColor="#9ca3af" />
                </View>
                <View>
                  <Text style={s.sectionLabel}>HEURE</Text>
                  <TextInput style={s.input} value={editTime} onChangeText={setEditTime} placeholder="HH:MM" placeholderTextColor="#9ca3af" />
                </View>
                <View>
                  <Text style={s.sectionLabel}>SERVICE</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 6 }}>
                    {editServices.map(svc => (
                      <TouchableOpacity
                        key={svc.id}
                        onPress={() => { setEditSvcId(svc.id); setEditPrix(String(svc.prix)) }}
                        style={[s.chip, editSvcId === svc.id && s.chipActive]}
                      >
                        <Text style={[s.chipLabel, editSvcId === svc.id && s.chipLabelActive]}>{svc.nom} — {svc.prix} $</Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </View>
                <View>
                  <Text style={s.sectionLabel}>EMPLOYÉ</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 6 }}>
                    <TouchableOpacity
                      onPress={() => setEditEmpId('')}
                      style={[s.chip, !editEmpId && s.chipActive]}
                    >
                      <Text style={[s.chipLabel, !editEmpId && s.chipLabelActive]}>Non assigné</Text>
                    </TouchableOpacity>
                    {editEmployes.map(emp => (
                      <TouchableOpacity
                        key={emp.id}
                        onPress={() => setEditEmpId(emp.id)}
                        style={[s.chip, editEmpId === emp.id && s.chipActive]}
                      >
                        <Text style={[s.chipLabel, editEmpId === emp.id && s.chipLabelActive]}>{emp.nom}</Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </View>
                <View>
                  <Text style={s.sectionLabel}>PRIX ($)</Text>
                  <TextInput style={s.input} value={editPrix} onChangeText={setEditPrix} keyboardType="numeric" placeholder="0.00" placeholderTextColor="#9ca3af" />
                </View>
                <View>
                  <Text style={s.sectionLabel}>NOTE INTERNE</Text>
                  <TextInput
                    style={[s.input, { height: 80, textAlignVertical: 'top' }]}
                    value={editNoteInterne}
                    onChangeText={setEditNoteInterne}
                    multiline
                    placeholder="Note visible uniquement par l'équipe..."
                    placeholderTextColor="#9ca3af"
                  />
                </View>
                <View>
                  <Text style={s.sectionLabel}>MESSAGE AU CLIENT (OPTIONNEL)</Text>
                  <TextInput
                    style={[s.input, { height: 80, textAlignVertical: 'top' }]}
                    value={messageClient}
                    onChangeText={t => setMessageClient(t.slice(0, 300))}
                    multiline
                    placeholder="Ex: Désolé pour ce changement..."
                    placeholderTextColor="#9ca3af"
                    maxLength={300}
                  />
                  <Text style={{ fontSize: 11, color: '#9ca3af', textAlign: 'right', marginTop: 2 }}>{messageClient.length}/300</Text>
                </View>
                <View style={{ flexDirection: 'row', gap: 10 }}>
                  <TouchableOpacity style={[s.dialogBtn, { flex: 1 }]} onPress={() => setEditing(false)}>
                    <Text style={{ fontSize: 14, fontWeight: '600', color: '#374151' }}>Annuler</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[s.dialogBtn, { flex: 1, backgroundColor: '#7c3aed', borderColor: '#7c3aed', opacity: editSaving ? 0.6 : 1 }]}
                    disabled={editSaving}
                    onPress={handleSave}
                  >
                    {editSaving
                      ? <ActivityIndicator size="small" color="#fff" />
                      : <Text style={{ fontSize: 14, fontWeight: '600', color: '#fff' }}>Sauvegarder</Text>}
                  </TouchableOpacity>
                </View>
              </View>

            ) : (
              /* ── View mode ───────────────────────────────────── */
              <View style={{ gap: 20 }}>

                {/* Réservation */}
                <View>
                  <Text style={s.sectionLabel}>RÉSERVATION</Text>
                  <View style={s.infoBox}>
                    <InfoRow label="Date" value={`${formatDateLong(row.date_rdv)} à ${row.heure_rdv?.slice(0, 5)}`} />
                    <View style={s.divider} />
                    <InfoRow label="Service" value={row.service ?? '—'} />
                    <View style={s.divider} />
                    <InfoRow label="Employé" value={row.employes?.[0]?.nom ?? '—'} />
                    <View style={s.divider} />
                    <InfoRow label="Durée" value={row.duree_rdv ? `${row.duree_rdv} min` : '—'} />
                    <View style={s.divider} />
                    <InfoRow label="Prix" value={row.prix != null ? `${row.prix} $` : '—'} />
                    <View style={s.divider} />
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                      <Text style={{ fontSize: 13, color: '#6b7280' }}>Statut</Text>
                      <StatusBadge statut={row.statut} />
                    </View>
                    {row.note_interne ? (
                      <>
                        <View style={s.divider} />
                        <Text style={{ fontSize: 11, color: '#9ca3af', marginBottom: 4 }}>Note interne</Text>
                        <Text style={{ fontSize: 13, color: '#374151' }}>{row.note_interne}</Text>
                      </>
                    ) : null}
                  </View>
                </View>

                {/* Client */}
                <View>
                  <Text style={s.sectionLabel}>CLIENT</Text>
                  <View style={s.infoBox}>
                    <Text style={{ fontSize: 15, fontWeight: '600', color: '#111827' }}>{clientName(row)}</Text>
                    {row.client_telephone ? (
                      <>
                        <View style={s.divider} />
                        <InfoRow label="Téléphone" value={row.client_telephone} />
                      </>
                    ) : null}
                    {row.client_email ? (
                      <>
                        <View style={s.divider} />
                        <Text style={{ fontSize: 13, color: '#6b7280' }} numberOfLines={1}>{row.client_email}</Text>
                      </>
                    ) : null}
                  </View>
                </View>

                {/* Historique client */}
                {row.client_id ? (
                  <View>
                    <Text style={s.sectionLabel}>HISTORIQUE CLIENT</Text>
                    {loadingClient ? (
                      <ActivityIndicator color="#7c3aed" style={{ marginTop: 8 }} />
                    ) : (
                      <>
                        {client ? (
                          <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }}>
                            <View style={[s.statMini, { backgroundColor: 'rgba(124,58,237,0.08)', flex: 1 }]}>
                              <Text style={[s.statMiniVal, { color: '#7c3aed' }]}>{history.length}</Text>
                              <Text style={s.statMiniLbl}>réservations</Text>
                            </View>
                            <View style={[s.statMini, { backgroundColor: 'rgba(245,158,11,0.08)', flex: 1 }]}>
                              <Text style={[s.statMiniVal, { color: '#d97706' }]}>{client.points_fidelite}</Text>
                              <Text style={s.statMiniLbl}>points</Text>
                            </View>
                            <View style={[s.statMini, { backgroundColor: '#f9fafb', flex: 1.5 }]}>
                              <Text style={[s.statMiniVal, { fontSize: 11, color: '#374151' }]} numberOfLines={1}>
                                {lastVisit ? formatDate(lastVisit.date_rdv) : '—'}
                              </Text>
                              <Text style={s.statMiniLbl}>dernière visite</Text>
                            </View>
                          </View>
                        ) : null}
                        {pastVisits.slice(0, 5).map(h => (
                          <View key={h.id} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#f3f4f6' }}>
                            <View>
                              <Text style={{ fontSize: 13, fontWeight: '500', color: '#374151' }}>{h.service ?? '—'}</Text>
                              <Text style={{ fontSize: 11, color: '#9ca3af' }}>{formatDate(h.date_rdv)}</Text>
                            </View>
                            <StatusBadge statut={h.statut as Statut} />
                          </View>
                        ))}
                        {pastVisits.length === 0 && (
                          <Text style={{ fontSize: 13, color: '#9ca3af', paddingVertical: 8 }}>Aucune visite précédente</Text>
                        )}
                      </>
                    )}
                  </View>
                ) : null}

                {/* Note salon */}
                {row.client_id ? (
                  <View>
                    <Text style={s.sectionLabel}>NOTE SALON</Text>
                    <TextInput
                      style={[s.input, { height: 80, textAlignVertical: 'top' }]}
                      value={note}
                      onChangeText={setNote}
                      multiline
                      placeholder="Note interne sur ce client..."
                      placeholderTextColor="#9ca3af"
                    />
                    <TouchableOpacity
                      onPress={saveNote}
                      disabled={savingNote}
                      style={[s.dialogBtn, { marginTop: 8, backgroundColor: '#7c3aed', borderColor: '#7c3aed', opacity: savingNote ? 0.6 : 1 }]}
                    >
                      {savingNote
                        ? <ActivityIndicator size="small" color="#fff" />
                        : <Text style={{ fontSize: 14, fontWeight: '600', color: '#fff' }}>Sauvegarder</Text>}
                    </TouchableOpacity>
                  </View>
                ) : null}

                {/* Actions */}
                {(isActive || canEdit) ? (
                  <View>
                    <Text style={s.sectionLabel}>ACTIONS</Text>
                    <View style={{ gap: 8 }}>
                      {isActive ? (
                        <View style={{ flexDirection: 'row', gap: 8 }}>
                          <TouchableOpacity
                            onPress={() => onStatusChange(row.id, 'completed')}
                            style={[s.actionBig, { backgroundColor: '#10b981', flex: 1 }]}
                          >
                            <Ionicons name="checkmark-circle-outline" size={16} color="#fff" />
                            <Text style={{ color: '#fff', fontWeight: '600', fontSize: 14 }}>Complété</Text>
                          </TouchableOpacity>
                          {canEdit ? (
                            <TouchableOpacity onPress={enterEdit} style={[s.actionBig, { backgroundColor: '#f3f4f6', flex: 1 }]}>
                              <Ionicons name="pencil-outline" size={16} color="#374151" />
                              <Text style={{ color: '#374151', fontWeight: '600', fontSize: 14 }}>Modifier</Text>
                            </TouchableOpacity>
                          ) : null}
                        </View>
                      ) : null}
                      {isActive ? (
                        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                          {isInNoShowWindow(row.date_rdv, row.heure_rdv, row.duree_rdv) ? (
                            <TouchableOpacity
                              onPress={() => onStatusChange(row.id, 'no_show')}
                              style={[s.actionSm, { backgroundColor: 'rgba(249,115,22,0.1)' }]}
                            >
                              <Ionicons name="person-remove-outline" size={14} color="#ea580c" />
                              <Text style={{ color: '#ea580c', fontWeight: '500', fontSize: 13 }}>Absent</Text>
                            </TouchableOpacity>
                          ) : null}
                          <TouchableOpacity
                            onPress={() => onStatusChange(row.id, 'cancelled')}
                            style={[s.actionSm, { backgroundColor: 'rgba(239,68,68,0.1)' }]}
                          >
                            <Ionicons name="close" size={14} color="#dc2626" />
                            <Text style={{ color: '#dc2626', fontWeight: '500', fontSize: 13 }}>Annuler</Text>
                          </TouchableOpacity>
                        </View>
                      ) : null}
                      {!isActive && canEdit ? (
                        <TouchableOpacity onPress={enterEdit} style={[s.actionBig, { backgroundColor: '#f3f4f6' }]}>
                          <Ionicons name="pencil-outline" size={16} color="#374151" />
                          <Text style={{ color: '#374151', fontWeight: '600', fontSize: 14 }}>Modifier</Text>
                        </TouchableOpacity>
                      ) : null}
                    </View>
                  </View>
                ) : null}

              </View>
            )}
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  )
}

// ── BookingModal ──────────────────────────────────────────────────
interface BookingModalProps {
  company: Company
  onClose: () => void
  onCreated: () => void
}

function BookingModal({ company, onClose, onCreated }: BookingModalProps) {
  const [services, setServices]     = useState<ServiceRow[]>([])
  const [employes, setEmployes]     = useState<EmployeRow[]>([])
  const [svcId, setSvcId]           = useState('')
  const [empId, setEmpId]           = useState('')
  const [date, setDate]             = useState(todayISO())
  const [heure, setHeure]           = useState('')
  const [slots, setSlots]           = useState<string[]>([])
  const [loadingSlots, setLoadingSlots] = useState(false)
  const [clientMode, setClientMode] = useState<'search' | 'new'>('search')
  const [clientSearch, setClientSearch] = useState('')
  const [clientResults, setClientResults] = useState<ClientRow[]>([])
  const [selectedClient, setSelectedClient] = useState<ClientRow | null>(null)
  const [newPrenom, setNewPrenom]   = useState('')
  const [newNom, setNewNom]         = useState('')
  const [newEmail, setNewEmail]     = useState('')
  const [newTel, setNewTel]         = useState('')
  const [saving, setSaving]         = useState(false)
  const [error, setError]           = useState('')

  useEffect(() => {
    Promise.all([
      supabase.from('services').select('id, nom, prix, duree_minutes').eq('company_id', company.id).eq('actif', true).order('nom'),
      supabase.from('employes').select('id, nom, duree_ajustement_pct').eq('company_id', company.id).eq('actif', true).order('nom'),
    ]).then(([{ data: s }, { data: e }]) => {
      setServices((s ?? []) as ServiceRow[])
      setEmployes((e ?? []) as EmployeRow[])
    })
  }, [company.id])

  // Regenerate slots
  useEffect(() => {
    if (!svcId || !date) { setSlots([]); return }
    const svc = services.find(sv => sv.id === svcId)
    if (!svc) return
    const selectedEmpForSlots = employes.find(e => e.id === empId)
    const dureeBase = svc.duree_minutes || 0
    const ajustementSlots = selectedEmpForSlots?.duree_ajustement_pct ?? 0
    const duree = dureeBase + ajustementSlots || 60

    const go = async () => {
      setLoadingSlots(true)
      const { data: booked } = await supabase
        .from('reservations')
        .select('heure_rdv, duree_rdv, employee_id')
        .eq('company_id', company.id).eq('date_rdv', date)
        .in('statut', ['pending', 'confirmed'])

      const dayIdx  = new Date(date + 'T00:00:00').getDay()
      const dayName = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'][dayIdx]
      const horaire = company.horaires?.[dayName]
      const debut   = horaire?.ouvert ? horaire.debut : '08:00'
      const fin     = horaire?.ouvert ? horaire.fin   : '20:00'

      const allSlots = generateSlots(debut, fin, duree)
      const now      = new Date()
      const isToday  = date === todayISO()

      const available = allSlots.filter(slot => {
        if (isToday) {
          const [h, m] = slot.split(':').map(Number)
          const sd = new Date(); sd.setHours(h, m, 0)
          if (sd <= now) return false
        }
        const s = toMins(slot), e = s + duree
        return !(booked ?? []).some(b => {
          if (empId && b.employee_id && b.employee_id !== empId) return false
          const bs = toMins(b.heure_rdv), be = bs + (b.duree_rdv ?? 60)
          return s < be && e > bs
        })
      })
      setSlots(available)
      setHeure('')
      setLoadingSlots(false)
    }
    go()
  }, [svcId, empId, date, services, company.id, company.horaires])

  // Client search debounce
  useEffect(() => {
    if (clientSearch.length < 2) { setClientResults([]); return }
    const t = setTimeout(async () => {
      const { data } = await supabase.from('clients')
        .select('id, prenom, nom, email, telephone, points_fidelite, est_bloque')
        .eq('company_id', company.id)
        .or(`prenom.ilike.%${clientSearch}%,nom.ilike.%${clientSearch}%,telephone.ilike.%${clientSearch}%`)
        .limit(5)
      setClientResults((data ?? []) as ClientRow[])
    }, 300)
    return () => clearTimeout(t)
  }, [clientSearch, company.id])

  const canSubmit = !!(svcId && date && heure && (clientMode === 'search' ? !!selectedClient : !!newPrenom))

  const handleSubmit = async () => {
    if (!canSubmit) return
    setSaving(true); setError('')
    try {
      let finalClientId = selectedClient?.id ?? ''
      let clientData: Record<string, string>

      if (clientMode === 'new') {
        const { data: nc, error: ce } = await supabase.from('clients')
          .insert({ company_id: company.id, prenom: newPrenom, nom: newNom, email: newEmail, telephone: newTel, points_fidelite: 0, est_bloque: false })
          .select('id').single()
        if (ce || !nc) { setError('Erreur création client'); setSaving(false); return }
        finalClientId = nc.id
        clientData = { client_prenom: newPrenom, client_nom: newNom, client_email: newEmail, client_telephone: newTel }
      } else {
        clientData = {
          client_prenom: selectedClient?.prenom ?? '',
          client_nom:    selectedClient?.nom ?? '',
          client_email:  selectedClient?.email ?? '',
          client_telephone: selectedClient?.telephone ?? '',
        }
      }

      const svc = services.find(sv => sv.id === svcId)
      const empForInsert = employes.find(e => e.id === empId)
      const dureeBaseInsert = svc?.duree_minutes || 0
      const ajustementInsert = empForInsert?.duree_ajustement_pct ?? 0
      const dureeFinale = dureeBaseInsert + ajustementInsert || 60
      const cancel_token = simpleUUID()
      const { error: insertErr } = await supabase.from('reservations').insert({
        company_id: company.id,
        client_id:  finalClientId || null,
        service:    svc?.nom ?? '',
        employee_id: empId || null,
        date_rdv:   date,
        heure_rdv:  heure,
        prix:       svc?.prix ?? 0,
        duree_rdv:  dureeFinale,
        statut:     'confirmed',
        cancel_token,
        ...clientData,
      })
      if (insertErr) { setError(insertErr.message); setSaving(false); return }

      fetch(`${NETLIFY_URL}/.netlify/functions/send-confirmation`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ company_id: company.id, ...clientData, service: svc?.nom ?? '', employee_id: empId || null, date_rdv: date, heure_rdv: heure, cancel_token }),
      }).catch(() => {})

      onCreated()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur')
    } finally {
      setSaving(false)
    }
  }

  const selectedSvc = services.find(sv => sv.id === svcId)
  const selectedEmp = employes.find(e => e.id === empId) ?? null
  const dureeBaseRecap = selectedSvc?.duree_minutes || 0
  const ajustementRecap = selectedEmp?.duree_ajustement_pct ?? 0
  const dureeAffichee = dureeBaseRecap + ajustementRecap || 60

  return (
    <Modal visible animationType="slide" presentationStyle={Platform.OS === 'ios' ? 'pageSheet' : 'overFullScreen'} onRequestClose={onClose}>
      <SafeAreaView style={{ flex: 1, backgroundColor: '#fff' }} edges={['top', 'bottom']}>
        <View style={s.modalHeader}>
          <Text style={s.modalTitle}>Nouvelle réservation</Text>
          <TouchableOpacity onPress={onClose}><Ionicons name="close" size={22} color="#6b7280" /></TouchableOpacity>
        </View>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 80 }} showsVerticalScrollIndicator={false}>
            <View style={{ gap: 16 }}>

              {/* Service */}
              <View>
                <Text style={s.fieldLabel}>Service *</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 6 }}>
                  {services.map(svc => (
                    <TouchableOpacity
                      key={svc.id}
                      onPress={() => setSvcId(svc.id)}
                      style={[s.chip, svcId === svc.id && s.chipActive]}
                    >
                      <Text style={[s.chipLabel, svcId === svc.id && s.chipLabelActive]}>
                        {svc.nom} — {svc.prix} $ ({svc.duree_minutes} min)
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
                {selectedSvc ? (
                  <View style={{ marginTop: 6 }}>
                    <Text style={{ fontSize: 12, color: '#7c3aed' }}>
                      Sélectionné : {selectedSvc.nom} · {dureeAffichee} min
                    </Text>
                    {ajustementRecap > 0 && selectedEmp ? (
                      <Text style={{ fontSize: 11, color: '#9ca3af', marginTop: 2, fontStyle: 'italic' }}>
                        Durée ajustée pour {selectedEmp.nom} (base : {dureeBaseRecap}min +{ajustementRecap}min)
                      </Text>
                    ) : null}
                  </View>
                ) : null}
              </View>

              {/* Employé */}
              <View>
                <Text style={s.fieldLabel}>Employé</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 6 }}>
                  <TouchableOpacity onPress={() => setEmpId('')} style={[s.chip, !empId && s.chipActive]}>
                    <Text style={[s.chipLabel, !empId && s.chipLabelActive]}>N'importe</Text>
                  </TouchableOpacity>
                  {employes.map(emp => (
                    <TouchableOpacity
                      key={emp.id}
                      onPress={() => setEmpId(emp.id)}
                      style={[s.chip, empId === emp.id && s.chipActive]}
                    >
                      <Text style={[s.chipLabel, empId === emp.id && s.chipLabelActive]}>{emp.nom}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>

              {/* Date */}
              <View>
                <Text style={s.fieldLabel}>Date *</Text>
                <TextInput style={s.input} value={date} onChangeText={setDate} placeholder="YYYY-MM-DD" placeholderTextColor="#9ca3af" />
              </View>

              {/* Créneaux */}
              {svcId && date ? (
                <View>
                  <Text style={s.fieldLabel}>Heure *</Text>
                  {loadingSlots ? (
                    <ActivityIndicator color="#7c3aed" style={{ marginTop: 8 }} />
                  ) : slots.length === 0 ? (
                    <Text style={{ fontSize: 13, color: '#9ca3af', marginTop: 6 }}>Aucun créneau disponible ce jour</Text>
                  ) : (
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 6 }}>
                      {slots.map(slot => (
                        <TouchableOpacity
                          key={slot}
                          onPress={() => setHeure(slot)}
                          style={{ paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, borderWidth: 1, backgroundColor: heure === slot ? '#7c3aed' : '#fff', borderColor: heure === slot ? '#7c3aed' : '#e5e7eb' }}
                        >
                          <Text style={{ fontSize: 13, fontWeight: '600', color: heure === slot ? '#fff' : '#374151' }}>{slot}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  )}
                </View>
              ) : null}

              {/* Client */}
              <View>
                <Text style={s.fieldLabel}>Client *</Text>
                <View style={{ flexDirection: 'row', gap: 8, marginBottom: 10 }}>
                  {(['search', 'new'] as const).map(mode => (
                    <TouchableOpacity
                      key={mode}
                      onPress={() => { setClientMode(mode); setSelectedClient(null); setClientSearch(''); setClientResults([]) }}
                      style={{ flex: 1, paddingVertical: 9, borderRadius: 10, alignItems: 'center', backgroundColor: clientMode === mode ? '#7c3aed' : '#f3f4f6', borderWidth: 1, borderColor: clientMode === mode ? '#7c3aed' : '#e5e7eb' }}
                    >
                      <Text style={{ fontSize: 13, fontWeight: '600', color: clientMode === mode ? '#fff' : '#374151' }}>
                        {mode === 'search' ? 'Existant' : 'Nouveau'}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                {clientMode === 'search' ? (
                  selectedClient ? (
                    <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(124,58,237,0.08)', borderRadius: 10, padding: 10 }}>
                      <Text style={{ flex: 1, fontWeight: '600', color: '#7c3aed' }}>{selectedClient.prenom} {selectedClient.nom}</Text>
                      <TouchableOpacity onPress={() => setSelectedClient(null)}>
                        <Ionicons name="close-circle" size={18} color="#9ca3af" />
                      </TouchableOpacity>
                    </View>
                  ) : (
                    <View>
                      <View style={s.searchBar}>
                        <Ionicons name="search-outline" size={14} color="#9ca3af" />
                        <TextInput
                          style={{ flex: 1, fontSize: 14, color: '#374151', marginLeft: 8 }}
                          placeholder="Nom, prénom ou téléphone..."
                          placeholderTextColor="#9ca3af"
                          value={clientSearch}
                          onChangeText={setClientSearch}
                        />
                      </View>
                      {clientResults.length > 0 ? (
                        <View style={{ backgroundColor: '#fff', borderRadius: 10, borderWidth: 1, borderColor: '#e5e7eb', marginTop: 4 }}>
                          {clientResults.map(c => (
                            <TouchableOpacity
                              key={c.id}
                              onPress={() => { setSelectedClient(c); setClientSearch(''); setClientResults([]) }}
                              style={{ padding: 12, borderBottomWidth: 1, borderBottomColor: '#f3f4f6' }}
                            >
                              <Text style={{ fontWeight: '600', color: '#111827' }}>{c.prenom} {c.nom}</Text>
                              <Text style={{ fontSize: 12, color: '#9ca3af' }}>{c.telephone}</Text>
                            </TouchableOpacity>
                          ))}
                        </View>
                      ) : null}
                    </View>
                  )
                ) : (
                  <View style={{ gap: 10 }}>
                    <View style={{ flexDirection: 'row', gap: 8 }}>
                      <TextInput style={[s.input, { flex: 1 }]} value={newPrenom} onChangeText={setNewPrenom} placeholder="Prénom *" placeholderTextColor="#9ca3af" />
                      <TextInput style={[s.input, { flex: 1 }]} value={newNom} onChangeText={setNewNom} placeholder="Nom" placeholderTextColor="#9ca3af" />
                    </View>
                    <TextInput style={s.input} value={newTel} onChangeText={setNewTel} placeholder="Téléphone" keyboardType="phone-pad" placeholderTextColor="#9ca3af" />
                    <TextInput style={s.input} value={newEmail} onChangeText={setNewEmail} placeholder="Email" keyboardType="email-address" autoCapitalize="none" placeholderTextColor="#9ca3af" />
                  </View>
                )}
              </View>

              {error ? <Text style={{ color: '#dc2626', fontSize: 13 }}>{error}</Text> : null}

              <View style={{ flexDirection: 'row', gap: 10 }}>
                <TouchableOpacity style={[s.dialogBtn, { flex: 1 }]} onPress={onClose}>
                  <Text style={{ fontSize: 14, fontWeight: '600', color: '#374151' }}>Annuler</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[s.dialogBtn, { flex: 1, backgroundColor: '#7c3aed', borderColor: '#7c3aed', opacity: (!canSubmit || saving) ? 0.5 : 1 }]}
                  disabled={!canSubmit || saving}
                  onPress={handleSubmit}
                >
                  {saving
                    ? <ActivityIndicator size="small" color="#fff" />
                    : <Text style={{ fontSize: 14, fontWeight: '600', color: '#fff' }}>Créer le RDV</Text>}
                </TouchableOpacity>
              </View>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  )
}

// ── Main component ────────────────────────────────────────────────
export default function ReservationsScreen() {
  const [company, setCompany]       = useState<Company | null>(null)
  const [rows, setRows]             = useState<ReservationRow[]>([])
  const [loading, setLoading]       = useState(true)
  const [activeFilter, setActiveFilter] = useState<QuickFilter>('aujourd_hui')
  const [search, setSearch]         = useState('')
  const [saving, setSaving]         = useState(false)

  const [showBooking, setShowBooking]     = useState(false)
  const [detailRow, setDetailRow]         = useState<ReservationRow | null>(null)
  const [cancelTarget, setCancelTarget]   = useState<ReservationRow | null>(null)
  const [cancelReason, setCancelReason]   = useState('')
  const [noShowTarget, setNoShowTarget]   = useState<ReservationRow | null>(null)

  // ── Load company ───────────────────────────────────────────────
  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return
      supabase.from('companies').select('id, horaires').eq('owner_email', user.email).single()
        .then(({ data }) => { if (data) setCompany(data as Company) })
    })
  }, [])

  // ── Load reservations ──────────────────────────────────────────
  const load = useCallback(async () => {
    if (!company) return
    const { data } = await supabase
      .from('reservations')
      .select('id, client_id, client_prenom, client_nom, client_email, client_telephone, service, employee_id, date_rdv, heure_rdv, prix, statut, cancel_token, duree_rdv, note_interne, employes(nom)')
      .eq('company_id', company.id)
      .order('date_rdv', { ascending: false })
      .order('heure_rdv', { ascending: false })
    setRows((data ?? []) as ReservationRow[])
    setLoading(false)
  }, [company?.id])

  useEffect(() => { load() }, [load])

  // ── Update statut ──────────────────────────────────────────────
  const updateStatut = async (id: string, statut: Statut) => {
    if (!company) return
    setSaving(true)
    if (statut === 'cancelled') {
      await fetch(`${NETLIFY_URL}/.netlify/functions/booking-cancel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reservation_id: id, admin_cancel: 'true' }),
      }).catch(() => {})
      setRows(prev => prev.map(r => r.id === id ? { ...r, statut: 'cancelled' } : r))
      setDetailRow(prev => prev?.id === id ? { ...prev, statut: 'cancelled' } : prev)
      setCancelTarget(null)
      setSaving(false)
      return
    }
    await supabase.from('reservations').update({ statut }).eq('id', id)
    setRows(prev => prev.map(r => r.id === id ? { ...r, statut } : r))
    setDetailRow(prev => prev?.id === id ? { ...prev, statut } : prev)
    setNoShowTarget(null)
    setSaving(false)
  }

  // ── Filter ─────────────────────────────────────────────────────
  const filtered = useMemo(() => rows.filter(r => {
    const f = activeFilter
    if (f === 'en_attente'   && r.statut !== 'pending')   return false
    if (f === 'confirmé'     && r.statut !== 'confirmed')  return false
    if (f === 'annulé'       && r.statut !== 'cancelled')  return false
    if (f === 'passé'        && r.statut !== 'completed')  return false
    if (f === 'absent'       && r.statut !== 'no_show')    return false
    const today = todayISO()
    if (f === 'aujourd_hui'  && r.date_rdv !== today) return false
    if (f === 'cette_semaine' && (r.date_rdv < startOfWeekISO() || r.date_rdv > today)) return false
    if (f === 'ce_mois'      && r.date_rdv < startOfMonthISO()) return false
    if (search.trim()) {
      const q    = search.toLowerCase()
      const name = `${r.client_prenom ?? ''} ${r.client_nom ?? ''}`.toLowerCase()
      const tel  = (r.client_telephone ?? '').toLowerCase()
      const svc  = (r.service ?? '').toLowerCase()
      if (!name.includes(q) && !svc.includes(q) && !tel.includes(q)) return false
    }
    return true
  }), [rows, activeFilter, search])

  // ── Stats ──────────────────────────────────────────────────────
  const today      = todayISO()
  const weekStart  = startOfWeekISO()
  const monthStart = startOfMonthISO()
  const todayCount  = rows.filter(r => r.date_rdv === today).length
  const weekRevenue = rows
    .filter(r => r.date_rdv >= weekStart && (r.statut === 'confirmed' || r.statut === 'completed'))
    .reduce((sum, r) => sum + (Number(r.prix) || 0), 0)
  const monthAll   = rows.filter(r => r.date_rdv >= monthStart)
  const monthBad   = monthAll.filter(r => r.statut === 'cancelled' || r.statut === 'no_show').length
  const cancelRate = monthAll.length > 0 ? Math.round((monthBad / monthAll.length) * 100) : 0

  if (!company || loading) return (
    <View style={{ flex: 1, backgroundColor: '#f5f3ff', alignItems: 'center', justifyContent: 'center' }}>
      <ActivityIndicator size="large" color="#7c3aed" />
    </View>
  )

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#f5f3ff' }} edges={['top']}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 100 }}>

        {/* ── Stats ── */}
        <ScrollView
          horizontal showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ padding: 16, gap: 12 }}
        >
          <View style={s.kpi}>
            <Text style={s.kpiLabel}>RDV aujourd'hui</Text>
            <Text style={s.kpiValue}>{todayCount}</Text>
            <Text style={s.kpiSub}>rendez-vous</Text>
          </View>
          <View style={s.kpi}>
            <Text style={s.kpiLabel}>Revenus cette semaine</Text>
            <Text style={s.kpiValue}>{weekRevenue.toFixed(0)} $</Text>
            <Text style={s.kpiSub}>confirmées + passées</Text>
          </View>
          <View style={s.kpi}>
            <Text style={s.kpiLabel}>Taux annulation mois</Text>
            <Text style={[s.kpiValue, { color: cancelRate > 20 ? '#ef4444' : '#7c3aed' }]}>{cancelRate}%</Text>
            <Text style={s.kpiSub}>{monthBad} sur {monthAll.length}</Text>
          </View>
        </ScrollView>

        {/* ── Header ── */}
        <View style={[s.card, { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginHorizontal: 16, marginBottom: 4 }]}>
          <View>
            <Text style={{ fontSize: 18, fontWeight: '700', color: '#111827' }}>Réservations</Text>
            <Text style={{ fontSize: 12, color: '#9ca3af', marginTop: 2 }}>{rows.length} au total</Text>
          </View>
          <TouchableOpacity onPress={() => shareCSV(filtered)} style={s.exportBtn}>
            <Ionicons name="download-outline" size={14} color="#7c3aed" />
            <Text style={{ fontSize: 12, color: '#7c3aed', fontWeight: '500' }}>Exporter</Text>
          </TouchableOpacity>
        </View>

        {/* ── Filters ── */}
        <ScrollView
          horizontal showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: 16, paddingVertical: 10, gap: 8 }}
        >
          {QUICK_FILTERS.map(f => {
            const active = activeFilter === f.value
            return (
              <TouchableOpacity
                key={f.value}
                onPress={() => setActiveFilter(f.value)}
                style={[s.filterChip, active && s.filterChipActive]}
              >
                <Text style={[s.filterLabel, active && s.filterLabelActive]}>{f.label}</Text>
              </TouchableOpacity>
            )
          })}
        </ScrollView>

        {/* ── Search ── */}
        <View style={[s.searchBar, { marginHorizontal: 16, marginBottom: 12 }]}>
          <Ionicons name="search-outline" size={16} color="#9ca3af" />
          <TextInput
            style={{ flex: 1, fontSize: 14, color: '#374151', marginLeft: 8 }}
            placeholder="Client, service, téléphone..."
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

        {/* ── Results count ── */}
        {(activeFilter !== 'tous' || !!search.trim()) ? (
          <Text style={{ fontSize: 12, color: '#9ca3af', marginHorizontal: 16, marginBottom: 8 }}>
            {filtered.length} résultat{filtered.length !== 1 ? 's' : ''}
          </Text>
        ) : null}

        {/* ── List ── */}
        {filtered.length === 0 ? (
          <View style={{ alignItems: 'center', paddingVertical: 60 }}>
            <View style={{ width: 56, height: 56, borderRadius: 16, backgroundColor: 'rgba(124,58,237,0.08)', alignItems: 'center', justifyContent: 'center', marginBottom: 12 }}>
              <Ionicons name="calendar-outline" size={28} color="#7c3aed" />
            </View>
            <Text style={{ fontSize: 15, fontWeight: '600', color: '#374151' }}>
              {activeFilter !== 'tous' || search ? 'Aucun résultat' : 'Aucune réservation'}
            </Text>
            <Text style={{ fontSize: 13, color: '#9ca3af', marginTop: 4 }}>
              {activeFilter !== 'tous' || search ? 'Modifiez les filtres' : 'Les réservations apparaîtront ici'}
            </Text>
          </View>
        ) : (
          filtered.map(r => {
            const st       = STATUS[r.statut]
            const isActive = r.statut === 'pending' || r.statut === 'confirmed'
            return (
              <TouchableOpacity
                key={r.id}
                onPress={() => setDetailRow(r)}
                activeOpacity={0.8}
                style={[s.card, { marginHorizontal: 16, marginBottom: 10 }]}
              >
                {/* Row 1: client + status */}
                <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 6 }}>
                  <View style={{ flex: 1, marginRight: 10 }}>
                    <Text style={{ fontSize: 15, fontWeight: '700', color: '#111827' }} numberOfLines={1}>{clientName(r)}</Text>
                    {r.client_telephone ? <Text style={{ fontSize: 12, color: '#9ca3af', marginTop: 1 }}>{r.client_telephone}</Text> : null}
                  </View>
                  <StatusBadge statut={r.statut} />
                </View>

                {/* Row 2: service + employee */}
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 10 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, flex: 1 }}>
                    <Ionicons name="cut-outline" size={12} color="#9ca3af" />
                    <Text style={{ fontSize: 13, color: '#6b7280' }} numberOfLines={1}>{r.service || '—'}</Text>
                  </View>
                  {r.employes?.[0]?.nom ? (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                      <Ionicons name="person-outline" size={12} color="#9ca3af" />
                      <Text style={{ fontSize: 13, color: '#6b7280' }} numberOfLines={1}>{r.employes[0].nom}</Text>
                    </View>
                  ) : null}
                </View>

                {/* Row 3: date + price + actions */}
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                    <Ionicons name="time-outline" size={12} color="#9ca3af" />
                    <Text style={{ fontSize: 12, color: '#374151', fontWeight: '500' }}>
                      {formatDate(r.date_rdv)} · {r.heure_rdv?.slice(0, 5)}
                    </Text>
                  </View>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    {r.prix != null ? (
                      <Text style={{ fontSize: 13, fontWeight: '600', color: '#111827' }}>{r.prix} $</Text>
                    ) : null}
                    {isActive ? (
                      <>
                        <TouchableOpacity onPress={() => setNoShowTarget(r)} style={[s.inlineBtn, { backgroundColor: 'rgba(249,115,22,0.1)' }]}>
                          <Ionicons name="person-remove-outline" size={14} color="#ea580c" />
                        </TouchableOpacity>
                        <TouchableOpacity onPress={() => { setCancelTarget(r); setCancelReason('') }} style={[s.inlineBtn, { backgroundColor: 'rgba(239,68,68,0.1)' }]}>
                          <Ionicons name="close" size={14} color="#dc2626" />
                        </TouchableOpacity>
                      </>
                    ) : null}
                    <TouchableOpacity onPress={() => setDetailRow(r)} style={[s.inlineBtn, { backgroundColor: 'rgba(124,58,237,0.1)' }]}>
                      <Ionicons name="eye-outline" size={14} color="#7c3aed" />
                    </TouchableOpacity>
                  </View>
                </View>
              </TouchableOpacity>
            )
          })
        )}
      </ScrollView>

      {/* ── FAB ── */}
      <TouchableOpacity style={s.fab} onPress={() => setShowBooking(true)}>
        <Ionicons name="add" size={28} color="#fff" />
      </TouchableOpacity>

      {/* ── Detail Modal ── */}
      {detailRow ? (
        <DetailModal
          row={detailRow}
          companyId={company.id}
          onClose={() => setDetailRow(null)}
          onStatusChange={updateStatut}
          onUpdate={(id, patch) => {
            setRows(prev => prev.map(r => r.id === id ? { ...r, ...patch } : r))
            setDetailRow(prev => prev ? { ...prev, ...patch } : null)
          }}
        />
      ) : null}

      {/* ── Booking Modal ── */}
      {showBooking ? (
        <BookingModal
          company={company}
          onClose={() => setShowBooking(false)}
          onCreated={() => { setShowBooking(false); load() }}
        />
      ) : null}

      {/* ── Cancel Confirm ── */}
      <Modal visible={!!cancelTarget} transparent animationType="fade" onRequestClose={() => setCancelTarget(null)}>
        <View style={s.dialogBackdrop}>
          <View style={s.dialog}>
            <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: 'rgba(239,68,68,0.1)', alignItems: 'center', justifyContent: 'center', marginBottom: 12 }}>
              <Ionicons name="warning-outline" size={20} color="#ef4444" />
            </View>
            <Text style={s.dialogTitle}>Annuler la réservation</Text>
            <Text style={s.dialogMsg}>Annuler le RDV de {cancelTarget ? clientName(cancelTarget) : ''} ?</Text>
            <TextInput
              style={[s.input, { marginTop: 12, height: 60, textAlignVertical: 'top' }]}
              placeholder="Motif d'annulation (optionnel)"
              placeholderTextColor="#9ca3af"
              multiline
              value={cancelReason}
              onChangeText={setCancelReason}
            />
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 16 }}>
              <TouchableOpacity style={[s.dialogBtn, { flex: 1 }]} onPress={() => setCancelTarget(null)}>
                <Text style={{ fontSize: 14, fontWeight: '600', color: '#374151' }}>Retour</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.dialogBtn, { flex: 1, backgroundColor: '#ef4444', borderColor: '#ef4444', opacity: saving ? 0.6 : 1 }]}
                disabled={saving}
                onPress={() => cancelTarget && updateStatut(cancelTarget.id, 'cancelled')}
              >
                {saving
                  ? <ActivityIndicator size="small" color="#fff" />
                  : <Text style={{ fontSize: 14, fontWeight: '600', color: '#fff' }}>Annuler le RDV</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── No-show Confirm ── */}
      <Modal visible={!!noShowTarget} transparent animationType="fade" onRequestClose={() => setNoShowTarget(null)}>
        <View style={s.dialogBackdrop}>
          <View style={s.dialog}>
            <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: 'rgba(249,115,22,0.1)', alignItems: 'center', justifyContent: 'center', marginBottom: 12 }}>
              <Ionicons name="person-remove-outline" size={20} color="#ea580c" />
            </View>
            <Text style={s.dialogTitle}>Marquer comme absent</Text>
            <Text style={s.dialogMsg}>{noShowTarget ? clientName(noShowTarget) : ''} ne s'est pas présenté(e) ?</Text>
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 16 }}>
              <TouchableOpacity style={[s.dialogBtn, { flex: 1 }]} onPress={() => setNoShowTarget(null)}>
                <Text style={{ fontSize: 14, fontWeight: '600', color: '#374151' }}>Retour</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.dialogBtn, { flex: 1, backgroundColor: '#ea580c', borderColor: '#ea580c', opacity: saving ? 0.6 : 1 }]}
                disabled={saving}
                onPress={() => noShowTarget && updateStatut(noShowTarget.id, 'no_show')}
              >
                {saving
                  ? <ActivityIndicator size="small" color="#fff" />
                  : <Text style={{ fontSize: 14, fontWeight: '600', color: '#fff' }}>Confirmer absent</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

    </SafeAreaView>
  )
}

// ── Styles ────────────────────────────────────────────────────────
const s = StyleSheet.create({
  kpi:              { width: 160, backgroundColor: 'rgba(255,255,255,0.9)', borderRadius: 20, padding: 16, shadowColor: '#7c3aed', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.12, shadowRadius: 16, elevation: 6 },
  kpiLabel:         { fontSize: 10, fontWeight: '700', color: '#9ca3af', letterSpacing: 0.5, marginBottom: 8 },
  kpiValue:         { fontSize: 26, fontWeight: '800', color: '#7c3aed', lineHeight: 30, marginBottom: 4 },
  kpiSub:           { fontSize: 11, color: '#9ca3af' },
  card:             { backgroundColor: 'rgba(255,255,255,0.9)', borderRadius: 20, padding: 14, shadowColor: '#7c3aed', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.08, shadowRadius: 12, elevation: 4 },
  filterChip:       { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 999, backgroundColor: '#fff', borderWidth: 1, borderColor: 'rgba(124,58,237,0.2)' },
  filterChipActive: { backgroundColor: '#7c3aed', borderColor: '#7c3aed' },
  filterLabel:      { fontSize: 13, color: '#6b7280', fontWeight: '500' },
  filterLabelActive:{ color: '#fff', fontWeight: '600' },
  searchBar:        { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(124,58,237,0.06)', borderRadius: 999, paddingHorizontal: 14, paddingVertical: 10, borderWidth: 1, borderColor: 'rgba(124,58,237,0.12)' },
  exportBtn:        { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.8)', borderWidth: 1, borderColor: 'rgba(124,58,237,0.2)' },
  inlineBtn:        { width: 28, height: 28, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  fab:              { position: 'absolute', right: 18, bottom: 18, width: 56, height: 56, borderRadius: 28, backgroundColor: '#7c3aed', alignItems: 'center', justifyContent: 'center', shadowColor: '#7c3aed', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.35, shadowRadius: 12, elevation: 8 },
  dialogBackdrop:   { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', alignItems: 'center', justifyContent: 'center', padding: 20 },
  dialog:           { backgroundColor: '#fff', borderRadius: 20, padding: 20, width: '100%', maxWidth: 360 },
  dialogTitle:      { fontSize: 16, fontWeight: '700', color: '#111827', marginBottom: 6 },
  dialogMsg:        { fontSize: 14, color: '#6b7280' },
  dialogBtn:        { padding: 13, borderRadius: 12, alignItems: 'center', borderWidth: 1, borderColor: '#e5e7eb' },
  modalHeader:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, borderBottomWidth: 1, borderBottomColor: '#f3f4f6' },
  modalTitle:       { fontSize: 16, fontWeight: '700', color: '#111827' },
  sectionLabel:     { fontSize: 11, fontWeight: '700', color: '#9ca3af', letterSpacing: 0.5, marginBottom: 8 },
  infoBox:          { backgroundColor: 'rgba(124,58,237,0.04)', borderRadius: 14, padding: 14, borderWidth: 1, borderColor: 'rgba(124,58,237,0.08)', gap: 10 },
  divider:          { height: 1, backgroundColor: 'rgba(0,0,0,0.06)' },
  statMini:         { borderRadius: 12, padding: 10, alignItems: 'center' },
  statMiniVal:      { fontSize: 18, fontWeight: '800', lineHeight: 22 },
  statMiniLbl:      { fontSize: 11, color: '#9ca3af', marginTop: 2 },
  fieldLabel:       { fontSize: 13, fontWeight: '600', color: '#374151', marginBottom: 4 },
  input:            { backgroundColor: '#f9fafb', borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 10, paddingVertical: 11, paddingHorizontal: 14, fontSize: 14, color: '#111827' },
  chip:             { marginRight: 8, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20, backgroundColor: '#f3f4f6', borderWidth: 1, borderColor: '#e5e7eb' },
  chipActive:       { backgroundColor: '#7c3aed', borderColor: '#7c3aed' },
  chipLabel:        { fontSize: 12, fontWeight: '600', color: '#374151' },
  chipLabelActive:  { color: '#fff' },
  actionBig:        { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderRadius: 12, padding: 12 },
  actionSm:         { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10 },
})
