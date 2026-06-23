import { useEffect, useState, useMemo, useCallback } from 'react'
import {
  View, Text, ScrollView, TouchableOpacity, TextInput, Modal,
  StyleSheet, ActivityIndicator, Switch, FlatList, Platform,
  KeyboardAvoidingView, Alert,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { supabase } from '../../../lib/supabase'
import type { Company } from '../../../lib/types'
import { useOwnerContext } from '../../../lib/ownerContext'

// ── Types ──────────────────────────────────────────────────────────────────────

type TabId = 'calendrier' | 'horaires' | 'demandes' | 'feries'
type StatutJour = 'travaille' | 'conge' | 'maladie' | 'permission' | 'formation' | 'indisponible'
type TypeDemande = 'conge' | 'maladie' | 'permission' | 'changement_horaire' | 'extra_shift' | 'document_administratif'
type JourKey = 'dim' | 'lun' | 'mar' | 'mer' | 'jeu' | 'ven' | 'sam'

interface Employe { id: string; nom: string; photo_url: string | null; couleur_agenda?: string | null }
interface Pause {
  id: string
  debut: string
  fin: string
  type: 'recurrente' | 'ponctuelle'
  dates: string[] | null
}
interface PauseModalState {
  empId: string
  jour: JourKey
  debut: string
  fin: string
  type: 'recurrente' | 'ponctuelle'
  dates: string[]
}
interface JourHoraire { actif: boolean; debut: string; fin: string; pauses: Pause[] }
interface Exception { id: string; debut: string; debut_heure: string; fin: string; fin_heure: string; raison: string }
interface Override {
  id:     string
  date:   string
  debut:  string
  fin:    string
  actif:  boolean
  raison: string
}
interface JourFerie {
  id: string; company_id: string
  date: string; nom: string; est_auto: boolean
}
interface Fermeture {
  id: string; ferie_id: string
  employe_id: string | null
}
type WeeklyHoraires = Record<JourKey, JourHoraire>
interface EmpData { horaires: WeeklyHoraires; exceptions: Exception[]; overrides: Override[]; dirty: boolean; saving: boolean }
interface StatutRow { id: string; employe_id: string; date_statut: string; statut: StatutJour; note: string | null }
interface DemandeRow {
  id: string; employe_id: string; type_demande: TypeDemande
  date_debut: string; heure_debut: string | null; date_fin: string; heure_fin: string | null
  motif: string | null; statut: 'en_attente' | 'approuve' | 'refuse' | 'annule'
  commentaire_manager: string | null; type_document?: string | null
  date_souhaitee?: string | null; note_manager?: string | null; created_at: string
}
interface SoldeVacances {
  employe_id: string; nom: string; prenom: string | null
  jours_vacances_annuels: number; jours_utilises: number; jours_restants: number
}

// ── Constants ──────────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<StatutJour, { label: string; emoji: string; bg: string; color: string }> = {
  travaille:    { label: 'Travaille',    emoji: '✅', bg: 'rgba(16,185,129,0.12)',  color: '#059669' },
  conge:        { label: 'Congé',        emoji: '🏖️', bg: 'rgba(59,130,246,0.12)', color: '#1d4ed8' },
  maladie:      { label: 'Maladie',      emoji: '🤒', bg: 'rgba(239,68,68,0.12)',  color: '#dc2626' },
  permission:   { label: 'Permission',   emoji: '📋', bg: 'rgba(245,158,11,0.12)', color: '#b45309' },
  formation:    { label: 'Formation',    emoji: '📚', bg: 'rgba(139,92,246,0.12)', color: '#7c3aed' },
  indisponible: { label: 'Indisponible', emoji: '⛔', bg: 'rgba(107,114,128,0.12)', color: '#6b7280' },
}

const TYPE_DEMANDE_LABELS: Record<TypeDemande, string> = {
  conge: 'Congé', maladie: 'Arrêt maladie', permission: 'Permission',
  changement_horaire: 'Changement horaire', extra_shift: 'Extra / Shift supplémentaire',
  document_administratif: 'Document administratif',
}

const JOURS: { key: JourKey; label: string }[] = [
  { key: 'dim', label: 'Dimanche' }, { key: 'lun', label: 'Lundi' },
  { key: 'mar', label: 'Mardi' },   { key: 'mer', label: 'Mercredi' },
  { key: 'jeu', label: 'Jeudi' },   { key: 'ven', label: 'Vendredi' },
  { key: 'sam', label: 'Samedi' },
]

const DAY_LABELS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim']

const EMP_COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#06B6D4', '#84CC16', '#F97316']

const MODELES = [
  { id: 'temps_plein', label: 'Lun–Ven' },
  { id: 'matins', label: 'Matins 9h–13h' },
  { id: 'apres_midis', label: 'Après-midis 13h–18h' },
  { id: 'weekends', label: 'Weekends' },
]

const TABS: { id: TabId; label: string }[] = [
  { id: 'calendrier', label: '📅 Calendrier' },
  { id: 'horaires',   label: '🕐 Horaires' },
  { id: 'demandes',   label: '📋 Demandes RH' },
  { id: 'feries',     label: '🎌 Fériés' },
]

const STATUTS_LIST = Object.entries(STATUS_CONFIG) as [StatutJour, typeof STATUS_CONFIG[StatutJour]][]
const TYPE_DEMANDE_OPTIONS = Object.entries(TYPE_DEMANDE_LABELS) as [TypeDemande, string][]

// ── Helpers ────────────────────────────────────────────────────────────────────

function todayISO() { return new Date().toLocaleDateString('en-CA') }
const uid = () => Math.random().toString(36).slice(2)

const JOUR_TO_DOW: Record<JourKey, number> = {
  dim: 0, lun: 1, mar: 2, mer: 3, jeu: 4, ven: 5, sam: 6,
}

function getUpcomingDates(jourKey: JourKey, tz: string, count = 12): string[] {
  const dow = JOUR_TO_DOW[jourKey]
  const todayStr = new Date().toLocaleDateString('en-CA', { timeZone: tz })
  const d = new Date(todayStr + 'T12:00:00')
  while (d.getDay() !== dow) d.setDate(d.getDate() + 1)
  const result: string[] = []
  for (let i = 0; i < count; i++) {
    result.push(d.toLocaleDateString('en-CA'))
    d.setDate(d.getDate() + 7)
  }
  return result
}

function getWeekStart(d: Date): Date {
  const dow = d.getDay()
  const diff = dow === 0 ? -6 : 1 - dow
  const start = new Date(d)
  start.setDate(d.getDate() + diff)
  start.setHours(0, 0, 0, 0)
  return start
}

function getWeekDates(weekStart: Date): string[] {
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart)
    d.setDate(weekStart.getDate() + i)
    return d.toLocaleDateString('en-CA')
  })
}

function formatWeekRange(weekStart: Date): string {
  const end = new Date(weekStart)
  end.setDate(weekStart.getDate() + 6)
  const opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short' }
  return `${weekStart.toLocaleDateString('fr-FR', opts)} – ${end.toLocaleDateString('fr-FR', opts)}`
}

function getDatesInRange(debut: string, fin: string): string[] {
  const dates: string[] = []
  const cur = new Date(debut + 'T12:00:00')
  const end = new Date(fin + 'T12:00:00')
  while (cur <= end) {
    dates.push(cur.toLocaleDateString('en-CA'))
    cur.setDate(cur.getDate() + 1)
  }
  return dates
}

function parseHoraires(raw: Record<string, unknown> | null): WeeklyHoraires {
  const keys: JourKey[] = ['dim', 'lun', 'mar', 'mer', 'jeu', 'ven', 'sam']
  return Object.fromEntries(keys.map(k => {
    const d = (raw?.[k] ?? {}) as Partial<JourHoraire & { pauses: Partial<Pause>[] }>
    return [k, {
      actif: d.actif ?? (k !== 'dim' && k !== 'sam'),
      debut: d.debut ?? '09:00', fin: d.fin ?? '18:00',
      pauses: (d.pauses ?? []).map(p => ({
        id:    p.id    ?? uid(),
        debut: p.debut ?? '12:00',
        fin:   p.fin   ?? '13:00',
        type:  (p as Partial<Pause>).type  ?? 'recurrente',
        dates: (p as Partial<Pause>).dates ?? null,
      })),
    }]
  })) as WeeklyHoraires
}

function parseExceptions(raw: unknown[]): Exception[] {
  return (raw ?? []).map((e) => {
    const ex = e as Partial<Exception>
    return {
      id:          ex.id          ?? uid(),
      debut:       ex.debut       ?? '',
      debut_heure: ex.debut_heure ?? '00:00',
      fin:         ex.fin         ?? '',
      fin_heure:   ex.fin_heure   ?? '23:59',
      raison:      ex.raison      ?? '',
    }
  })
}

function parseOverrides(raw: unknown[]): Override[] {
  return (raw ?? []).map((o) => {
    const ov = o as Partial<Override>
    return {
      id:     ov.id     ?? uid(),
      date:   ov.date   ?? '',
      debut:  ov.debut  ?? '09:00',
      fin:    ov.fin    ?? '17:00',
      actif:  ov.actif  ?? true,
      raison: ov.raison ?? '',
    }
  })
}

function getFeriesQuebec(year: number): Array<{ date: string; nom: string }> {
  function getPaques(y: number): Date {
    const a = y % 19
    const b = Math.floor(y / 100)
    const c = y % 100
    const d = Math.floor(b / 4)
    const e = b % 4
    const f = Math.floor((b + 8) / 25)
    const g = Math.floor((b - f + 1) / 3)
    const h = (19 * a + b - d - g + 15) % 30
    const i = Math.floor(c / 4)
    const k = c % 4
    const l = (32 + 2 * e + 2 * i - h - k) % 7
    const m = Math.floor((a + 11 * h + 22 * l) / 451)
    const month = Math.floor((h + l - 7 * m + 114) / 31)
    const day = ((h + l - 7 * m + 114) % 31) + 1
    return new Date(y, month - 1, day)
  }
  function fmt(d: Date): string {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  }
  function addDays(d: Date, n: number): Date {
    const r = new Date(d); r.setDate(r.getDate() + n); return r
  }
  function nthMonday(y: number, month: number, n: number): Date {
    const d = new Date(y, month - 1, 1)
    const dow = d.getDay()
    const first = dow === 1 ? d : new Date(y, month - 1, 1 + (8 - dow) % 7)
    return new Date(y, month - 1, first.getDate() + (n - 1) * 7)
  }
  function lastMondayBefore(y: number, month: number, day: number): Date {
    const ref = new Date(y, month - 1, day)
    const dow = ref.getDay()
    const diff = dow === 1 ? 0 : (dow === 0 ? 6 : dow - 1)
    return new Date(y, month - 1, day - diff)
  }
  const paques = getPaques(year)
  return [
    { date: `${year}-01-01`, nom: "Jour de l'An" },
    { date: fmt(addDays(paques, -2)), nom: 'Vendredi Saint' },
    { date: fmt(addDays(paques, 1)),  nom: 'Lundi de Pâques' },
    { date: fmt(lastMondayBefore(year, 5, 25)), nom: 'Fête des Patriotes' },
    { date: `${year}-06-24`, nom: 'Fête Nationale du Québec' },
    { date: `${year}-07-01`, nom: 'Fête du Canada' },
    { date: fmt(nthMonday(year, 9, 1)), nom: 'Fête du Travail' },
    { date: fmt(nthMonday(year, 10, 2)), nom: "Action de Grâce" },
    { date: `${year}-12-25`, nom: 'Noël' },
    { date: `${year}-12-26`, nom: 'Lendemain de Noël' },
  ].sort((a, b) => a.date.localeCompare(b.date))
}

