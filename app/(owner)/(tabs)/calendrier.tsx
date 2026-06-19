import { useEffect, useState, useRef, useCallback } from 'react'
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  Modal, TextInput, ActivityIndicator, Dimensions,
  KeyboardAvoidingView, Platform,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { supabase } from '../../../lib/supabase'
import { parseDate } from '../../../lib/parseDate'

const { width: SCREEN_W } = Dimensions.get('window')

const NETLIFY_URL = 'https://app.pixsellmedia.ca'

// ── Constants ────────────────────────────────────────────────────
const SLOT_H        = 44
const START_H       = 7
const END_H         = 22
const TOTAL_SLOTS   = (END_H - START_H) * 4
const GRID_H        = TOTAL_SLOTS * SLOT_H
const TIME_COL_WIDTH = 56
const COLUMN_WIDTH   = 200

// ── Types ────────────────────────────────────────────────────────
type Statut = 'pending' | 'confirmed' | 'completed' | 'cancelled' | 'no_show'

interface Resa {
  id: string
  client_id: string | null
  client_prenom: string | null
  client_nom: string | null
  client_telephone: string | null
  client_email: string | null
  service: string | null
  employee_id: string | null
  date_rdv: string
  heure_rdv: string
  duree_rdv: number | null
  prix: number | null
  statut: Statut
  cancel_token: string | null
  choix_direct?: boolean | null
  created_at?: string | null
}

interface Employe {
  id: string
  nom: string
  prenom?: string | null
  photo_url: string | null
  titre: string | null
  couleur_agenda: string | null
}

interface Svc {
  id: string
  nom: string
  prix: number
  duree_minutes: number
  couleur?: string | null
}

interface Cli {
  id: string
  prenom: string
  nom: string
  email: string
  telephone: string
}

interface RawAbsence {
  employe_id: string
  type_demande: string
  date_debut: string
  heure_debut: string | null
  date_fin: string
  heure_fin: string | null
}

// ── Status config ────────────────────────────────────────────────
const ST: Record<Statut, { label: string; bg: string; color: string }> = {
  pending:   { label: 'Confirmé',   bg: 'rgba(16,185,129,0.15)',  color: '#059669' },
  confirmed: { label: 'Confirmé',   bg: 'rgba(16,185,129,0.15)',  color: '#059669' },
  completed: { label: 'Passé',      bg: 'rgba(107,114,128,0.15)', color: '#6b7280' },
  cancelled: { label: 'Annulé',     bg: 'rgba(239,68,68,0.15)',   color: '#dc2626' },
  no_show:   { label: 'Absent',     bg: 'rgba(239,68,68,0.1)',    color: '#ef4444' },
}

const ABSENCE_CFG: Record<string, { emoji: string; label: string; bg: string; border: string; text: string }> = {
  conge:              { emoji: '🏖️', label: 'Congé',        bg: '#dbeafe', border: '#93c5fd', text: '#1e40af' },
  maladie:            { emoji: '🤒', label: 'Maladie',      bg: '#fee2e2', border: '#fca5a5', text: '#991b1b' },
  permission:         { emoji: '📋', label: 'Permission',   bg: '#fed7aa', border: '#fb923c', text: '#9a3412' },
  changement_horaire: { emoji: '🔄', label: 'Ch. horaire',  bg: '#e9d5ff', border: '#c084fc', text: '#6b21a8' },
  extra_shift:        { emoji: '➕', label: 'Extra',        bg: '#d1fae5', border: '#6ee7b7', text: '#065f46' },
  indisponible:       { emoji: '⛔', label: 'Indispo',      bg: '#f3f4f6', border: '#d1d5db', text: '#374151' },
}

const EMP_COLORS = ['#7c3aed', '#ec4899', '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4']

// ── Helpers ──────────────────────────────────────────────────────
const toMins = (t: string) => { const [h, m] = (t || '0:0').split(':').map(Number); return h * 60 + m }
const toTime = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
const todayISO = () => new Date().toLocaleDateString('en-CA')
const addDays = (d: string, n: number) => {
  const dt = parseDate(d); dt.setDate(dt.getDate() + n); return dt.toLocaleDateString('en-CA')
}
const fmtDate = (iso: string) =>
  parseDate(iso).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' })
const empColor = (emp: Employe | undefined, idx: number) =>
  emp?.couleur_agenda || EMP_COLORS[idx % EMP_COLORS.length]