const DEFAULT_HORAIRES: WeeklyHoraires = {
  dim: { actif: false, debut: '09:00', fin: '18:00', pauses: [] },
  lun: { actif: true,  debut: '09:00', fin: '18:00', pauses: [] },
  mar: { actif: true,  debut: '09:00', fin: '18:00', pauses: [] },
  mer: { actif: true,  debut: '09:00', fin: '18:00', pauses: [] },
  jeu: { actif: true,  debut: '09:00', fin: '18:00', pauses: [] },
  ven: { actif: true,  debut: '09:00', fin: '18:00', pauses: [] },
  sam: { actif: false, debut: '09:00', fin: '18:00', pauses: [] },
}

function formatDate(iso: string | undefined): string {
  if (!iso) return ''
  const d = new Date(iso + 'T12:00:00')
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })
}

function empColor(emp: Employe, index: number): string {
  return emp.couleur_agenda ?? EMP_COLORS[index % EMP_COLORS.length]
}

function initials(nom: string): string {
  return nom.split(' ').map(w => w[0] ?? '').join('').toUpperCase().slice(0, 2) || '?'
}

function applyModeleToHoraires(id: string, horaires: WeeklyHoraires): WeeklyHoraires {
  const h: WeeklyHoraires = JSON.parse(JSON.stringify(horaires))
  if (id === 'temps_plein') {
    const keys: JourKey[] = ['lun', 'mar', 'mer', 'jeu', 'ven']
    keys.forEach(k => { h[k].actif = true; h[k].debut = '09:00'; h[k].fin = '18:00' })
    h.sam.actif = false; h.dim.actif = false
  } else if (id === 'matins') {
    const keys: JourKey[] = ['lun', 'mar', 'mer', 'jeu', 'ven']
    keys.forEach(k => { h[k].actif = true; h[k].debut = '09:00'; h[k].fin = '13:00' })
    h.sam.actif = false; h.dim.actif = false
  } else if (id === 'apres_midis') {
    const keys: JourKey[] = ['lun', 'mar', 'mer', 'jeu', 'ven']
    keys.forEach(k => { h[k].actif = true; h[k].debut = '13:00'; h[k].fin = '18:00' })
    h.sam.actif = false; h.dim.actif = false
  } else if (id === 'weekends') {
    const wk: JourKey[] = ['lun', 'mar', 'mer', 'jeu', 'ven']
    wk.forEach(k => { h[k].actif = false })
    h.sam.actif = true; h.sam.debut = '09:00'; h.sam.fin = '18:00'
    h.dim.actif = true; h.dim.debut = '09:00'; h.dim.fin = '18:00'
  }
  return h
}

// ── Avatar component ───────────────────────────────────────────────────────────

function Avatar({ emp, size = 32, index = 0 }: { emp: Employe; size?: number; index?: number }) {
  const color = empColor(emp, index)
  return (
    <View style={{
      width: size, height: size, borderRadius: size / 2,
      backgroundColor: color + '22', borderWidth: 2, borderColor: color,
      alignItems: 'center', justifyContent: 'center',
    }}>
      <Text style={{ fontSize: size * 0.35, fontWeight: '800', color }}>{initials(emp.nom)}</Text>
    </View>
  )
}

// ── Main Component ─────────────────────────────────────────────────────────────

export default function AgendaCollabScreen() {
  const { company } = useOwnerContext()
  const [tab, setTab]           = useState<TabId>('calendrier')
  const [loading, setLoading]   = useState(true)

  // Data
  const [employes, setEmployes]     = useState<Employe[]>([])
  const [empData, setEmpData]       = useState<Record<string, EmpData>>({})
  const [statuts, setStatuts]       = useState<StatutRow[]>([])
  const [demandes, setDemandes]     = useState<DemandeRow[]>([])
  const [soldes, setSoldes]         = useState<SoldeVacances[]>([])

  // Calendrier state
  const [weekStart, setWeekStart]   = useState(() => getWeekStart(new Date()))
  const weekDates                    = useMemo(() => getWeekDates(weekStart), [weekStart])
  const today                        = todayISO()

  // Popup statut
  const [popup, setPopup] = useState<{ empId: string; date: string; current: StatutJour | null } | null>(null)
  const [popupNote, setPopupNote]   = useState('')
  const [popupSaving, setPopupSaving] = useState(false)

  // Demandes RH form
  const [formEmpId, setFormEmpId]       = useState('')
  const [formType, setFormType]         = useState<TypeDemande>('conge')
  const [formDebut, setFormDebut]       = useState(todayISO())
  const [formFin, setFormFin]           = useState(todayISO())
  const [formHeureDebut, setFormHeureDebut] = useState('')
  const [formHeureFin, setFormHeureFin]     = useState('')
  const [formMotif, setFormMotif]       = useState('')
  const [formSaving, setFormSaving]     = useState(false)

  // Message / gratif
  const [msgEmpId, setMsgEmpId]   = useState('')
  const [msgText, setMsgText]     = useState('')
  const [msgSaving, setMsgSaving] = useState(false)
  const [gratEmpId, setGratEmpId] = useState('')
  const [gratType, setGratType]   = useState<'prime' | 'bonus' | 'recompense'>('prime')
  const [gratMontant, setGratMontant] = useState('')
  const [gratMsg, setGratMsg]     = useState('')
  const [gratSaving, setGratSaving] = useState(false)

  const [pauseModal, setPauseModal] = useState<PauseModalState | null>(null)

  // Sélection multiple calendrier
  const [selectedCells, setSelectedCells] = useState<{ empId: string; date: string }[]>([])
  const [selectionEmpId, setSelectionEmpId] = useState<string | null>(null)
  const [multiPopup, setMultiPopup] = useState(false)
  const [multiPopupNote, setMultiPopupNote] = useState('')

  // Approbation/refus modals
  const [approuverTarget, setApprouverTarget] = useState<DemandeRow | null>(null)
  const [refuserTarget, setRefuserTarget]     = useState<DemandeRow | null>(null)
  const [approNote, setApprNote]     = useState('')
  const [refusMotif, setRefusMotif]  = useState('')
  const [actionSaving, setActionSaving] = useState(false)

  // P3 — Jours fériés
  const [feries, setFeries]             = useState<JourFerie[]>([])
  const [fermetures, setFermetures]     = useState<Fermeture[]>([])
  const [feriesAnnee, setFeriesAnnee]   = useState(new Date().getFullYear())

  // ── Load ──────────────────────────────────────────────────────────
  useEffect(() => { if (company) loadAll() }, [company?.id])
  useEffect(() => { if (company) loadStatuts() }, [company?.id, weekDates])

  async function loadAll() {
    setLoading(true)
    const cid = company!.id
    const [{ data: emps }, { data: horairesRows }, { data: demandesRows }, { data: soldesRows }] = await Promise.all([
      supabase.from('employes').select('id, nom, photo_url, couleur_agenda').eq('company_id', cid).eq('actif', true).order('nom'),
      supabase.from('employe_horaires').select('employe_id, horaires, exceptions, overrides').eq('company_id', cid),
      supabase.from('employe_demandes_rh').select('*').eq('company_id', cid).order('created_at', { ascending: false }),
      supabase.from('v_employe_solde_vacances').select('employe_id, nom, prenom, jours_vacances_annuels, jours_utilises, jours_restants').eq('company_id', cid),
    ])
    const empList = (emps ?? []) as Employe[]
    setEmployes(empList)
    setDemandes((demandesRows ?? []) as DemandeRow[])
    setSoldes((soldesRows ?? []) as SoldeVacances[])
    // Build empData
    const map: Record<string, EmpData> = {}
    empList.forEach(emp => {
      const row = (horairesRows ?? []).find((r: { employe_id: string }) => r.employe_id === emp.id) as
        { employe_id: string; horaires: Record<string, unknown> | null; exceptions: unknown[] | null; overrides?: unknown[] } | undefined
      map[emp.id] = {
        horaires:   parseHoraires(row?.horaires ?? null),
        exceptions: parseExceptions(row?.exceptions ?? []),
        overrides:  parseOverrides(row?.overrides ?? []),
        dirty: false, saving: false,
      }
    })
    setEmpData(map)
    if (empList.length > 0) { setFormEmpId(empList[0].id); setMsgEmpId(empList[0].id); setGratEmpId(empList[0].id) }
    setLoading(false)
  }

  async function loadStatuts() {
    if (!company || weekDates.length < 7) return
    const { data } = await supabase
      .from('employe_statuts_jour')
      .select('id, employe_id, date_statut, statut, note')
      .eq('company_id', company.id)
      .gte('date_statut', weekDates[0])
      .lte('date_statut', weekDates[6])
    setStatuts((data ?? []) as StatutRow[])
  }

  // statutsMap[empId][date] = StatutJour
  const statutsMap = useMemo(() => {
    const m: Record<string, Record<string, StatutJour>> = {}
    statuts.forEach(s => {
      if (!m[s.employe_id]) m[s.employe_id] = {}
      m[s.employe_id][s.date_statut] = s.statut
    })
    return m
  }, [statuts])

  // Alertes sous-effectif : jours où tous les actifs sont absents
  const alertesConflits = useMemo(() => {
    return weekDates.filter(date => {
      if (employes.length === 0) return false
      return employes.every(emp => {
        const st = statutsMap[emp.id]?.[date]
        return st && st !== 'travaille'
      })
    })
  }, [weekDates, employes, statutsMap])

  // ── Popup statut ──────────────────────────────────────────────────

  function openPopup(empId: string, date: string, current: StatutJour | null) {
    const row = statuts.find(s => s.employe_id === empId && s.date_statut === date)
    setPopup({ empId, date, current })
    setPopupNote(row?.note ?? '')
  }

  async function setStatut(empId: string, date: string, statut: StatutJour | null, note: string) {
    if (!company) return
    setPopupSaving(true)
    if (statut === null) {
      await supabase.from('employe_statuts_jour').delete()
        .eq('company_id', company.id).eq('employe_id', empId).eq('date_statut', date)
      setStatuts(prev => prev.filter(s => !(s.employe_id === empId && s.date_statut === date)))
    } else {
      await supabase.from('employe_statuts_jour').upsert(
        { company_id: company.id, employe_id: empId, date_statut: date, statut, note: note || null },
        { onConflict: 'employe_id,date_statut' }
      )
      setStatuts(prev => {
        const filtered = prev.filter(s => !(s.employe_id === empId && s.date_statut === date))
        return [...filtered, { id: uid(), employe_id: empId, date_statut: date, statut, note: note || null }]
      })
    }
    setPopupSaving(false)
    setPopup(null)
  }

  // ── Horaires ──────────────────────────────────────────────────────

  function setHoraireField(empId: string, jour: JourKey, field: 'debut' | 'fin', value: string) {
    setEmpData(prev => {
      const d = { ...prev[empId] }
      d.horaires = { ...d.horaires, [jour]: { ...d.horaires[jour], [field]: value } }
      d.dirty = true
      return { ...prev, [empId]: d }
    })
  }

  function toggleJour(empId: string, jour: JourKey) {
    setEmpData(prev => {
      const d = { ...prev[empId] }
      d.horaires = { ...d.horaires, [jour]: { ...d.horaires[jour], actif: !d.horaires[jour].actif } }
      d.dirty = true
      return { ...prev, [empId]: d }
    })
  }

  function applyModele(empId: string, modeleId: string) {
    setEmpData(prev => {
      const d = { ...prev[empId] }
      d.horaires = applyModeleToHoraires(modeleId, d.horaires)
      d.dirty = true
      return { ...prev, [empId]: d }
    })
  }

  function openPauseModal(empId: string, jour: JourKey) {
    setPauseModal({ empId, jour, debut: '12:00', fin: '13:00', type: 'recurrente', dates: [] })
  }

  function confirmAddPause() {
    if (!pauseModal) return
    const { empId, jour, debut, fin, type, dates } = pauseModal
    setEmpData(prev => {
      const d = { ...prev[empId] }
      const pauses = [...d.horaires[jour].pauses, {
        id: uid(), debut, fin,
        type,
        dates: type === 'ponctuelle' ? dates : null,
      }]
      d.horaires = { ...d.horaires, [jour]: { ...d.horaires[jour], pauses } }
      d.dirty = true
      return { ...prev, [empId]: d }
    })
    setPauseModal(null)
  }

  function removePause(empId: string, jour: JourKey, pauseId: string) {
    setEmpData(prev => {
      const d = { ...prev[empId] }
      const pauses = d.horaires[jour].pauses.filter(p => p.id !== pauseId)
      d.horaires = { ...d.horaires, [jour]: { ...d.horaires[jour], pauses } }
      d.dirty = true
      return { ...prev, [empId]: d }
    })
  }

  function setPauseField(empId: string, jour: JourKey, pauseId: string, field: 'debut' | 'fin', value: string) {
    setEmpData(prev => {
      const d = { ...prev[empId] }
      const pauses = d.horaires[jour].pauses.map(p => p.id === pauseId ? { ...p, [field]: value } : p)
      d.horaires = { ...d.horaires, [jour]: { ...d.horaires[jour], pauses } }
      d.dirty = true
      return { ...prev, [empId]: d }
    })
  }

  function addException(empId: string) {
    setEmpData(prev => {
      const d = { ...prev[empId] }
      d.exceptions = [...d.exceptions, { id: uid(), debut: todayISO(), debut_heure: '00:00', fin: todayISO(), fin_heure: '23:59', raison: '' }]
      d.dirty = true
      return { ...prev, [empId]: d }
    })
  }

  function removeException(empId: string, exId: string) {
    setEmpData(prev => {
      const d = { ...prev[empId] }
      d.exceptions = d.exceptions.filter(e => e.id !== exId)
      d.dirty = true
      return { ...prev, [empId]: d }
    })
  }

  function setExceptionField(empId: string, exId: string, field: 'debut' | 'debut_heure' | 'fin' | 'fin_heure' | 'raison', value: string) {
    setEmpData(prev => {
      const d = { ...prev[empId] }
      d.exceptions = d.exceptions.map(e => e.id === exId ? { ...e, [field]: value } : e)
      d.dirty = true
      return { ...prev, [empId]: d }
    })
  }

  async function saveHoraires(empId: string) {
    if (!company) return
    setEmpData(prev => ({ ...prev, [empId]: { ...prev[empId], saving: true } }))
    const data = empData[empId]
    await supabase.from('employe_horaires').upsert(
      { company_id: company.id, employe_id: empId, horaires: data.horaires, exceptions: data.exceptions, overrides: data.overrides },
      { onConflict: 'company_id,employe_id' }
    )
    setEmpData(prev => ({ ...prev, [empId]: { ...prev[empId], dirty: false, saving: false } }))
  }

  // ── Demandes RH ───────────────────────────────────────────────────

  async function handleSubmitDemande() {
    if (!company || !formEmpId) return
    setFormSaving(true)
    await supabase.from('employe_demandes_rh').insert({
      company_id: company.id, employe_id: formEmpId, type_demande: formType,
      date_debut: formDebut, heure_debut: formHeureDebut || null,
      date_fin: formFin, heure_fin: formHeureFin || null,
      motif: formMotif || null, statut: 'en_attente',
    })
    const { data } = await supabase
      .from('employe_demandes_rh').select('*').eq('company_id', company.id).order('created_at', { ascending: false })
    setDemandes((data ?? []) as DemandeRow[])
    setFormMotif('')
    setFormSaving(false)
  }

  async function handleApprouver() {
    if (!company || !approuverTarget) return
    setActionSaving(true)
    const d = approuverTarget
    await supabase.from('employe_demandes_rh').update({ statut: 'approuve', commentaire_manager: approNote || null }).eq('id', d.id)
    if (d.type_demande !== 'document_administratif') {
      const statutCree: StatutJour =
        d.type_demande === 'conge' ? 'conge'
        : d.type_demande === 'maladie' ? 'maladie'
        : d.type_demande === 'permission' ? 'permission'
        : 'indisponible'
      const dates = getDatesInRange(d.date_debut, d.date_fin)
      await supabase.from('employe_statuts_jour').upsert(
        dates.map(date => ({ company_id: company.id, employe_id: d.employe_id, date_statut: date, statut: statutCree, note: 'Demande approuvée' })),
        { onConflict: 'employe_id,date_statut' }
      )
    }
    setDemandes(prev => prev.map(r => r.id === d.id ? { ...r, statut: 'approuve' } : r))
    setApprouverTarget(null)
    setApprNote('')
    setActionSaving(false)
    loadStatuts()
  }

  async function handleRefuser() {
    if (!company || !refuserTarget || !refusMotif.trim()) return
    setActionSaving(true)
    await supabase.from('employe_demandes_rh').update({ statut: 'refuse', commentaire_manager: refusMotif }).eq('id', refuserTarget.id)
    setDemandes(prev => prev.map(r => r.id === refuserTarget.id ? { ...r, statut: 'refuse', commentaire_manager: refusMotif } : r))
    setRefuserTarget(null)
    setRefusMotif('')
    setActionSaving(false)
  }

  async function annulerDemande(d: DemandeRow) {
    Alert.alert(
      'Annuler la demande',
      'Annuler cette demande approuvée ? Les créneaux seront restaurés.',
      [
        { text: 'Non', style: 'cancel' },
        {
          text: 'Annuler la demande',
          style: 'destructive',
          onPress: async () => {
            const { error } = await supabase.from('employe_demandes_rh')
              .update({ statut: 'annule' })
              .eq('id', d.id)
            if (error) { console.error('[annulerDemande]', error); Alert.alert('Erreur', error.message); return }
            if (d.type_demande !== 'document_administratif') {
              await supabase.from('employe_statuts_jour')
                .delete()
                .eq('company_id', company!.id)
                .eq('employe_id', d.employe_id)
                .gte('date_statut', d.date_debut)
                .lte('date_statut', d.date_fin)
            }
            setDemandes(prev => prev.map(r => r.id === d.id ? { ...r, statut: 'annule' } : r))
          },
        },
      ]
    )
  }

  async function handleSendMsg() {
    if (!company || !msgEmpId || !msgText.trim()) return
    setMsgSaving(true)
    await supabase.from('employe_notifications').insert({
      company_id: company.id, employe_id: msgEmpId,
      type: 'message_owner', titre: '📣 Message de votre manager', message: msgText, lu: false,
    })
    setMsgText('')
    setMsgSaving(false)
  }

  async function handleSendGratif() {
    if (!company || !gratEmpId || !gratMsg.trim()) return
    setGratSaving(true)
    await supabase.from('employe_gratifications').insert({
      company_id: company.id, employe_id: gratEmpId,
      type_gratif: gratType, montant: Number(gratMontant) || 0, message: gratMsg, lu: false,
    })
    await supabase.from('employe_notifications').insert({
      company_id: company.id, employe_id: gratEmpId,
      type: 'gratification', titre: '🎁 Nouvelle gratification', message: gratMsg, lu: false,
    })
    setGratMsg(''); setGratMontant('')
    setGratSaving(false)
  }

  // ── Overrides CRUD ───────────────────────────────────────────────

  function addOverride(empId: string) {
    setEmpData(prev => {
      const d = { ...prev[empId] }
      d.overrides = [...d.overrides, { id: uid(), date: '', debut: '09:00', fin: '17:00', actif: true, raison: '' }]
      d.dirty = true
      return { ...prev, [empId]: d }
    })
  }

  function setOverrideField(empId: string, ovId: string, field: keyof Override, val: string | boolean) {
    setEmpData(prev => {
      const d = { ...prev[empId] }
      d.overrides = d.overrides.map(o => o.id === ovId ? { ...o, [field]: val } : o)
      d.dirty = true
      return { ...prev, [empId]: d }
    })
  }

  function removeOverride(empId: string, ovId: string) {
    setEmpData(prev => {
      const d = { ...prev[empId] }
      d.overrides = d.overrides.filter(o => o.id !== ovId)
      d.dirty = true
      return { ...prev, [empId]: d }
    })
  }

  // ── Jours fériés ─────────────────────────────────────────────────

  useEffect(() => { if (tab === 'feries' && company) loadFeries() }, [company?.id, tab, feriesAnnee])

  async function loadFeries() {
    if (!company) return
    const { data: f } = await supabase
      .from('jours_feries')
      .select('id, company_id, date, nom, est_auto')
      .eq('company_id', company.id)
      .order('date')
    const feriesForYear = (f ?? []).filter((x: { date: string }) => x.date.startsWith(String(feriesAnnee)))
    if (feriesForYear.length === 0) {
      const generated = getFeriesQuebec(feriesAnnee)
      await supabase.from('jours_feries').insert(
        generated.map(g => ({ ...g, company_id: company.id, est_auto: true }))
      )
      loadFeries()
      return
    }
    setFeries((f ?? []) as JourFerie[])
    const { data: fm } = await supabase
      .from('jours_feries_fermetures')
      .select('id, ferie_id, employe_id')
      .eq('company_id', company.id)
    setFermetures((fm ?? []) as Fermeture[])
  }

  async function toggleSalon(ferieId: string) {
    if (!company) return
    const existing = fermetures.filter(f => f.ferie_id === ferieId)
    const salonFerme = existing.some(f => f.employe_id === null)
    if (salonFerme) {
      await supabase.from('jours_feries_fermetures').delete().in('id', existing.map(f => f.id))
      setFermetures(prev => prev.filter(f => f.ferie_id !== ferieId))
    } else {
      await supabase.from('jours_feries_fermetures').delete().in('id', existing.map(f => f.id))
      const { data } = await supabase.from('jours_feries_fermetures')
        .insert({ company_id: company.id, ferie_id: ferieId, employe_id: null })
        .select('id, ferie_id, employe_id').single()
      if (data) setFermetures(prev => [...prev.filter(f => f.ferie_id !== ferieId), data as Fermeture])
    }
  }

  async function toggleEmp(ferieId: string, empId: string) {
    if (!company) return
    const existing = fermetures.find(f => f.ferie_id === ferieId && f.employe_id === empId)
    if (existing) {
      await supabase.from('jours_feries_fermetures').delete().eq('id', existing.id)
      setFermetures(prev => prev.filter(f => f.id !== existing.id))
    } else {
      const { data } = await supabase.from('jours_feries_fermetures')
        .insert({ company_id: company.id, ferie_id: ferieId, employe_id: empId })
        .select('id, ferie_id, employe_id').single()
      if (data) setFermetures(prev => [...prev, data as Fermeture])
    }
  }

  // ── Render horaire card ───────────────────────────────────────────

  const renderHoraireCard = useCallback(({ item: emp, index }: { item: Employe; index: number }) => {
    const data = empData[emp.id]
    if (!data) return null
    const color = empColor(emp, index)
    return (
      <View style={s.card}>
        {/* Header */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 }}>
          <Avatar emp={emp} size={40} index={index} />
          <Text style={{ flex: 1, fontSize: 16, fontWeight: '800', color: '#111827' }}>{emp.nom}</Text>
          {data.dirty && !data.saving && (
            <Text style={{ fontSize: 12, color: '#b45309', fontWeight: '600' }}>Non sauvegardé</Text>
          )}
          <TouchableOpacity
            style={[s.smallBtn, { opacity: data.dirty && !data.saving ? 1 : 0.4 }]}
            onPress={() => saveHoraires(emp.id)}
            disabled={!data.dirty || data.saving}
          >
            {data.saving
              ? <ActivityIndicator size="small" color="#fff" />
              : <Text style={{ color: '#fff', fontSize: 12, fontWeight: '700' }}>Sauvegarder</Text>
            }
          </TouchableOpacity>
        </View>

        {/* Modèles rapides */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, marginBottom: 12 }}>
          {MODELES.map(m => (
            <TouchableOpacity key={m.id} onPress={() => applyModele(emp.id, m.id)} style={s.modeleChip}>
              <Text style={s.modeleLabel}>{m.label}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* 7 jours */}
        {JOURS.map(({ key, label }) => {
          const jour = data.horaires[key]
          return (
            <View key={key} style={s.jourRow}>
              <Text style={[s.jourLabel, { color: jour.actif ? '#374151' : '#9ca3af' }]}>{label}</Text>
              <Switch
                value={jour.actif}
                onValueChange={() => toggleJour(emp.id, key)}
                trackColor={{ false: '#d1d5db', true: color + '60' }}
                thumbColor={jour.actif ? color : '#f4f4f5'}
                style={{ transform: [{ scaleX: 0.8 }, { scaleY: 0.8 }] }}
              />
              {jour.actif ? (
                <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <TextInput
                    style={s.timeInput}
                    value={jour.debut}
                    onChangeText={v => setHoraireField(emp.id, key, 'debut', v)}
                    placeholder="09:00"
                  />
                  <Text style={{ color: '#9ca3af' }}>→</Text>
                  <TextInput
                    style={s.timeInput}
                    value={jour.fin}
                    onChangeText={v => setHoraireField(emp.id, key, 'fin', v)}
                    placeholder="18:00"
                  />
                  <TouchableOpacity onPress={() => openPauseModal(emp.id, key)}>
                    <Ionicons name="add-circle-outline" size={20} color={color} />
                  </TouchableOpacity>
                </View>
              ) : (
                <Text style={{ flex: 1, color: '#9ca3af', fontSize: 13 }}>Repos</Text>
              )}
            </View>
          )
        })}

        {/* Pauses (si actif) */}
        {JOURS.filter(({ key }) => data.horaires[key].actif && data.horaires[key].pauses.length > 0).map(({ key, label }) => (
          <View key={'pauses_' + key} style={{ marginTop: 4, paddingLeft: 8, borderLeftWidth: 2, borderColor: '#ede9fe', marginBottom: 8 }}>
            <Text style={{ fontSize: 12, color: '#7c3aed', fontWeight: '600', marginBottom: 4 }}>Pauses {label}</Text>
            {data.horaires[key].pauses.map(p => (
              <View key={p.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                <View style={{ alignItems: 'center', gap: 2 }}>
                  {p.type === 'ponctuelle' ? (
                    <View style={{ backgroundColor: '#fef3c7', borderRadius: 4, paddingHorizontal: 4, paddingVertical: 1 }}>
                      <Text style={{ fontSize: 9, color: '#b45309', fontWeight: '700' }}>{p.dates?.length ?? 0}×</Text>
                    </View>
                  ) : (
                    <View style={{ backgroundColor: '#dbeafe', borderRadius: 4, paddingHorizontal: 4, paddingVertical: 1 }}>
                      <Text style={{ fontSize: 9, color: '#1d4ed8', fontWeight: '700' }}>hebdo</Text>
                    </View>
                  )}
                </View>
                <TextInput
                  style={[s.timeInput, { width: 70 }]}
                  value={p.debut}
                  onChangeText={v => setPauseField(emp.id, key, p.id, 'debut', v)}
                />
                <Text style={{ color: '#9ca3af' }}>→</Text>
                <TextInput
                  style={[s.timeInput, { width: 70 }]}
                  value={p.fin}
                  onChangeText={v => setPauseField(emp.id, key, p.id, 'fin', v)}
                />
                <TouchableOpacity onPress={() => removePause(emp.id, key, p.id)}>
                  <Ionicons name="close-circle-outline" size={18} color="#dc2626" />
                </TouchableOpacity>
              </View>
            ))}
          </View>
        ))}

        {/* Exceptions */}
        <View style={{ marginTop: 8 }}>
          <Text style={[s.subTitle, { marginBottom: 8 }]}>Exceptions de période</Text>
          {data.exceptions.map(ex => (
            <View key={ex.id} style={{ backgroundColor: '#fff7ed', borderRadius: 10, padding: 10, marginBottom: 8, gap: 6 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'flex-end', marginBottom: 2 }}>
                <TouchableOpacity onPress={() => removeException(emp.id, ex.id)}>
                  <Ionicons name="trash-outline" size={18} color="#dc2626" />
                </TouchableOpacity>
              </View>
              <View style={{ flexDirection: 'column', gap: 6 }}>
                <View style={{ flexDirection: 'row', gap: 6 }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 11, color: '#92400e', marginBottom: 2 }}>Date début</Text>
                    <TextInput style={s.input} value={ex.debut} onChangeText={v => setExceptionField(emp.id, ex.id, 'debut', v)} placeholder="AAAA-MM-JJ" />
                  </View>
                  <View style={{ width: 90 }}>
                    <Text style={{ fontSize: 11, color: '#92400e', marginBottom: 2 }}>Heure</Text>
                    <TextInput style={s.input} value={ex.debut_heure} onChangeText={v => setExceptionField(emp.id, ex.id, 'debut_heure', v)} placeholder="00:00" keyboardType="numeric" />
                  </View>
                </View>
                <View style={{ flexDirection: 'row', gap: 6 }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 11, color: '#92400e', marginBottom: 2 }}>Date fin</Text>
                    <TextInput style={s.input} value={ex.fin} onChangeText={v => setExceptionField(emp.id, ex.id, 'fin', v)} placeholder="AAAA-MM-JJ" />
                  </View>
                  <View style={{ width: 90 }}>
                    <Text style={{ fontSize: 11, color: '#92400e', marginBottom: 2 }}>Heure</Text>
                    <TextInput style={s.input} value={ex.fin_heure} onChangeText={v => setExceptionField(emp.id, ex.id, 'fin_heure', v)} placeholder="23:59" keyboardType="numeric" />
                  </View>
                </View>
              </View>
              <TextInput
                style={s.input}
                value={ex.raison}
                onChangeText={v => setExceptionField(emp.id, ex.id, 'raison', v)}
                placeholder="Raison de l'exception..."
              />
            </View>
          ))}
          <TouchableOpacity style={s.outlineBtn} onPress={() => addException(emp.id)}>
            <Ionicons name="add" size={16} color="#7c3aed" />
            <Text style={{ color: '#7c3aed', fontWeight: '600', fontSize: 13 }}>Ajouter exception</Text>
          </TouchableOpacity>
        </View>

        {/* Overrides */}
        <View style={{ borderTopWidth: 1, borderTopColor: '#f3f4f6', paddingTop: 12, marginTop: 4 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <Text style={{ fontSize: 11, fontWeight: '700', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: 0.5 }}>
              Horaires exceptionnels
            </Text>
            <TouchableOpacity onPress={() => addOverride(emp.id)}>
              <Text style={{ fontSize: 12, color: '#7c3aed', fontWeight: '600' }}>+ Ajouter</Text>
            </TouchableOpacity>
          </View>
          {data.overrides.length === 0 ? (
            <Text style={{ fontSize: 12, color: '#9ca3af', textAlign: 'center', paddingVertical: 12 }}>
              Aucun horaire exceptionnel configuré
            </Text>
          ) : (
            data.overrides.map(ov => (
              <View key={ov.id} style={{
                backgroundColor: '#eff6ff', borderWidth: 1,
                borderColor: '#bfdbfe', borderRadius: 12,
                padding: 12, marginBottom: 8,
              }}>
                <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center', marginBottom: 8 }}>
                  <TextInput
                    value={ov.date}
                    onChangeText={v => setOverrideField(emp.id, ov.id, 'date', v)}
                    placeholder="AAAA-MM-JJ"
                    style={[s.input, { flex: 1, marginBottom: 0 }]}
                  />
                  <TouchableOpacity
                    onPress={() => setOverrideField(emp.id, ov.id, 'actif', !ov.actif)}
                    style={{
                      paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8,
                      backgroundColor: ov.actif ? '#dcfce7' : '#f3f4f6',
                    }}
                  >
                    <Text style={{ fontSize: 11, fontWeight: '600', color: ov.actif ? '#16a34a' : '#6b7280' }}>
                      {ov.actif ? '● Travaille' : '○ Repos'}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => removeOverride(emp.id, ov.id)}>
                    <Text style={{ color: '#ef4444', fontSize: 20, lineHeight: 20 }}>×</Text>
                  </TouchableOpacity>
                </View>
                {ov.actif && (
                  <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center', marginBottom: 8 }}>
                    <TextInput
                      value={ov.debut}
                      onChangeText={v => setOverrideField(emp.id, ov.id, 'debut', v)}
                      placeholder="09:00"
                      keyboardType="numeric"
                      style={[s.timeInput, { flex: 1 }]}
                    />
                    <Text style={{ color: '#9ca3af' }}>→</Text>
                    <TextInput
                      value={ov.fin}
                      onChangeText={v => setOverrideField(emp.id, ov.id, 'fin', v)}
                      placeholder="17:00"
                      keyboardType="numeric"
                      style={[s.timeInput, { flex: 1 }]}
                    />
                  </View>
                )}
                <TextInput
                  value={ov.raison}
                  onChangeText={v => setOverrideField(emp.id, ov.id, 'raison', v)}
                  placeholder="Raison (ex: Horaire exceptionnel...)"
                  style={[s.input, { marginBottom: 0 }]}
                />
              </View>
            ))
          )}
        </View>
      </View>
    )
  }, [empData])

  // ── Main Render ───────────────────────────────────────────────────

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#f5f3ff' }} edges={['top']}>
      {/* Header */}
      <View style={s.header}>
        <Text style={s.headerTitle}>Agenda collaborateurs</Text>
      </View>

      {/* Onglets */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.tabsScroll} contentContainerStyle={{ paddingHorizontal: 16, paddingVertical: 8, gap: 8 }}>
        {TABS.map(t => (
          <TouchableOpacity key={t.id} onPress={() => setTab(t.id)} style={[s.tabChip, tab === t.id && s.tabChipActive]}>
            <Text style={[s.tabLabel, tab === t.id && s.tabLabelActive]}>{t.label}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {loading ? (
        <ActivityIndicator style={{ marginTop: 40 }} size="large" color="#7c3aed" />
      ) : (
        <>
          {/* ── CALENDRIER ── */}
          {tab === 'calendrier' && (
            <View style={{ flex: 1, position: 'relative' }}>
              {/* Navigation semaine */}
              <View style={s.weekNav}>
                <TouchableOpacity onPress={() => setWeekStart(w => { const d = new Date(w); d.setDate(d.getDate() - 7); return d })}>
                  <Ionicons name="chevron-back" size={22} color="#7c3aed" />
                </TouchableOpacity>
                <Text style={s.weekLabel}>{formatWeekRange(weekStart)}</Text>
                <TouchableOpacity onPress={() => setWeekStart(w => { const d = new Date(w); d.setDate(d.getDate() + 7); return d })}>
                  <Ionicons name="chevron-forward" size={22} color="#7c3aed" />
                </TouchableOpacity>
                <TouchableOpacity onPress={() => setWeekStart(getWeekStart(new Date()))} style={s.todayBtn}>
                  <Text style={{ color: '#7c3aed', fontWeight: '700', fontSize: 12 }}>Auj.</Text>
                </TouchableOpacity>
              </View>

              {/* Alerte sous-effectif */}
              {alertesConflits.length > 0 && (
                <View style={{ backgroundColor: '#fef3c7', marginHorizontal: 12, marginBottom: 8, borderRadius: 10, padding: 10 }}>
                  <Text style={{ color: '#92400e', fontSize: 13, fontWeight: '600' }}>
                    ⚠️ Sous-effectif détecté : {alertesConflits.map(d => new Date(d + 'T12:00').getDate()).join(', ')}
                  </Text>
                </View>
              )}

              {/* Grille calendrier */}
              <ScrollView style={{ flex: 1 }}>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  <View style={{ paddingHorizontal: 8, paddingBottom: 20 }}>
                    {/* Header colonnes */}
                    <View style={{ flexDirection: 'row', marginBottom: 4 }}>
                      <View style={{ width: 90 }} />
                      {weekDates.map((date, i) => {
                        const isToday = date === today
                        const dayNum = new Date(date + 'T12:00').getDate()
                        return (
                          <View key={date} style={{ width: 56, alignItems: 'center' }}>
                            <Text style={{ fontSize: 11, color: isToday ? '#7c3aed' : '#9ca3af', fontWeight: '600' }}>{DAY_LABELS[i]}</Text>
                            <View style={[{ width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center' }, isToday && { backgroundColor: '#7c3aed' }]}>
                              <Text style={{ fontSize: 13, fontWeight: '700', color: isToday ? '#fff' : '#374151' }}>{dayNum}</Text>
                            </View>
                          </View>
                        )
                      })}
                    </View>

                    {/* Lignes employés */}
                    {employes.map((emp, idx) => (
                      <View key={emp.id} style={[s.empRow, idx % 2 === 0 ? { backgroundColor: '#faf5ff' } : { backgroundColor: '#fff' }]}>
                        <View style={{ width: 90, flexDirection: 'row', alignItems: 'center', gap: 6, paddingRight: 4 }}>
                          <Avatar emp={emp} size={26} index={idx} />
                          <Text style={{ fontSize: 12, fontWeight: '600', color: '#374151', flex: 1 }} numberOfLines={1}>
                            {emp.nom.split(' ')[0]}
                          </Text>
                        </View>
                        {weekDates.map(date => {
                          const statut = statutsMap[emp.id]?.[date] ?? null
                          const cfg = statut ? STATUS_CONFIG[statut] : null
                          const isSelected = selectedCells.some(c => c.empId === emp.id && c.date === date)
                          return (
                            <TouchableOpacity
                              key={date}
                              style={{ width: 56, paddingHorizontal: 3, paddingVertical: 4 }}
                              onPress={() => {
                                if (selectedCells.length === 0) {
                                  setSelectionEmpId(emp.id)
                                  setSelectedCells([{ empId: emp.id, date }])
                                  return
                                }
                                if (selectionEmpId === emp.id) {
                                  const exists = selectedCells.some(c => c.date === date)
                                  if (exists) {
                                    const newSel = selectedCells.filter(c => c.date !== date)
                                    setSelectedCells(newSel)
                                    if (newSel.length === 0) setSelectionEmpId(null)
                                  } else {
                                    setSelectedCells([...selectedCells, { empId: emp.id, date }])
                                  }
                                  return
                                }
                                setSelectedCells([])
                                setSelectionEmpId(null)
                                openPopup(emp.id, date, statut)
                              }}
                            >
                              <View style={[s.cell, cfg ? { backgroundColor: cfg.bg } : s.cellEmpty, isSelected && { borderWidth: 2, borderColor: '#7c3aed', backgroundColor: 'rgba(124,58,237,0.08)' }]}>
                                {cfg ? (
                                  <>
                                    <Text style={{ fontSize: 14 }}>{cfg.emoji}</Text>
                                    <Text style={{ fontSize: 7, color: cfg.color, fontWeight: '700', textAlign: 'center' }} numberOfLines={1}>{cfg.label}</Text>
                                  </>
                                ) : (
                                  <Text style={{ color: '#d1d5db', fontSize: 16 }}>—</Text>
                                )}
                              </View>
                            </TouchableOpacity>
                          )
                        })}
                      </View>
                    ))}
                  </View>
                </ScrollView>

                {/* Légende */}
                <View style={{ paddingHorizontal: 16, paddingBottom: 20 }}>
                  <Text style={s.subTitle}>Légende</Text>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
                    {STATUTS_LIST.map(([k, cfg]) => (
                      <View key={k} style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, backgroundColor: cfg.bg }}>
                        <Text style={{ fontSize: 13 }}>{cfg.emoji}</Text>
                        <Text style={{ fontSize: 12, color: cfg.color, fontWeight: '600' }}>{cfg.label}</Text>
                      </View>
                    ))}
                  </View>
                </View>
              </ScrollView>

              {selectedCells.length > 0 && (
                <View style={{
                  position: 'absolute', bottom: 100, left: 16, right: 16,
                  backgroundColor: '#1f2937', borderRadius: 16,
                  zIndex: 999,
                  elevation: 10,
                  padding: 12, flexDirection: 'row', alignItems: 'center',
                  gap: 8, shadowColor: '#000', shadowOpacity: 0.3,
                  shadowRadius: 12,
                }}>
                  <Text style={{ color: 'white', fontSize: 13, fontWeight: '600', flex: 1 }}>
                    {selectedCells.length} jour{selectedCells.length > 1 ? 's' : ''} sélectionné{selectedCells.length > 1 ? 's' : ''}
                  </Text>
                  <TouchableOpacity
                    onPress={() => { setMultiPopup(true); setMultiPopupNote('') }}
                    style={{ backgroundColor: '#7c3aed', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8 }}>
                    <Text style={{ color: 'white', fontWeight: '600', fontSize: 13 }}>Appliquer</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => { setSelectedCells([]); setSelectionEmpId(null) }}
                    style={{ backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8 }}>
                    <Text style={{ color: 'white', fontSize: 13 }}>✕</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          )}

          {/* ── HORAIRES ── */}
          {tab === 'horaires' && (
            <FlatList
              data={employes}
              keyExtractor={e => e.id}
              renderItem={renderHoraireCard}
              contentContainerStyle={{ padding: 16, paddingBottom: 100, gap: 16 }}
              ListEmptyComponent={<Text style={{ textAlign: 'center', color: '#9ca3af', marginTop: 40 }}>Aucun employé actif</Text>}
            />
          )}

          {/* ── DEMANDES RH ── */}
          {tab === 'demandes' && (
            <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 100, gap: 16 }}>

              {/* Soldes vacances */}
              <View style={s.card}>
                <Text style={s.sectionTitle}>Soldes vacances</Text>
                {soldes.length === 0
                  ? <Text style={s.empty}>Aucun solde disponible</Text>
                  : (
                    <View>
                      <View style={[s.tableRow, { backgroundColor: '#f5f3ff' }]}>
                        <Text style={[s.th, { flex: 2 }]}>Employé</Text>
                        <Text style={[s.th, { flex: 1, textAlign: 'center' }]}>Alloués</Text>
                        <Text style={[s.th, { flex: 1, textAlign: 'center' }]}>Utilisés</Text>
                        <Text style={[s.th, { flex: 1, textAlign: 'center' }]}>Restants</Text>
                      </View>
                      {soldes.map(sv => (
                        <View key={sv.employe_id} style={s.tableRow}>
                          <Text style={[s.td, { flex: 2 }]}>{[sv.prenom, sv.nom].filter(Boolean).join(' ')}</Text>
                          <Text style={[s.td, { flex: 1, textAlign: 'center' }]}>{sv.jours_vacances_annuels}</Text>
                          <Text style={[s.td, { flex: 1, textAlign: 'center', color: '#dc2626' }]}>{Number(sv.jours_utilises).toFixed(1)}</Text>
                          <Text style={[s.td, { flex: 1, textAlign: 'center', color: sv.jours_restants < 3 ? '#dc2626' : '#059669', fontWeight: '700' }]}>{Number(sv.jours_restants).toFixed(1)}</Text>
                        </View>
                      ))}
                    </View>
                  )
                }
              </View>

              {/* Formulaire nouvelle demande */}
              <View style={s.card}>
                <Text style={s.sectionTitle}>Nouvelle demande RH</Text>

                <Text style={s.fieldLabel}>Employé *</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, marginBottom: 12 }}>
                  {employes.map(e => (
                    <TouchableOpacity key={e.id} onPress={() => setFormEmpId(e.id)} style={[s.filterChip, formEmpId === e.id && s.filterChipActive]}>
                      <Text style={[s.filterLabel, formEmpId === e.id && s.filterLabelActive]}>{e.nom.split(' ')[0]}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>

                <Text style={s.fieldLabel}>Type de demande *</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, marginBottom: 12 }}>
                  {TYPE_DEMANDE_OPTIONS.map(([k, label]) => (
                    <TouchableOpacity key={k} onPress={() => setFormType(k)} style={[s.filterChip, formType === k && s.filterChipActive]}>
                      <Text style={[s.filterLabel, formType === k && s.filterLabelActive]}>{label}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>

                <View style={{ flexDirection: 'row', gap: 10 }}>
                  <View style={{ flex: 1 }}>
                    <Text style={s.fieldLabel}>Date début *</Text>
                    <TextInput style={s.input} placeholder="AAAA-MM-JJ" value={formDebut} onChangeText={setFormDebut} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.fieldLabel}>Heure début</Text>
                    <TextInput style={s.input} placeholder="09:00" value={formHeureDebut} onChangeText={setFormHeureDebut} />
                  </View>
                </View>
                <View style={{ flexDirection: 'row', gap: 10 }}>
                  <View style={{ flex: 1 }}>
                    <Text style={s.fieldLabel}>Date fin *</Text>
                    <TextInput style={s.input} placeholder="AAAA-MM-JJ" value={formFin} onChangeText={setFormFin} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.fieldLabel}>Heure fin</Text>
                    <TextInput style={s.input} placeholder="18:00" value={formHeureFin} onChangeText={setFormHeureFin} />
                  </View>
                </View>
                <Text style={s.fieldLabel}>Motif</Text>
                <TextInput
                  style={[s.input, { height: 70, textAlignVertical: 'top' }]}
                  multiline
                  placeholder="Motif de la demande..."
                  value={formMotif}
                  onChangeText={setFormMotif}
                />
                <TouchableOpacity style={s.saveBtn} onPress={handleSubmitDemande} disabled={formSaving || !formEmpId}>
                  {formSaving ? <ActivityIndicator color="#fff" /> : <Text style={s.saveBtnText}>Soumettre la demande</Text>}
                </TouchableOpacity>
              </View>

              {/* Historique */}
              <View style={s.card}>
                <Text style={s.sectionTitle}>Historique des demandes</Text>
                {demandes.length === 0
                  ? <Text style={s.empty}>Aucune demande</Text>
                  : demandes.map(d => {
                    const emp = employes.find(e => e.id === d.employe_id)
                    const isAttente = d.statut === 'en_attente'
                    const statutColor = d.statut === 'approuve' ? '#059669' : d.statut === 'refuse' ? '#dc2626' : d.statut === 'annule' ? '#6b7280' : '#b45309'
                    const statutBg = d.statut === 'approuve' ? '#d1fae5' : d.statut === 'refuse' ? '#fee2e2' : d.statut === 'annule' ? '#f3f4f6' : '#fef3c7'
                    const soldeEmp = soldes.find(s => s.employe_id === d.employe_id)
                    return (
                      <View key={d.id} style={s.demandeCard}>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
                          <View style={{ flex: 1 }}>
                            <Text style={{ fontWeight: '700', color: '#111827', fontSize: 14 }}>
                              {emp?.nom ?? '—'} — {TYPE_DEMANDE_LABELS[d.type_demande]}
                            </Text>
                            <Text style={{ color: '#6b7280', fontSize: 12, marginTop: 2 }}>
                              {formatDate(d.date_debut)} → {formatDate(d.date_fin)}
                            </Text>
                            {d.motif ? <Text style={{ color: '#374151', fontSize: 12, marginTop: 2 }}>{d.motif}</Text> : null}
                          </View>
                          <View style={{ paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, backgroundColor: statutBg }}>
                            <Text style={{ fontSize: 11, fontWeight: '700', color: statutColor }}>
                              {d.statut === 'approuve' ? 'Approuvé' : d.statut === 'refuse' ? 'Refusé' : d.statut === 'annule' ? 'Annulé' : 'En attente'}
                            </Text>
                          </View>
                        </View>
                        {d.commentaire_manager ? (
                          <Text style={{ fontSize: 12, color: '#7c3aed', fontStyle: 'italic' }}>Manager : {d.commentaire_manager}</Text>
                        ) : null}
                        {isAttente && (
                          <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
                            <TouchableOpacity
                              style={[s.smallBtn, { backgroundColor: '#059669' }]}
                              onPress={() => {
                                if (d.type_demande === 'conge' && soldeEmp && getDatesInRange(d.date_debut, d.date_fin).length > soldeEmp.jours_restants) {
                                  setApprouverTarget(d)
                                  setApprNote(`⚠️ Quota dépassé — solde restant : ${Number(soldeEmp.jours_restants).toFixed(1)} j.`)
                                } else {
                                  setApprouverTarget(d)
                                  setApprNote('')
                                }
                              }}
                            >
                              <Text style={{ color: '#fff', fontWeight: '700', fontSize: 12 }}>Approuver</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                              style={[s.smallBtn, { backgroundColor: '#dc2626' }]}
                              onPress={() => { setRefuserTarget(d); setRefusMotif('') }}
                            >
                              <Text style={{ color: '#fff', fontWeight: '700', fontSize: 12 }}>Refuser</Text>
                            </TouchableOpacity>
                          </View>
                        )}
                        {d.statut === 'approuve' && (
                          <TouchableOpacity
                            style={[s.smallBtn, { backgroundColor: '#6b7280', marginTop: 8 }]}
                            onPress={() => annulerDemande(d)}
                          >
                            <Text style={{ color: '#fff', fontWeight: '700', fontSize: 12 }}>✕ Annuler</Text>
                          </TouchableOpacity>
                        )}
                      </View>
                    )
                  })
                }
              </View>

              {/* Envoyer message */}
              <View style={s.card}>
                <Text style={s.sectionTitle}>📣 Envoyer un message</Text>
                <Text style={s.fieldLabel}>Employé</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, marginBottom: 12 }}>
                  {employes.map(e => (
                    <TouchableOpacity key={e.id} onPress={() => setMsgEmpId(e.id)} style={[s.filterChip, msgEmpId === e.id && s.filterChipActive]}>
                      <Text style={[s.filterLabel, msgEmpId === e.id && s.filterLabelActive]}>{e.nom.split(' ')[0]}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
                <TextInput
                  style={[s.input, { height: 70, textAlignVertical: 'top' }]}
                  multiline
                  placeholder="Votre message..."
                  value={msgText}
                  onChangeText={setMsgText}
                />
                <TouchableOpacity style={s.saveBtn} onPress={handleSendMsg} disabled={msgSaving || !msgText.trim()}>
                  {msgSaving ? <ActivityIndicator color="#fff" /> : <Text style={s.saveBtnText}>Envoyer le message</Text>}
                </TouchableOpacity>
              </View>

              {/* Gratification */}
              <View style={s.card}>
                <Text style={s.sectionTitle}>🎁 Envoyer une gratification</Text>
                <Text style={s.fieldLabel}>Employé</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, marginBottom: 12 }}>
                  {employes.map(e => (
                    <TouchableOpacity key={e.id} onPress={() => setGratEmpId(e.id)} style={[s.filterChip, gratEmpId === e.id && s.filterChipActive]}>
                      <Text style={[s.filterLabel, gratEmpId === e.id && s.filterLabelActive]}>{e.nom.split(' ')[0]}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
                <Text style={s.fieldLabel}>Type</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, marginBottom: 12 }}>
                  {([['prime', 'Prime'], ['bonus', 'Bonus'], ['recompense', 'Récompense']] as const).map(([v, l]) => (
                    <TouchableOpacity key={v} onPress={() => setGratType(v)} style={[s.filterChip, gratType === v && s.filterChipActive]}>
                      <Text style={[s.filterLabel, gratType === v && s.filterLabelActive]}>{l}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
                <Text style={s.fieldLabel}>Montant ($)</Text>
                <TextInput style={s.input} keyboardType="numeric" placeholder="0" value={gratMontant} onChangeText={setGratMontant} />
                <Text style={s.fieldLabel}>Message *</Text>
                <TextInput
                  style={[s.input, { height: 60, textAlignVertical: 'top' }]}
                  multiline
                  placeholder="Message accompagnant la gratification..."
                  value={gratMsg}
                  onChangeText={setGratMsg}
                />
                <TouchableOpacity style={s.saveBtn} onPress={handleSendGratif} disabled={gratSaving || !gratMsg.trim()}>
                  {gratSaving ? <ActivityIndicator color="#fff" /> : <Text style={s.saveBtnText}>Envoyer la gratification</Text>}
                </TouchableOpacity>
              </View>
            </ScrollView>
          )}
          {/* ── FÉRIÉS ── */}
          {tab === 'feries' && (
            <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, paddingBottom: 100 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <Text style={{ fontSize: 16, fontWeight: '700', color: '#111827' }}>
                  Jours fériés {feriesAnnee}
                </Text>
                <View style={{ flexDirection: 'row', gap: 12 }}>
                  <TouchableOpacity onPress={() => setFeriesAnnee(y => y - 1)}>
                    <Text style={{ color: '#7c3aed', fontWeight: '700', fontSize: 16 }}>←</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => setFeriesAnnee(y => y + 1)}>
                    <Text style={{ color: '#7c3aed', fontWeight: '700', fontSize: 16 }}>→</Text>
                  </TouchableOpacity>
                </View>
              </View>
              <Text style={{ fontSize: 11, color: '#9ca3af', marginBottom: 12 }}>
                Par défaut = ouvert. Touchez pour fermer.
              </Text>
              {feries
                .filter(f => f.date.startsWith(String(feriesAnnee)))
                .map(ferie => {
                  const ferieFermetures = fermetures.filter(f => f.ferie_id === ferie.id)
                  const salonFerme = ferieFermetures.some(f => f.employe_id === null)
                  return (
                    <View key={ferie.id} style={{
                      backgroundColor: '#fff', borderRadius: 12, padding: 12, marginBottom: 8,
                      borderWidth: 1, borderColor: 'rgba(0,0,0,0.06)',
                      shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 4, elevation: 1,
                    }}>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }}>
                        <Text style={{ fontSize: 13, fontWeight: '600', color: '#111827', flex: 1, marginRight: 8 }}>
                          {ferie.nom}
                        </Text>
                        <Text style={{ fontSize: 11, color: '#9ca3af' }}>
                          {new Date(ferie.date + 'T12:00:00').toLocaleDateString('fr-CA', { weekday: 'short', day: 'numeric', month: 'short' })}
                        </Text>
                      </View>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                        <Text style={{ fontSize: 11, color: '#6b7280', width: 56 }}>SALON</Text>
                        <TouchableOpacity onPress={() => toggleSalon(ferie.id)}>
                          <View style={{
                            paddingHorizontal: 12, paddingVertical: 4, borderRadius: 20,
                            backgroundColor: salonFerme ? '#fee2e2' : '#dcfce7',
                          }}>
                            <Text style={{ fontSize: 11, fontWeight: '600', color: salonFerme ? '#ef4444' : '#16a34a' }}>
                              {salonFerme ? '✕ Fermé' : '○ Ouvert'}
                            </Text>
                          </View>
                        </TouchableOpacity>
                      </View>
                      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                        {employes.map(emp => {
                          const empFerme = salonFerme || ferieFermetures.some(f => f.employe_id === emp.id)
                          return (
                            <TouchableOpacity
                              key={emp.id}
                              onPress={() => !salonFerme && toggleEmp(ferie.id, emp.id)}
                              style={{
                                paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20, borderWidth: 1,
                                borderColor: empFerme ? '#fca5a5' : '#86efac',
                                backgroundColor: empFerme ? '#fee2e2' : '#dcfce7',
                                opacity: salonFerme ? 0.5 : 1,
                              }}
                            >
                              <Text style={{ fontSize: 11, fontWeight: '600', color: empFerme ? '#ef4444' : '#16a34a' }}>
                                {emp.nom.split(' ')[0]}
                              </Text>
                            </TouchableOpacity>
                          )
                        })}
                      </View>
                    </View>
                  )
                })
              }
            </ScrollView>
          )}
        </>
      )}

      {/* ── Popup Statut ── */}
      <Modal
        visible={!!popup}
        animationType="slide"
        presentationStyle={Platform.OS === 'ios' ? 'pageSheet' : undefined}
        transparent={Platform.OS !== 'ios'}
      >
        {Platform.OS !== 'ios' && (
          <TouchableOpacity style={s.modalBackdrop} activeOpacity={1} onPress={() => setPopup(null)} />
        )}
        <View style={[s.modalSheet, Platform.OS !== 'ios' && { position: 'absolute', bottom: 0, left: 0, right: 0 }]}>
          <View style={s.modalHeader}>
            <Text style={s.modalTitle}>
              {popup ? `${employes.find(e => e.id === popup.empId)?.nom ?? '—'} — ${formatDate(popup.date)}` : ''}
            </Text>
            <TouchableOpacity onPress={() => setPopup(null)}>
              <Text style={s.modalClose}>✕</Text>
            </TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={{ padding: 20 }}>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 16 }}>
              {STATUTS_LIST.map(([statut, cfg]) => (
                <TouchableOpacity
                  key={statut}
                  style={[s.statutBtn, { backgroundColor: cfg.bg, borderColor: popup?.current === statut ? cfg.color : 'transparent', borderWidth: 2 }]}
                  onPress={() => popup && setStatut(popup.empId, popup.date, statut, popupNote)}
                  disabled={popupSaving}
                >
                  <Text style={{ fontSize: 24 }}>{cfg.emoji}</Text>
                  <Text style={{ fontSize: 12, color: cfg.color, fontWeight: '700', marginTop: 4, textAlign: 'center' }}>{cfg.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <Text style={s.fieldLabel}>Note (optionnelle)</Text>
            <TextInput
              style={s.input}
              placeholder="Note..."
              value={popupNote}
              onChangeText={setPopupNote}
            />
            {popup?.current && (
              <TouchableOpacity
                style={[s.outlineBtn, { borderColor: '#dc2626', marginTop: 8 }]}
                onPress={() => popup && setStatut(popup.empId, popup.date, null, '')}
                disabled={popupSaving}
              >
                <Ionicons name="close-circle-outline" size={16} color="#dc2626" />
                <Text style={{ color: '#dc2626', fontWeight: '600', fontSize: 13 }}>Effacer le statut</Text>
              </TouchableOpacity>
            )}
            {popupSaving && <ActivityIndicator style={{ marginTop: 12 }} color="#7c3aed" />}
          </ScrollView>
        </View>
      </Modal>

      {/* ── Modal Approbation ── */}
      <Modal visible={!!approuverTarget} transparent animationType="slide" presentationStyle={Platform.OS === 'ios' ? 'pageSheet' : undefined}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={s.dialogOverlay}>
            <View style={s.dialogBox}>
              <Text style={s.dialogTitle}>Approuver la demande ?</Text>
              {approuverTarget && (
                <Text style={s.dialogMsg}>
                  {employes.find(e => e.id === approuverTarget.employe_id)?.nom} — {TYPE_DEMANDE_LABELS[approuverTarget.type_demande]}{'\n'}
                  {formatDate(approuverTarget.date_debut)} → {formatDate(approuverTarget.date_fin)}
                </Text>
              )}
              {approNote ? (
                <View style={{ backgroundColor: '#fffbeb', borderRadius: 8, padding: 10, marginTop: 8 }}>
                  <Text style={{ color: '#92400e', fontSize: 13 }}>{approNote}</Text>
                </View>
              ) : null}
              <Text style={[s.fieldLabel, { marginTop: 12 }]}>Note manager (optionnelle)</Text>
              <TextInput
                style={s.input}
                placeholder="Commentaire..."
                value={approNote.startsWith('⚠️') ? '' : approNote}
                onChangeText={setApprNote}
              />
              <View style={{ flexDirection: 'row', gap: 10, marginTop: 12 }}>
                <TouchableOpacity style={[s.dialogBtn, { flex: 1, backgroundColor: '#f3f4f6' }]} onPress={() => setApprouverTarget(null)}>
                  <Text style={{ color: '#374151', fontWeight: '600' }}>Annuler</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[s.dialogBtn, { flex: 1, backgroundColor: '#059669' }]} onPress={handleApprouver} disabled={actionSaving}>
                  {actionSaving ? <ActivityIndicator color="#fff" size="small" /> : <Text style={{ color: '#fff', fontWeight: '600' }}>Approuver</Text>}
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ── Modal Refus ── */}
      <Modal visible={!!refuserTarget} transparent animationType="slide">
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={s.dialogOverlay}>
            <View style={s.dialogBox}>
              <Text style={s.dialogTitle}>Refuser la demande</Text>
              {refuserTarget && (
                <Text style={s.dialogMsg}>
                  {employes.find(e => e.id === refuserTarget.employe_id)?.nom} — {TYPE_DEMANDE_LABELS[refuserTarget.type_demande]}
                </Text>
              )}
              <Text style={[s.fieldLabel, { marginTop: 12 }]}>Motif du refus *</Text>
              <TextInput
                style={[s.input, { height: 70, textAlignVertical: 'top' }]}
                multiline
                placeholder="Indiquer le motif..."
                value={refusMotif}
                onChangeText={setRefusMotif}
              />
              <View style={{ flexDirection: 'row', gap: 10, marginTop: 12 }}>
                <TouchableOpacity style={[s.dialogBtn, { flex: 1, backgroundColor: '#f3f4f6' }]} onPress={() => setRefuserTarget(null)}>
                  <Text style={{ color: '#374151', fontWeight: '600' }}>Annuler</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[s.dialogBtn, { flex: 1, backgroundColor: '#dc2626', opacity: !refusMotif.trim() ? 0.5 : 1 }]} onPress={handleRefuser} disabled={actionSaving || !refusMotif.trim()}>
                  {actionSaving ? <ActivityIndicator color="#fff" size="small" /> : <Text style={{ color: '#fff', fontWeight: '600' }}>Refuser</Text>}
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
      {/* ── Modal Pause ── */}
      <Modal
        visible={!!pauseModal}
        transparent
        animationType="fade"
        onRequestClose={() => setPauseModal(null)}
      >
        {pauseModal && (() => {
          const labelJour = JOURS.find(j => j.key === pauseModal.jour)?.label ?? ''
          const tz = company?.timezone ?? 'America/Toronto'
          const upcomingDates = getUpcomingDates(pauseModal.jour, tz)
          const canAdd = pauseModal.type !== 'ponctuelle' || pauseModal.dates.length > 0
          return (
            <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
              <View style={s.dialogOverlay}>
                <View style={[s.dialogBox, { maxHeight: '85%' }]}>

                  {/* Header */}
                  <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 16 }}>
                    <Text style={[s.dialogTitle, { flex: 1 }]}>Nouvelle pause — {labelJour}</Text>
                    <TouchableOpacity onPress={() => setPauseModal(null)}>
                      <Text style={{ fontSize: 20, color: '#9ca3af', fontWeight: '700' }}>✕</Text>
                    </TouchableOpacity>
                  </View>

                  <ScrollView showsVerticalScrollIndicator={false}>

                    {/* Type */}
                    <Text style={[s.fieldLabel, { marginBottom: 8 }]}>Type</Text>
                    {(['recurrente', 'ponctuelle'] as const).map(t => (
                      <TouchableOpacity
                        key={t}
                        onPress={() => setPauseModal(prev => prev ? { ...prev, type: t, dates: [] } : prev)}
                        style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 }}
                      >
                        <View style={{
                          width: 18, height: 18, borderRadius: 9,
                          borderWidth: 2, borderColor: pauseModal.type === t ? '#7c3aed' : '#d1d5db',
                          alignItems: 'center', justifyContent: 'center',
                        }}>
                          {pauseModal.type === t && (
                            <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: '#7c3aed' }} />
                          )}
                        </View>
                        <Text style={{ fontSize: 14, color: '#374151' }}>
                          {t === 'recurrente'
                            ? `Récurrente (tous les ${labelJour.toLowerCase()}s)`
                            : 'Ponctuelle (dates spécifiques)'}
                        </Text>
                      </TouchableOpacity>
                    ))}

                    {/* Heures */}
                    <Text style={[s.fieldLabel, { marginTop: 8 }]}>Heures</Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 16 }}>
                      <TextInput
                        style={[s.timeInput, { flex: 1 }]}
                        value={pauseModal.debut}
                        onChangeText={v => setPauseModal(prev => prev ? { ...prev, debut: v } : prev)}
                        placeholder="12:00"
                        maxLength={5}
                      />
                      <Text style={{ color: '#9ca3af' }}>→</Text>
                      <TextInput
                        style={[s.timeInput, { flex: 1 }]}
                        value={pauseModal.fin}
                        onChangeText={v => setPauseModal(prev => prev ? { ...prev, fin: v } : prev)}
                        placeholder="13:00"
                        maxLength={5}
                      />
                    </View>

                    {/* Date chips — ponctuelle seulement */}
                    {pauseModal.type === 'ponctuelle' && (
                      <View style={{ marginBottom: 16 }}>
                        <Text style={[s.fieldLabel, { marginBottom: 8 }]}>
                          Sélectionnez les {labelJour.toLowerCase()}s
                        </Text>
                        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                          {upcomingDates.map(date => {
                            const selected = pauseModal.dates.includes(date)
                            const label = new Date(date + 'T12:00:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })
                            return (
                              <TouchableOpacity
                                key={date}
                                onPress={() => setPauseModal(prev => prev ? {
                                  ...prev,
                                  dates: selected
                                    ? prev.dates.filter(d => d !== date)
                                    : [...prev.dates, date],
                                } : prev)}
                                style={{
                                  paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8,
                                  backgroundColor: selected ? '#7c3aed' : '#f3f4f6',
                                }}
                              >
                                <Text style={{ fontSize: 12, fontWeight: '600', color: selected ? '#fff' : '#6b7280' }}>
                                  {label}
                                </Text>
                              </TouchableOpacity>
                            )
                          })}
                        </View>
                      </View>
                    )}

                  </ScrollView>

                  {/* Actions */}
                  <View style={{ flexDirection: 'row', gap: 10, marginTop: 12 }}>
                    <TouchableOpacity
                      style={[s.dialogBtn, { flex: 1, backgroundColor: '#f3f4f6' }]}
                      onPress={() => setPauseModal(null)}
                    >
                      <Text style={{ color: '#374151', fontWeight: '600' }}>Annuler</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[s.dialogBtn, { flex: 1, backgroundColor: '#7c3aed', opacity: canAdd ? 1 : 0.4 }]}
                      onPress={confirmAddPause}
                      disabled={!canAdd}
                    >
                      <Text style={{ color: '#fff', fontWeight: '700' }}>Ajouter</Text>
                    </TouchableOpacity>
                  </View>

                </View>
              </View>
            </KeyboardAvoidingView>
          )
        })()}
      </Modal>

      {/* ── Modal Multi-sélection ── */}
      <Modal visible={multiPopup} transparent animationType="slide" onRequestClose={() => setMultiPopup(false)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' }}>
          <View style={{ backgroundColor: 'white', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <Text style={{ fontWeight: '700', fontSize: 15 }}>
                Appliquer à {selectedCells.length} jour{selectedCells.length > 1 ? 's' : ''}
              </Text>
              <TouchableOpacity onPress={() => setMultiPopup(false)}>
                <Text style={{ fontSize: 18, color: '#9ca3af' }}>✕</Text>
              </TouchableOpacity>
            </View>

            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
              {(Object.entries(STATUS_CONFIG) as [StatutJour, typeof STATUS_CONFIG[StatutJour]][]).map(([sk, cfg]) => (
                <TouchableOpacity
                  key={sk}
                  onPress={async () => {
                    for (const cell of selectedCells) {
                      await setStatut(cell.empId, cell.date, sk, multiPopupNote)
                    }
                    await loadStatuts()
                    setMultiPopup(false)
                    setSelectedCells([])
                    setSelectionEmpId(null)
                    setMultiPopupNote('')
                  }}
                  style={{ width: '47%', padding: 10, borderRadius: 10, borderWidth: 1.5, borderColor: '#e5e7eb', backgroundColor: 'white', alignItems: 'center', flexDirection: 'row', gap: 6, justifyContent: 'center' }}>
                  <Text style={{ fontSize: 16 }}>{cfg.emoji}</Text>
                  <Text style={{ fontSize: 13, fontWeight: '600', color: '#374151' }}>{cfg.label}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <TextInput
              placeholder="Note optionnelle..."
              value={multiPopupNote}
              onChangeText={setMultiPopupNote}
              style={{ borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 8, padding: 10, fontSize: 13, marginBottom: 8 }}
            />

            <TouchableOpacity
              onPress={async () => {
                for (const cell of selectedCells) {
                  await setStatut(cell.empId, cell.date, null, '')
                }
                await loadStatuts()
                setMultiPopup(false)
                setSelectedCells([])
                setSelectionEmpId(null)
              }}
              style={{ padding: 10, borderRadius: 8, borderWidth: 1, borderColor: '#e5e7eb', alignItems: 'center' }}>
              <Text style={{ color: '#dc2626', fontWeight: '600', fontSize: 13 }}>Effacer le statut</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  )
}

// ── Styles ─────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  header: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 4 },
  headerTitle: { fontSize: 22, fontWeight: '800', color: '#111827' },
  tabsScroll: { flexGrow: 0, flexShrink: 0 },
  tabChip: {
    paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20,
    backgroundColor: '#fff', borderWidth: 1, borderColor: '#e5e7eb',
  },
  tabChipActive: { backgroundColor: '#7c3aed', borderColor: '#7c3aed' },
  tabLabel: { fontSize: 13, fontWeight: '600', color: '#6b7280' },
  tabLabelActive: { color: '#fff' },
  weekNav: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 16, paddingVertical: 8, gap: 8,
  },
  weekLabel: { flex: 1, textAlign: 'center', fontSize: 14, fontWeight: '700', color: '#374151' },
  todayBtn: {
    paddingHorizontal: 10, paddingVertical: 5, borderRadius: 12,
    backgroundColor: '#ede9fe',
  },
  empRow: {
    flexDirection: 'row', alignItems: 'center',
    borderRadius: 8, marginBottom: 3, paddingVertical: 6,
  },
  cell: {
    borderRadius: 8, alignItems: 'center', justifyContent: 'center',
    height: 52, paddingHorizontal: 2,
  },
  cellEmpty: { backgroundColor: 'rgba(229,231,235,0.3)' },
  card: {
    backgroundColor: '#fff', borderRadius: 16, padding: 16,
    shadowColor: '#7c3aed', shadowOpacity: 0.07, shadowRadius: 10, elevation: 3,
  },
  jourRow: {
    flexDirection: 'row', alignItems: 'center', paddingVertical: 6,
    borderBottomWidth: 1, borderColor: '#f3f4f6', gap: 6,
  },
  jourLabel: { width: 78, fontSize: 13, fontWeight: '600' },
  timeInput: {
    borderWidth: 1, borderColor: '#ddd6fe', borderRadius: 8,
    paddingHorizontal: 8, paddingVertical: 5, fontSize: 13,
    backgroundColor: '#faf5ff', color: '#111827', width: 62,
  },
  modeleChip: {
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 14,
    backgroundColor: '#ede9fe', borderWidth: 1, borderColor: '#c4b5fd',
  },
  modeleLabel: { fontSize: 12, color: '#7c3aed', fontWeight: '700' },
  sectionTitle: {
    fontSize: 15, fontWeight: '800', color: '#7c3aed',
    marginBottom: 12, paddingBottom: 8, borderBottomWidth: 1, borderColor: '#ede9fe',
  },
  subTitle: { fontSize: 13, fontWeight: '700', color: '#374151' },
  empty: { color: '#9ca3af', fontSize: 14, textAlign: 'center', paddingVertical: 12 },
  tableRow: {
    flexDirection: 'row', paddingVertical: 8,
    borderBottomWidth: 1, borderColor: '#f3f4f6',
  },
  th: { fontSize: 12, fontWeight: '700', color: '#6b7280' },
  td: { fontSize: 13, color: '#374151' },
  demandeCard: {
    backgroundColor: '#f9fafb', borderRadius: 12, padding: 12,
    marginBottom: 10, borderWidth: 1, borderColor: '#e5e7eb',
  },
  smallBtn: {
    paddingHorizontal: 12, paddingVertical: 7, borderRadius: 8,
    backgroundColor: '#7c3aed', alignItems: 'center', justifyContent: 'center',
  },
  outlineBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10,
    borderWidth: 1.5, borderColor: '#7c3aed', justifyContent: 'center',
  },
  fieldLabel: { fontSize: 13, fontWeight: '600', color: '#374151', marginBottom: 6 },
  input: {
    borderWidth: 1, borderColor: '#ddd6fe', borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 10, fontSize: 14,
    backgroundColor: '#faf5ff', color: '#111827', marginBottom: 12,
  },
  filterChip: {
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16,
    backgroundColor: '#f3f4f6', borderWidth: 1, borderColor: '#e5e7eb',
  },
  filterChipActive: { backgroundColor: '#ede9fe', borderColor: '#7c3aed' },
  filterLabel: { fontSize: 13, color: '#6b7280', fontWeight: '500' },
  filterLabelActive: { color: '#7c3aed', fontWeight: '700' },
  saveBtn: {
    backgroundColor: '#7c3aed', borderRadius: 12, paddingVertical: 13,
    alignItems: 'center', marginTop: 4,
  },
  saveBtnText: { color: '#fff', fontWeight: '800', fontSize: 14 },
  modalBackdrop: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  modalSheet: {
    backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24,
    maxHeight: '85%',
  },
  modalHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    padding: 20, borderBottomWidth: 1, borderColor: '#f3f4f6',
  },
  modalTitle: { fontSize: 16, fontWeight: '800', color: '#111827', flex: 1, marginRight: 8 },
  modalClose: { fontSize: 20, color: '#9ca3af', fontWeight: '700' },
  statutBtn: {
    width: '30%', paddingVertical: 14, borderRadius: 14,
    alignItems: 'center', justifyContent: 'center',
  },
  dialogOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center', alignItems: 'center', padding: 24,
  },
  dialogBox: {
    backgroundColor: '#fff', borderRadius: 20, padding: 24,
    width: '100%', maxWidth: 380,
  },
  dialogTitle: { fontSize: 17, fontWeight: '800', color: '#111827', marginBottom: 6 },
  dialogMsg: { color: '#6b7280', fontSize: 14, lineHeight: 20 },
  dialogBtn: {
    paddingVertical: 12, borderRadius: 10, alignItems: 'center',
  },
})