// ── Main component ───────────────────────────────────────────────
export default function CalendrierScreen() {
  const [company, setCompany] = useState<{ id: string; couleur_service_enabled?: boolean | null } | null>(null)
  const [employes, setEmployes] = useState<Employe[]>([])
  const [services, setServices] = useState<Svc[]>([])
  const [resas, setResas] = useState<Resa[]>([])
  const [absences, setAbsences] = useState<RawAbsence[]>([])
  const [selectedDate, setSelectedDate] = useState(todayISO())
  const [viewMode, setViewMode] = useState<'day' | 'week'>('day')
  const [visibleEmpIds, setVisibleEmpIds] = useState<Set<string>>(new Set())
  const [weekEmpId, setWeekEmpId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [nowMins, setNowMins] = useState(() => { const n = new Date(); return n.getHours() * 60 + n.getMinutes() })

  // Create modal
  const [createModal, setCreateModal] = useState(false)
  const [createEmpId, setCreateEmpId] = useState('')
  const [createSvcId, setCreateSvcId] = useState('')
  const [createDate, setCreateDate] = useState(todayISO())
  const [createTime, setCreateTime] = useState('09:00')
  const [clientSearch, setClientSearch] = useState('')
  const [clientResults, setClientResults] = useState<Cli[]>([])
  const [selectedClient, setSelectedClient] = useState<Cli | null>(null)
  const [newClientMode, setNewClientMode] = useState(false)
  const [newPrenom, setNewPrenom] = useState('')
  const [newNom, setNewNom] = useState('')
  const [newTel, setNewTel] = useState('')
  const [newEmail, setNewEmail] = useState('')
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState('')

  // Detail modal
  const [detailResa, setDetailResa] = useState<Resa | null>(null)
  const [updating, setUpdating] = useState(false)
  const [editingResaId, setEditingResaId] = useState<string | null>(null)
  const [messageClient, setMessageClient] = useState('')

  const scrollRef = useRef<ScrollView>(null)

  // ── Load company ─────────────────────────────────────────────
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session?.user) return
      supabase.from('companies').select('id, couleur_service_enabled').eq('owner_email', session.user.email).single()
        .then(({ data }) => { if (data) setCompany(data) })
    })
  }, [])

  // ── Load employes + services ─────────────────────────────────
  useEffect(() => {
    if (!company) return
    Promise.all([
      supabase.from('employes').select('id, nom, prenom, photo_url, titre, couleur_agenda').eq('company_id', company.id).eq('actif', true).order('nom'),
      supabase.from('services_catalogue').select('id, nom, prix, duree_minutes, couleur').eq('company_id', company.id).eq('actif', true).order('ordre', { ascending: true }),
    ]).then(([{ data: emps }, { data: svcs }]) => {
      const empList = (emps ?? []) as Employe[]
      setEmployes(empList)
      setServices((svcs ?? []) as Svc[])
      setVisibleEmpIds(new Set(empList.map(e => e.id)))
      if (empList.length > 0) { setWeekEmpId(empList[0].id); setCreateEmpId(empList[0].id) }
    })
  }, [company?.id])

  // ── Load resas + absences ────────────────────────────────────
  const loadResas = useCallback(async () => {
    if (!company) return
    const dow = (parseDate(selectedDate).getDay() + 6) % 7
    const weekMon = addDays(selectedDate, -dow)
    const dateFrom = viewMode === 'week' ? weekMon : selectedDate
    const dateTo   = viewMode === 'week' ? addDays(weekMon, 6) : selectedDate

    const [{ data: resaData }, { data: absData }] = await Promise.all([
      supabase.from('reservations')
        .select('id, client_id, client_prenom, client_nom, client_telephone, client_email, service, employee_id, date_rdv, heure_rdv, duree_rdv, prix, statut, cancel_token, choix_direct, created_at')
        .eq('company_id', company.id)
        .gte('date_rdv', dateFrom).lte('date_rdv', dateTo)
        .order('heure_rdv'),
      supabase.from('employe_demandes_rh')
        .select('employe_id, type_demande, date_debut, heure_debut, date_fin, heure_fin')
        .eq('company_id', company.id).eq('statut', 'approuve')
        .lte('date_debut', dateTo).gte('date_fin', dateFrom),
    ])
    setResas((resaData ?? []) as Resa[])
    setAbsences((absData ?? []) as RawAbsence[])
    setLoading(false)
  }, [company?.id, selectedDate, viewMode])

  useEffect(() => { loadResas() }, [loadResas])

  // Auto-refresh every 60s
  useEffect(() => {
    const t = setInterval(loadResas, 60_000)
    return () => clearInterval(t)
  }, [loadResas])

  // Update now line every minute
  useEffect(() => {
    const t = setInterval(() => { const n = new Date(); setNowMins(n.getHours() * 60 + n.getMinutes()) }, 60_000)
    return () => clearInterval(t)
  }, [])

  // Scroll to now on load
  useEffect(() => {
    if (!loading) {
      const slot = Math.max(0, Math.floor((nowMins - START_H * 60) / 15) - 2)
      setTimeout(() => scrollRef.current?.scrollTo({ y: slot * SLOT_H, animated: true }), 400)
    }
  }, [loading])

  // ── Client search ────────────────────────────────────────────
  useEffect(() => {
    if (!company || clientSearch.length < 2) { setClientResults([]); return }
    const t = setTimeout(async () => {
      const { data } = await supabase.from('clients')
        .select('id, prenom, nom, email, telephone').eq('company_id', company.id)
        .or(`prenom.ilike.%${clientSearch}%,nom.ilike.%${clientSearch}%,telephone.ilike.%${clientSearch}%`).limit(8)
      setClientResults((data ?? []) as Cli[])
    }, 300)
    return () => clearTimeout(t)
  }, [clientSearch, company?.id])

  // ── Create RDV ───────────────────────────────────────────────
  const openCreate = (empId: string, slotIdx: number, date: string) => {
    const time = toTime(START_H * 60 + slotIdx * 15)
    setCreateEmpId(empId)
    setCreateDate(date)
    setCreateTime(time)
    setSelectedClient(null)
    setNewClientMode(false)
    setClientSearch('')
    setCreateSvcId(services[0]?.id ?? '')
    setCreateError('')
    setNewPrenom(''); setNewNom(''); setNewTel(''); setNewEmail('')
    setCreateModal(true)
  }

  const openEdit = (r: Resa) => {
    setCreateEmpId(r.employee_id ?? '')
    setCreateDate(r.date_rdv)
    setCreateTime(r.heure_rdv?.slice(0, 5) ?? '09:00')
    const svc = services.find(s => s.nom === r.service)
    setCreateSvcId(svc?.id ?? services[0]?.id ?? '')
    setSelectedClient(r.client_id ? {
      id: r.client_id,
      prenom: r.client_prenom ?? '',
      nom: r.client_nom ?? '',
      email: r.client_email ?? '',
      telephone: r.client_telephone ?? '',
    } : null)
    setNewClientMode(false)
    setCreateError('')
    setMessageClient('')
    setEditingResaId(r.id)
    setDetailResa(null)
    setCreateModal(true)
  }

  const handleCreate = async () => {
    if (!company || !createEmpId || !createSvcId || !createTime) { setCreateError('Employé, service et heure sont requis'); return }
    setCreating(true); setCreateError('')
    try {
      if (editingResaId) {
        const svc = services.find(s => s.id === createSvcId)
        const { error } = await supabase.from('reservations').update({
          employee_id: createEmpId,
          service: svc?.nom ?? null,
          prix: svc?.prix ?? 0,
          duree_rdv: svc?.duree_minutes ?? 30,
          date_rdv: createDate,
          heure_rdv: createTime,
          client_id: selectedClient?.id ?? null,
          client_prenom: selectedClient?.prenom ?? newPrenom ?? null,
          client_nom: selectedClient?.nom ?? newNom ?? null,
          client_telephone: selectedClient?.telephone ?? newTel ?? null,
          client_email: selectedClient?.email ?? newEmail ?? null,
        }).eq('id', editingResaId)
        if (error) { setCreateError(error.message); setCreating(false); return }
        fetch(`${NETLIFY_URL}/.netlify/functions/send-confirmation`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type:           'admin-modify',
            reservation_id: editingResaId,
            message_client: messageClient.trim() || null,
          }),
        }).catch(e => console.error('[send-confirmation] failed:', e))
        setEditingResaId(null)
        setCreateModal(false)
        loadResas()
        return
      }

      let clientId: string | null = null
      let clientPrenom: string | null = null
      let clientNom: string | null = null
      let clientTel: string | null = null
      let clientEmail: string | null = null

      if (selectedClient) {
        clientId = selectedClient.id; clientPrenom = selectedClient.prenom
        clientNom = selectedClient.nom; clientTel = selectedClient.telephone; clientEmail = selectedClient.email
      } else if (newClientMode) {
        if (!newPrenom) { setCreateError('Prénom requis'); setCreating(false); return }
        const { data: nc, error: ce } = await supabase.from('clients')
          .insert({ company_id: company.id, prenom: newPrenom, nom: newNom, email: newEmail, telephone: newTel, points_fidelite: 0, est_bloque: false })
          .select('id').single()
        if (ce || !nc) { setCreateError('Erreur création client'); setCreating(false); return }
        clientId = nc.id; clientPrenom = newPrenom; clientNom = newNom; clientTel = newTel; clientEmail = newEmail
      }

      const svc = services.find(s => s.id === createSvcId)
      const { error } = await supabase.from('reservations').insert({
        company_id: company.id, employee_id: createEmpId,
        client_id: clientId, client_prenom: clientPrenom, client_nom: clientNom,
        client_telephone: clientTel, client_email: clientEmail,
        service: svc?.nom ?? null, prix: svc?.prix ?? 0,
        duree_rdv: svc?.duree_minutes ?? 30,
        date_rdv: createDate, heure_rdv: createTime, statut: 'confirmed',
      })
      if (error) { setCreateError(error.message); setCreating(false); return }
      setCreateModal(false); loadResas()
    } catch (e) { setCreateError(e instanceof Error ? e.message : 'Erreur') }
    finally { setCreating(false) }
  }

  // ── Update statut ────────────────────────────────────────────
  const handleUpdateStatut = async (id: string, statut: Statut) => {
    setUpdating(true)
    await supabase.from('reservations').update({ statut }).eq('id', id)
    setUpdating(false)
    setDetailResa(r => r ? { ...r, statut } : r)
    loadResas()
  }

  // ── Render one employee column ───────────────────────────────
  const renderColumn = (emp: Employe, empIdx: number, date: string, colW: number) => {
    const color = empColor(emp, empIdx)
    const dayResas = resas.filter(r => r.employee_id === emp.id && r.date_rdv === date)
    const dayAbs   = absences
      .filter(a => a.employe_id === emp.id && a.date_debut <= date && a.date_fin >= date)
      .map(a => ({ type_demande: a.type_demande, heure_debut: a.heure_debut || '00:00', heure_fin: a.heure_fin || '23:59' }))

    return (
      <View key={`${emp.id}-${date}`} style={{ width: colW, height: GRID_H, position: 'relative' }}>
        {/* Grid slots */}
        {Array.from({ length: TOTAL_SLOTS }).map((_, i) => (
          <TouchableOpacity
            key={i}
            onPress={() => openCreate(emp.id, i, date)}
            style={{
              position: 'absolute', top: i * SLOT_H, left: 0, right: 0, height: SLOT_H,
              borderTopWidth: i % 4 === 0 ? 1 : 0.5,
              borderTopColor: i % 4 === 0 ? 'rgba(0,0,0,0.09)' : 'rgba(0,0,0,0.04)',
              borderRightWidth: 1, borderRightColor: 'rgba(0,0,0,0.05)',
            }}
          />
        ))}

        {/* Absence overlays */}
        {dayAbs.map((abs, ai) => {
          const cfg = ABSENCE_CFG[abs.type_demande] ?? ABSENCE_CFG.indisponible
          const top = Math.max(0, (toMins(abs.heure_debut) - START_H * 60) / 15 * SLOT_H)
          const bot = Math.min(GRID_H, (toMins(abs.heure_fin) - START_H * 60) / 15 * SLOT_H)
          const h = Math.max(8, bot - top)
          return (
            <View key={ai} style={{
              position: 'absolute', top, left: 2, right: 2, height: h,
              backgroundColor: cfg.bg, borderLeftWidth: 3, borderLeftColor: cfg.border,
              borderRadius: 4, opacity: 0.75, alignItems: 'center', justifyContent: 'center',
            }}>
              {h > 20 && <Text style={{ fontSize: 11, color: cfg.text, fontWeight: '600' }}>{cfg.emoji} {cfg.label}</Text>}
            </View>
          )
        })}

        {/* Reservations */}
        {dayResas.filter(r => r.statut !== 'cancelled').map(r => {
          const top          = (toMins(r.heure_rdv) - START_H * 60) / 15 * SLOT_H
          const h            = Math.max(SLOT_H, ((r.duree_rdv ?? 30) / 15) * SLOT_H)
          const st           = ST[r.statut]
          const showSvcColor = company?.couleur_service_enabled !== false
          const svcColor     = services.find(s => s.nom === r.service)?.couleur ?? null
          return (
            <TouchableOpacity key={r.id} onPress={() => setDetailResa(r)} style={{
              position: 'absolute', top: top + 1, left: 3, right: 3, height: h - 2,
              backgroundColor: showSvcColor && svcColor ? `${svcColor}18` : st.bg,
              borderLeftWidth: 3,
              borderLeftColor: showSvcColor && svcColor ? svcColor : color,
              borderRadius: 6, padding: 4, overflow: 'hidden',
            }}>
              <Text style={{ fontSize: 11, fontWeight: '700', color: '#111827' }} numberOfLines={1}>
                {[r.client_prenom, r.client_nom].filter(Boolean).join(' ') || '—'}{r.choix_direct ? ' ❤️' : ''}
              </Text>
              {h > 36 && <Text style={{ fontSize: 10, color: '#6b7280' }} numberOfLines={1}>{r.service}</Text>}
              {h > 52 && <Text style={{ fontSize: 10, color: '#9ca3af' }}>{r.heure_rdv?.slice(0, 5)}</Text>}
              {h > 68 && r.created_at && <Text style={{ fontSize: 9, color: '#9ca3af' }} numberOfLines={1}>📅 {new Date(r.created_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}</Text>}
            </TouchableOpacity>
          )
        })}

        {/* Now line */}
        {date === todayISO() && nowMins >= START_H * 60 && nowMins < END_H * 60 && (
          <View style={{
            position: 'absolute', top: (nowMins - START_H * 60) / 15 * SLOT_H,
            left: 0, right: 0, height: 2, backgroundColor: '#ef4444', zIndex: 20,
          }} />
        )}
      </View>
    )
  }

  // ── Week dates ───────────────────────────────────────────────
  const weekDates = (() => {
    const dow = (parseDate(selectedDate).getDay() + 6) % 7
    const mon = addDays(selectedDate, -dow)
    return Array.from({ length: 7 }, (_, i) => addDays(mon, i))
  })()

  const visibleEmps = employes.filter(e => visibleEmpIds.has(e.id))
  const weekEmp = employes.find(e => e.id === weekEmpId) ?? employes[0]
  const weekColW = (SCREEN_W - TIME_COL_WIDTH) / 7
  const dayVisibleCols = Math.min(visibleEmps.length || 1, 3)
  const DAY_COL_W = (SCREEN_W - TIME_COL_WIDTH - 16) / dayVisibleCols

  if (loading) return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#f5f3ff' }}>
      <ActivityIndicator size="large" color="#7c3aed" />
    </View>
  )

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#f5f3ff' }} edges={['top']}>

      {/* ── Top bar ── */}
      <View style={s.topBar}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <TouchableOpacity onPress={() => setSelectedDate(d => addDays(d, viewMode === 'week' ? -7 : -1))} style={s.navBtn}>
            <Ionicons name="chevron-back" size={16} color="#7c3aed" />
          </TouchableOpacity>
          <Text style={{ fontSize: 13, fontWeight: '600', color: '#111827', minWidth: 120, textAlign: 'center' }}>
            {viewMode === 'week'
              ? `${fmtDate(weekDates[0])} – ${fmtDate(weekDates[6])}`
              : fmtDate(selectedDate)}
          </Text>
          <TouchableOpacity onPress={() => setSelectedDate(d => addDays(d, viewMode === 'week' ? 7 : 1))} style={s.navBtn}>
            <Ionicons name="chevron-forward" size={16} color="#7c3aed" />
          </TouchableOpacity>
        </View>
        <View style={{ flexDirection: 'row', gap: 6 }}>
          <TouchableOpacity
            onPress={() => {
              setSelectedDate(todayISO())
              setTimeout(() => {
                const slot = Math.max(0, Math.floor((nowMins - START_H * 60) / 15) - 2)
                scrollRef.current?.scrollTo({ y: slot * SLOT_H, animated: true })
              }, 300)
            }}
            style={s.chipBtn}
          >
            <Text style={{ fontSize: 12, fontWeight: '600', color: '#7c3aed' }}>Aujourd'hui</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setViewMode(v => v === 'day' ? 'week' : 'day')} style={s.chipBtn}>
            <Text style={{ fontSize: 12, fontWeight: '600', color: '#7c3aed' }}>
              {viewMode === 'day' ? 'Semaine' : 'Jour'}
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* ── Employee filter / Week emp selector ── */}
      <ScrollView
        horizontal showsHorizontalScrollIndicator={false}
        style={{ flexGrow: 0, maxHeight: 46, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: 'rgba(0,0,0,0.06)' }}
        contentContainerStyle={{ paddingHorizontal: 12, paddingVertical: 7, gap: 8, alignItems: 'center' }}
      >
        {employes.map(emp => {
          const active = viewMode === 'day' ? visibleEmpIds.has(emp.id) : weekEmpId === emp.id
          const color  = emp.couleur_agenda || EMP_COLORS[employes.indexOf(emp) % EMP_COLORS.length]
          return (
            <TouchableOpacity
              key={emp.id}
              onPress={() => {
                if (viewMode === 'day') {
                  setVisibleEmpIds(prev => {
                    const next = new Set(prev)
                    if (next.has(emp.id)) { if (next.size > 1) next.delete(emp.id) } else next.add(emp.id)
                    return next
                  })
                } else {
                  setWeekEmpId(emp.id)
                }
              }}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20, backgroundColor: active ? color + '22' : '#f3f4f6', borderWidth: 1, borderColor: active ? color : '#e5e7eb' }}
            >
              {viewMode === 'day' && <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: active ? color : '#9ca3af' }} />}
              <Text style={{ fontSize: 12, fontWeight: '600', color: active ? color : '#9ca3af' }} numberOfLines={1}>{emp.nom}</Text>
            </TouchableOpacity>
          )
        })}
      </ScrollView>

      {/* ── Day view: single outer horizontal ScrollView keeps headers + columns in sync ── */}
      {viewMode === 'day' && (
        <View style={{ flex: 1 }}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={{ width: TIME_COL_WIDTH + visibleEmps.length * DAY_COL_W }}>

              {/* Employee headers — plain row, not a ScrollView */}
              <View style={{ flexDirection: 'row', backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: 'rgba(0,0,0,0.06)' }}>
                <View style={{ width: TIME_COL_WIDTH }} />
                {visibleEmps.map((emp, i) => {
                  const color = empColor(emp, i)
                  return (
                    <View key={emp.id} style={{ width: DAY_COL_W, padding: 8, alignItems: 'center', borderRightWidth: 1, borderRightColor: 'rgba(0,0,0,0.05)' }}>
                      <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: color, alignItems: 'center', justifyContent: 'center', marginBottom: 2 }}>
                        <Text style={{ color: '#fff', fontSize: 11, fontWeight: '700' }}>{emp.nom.slice(0, 2).toUpperCase()}</Text>
                      </View>
                      <Text style={{ fontSize: 11, fontWeight: '600', color: '#374151' }} numberOfLines={1}>{emp.nom}</Text>
                      {emp.titre ? <Text style={{ fontSize: 10, color: '#9ca3af' }} numberOfLines={1}>{emp.titre}</Text> : null}
                    </View>
                  )
                })}
              </View>

              {/* Time grid — vertical scroll only */}
              <ScrollView ref={scrollRef} showsVerticalScrollIndicator={false} nestedScrollEnabled>
                <View style={{ flexDirection: 'row', height: GRID_H }}>
                  <View style={{ width: TIME_COL_WIDTH }}>
                    {Array.from({ length: TOTAL_SLOTS }).map((_, i) => (
                      <View key={i} style={{ height: SLOT_H, justifyContent: 'flex-start', alignItems: 'flex-end', paddingRight: 6, paddingTop: 2 }}>
                        {i % 4 === 0 && <Text style={{ fontSize: 10, color: '#9ca3af', fontWeight: '500' }}>{toTime(START_H * 60 + i * 15)}</Text>}
                      </View>
                    ))}
                  </View>
                  {visibleEmps.map((emp, i) => renderColumn(emp, i, selectedDate, DAY_COL_W))}
                </View>
              </ScrollView>

            </View>
          </ScrollView>
        </View>
      )}

      {/* ── Week view ── */}
      {viewMode === 'week' && weekEmp && (
        <View style={{ flex: 1 }}>
          {/* Week column headers */}
          <View style={{ flexDirection: 'row', backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: 'rgba(0,0,0,0.06)' }}>
            <View style={{ width: TIME_COL_WIDTH }} />
            {weekDates.map(date => {
              const isToday = date === todayISO()
              const label = parseDate(date).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric' })
              return (
                <TouchableOpacity key={date} onPress={() => { setSelectedDate(date); setViewMode('day') }}
                  style={{ width: weekColW, padding: 8, alignItems: 'center', borderRightWidth: 1, borderRightColor: 'rgba(0,0,0,0.05)', backgroundColor: isToday ? 'rgba(124,58,237,0.05)' : 'transparent' }}>
                  <Text style={{ fontSize: 11, fontWeight: isToday ? '700' : '500', color: isToday ? '#7c3aed' : '#374151', textAlign: 'center' }}>{label}</Text>
                </TouchableOpacity>
              )
            })}
          </View>
          {/* Week time grid */}
          <ScrollView ref={scrollRef} style={{ flex: 1 }} showsVerticalScrollIndicator={false} nestedScrollEnabled>
            <View style={{ flexDirection: 'row', height: GRID_H }}>
              <View style={{ width: TIME_COL_WIDTH }}>
                {Array.from({ length: TOTAL_SLOTS }).map((_, i) => (
                  <View key={i} style={{ height: SLOT_H, justifyContent: 'flex-start', alignItems: 'flex-end', paddingRight: 6, paddingTop: 2 }}>
                    {i % 4 === 0 && <Text style={{ fontSize: 10, color: '#9ca3af', fontWeight: '500' }}>{toTime(START_H * 60 + i * 15)}</Text>}
                  </View>
                ))}
              </View>
              {weekDates.map(date => renderColumn(weekEmp, employes.indexOf(weekEmp), date, weekColW))}
            </View>
          </ScrollView>
        </View>
      )}

      {/* ── FAB ── */}
      <TouchableOpacity
        onPress={() => openCreate(visibleEmps[0]?.id ?? '', Math.max(0, Math.floor((nowMins - START_H * 60) / 15)), selectedDate)}
        style={s.fab}
      >
        <Ionicons name="add" size={26} color="#fff" />
      </TouchableOpacity>

      {/* ── Create RDV Modal ── */}
      <Modal key={editingResaId ?? 'create'} visible={createModal} animationType="slide" presentationStyle={Platform.OS === 'ios' ? 'pageSheet' : 'overFullScreen'} onRequestClose={() => { setCreateModal(false); setEditingResaId(null) }}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <SafeAreaView style={{ flex: 1, backgroundColor: '#fff' }} edges={['top', 'bottom']}>
            <View style={s.modalHeader}>
              <Text style={s.modalTitle}>{editingResaId ? 'Modifier le RDV' : 'Nouveau rendez-vous'}</Text>
              <TouchableOpacity onPress={() => { setCreateModal(false); setEditingResaId(null) }}><Ionicons name="close" size={22} color="#6b7280" /></TouchableOpacity>
            </View>
            <ScrollView contentContainerStyle={{ padding: 16, gap: 14 }}>
              {/* Date + Time */}
              <View style={{ flexDirection: 'row', gap: 12 }}>
                <View style={{ flex: 1 }}>
                  <Text style={s.fieldLabel}>Date</Text>
                  <TextInput style={s.input} value={createDate} onChangeText={setCreateDate} placeholder="YYYY-MM-DD" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.fieldLabel}>Heure</Text>
                  <TextInput style={s.input} value={createTime} onChangeText={setCreateTime} placeholder="HH:MM" />
                </View>
              </View>

              {/* Employee */}
              <View>
                <Text style={s.fieldLabel}>Employé</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 6 }}>
                  {employes.map(e => {
                    const active = createEmpId === e.id
                    const color  = e.couleur_agenda || EMP_COLORS[employes.indexOf(e) % EMP_COLORS.length]
                    return (
                      <TouchableOpacity key={e.id} onPress={() => setCreateEmpId(e.id)} style={{ marginRight: 8, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20, backgroundColor: active ? color : '#f3f4f6', borderWidth: 1, borderColor: active ? color : '#e5e7eb' }}>
                        <Text style={{ fontSize: 13, fontWeight: '600', color: active ? '#fff' : '#374151' }}>{e.nom}</Text>
                      </TouchableOpacity>
                    )
                  })}
                </ScrollView>
              </View>

              {/* Service */}
              <View>
                <Text style={s.fieldLabel}>Service</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 6 }}>
                  {services.map(sv => {
                    const active = createSvcId === sv.id
                    return (
                      <TouchableOpacity key={sv.id} onPress={() => setCreateSvcId(sv.id)} style={{ marginRight: 8, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20, backgroundColor: active ? '#7c3aed' : '#f3f4f6', borderWidth: 1, borderColor: active ? '#7c3aed' : '#e5e7eb' }}>
                        <Text style={{ fontSize: 12, fontWeight: '600', color: active ? '#fff' : '#374151' }}>{sv.nom} — {sv.prix} $</Text>
                      </TouchableOpacity>
                    )
                  })}
                </ScrollView>
              </View>

              {/* Client */}
              <View>
                <Text style={s.fieldLabel}>Client</Text>
                {selectedClient ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(124,58,237,0.08)', borderRadius: 10, padding: 10, gap: 10 }}>
                    <Text style={{ flex: 1, fontWeight: '600', color: '#7c3aed' }}>{selectedClient.prenom} {selectedClient.nom}</Text>
                    <TouchableOpacity onPress={() => setSelectedClient(null)}><Ionicons name="close-circle" size={18} color="#9ca3af" /></TouchableOpacity>
                  </View>
                ) : newClientMode ? (
                  <View style={{ gap: 10 }}>
                    <View style={{ flexDirection: 'row', gap: 8 }}>
                      <TextInput style={[s.input, { flex: 1 }]} value={newPrenom} onChangeText={setNewPrenom} placeholder="Prénom *" />
                      <TextInput style={[s.input, { flex: 1 }]} value={newNom} onChangeText={setNewNom} placeholder="Nom" />
                    </View>
                    <TextInput style={s.input} value={newTel} onChangeText={setNewTel} placeholder="Téléphone" keyboardType="phone-pad" />
                    <TextInput style={s.input} value={newEmail} onChangeText={setNewEmail} placeholder="Email" keyboardType="email-address" autoCapitalize="none" />
                    <TouchableOpacity onPress={() => setNewClientMode(false)}>
                      <Text style={{ fontSize: 13, color: '#7c3aed' }}>← Chercher un client existant</Text>
                    </TouchableOpacity>
                  </View>
                ) : (
                  <View>
                    <TextInput style={s.input} value={clientSearch} onChangeText={setClientSearch} placeholder="Nom, prénom ou téléphone…" />
                    {clientResults.length > 0 && (
                      <View style={{ backgroundColor: '#fff', borderRadius: 10, borderWidth: 1, borderColor: '#e5e7eb', marginTop: 4, maxHeight: 160 }}>
                        {clientResults.map(c => (
                          <TouchableOpacity key={c.id} onPress={() => { setSelectedClient(c); setClientSearch(''); setClientResults([]) }} style={{ padding: 10, borderBottomWidth: 1, borderBottomColor: '#f3f4f6' }}>
                            <Text style={{ fontWeight: '600', color: '#111827' }}>{c.prenom} {c.nom}</Text>
                            <Text style={{ fontSize: 12, color: '#9ca3af' }}>{c.telephone}</Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    )}
                    <TouchableOpacity style={{ marginTop: 8 }} onPress={() => setNewClientMode(true)}>
                      <Text style={{ fontSize: 13, color: '#7c3aed' }}>+ Nouveau client</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>

              {editingResaId ? (
                <View>
                  <Text style={s.fieldLabel}>Message au client (optionnel)</Text>
                  <TextInput
                    style={[s.input, { height: 80, textAlignVertical: 'top' }]}
                    value={messageClient}
                    onChangeText={t => setMessageClient(t.slice(0, 300))}
                    multiline
                    placeholder="Ex: Désolé pour ce changement..."
                    maxLength={300}
                  />
                  <Text style={{ fontSize: 11, color: '#9ca3af', textAlign: 'right', marginTop: 2 }}>{messageClient.length}/300</Text>
                </View>
              ) : null}

              {createError ? <Text style={{ color: '#dc2626', fontSize: 13 }}>{createError}</Text> : null}

              <TouchableOpacity onPress={handleCreate} disabled={creating} style={{ backgroundColor: '#7c3aed', borderRadius: 12, padding: 14, alignItems: 'center', opacity: creating ? 0.6 : 1, marginTop: 4 }}>
                {creating ? <ActivityIndicator color="#fff" size="small" /> : <Text style={{ color: '#fff', fontWeight: '700', fontSize: 15 }}>{editingResaId ? 'Enregistrer' : 'Créer le rendez-vous'}</Text>}
              </TouchableOpacity>
            </ScrollView>
          </SafeAreaView>
        </KeyboardAvoidingView>
      </Modal>

      {/* ── Detail RDV Modal ── */}
      <Modal visible={!!detailResa} animationType="slide" presentationStyle={Platform.OS === 'ios' ? 'pageSheet' : 'overFullScreen'} onRequestClose={() => setDetailResa(null)}>
        {detailResa && (
          <SafeAreaView style={{ flex: 1, backgroundColor: '#fff' }} edges={['top', 'bottom']}>
            <View style={s.modalHeader}>
              <Text style={s.modalTitle}>Détail rendez-vous</Text>
              <TouchableOpacity onPress={() => setDetailResa(null)}><Ionicons name="close" size={22} color="#6b7280" /></TouchableOpacity>
            </View>
            <ScrollView contentContainerStyle={{ padding: 16, gap: 10 }}>
              <View style={s.detailRow}><Ionicons name="person-outline" size={16} color="#7c3aed" /><Text style={s.detailText}>{[detailResa.client_prenom, detailResa.client_nom].filter(Boolean).join(' ') || 'Sans nom'}{detailResa.choix_direct ? ' ❤️' : ''}</Text></View>
              {detailResa.client_telephone && <View style={s.detailRow}><Ionicons name="call-outline" size={16} color="#7c3aed" /><Text style={s.detailText}>{detailResa.client_telephone}</Text></View>}
              {detailResa.client_email && <View style={s.detailRow}><Ionicons name="mail-outline" size={16} color="#7c3aed" /><Text style={s.detailText}>{detailResa.client_email}</Text></View>}
              <View style={s.detailRow}><Ionicons name="cut-outline" size={16} color="#7c3aed" /><Text style={s.detailText}>{detailResa.service || '—'}</Text></View>
              <View style={s.detailRow}><Ionicons name="time-outline" size={16} color="#7c3aed" /><Text style={s.detailText}>{detailResa.date_rdv} à {detailResa.heure_rdv?.slice(0, 5)} ({detailResa.duree_rdv ?? '?'} min)</Text></View>
              {detailResa.prix != null && <View style={s.detailRow}><Ionicons name="cash-outline" size={16} color="#7c3aed" /><Text style={s.detailText}>{detailResa.prix} $</Text></View>}
              <View style={s.detailRow}><Ionicons name="cut-sharp" size={16} color="#7c3aed" /><Text style={s.detailText}>✂️ {(() => { const emp = employes.find(e => e.id === detailResa.employee_id); return emp ? [emp.prenom, emp.nom].filter(Boolean).join(' ') : 'Non assigné' })()}</Text></View>
              {detailResa.created_at && <View style={s.detailRow}><Ionicons name="calendar-outline" size={16} color="#7c3aed" /><Text style={s.detailText}>📅 Réservé le {new Date(detailResa.created_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })} à {new Date(detailResa.created_at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</Text></View>}
              <View style={[s.detailRow, { marginTop: 4 }]}>
                <View style={{ backgroundColor: ST[detailResa.statut].bg, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 }}>
                  <Text style={{ fontSize: 12, fontWeight: '600', color: ST[detailResa.statut].color }}>{ST[detailResa.statut].label}</Text>
                </View>
              </View>

              <TouchableOpacity
                onPress={() => openEdit(detailResa)}
                style={{ backgroundColor: 'rgba(124,58,237,0.1)', borderRadius: 12, padding: 14, alignItems: 'center', marginBottom: 8, marginTop: 8 }}
              >
                <Text style={{ color: '#7c3aed', fontWeight: '700', fontSize: 15 }}>✏️ Modifier</Text>
              </TouchableOpacity>

              <View style={{ gap: 8 }}>
                {(detailResa.statut === 'pending' || detailResa.statut === 'confirmed') && (<>
                  <TouchableOpacity onPress={() => handleUpdateStatut(detailResa.id, 'completed')} disabled={updating} style={[s.actionBtn, { backgroundColor: 'rgba(107,114,128,0.1)', borderColor: '#e5e7eb' }]}>
                    <Text style={{ color: '#6b7280', fontWeight: '600' }}>Marquer passé</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => handleUpdateStatut(detailResa.id, 'no_show')} disabled={updating} style={[s.actionBtn, { backgroundColor: 'rgba(249,115,22,0.1)', borderColor: 'rgba(249,115,22,0.3)' }]}>
                    <Text style={{ color: '#ea580c', fontWeight: '600' }}>Absent (no-show)</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => handleUpdateStatut(detailResa.id, 'cancelled')} disabled={updating} style={[s.actionBtn, { backgroundColor: 'rgba(239,68,68,0.1)', borderColor: 'rgba(239,68,68,0.3)' }]}>
                    <Text style={{ color: '#dc2626', fontWeight: '600' }}>Annuler</Text>
                  </TouchableOpacity>
                </>)}
              </View>
            </ScrollView>
          </SafeAreaView>
        )}
      </Modal>

    </SafeAreaView>
  )
}

// ── Styles ───────────────────────────────────────────────────────
const s = StyleSheet.create({
  topBar:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, paddingVertical: 10, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: 'rgba(0,0,0,0.06)' },
  navBtn:     { width: 30, height: 30, borderRadius: 15, backgroundColor: 'rgba(124,58,237,0.1)', alignItems: 'center', justifyContent: 'center' },
  chipBtn:    { paddingHorizontal: 12, paddingVertical: 6, backgroundColor: 'rgba(124,58,237,0.1)', borderRadius: 20 },
  fab:        { position: 'absolute', right: 18, bottom: 18, width: 52, height: 52, borderRadius: 26, backgroundColor: '#7c3aed', alignItems: 'center', justifyContent: 'center', shadowColor: '#7c3aed', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.35, shadowRadius: 12, elevation: 8 },
  modalHeader:{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, borderBottomWidth: 1, borderBottomColor: '#f3f4f6' },
  modalTitle: { fontSize: 16, fontWeight: '700', color: '#111827' },
  fieldLabel: { fontSize: 13, fontWeight: '600', color: '#374151', marginBottom: 6 },
  input:      { backgroundColor: '#f9fafb', borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 10, paddingVertical: 11, paddingHorizontal: 14, fontSize: 14, color: '#111827' },
  detailRow:  { flexDirection: 'row', alignItems: 'center', gap: 10 },
  detailText: { fontSize: 14, color: '#374151', flex: 1 },
  actionBtn:  { borderRadius: 10, padding: 12, alignItems: 'center', borderWidth: 1 },
})
