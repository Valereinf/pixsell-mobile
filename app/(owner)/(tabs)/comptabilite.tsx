import { useEffect, useState, useRef, useMemo } from 'react'
import {
  View, Text, ScrollView, TouchableOpacity, TextInput, Modal,
  StyleSheet, ActivityIndicator, Share, Platform, KeyboardAvoidingView,
  Alert,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { supabase } from '../../../lib/supabase'
import type { Company } from '../../../lib/types'
import { useOwnerContext } from '../../../lib/ownerContext'

// ── Types ─────────────────────────────────────────────────────────────────────

type PeriodType = 'month' | '3months' | 'year' | 'custom'
type TabId = 'dashboard' | 'encaissements' | 'depenses' | 'rapports' | 'graphiques' | 'remunerations'

interface ReservationJour {
  id: string
  client_prenom: string | null
  client_nom: string | null
  service: string | null
  prix: string | null
  heure_rdv: string
  statut: string
  employee_id: string | null
}

interface EncaisserForm {
  pourboire: string
  penalite: string
  methode: 'comptant' | 'carte' | 'virement' | 'autre'
}

interface ManualForm {
  client_nom: string
  service: string
  employe_id: string
  montant_base: string
  pourboire: string
  methode_paiement: 'comptant' | 'carte' | 'virement' | 'autre'
  note: string
  date_encaissement: string
}

interface DepenseForm {
  categorie: 'loyer' | 'fournitures' | 'equipement' | 'marketing' | 'salaires' | 'taxes' | 'assurances' | 'services' | 'autre'
  type_charge: 'fixe' | 'variable'
  description: string
  montant: string
  date_depense: string
}

interface MonthData { label: string; ym: string; recettes: number; depenses: number }

interface Encaissement {
  id: string
  company_id: string
  reservation_id: string | null
  employe_id: string | null
  client_nom: string | null
  service: string | null
  montant_base: number
  pourboire: number
  penalite: number
  remise: number
  total: number
  methode_paiement: 'comptant' | 'carte' | 'virement' | 'autre'
  statut: 'encaisse' | 'annule' | 'rembourse'
  note: string | null
  date_encaissement: string
  employes?: { nom: string }[] | null
}

interface Depense {
  id: string
  company_id: string
  montant: number
  description: string
  categorie: 'loyer' | 'fournitures' | 'equipement' | 'marketing' | 'salaires' | 'taxes' | 'assurances' | 'services' | 'autre'
  type_charge: 'fixe' | 'variable'
  date_depense: string
  justificatif_url?: string | null
  created_at: string
}

interface Employee {
  id: string
  nom: string
  mode_remuneration?: 'aucun' | 'commission' | 'horaire' | 'fixe' | null
  taux_commission?: number | null
  taux_horaire?: number | null
  salaire_mensuel?: number | null
}

// ── Constants ──────────────────────────────────────────────────────────────────

const CATEGORIES_LABELS: Record<string, string> = {
  loyer: 'Loyer / Charge locative',
  fournitures: 'Fournitures',
  equipement: 'Équipement',
  marketing: 'Marketing',
  salaires: 'Salaires',
  taxes: 'Taxes / Impôts',
  assurances: 'Assurances',
  services: 'Services professionnels',
  autre: 'Autre',
}

const METHODES_LABELS: Record<string, string> = {
  comptant: 'Comptant',
  carte: 'Carte',
  virement: 'Virement',
  autre: 'Autre',
}

const TABS: { id: TabId; label: string }[] = [
  { id: 'dashboard',     label: 'Dashboard' },
  { id: 'encaissements', label: 'Encaissements' },
  { id: 'depenses',      label: 'Dépenses' },
  { id: 'rapports',      label: 'Rapports' },
  { id: 'graphiques',    label: 'Graphiques' },
  { id: 'remunerations', label: 'Rémunérations' },
]

const METHODE_OPTIONS: EncaisserForm['methode'][] = ['comptant', 'carte', 'virement', 'autre']
const CATEGORIE_OPTIONS: DepenseForm['categorie'][] = ['loyer','fournitures','equipement','marketing','salaires','taxes','assurances','services','autre']
const CHARGE_OPTIONS: DepenseForm['type_charge'][] = ['fixe', 'variable']
const PERIOD_OPTIONS: { id: PeriodType; label: string }[] = [
  { id: 'month',    label: 'Ce mois' },
  { id: '3months',  label: '3 mois' },
  { id: 'year',     label: 'Cette année' },
  { id: 'custom',   label: 'Personnalisé' },
]

// ── Helpers ────────────────────────────────────────────────────────────────────

function todayISO() { return new Date().toLocaleDateString('en-CA') }
function fmt(n: number) { return n.toFixed(2) }

function buildDateRange(type: PeriodType, customStart: string, customEnd: string) {
  const today = todayISO()
  const now = new Date()
  if (type === 'month') {
    const s = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
    return { start: s, end: today }
  }
  if (type === '3months') {
    const d = new Date(now); d.setMonth(d.getMonth() - 3)
    return { start: d.toLocaleDateString('en-CA'), end: today }
  }
  if (type === 'year') {
    return { start: `${now.getFullYear()}-01-01`, end: today }
  }
  return { start: customStart || today, end: customEnd || today }
}

function last12Months(): { ym: string; label: string }[] {
  return Array.from({ length: 12 }, (_, i) => {
    const d = new Date()
    d.setDate(1)
    d.setMonth(d.getMonth() - 11 + i)
    return {
      ym: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
      label: d.toLocaleDateString('fr-FR', { month: 'short', year: '2-digit' }),
    }
  })
}

function clientLabel(r: Pick<ReservationJour, 'client_prenom' | 'client_nom'>) {
  return [r.client_prenom, r.client_nom].filter(Boolean).join(' ') || '—'
}

async function exportCSV(rows: (string | number | null)[][], filename: string) {
  const csv = rows
    .map(r => r.map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(','))
    .join('\n')
  await Share.share({ message: csv, title: filename })
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function KpiCard({ label, value, color, sub }: { label: string; value: string; color: string; sub?: string }) {
  return (
    <View style={[s.kpiCard, { borderLeftColor: color }]}>
      <Text style={s.kpiLabel}>{label}</Text>
      <Text style={[s.kpiValue, { color }]}>{value}</Text>
      {sub ? <Text style={s.kpiSub}>{sub}</Text> : null}
    </View>
  )
}

function HBar({ label, value, max, color }: { label: string; value: number; max: number; color: string }) {
  const pct = max > 0 ? Math.max(0.02, value / max) : 0.02
  return (
    <View style={{ marginBottom: 8 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 3 }}>
        <Text style={{ fontSize: 13, color: '#374151' }} numberOfLines={1}>{label}</Text>
        <Text style={{ fontSize: 13, fontWeight: '600', color }}>{fmt(value)} $</Text>
      </View>
      <View style={{ height: 8, borderRadius: 4, backgroundColor: '#e5e7eb' }}>
        <View style={{ height: 8, borderRadius: 4, backgroundColor: color, width: `${Math.round(pct * 100)}%` }} />
      </View>
    </View>
  )
}

function Badge({ label, color, bg }: { label: string; color: string; bg: string }) {
  return (
    <View style={{ paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, backgroundColor: bg, alignSelf: 'flex-start' }}>
      <Text style={{ fontSize: 11, color, fontWeight: '600' }}>{label}</Text>
    </View>
  )
}

function MethodePill({ value, selected, onPress }: { value: EncaisserForm['methode']; selected: boolean; onPress: () => void }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      style={{
        paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, marginRight: 8,
        backgroundColor: selected ? '#7c3aed' : '#f3f4f6',
        borderWidth: selected ? 0 : 1, borderColor: '#e5e7eb',
      }}
    >
      <Text style={{ color: selected ? '#fff' : '#374151', fontSize: 13, fontWeight: '500' }}>
        {METHODES_LABELS[value]}
      </Text>
    </TouchableOpacity>
  )
}

// ── Main Component ─────────────────────────────────────────────────────────────

export default function ComptabiliteScreen() {
  const { company: ctxCompany }       = useOwnerContext()
  const [company, setCompany]         = useState<Company | null>(ctxCompany)
  const [tab, setTab]                 = useState<TabId>('dashboard')
  const [period, setPeriod]           = useState<PeriodType>('month')
  const [customStart, setCustomStart] = useState('')
  const [customEnd, setCustomEnd]     = useState('')
  const [loading, setLoading]         = useState(true)

  // Encaissements
  const [encaissements, setEncaissements] = useState<Encaissement[]>([])
  // Dépenses
  const [depenses, setDepenses]           = useState<Depense[]>([])
  // Réservations du jour
  const [rdvJour, setRdvJour]             = useState<ReservationJour[]>([])
  const [dateJour, setDateJour]           = useState(todayISO())
  // Employés
  const [employes, setEmployes]           = useState<Employee[]>([])
  // 12 mois
  const [monthData, setMonthData]         = useState<MonthData[]>([])
  // Heures saisies (mode horaire)
  const [heuresEmp, setHeuresEmp]         = useState<Record<string, string>>({})

  // Encaissement inline state per rdv
  const [encForms, setEncForms] = useState<Record<string, EncaisserForm>>({})
  const [encLoading, setEncLoading] = useState<Record<string, boolean>>({})
  const [encaissesIds, setEncaissesIds] = useState<Set<string>>(new Set())
  const [encaissesTotals, setEncaissesTotals] = useState<Record<string, number>>({})

  // Modals
  const [showManual, setShowManual]     = useState(false)
  const [showDepense, setShowDepense]   = useState(false)
  const [detailEnc, setDetailEnc]       = useState<Encaissement | null>(null)
  const [annulerEnc, setAnnulerEnc]     = useState<Encaissement | null>(null)
  const [deleteDepId, setDeleteDepId]   = useState<string | null>(null)
  const [saving, setSaving]             = useState(false)

  // Filters — encaissements historique
  const [histStart, setHistStart] = useState('')
  const [histEnd, setHistEnd]     = useState('')
  const [histEmp, setHistEmp]     = useState('')
  const [histMeth, setHistMeth]   = useState('')

  // Filters — dépenses historique
  const [depStart, setDepStart]   = useState('')
  const [depEnd, setDepEnd]       = useState('')
  const [depCat, setDepCat]       = useState('')

  // Forms
  const [manualForm, setManualForm] = useState<ManualForm>({
    client_nom: '', service: '', employe_id: '', montant_base: '',
    pourboire: '', methode_paiement: 'comptant', note: '',
    date_encaissement: todayISO(),
  })
  const [depenseForm, setDepenseForm] = useState<DepenseForm>({
    categorie: 'loyer', type_charge: 'fixe', description: '',
    montant: '', date_depense: todayISO(),
  })

  // ── Load company ──────────────────────────────────────────────────
  useEffect(() => {
    if (ctxCompany) { setCompany(ctxCompany); return }
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return
      supabase.from('companies').select('*').eq('owner_email', user.email).single()
        .then(({ data }) => { if (data) setCompany(data as Company) })
    })
  }, [ctxCompany])

  // ── Load data on company / period change ──────────────────────────
  const { start, end } = buildDateRange(period, customStart, customEnd)

  useEffect(() => {
    if (!company) return
    loadAll()
  }, [company, period, customStart, customEnd])

  useEffect(() => {
    if (!company) return
    loadRdvJour()
  }, [company, dateJour])

  async function loadAll() {
    setLoading(true)
    const cid = company!.id
    const [encRes, depRes, empRes] = await Promise.all([
      supabase.from('encaissements')
        .select('*, employes(nom)')
        .eq('company_id', cid)
        .gte('date_encaissement', start)
        .lte('date_encaissement', end)
        .eq('statut', 'encaisse')
        .order('date_encaissement', { ascending: false }),
      supabase.from('depenses')
        .select('*')
        .eq('company_id', cid)
        .gte('date_depense', start)
        .lte('date_depense', end)
        .order('date_depense', { ascending: false }),
      supabase.from('employes')
        .select('id, nom, mode_remuneration, taux_commission, taux_horaire, salaire_mensuel')
        .eq('company_id', cid)
        .eq('actif', true)
        .order('nom'),
    ])
    setEncaissements(encRes.data ?? [])
    setDepenses(depRes.data ?? [])
    setEmployes(empRes.data ?? [])
    await loadMonthData(cid)
    setLoading(false)
  }

  async function loadRdvJour() {
    if (!company) return
    const { data } = await supabase
      .from('reservations')
      .select('id, client_prenom, client_nom, service, prix, heure_rdv, statut, employee_id')
      .eq('company_id', company.id)
      .eq('date_rdv', dateJour)
      .neq('statut', 'cancelled')
      .order('heure_rdv')
    const rows = (data ?? []) as ReservationJour[]
    setRdvJour(rows)
    // Load already-encaissed reservations for today
    const { data: encs } = await supabase
      .from('encaissements')
      .select('reservation_id, total')
      .eq('company_id', company.id)
      .eq('date_encaissement', dateJour)
      .eq('statut', 'encaisse')
      .not('reservation_id', 'is', null)
    const ids = new Set<string>((encs ?? []).map((e: { reservation_id: string }) => e.reservation_id))
    const totals: Record<string, number> = {}
    ;(encs ?? []).forEach((e: { reservation_id: string; total: number }) => { totals[e.reservation_id] = e.total })
    setEncaissesIds(ids)
    setEncaissesTotals(totals)
    // Init forms
    const forms: Record<string, EncaisserForm> = {}
    rows.forEach(r => { forms[r.id] = { pourboire: '', penalite: '', methode: 'comptant' } })
    setEncForms(forms)
  }

  async function loadMonthData(cid: string) {
    const months = last12Months()
    const rangeStart = months[0].ym + '-01'
    const [encRes, depRes] = await Promise.all([
      supabase.from('encaissements')
        .select('total, date_encaissement')
        .eq('company_id', cid)
        .eq('statut', 'encaisse')
        .gte('date_encaissement', rangeStart),
      supabase.from('depenses')
        .select('montant, date_depense')
        .eq('company_id', cid)
        .gte('date_depense', rangeStart),
    ])
    const encByMonth: Record<string, number> = {}
    ;(encRes.data ?? []).forEach((e: { date_encaissement: string; total: number }) => {
      const ym = e.date_encaissement.slice(0, 7)
      encByMonth[ym] = (encByMonth[ym] ?? 0) + Number(e.total)
    })
    const depByMonth: Record<string, number> = {}
    ;(depRes.data ?? []).forEach((d: { date_depense: string; montant: number }) => {
      const ym = d.date_depense.slice(0, 7)
      depByMonth[ym] = (depByMonth[ym] ?? 0) + Number(d.montant)
    })
    setMonthData(months.map(m => ({
      ...m,
      recettes: encByMonth[m.ym] ?? 0,
      depenses: depByMonth[m.ym] ?? 0,
    })))
  }

  // ── Encaisser réservation ─────────────────────────────────────────
  async function handleEncaisser(rdv: ReservationJour) {
    if (!company) return
    const f = encForms[rdv.id] ?? { pourboire: '', penalite: '', methode: 'comptant' as const }
    const montant_base = Number(rdv.prix ?? 0)
    const pourboire = Number(f.pourboire || 0)
    const penalite = Number(f.penalite || 0)
    const client_nom = clientLabel(rdv)
    setEncLoading(prev => ({ ...prev, [rdv.id]: true }))
    const { error } = await supabase.from('encaissements').insert({
      company_id: company.id,
      reservation_id: rdv.id,
      employe_id: rdv.employee_id ?? null,
      client_nom,
      service: rdv.service,
      montant_base,
      pourboire,
      penalite,
      total: montant_base + pourboire + penalite,
      methode_paiement: f.methode,
      date_encaissement: dateJour,
    })
    if (!error) {
      await supabase.from('reservations').update({ statut: 'completed' }).eq('id', rdv.id)
      setEncaissesIds(prev => new Set([...prev, rdv.id]))
      setEncaissesTotals(prev => ({ ...prev, [rdv.id]: montant_base + pourboire + penalite }))
      await loadAll()
    }
    setEncLoading(prev => ({ ...prev, [rdv.id]: false }))
  }

  // ── Encaissement manuel ───────────────────────────────────────────
  async function handleManual() {
    if (!company) return
    setSaving(true)
    const montant_base = Number(manualForm.montant_base || 0)
    const pourboire = Number(manualForm.pourboire || 0)
    await supabase.from('encaissements').insert({
      company_id: company.id,
      employe_id: manualForm.employe_id || null,
      client_nom: manualForm.client_nom || null,
      service: manualForm.service || null,
      montant_base,
      pourboire,
      penalite: 0,
      total: montant_base + pourboire,
      methode_paiement: manualForm.methode_paiement,
      note: manualForm.note || null,
      date_encaissement: manualForm.date_encaissement,
    })
    await loadAll()
    setShowManual(false)
    setManualForm({ client_nom: '', service: '', employe_id: '', montant_base: '', pourboire: '', methode_paiement: 'comptant', note: '', date_encaissement: todayISO() })
    setSaving(false)
  }

  // ── Ajouter dépense ───────────────────────────────────────────────
  async function handleAddDepense() {
    if (!company) return
    setSaving(true)
    await supabase.from('depenses').insert({
      company_id: company.id,
      categorie: depenseForm.categorie,
      type_charge: depenseForm.type_charge,
      description: depenseForm.description,
      montant: Number(depenseForm.montant),
      date_depense: depenseForm.date_depense,
    })
    await loadAll()
    setShowDepense(false)
    setDepenseForm({ categorie: 'loyer', type_charge: 'fixe', description: '', montant: '', date_depense: todayISO() })
    setSaving(false)
  }

  // ── Annuler encaissement ──────────────────────────────────────────
  async function handleAnnuler() {
    if (!annulerEnc) return
    setSaving(true)
    await supabase.from('encaissements').update({ statut: 'annule' }).eq('id', annulerEnc.id)
    setEncaissements(prev => prev.filter(e => e.id !== annulerEnc.id))
    setAnnulerEnc(null)
    setSaving(false)
  }

  // ── Supprimer dépense ─────────────────────────────────────────────
  async function handleDeleteDep() {
    if (!deleteDepId) return
    setSaving(true)
    await supabase.from('depenses').delete().eq('id', deleteDepId)
    setDepenses(prev => prev.filter(d => d.id !== deleteDepId))
    setDeleteDepId(null)
    setSaving(false)
  }

  // ── Computed values ───────────────────────────────────────────────
  const totalRecettes   = useMemo(() => encaissements.reduce((s, e) => s + Number(e.total), 0), [encaissements])
  const totalDepenses   = useMemo(() => depenses.reduce((s, d) => s + Number(d.montant), 0), [depenses])
  const benefice        = totalRecettes - totalDepenses
  const chargesFixe     = useMemo(() => depenses.filter(d => d.type_charge === 'fixe').reduce((s, d) => s + Number(d.montant), 0), [depenses])
  const chargesVariable = useMemo(() => depenses.filter(d => d.type_charge === 'variable').reduce((s, d) => s + Number(d.montant), 0), [depenses])

  const recettesParEmp = useMemo(() => {
    const map: Record<string, { nom: string; total: number }> = {}
    encaissements.forEach(e => {
      const id = e.employe_id ?? '__none__'
      const nom = (e.employes as { nom: string }[] | null)?.[0]?.nom ?? 'Non assigné'
      if (!map[id]) map[id] = { nom, total: 0 }
      map[id].total += Number(e.total)
    })
    return Object.values(map).sort((a, b) => b.total - a.total)
  }, [encaissements])

  const recettesParService = useMemo(() => {
    const map: Record<string, number> = {}
    encaissements.forEach(e => {
      const svc = e.service ?? '—'
      map[svc] = (map[svc] ?? 0) + Number(e.total)
    })
    return Object.entries(map).map(([nom, total]) => ({ nom, total })).sort((a, b) => b.total - a.total).slice(0, 8)
  }, [encaissements])

  const depensesParCat = useMemo(() => {
    const map: Record<string, number> = {}
    depenses.forEach(d => { map[d.categorie] = (map[d.categorie] ?? 0) + Number(d.montant) })
    return Object.entries(map).map(([cat, total]) => ({ cat, total })).sort((a, b) => b.total - a.total)
  }, [depenses])

  const recettesParJour = useMemo(() => {
    const jours = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam']
    const sums = [0, 0, 0, 0, 0, 0, 0]
    encaissements.forEach(e => {
      const d = new Date(e.date_encaissement + 'T12:00:00')
      sums[d.getDay()] += Number(e.total)
    })
    return jours.map((label, i) => ({ label, value: sums[i] }))
  }, [encaissements])

  const recap30 = useMemo(() => {
    const map: Record<string, { nb: number; total: number }> = {}
    const limit = new Date(); limit.setDate(limit.getDate() - 30)
    encaissements
      .filter(e => new Date(e.date_encaissement) >= limit)
      .forEach(e => {
        const d = e.date_encaissement
        if (!map[d]) map[d] = { nb: 0, total: 0 }
        map[d].nb++
        map[d].total += Number(e.total)
      })
    return Object.entries(map).map(([date, v]) => ({ date, ...v })).sort((a, b) => b.date.localeCompare(a.date))
  }, [encaissements])

  const filteredEnc = useMemo(() => encaissements.filter(e => {
    if (histStart && e.date_encaissement < histStart) return false
    if (histEnd && e.date_encaissement > histEnd) return false
    if (histEmp && e.employe_id !== histEmp) return false
    if (histMeth && e.methode_paiement !== histMeth) return false
    return true
  }), [encaissements, histStart, histEnd, histEmp, histMeth])

  const filteredDep = useMemo(() => depenses.filter(d => {
    if (depStart && d.date_depense < depStart) return false
    if (depEnd && d.date_depense > depEnd) return false
    if (depCat && d.categorie !== depCat) return false
    return true
  }), [depenses, depStart, depEnd, depCat])

  // ── Rémunérations ─────────────────────────────────────────────────
  const remuData = useMemo(() => {
    const [sy, sm] = start.split('-').map(Number)
    const [ey, em] = end.split('-').map(Number)
    const nbMois = Math.max(1, (ey - sy) * 12 + (em - sm) + 1)
    return employes.map(emp => {
      const recettes = encaissements
        .filter(e => e.employe_id === emp.id)
        .reduce((s, e) => s + Number(e.total), 0)
      let remuneration = 0
      let detail = '—'
      const mode = emp.mode_remuneration ?? 'aucun'
      if (mode === 'commission' && emp.taux_commission) {
        remuneration = recettes * Number(emp.taux_commission) / 100
        detail = `${emp.taux_commission}% × ${fmt(recettes)} $`
      } else if (mode === 'fixe' && emp.salaire_mensuel) {
        remuneration = Number(emp.salaire_mensuel) * nbMois
        detail = `${fmt(Number(emp.salaire_mensuel))} $/mois × ${nbMois} mois`
      } else if (mode === 'horaire' && emp.taux_horaire) {
        const h = Number(heuresEmp[emp.id] || 0)
        remuneration = Number(emp.taux_horaire) * h
        detail = `${fmt(Number(emp.taux_horaire))} $/h × ${h} h`
      }
      return { emp, recettes, remuneration, detail, mode }
    })
  }, [employes, encaissements, heuresEmp, start, end])

  const totalRemu = useMemo(() => remuData.reduce((s, r) => s + r.remuneration, 0), [remuData])
  const ratioMasse = totalRecettes > 0 ? (totalRemu / totalRecettes * 100) : 0
  const hasUnconfigured = employes.some(e => !e.mode_remuneration || e.mode_remuneration === 'aucun')

  // ── Render ─────────────────────────────────────────────────────────
  const showPeriod = ['dashboard', 'rapports', 'remunerations'].includes(tab)
  const maxEmp = Math.max(1, ...recettesParEmp.map(e => e.total))
  const maxSvc = Math.max(1, ...recettesParService.map(s => s.total))
  const maxCat = Math.max(1, ...depensesParCat.map(d => d.total))
  const maxMonth = Math.max(1, ...monthData.map(m => Math.max(m.recettes, m.depenses)))
  const maxJour = Math.max(1, ...recettesParJour.map(j => j.value))

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#f5f3ff' }} edges={['top']}>
      {/* Header */}
      <View style={s.header}>
        <Text style={s.headerTitle}>Comptabilité</Text>
        <TouchableOpacity style={s.addBtn} onPress={() => setShowManual(true)}>
          <Text style={s.addBtnText}>+ Encaisser</Text>
        </TouchableOpacity>
      </View>

      {/* Onglets */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.tabsScroll} contentContainerStyle={{ paddingHorizontal: 16, paddingVertical: 8, gap: 8 }}>
        {TABS.map(t => {
          const active = tab === t.id
          return (
            <TouchableOpacity
              key={t.id}
              onPress={() => setTab(t.id)}
              style={[s.tabChip, active && s.tabChipActive]}
            >
              <Text style={[s.tabLabel, active && s.tabLabelActive]}>{t.label}</Text>
            </TouchableOpacity>
          )
        })}
      </ScrollView>

      {/* Période */}
      {showPeriod && (
        <View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 8, gap: 8 }}>
            {PERIOD_OPTIONS.map(p => {
              const active = period === p.id
              return (
                <TouchableOpacity key={p.id} onPress={() => setPeriod(p.id)} style={[s.periodChip, active && s.periodChipActive]}>
                  <Text style={[s.periodLabel, active && s.periodLabelActive]}>{p.label}</Text>
                </TouchableOpacity>
              )
            })}
          </ScrollView>
          {period === 'custom' && (
            <View style={{ flexDirection: 'row', paddingHorizontal: 16, gap: 8, marginBottom: 8 }}>
              <TextInput style={[s.input, { flex: 1 }]} placeholder="Début AAAA-MM-JJ" value={customStart} onChangeText={setCustomStart} />
              <TextInput style={[s.input, { flex: 1 }]} placeholder="Fin AAAA-MM-JJ" value={customEnd} onChangeText={setCustomEnd} />
            </View>
          )}
        </View>
      )}

      {/* Contenu */}
      {loading ? (
        <ActivityIndicator style={{ marginTop: 40 }} size="large" color="#7c3aed" />
      ) : (
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, paddingBottom: 100 }}>

          {/* ── DASHBOARD ── */}
          {tab === 'dashboard' && (
            <View>
              <View style={s.kpiGrid}>
                <KpiCard label="Recettes"      value={`${fmt(totalRecettes)} $`}   color="#059669" />
                <KpiCard label="Dépenses"      value={`${fmt(totalDepenses)} $`}   color="#dc2626" />
                <KpiCard label="Bénéfice"      value={`${fmt(benefice)} $`}        color={benefice >= 0 ? '#7c3aed' : '#dc2626'} />
                <KpiCard label="Encaissements" value={`${encaissements.length}`}   color="#2563eb" />
              </View>

              <View style={s.section}>
                <Text style={s.sectionTitle}>Recettes par employé</Text>
                {recettesParEmp.length === 0
                  ? <Text style={s.empty}>Aucune donnée</Text>
                  : recettesParEmp.map(e => <HBar key={e.nom} label={e.nom} value={e.total} max={maxEmp} color="#7c3aed" />)
                }
              </View>

              <View style={s.section}>
                <Text style={s.sectionTitle}>Recettes par service (top 8)</Text>
                {recettesParService.length === 0
                  ? <Text style={s.empty}>Aucune donnée</Text>
                  : recettesParService.map(e => <HBar key={e.nom} label={e.nom} value={e.total} max={maxSvc} color="#db2777" />)
                }
              </View>

              <View style={s.section}>
                <Text style={s.sectionTitle}>Récapitulatif journalier (30 derniers jours)</Text>
                {recap30.length === 0
                  ? <Text style={s.empty}>Aucune donnée</Text>
                  : recap30.map(r => (
                    <View key={r.date} style={s.tableRow}>
                      <Text style={[s.tableCell, { flex: 2 }]}>{r.date}</Text>
                      <Text style={[s.tableCell, { flex: 1, textAlign: 'center' }]}>{r.nb}</Text>
                      <Text style={[s.tableCell, { flex: 2, textAlign: 'right', color: '#059669', fontWeight: '600' }]}>{fmt(r.total)} $</Text>
                    </View>
                  ))
                }
              </View>
            </View>
          )}

          {/* ── ENCAISSEMENTS ── */}
          {tab === 'encaissements' && (
            <View>
              {/* Sélecteur date */}
              <View style={[s.section, { flexDirection: 'row', alignItems: 'center', gap: 12 }]}>
                <Text style={s.fieldLabel}>Date :</Text>
                <TextInput style={[s.input, { flex: 1 }]} value={dateJour} onChangeText={setDateJour} placeholder="AAAA-MM-JJ" />
                <View style={{ backgroundColor: '#ede9fe', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8 }}>
                  <Text style={{ color: '#7c3aed', fontWeight: '700' }}>
                    {encaissesIds.size} / {rdvJour.length} encaissés
                  </Text>
                </View>
              </View>

              {/* Réservations du jour */}
              <View style={s.section}>
                <Text style={s.sectionTitle}>Réservations du {dateJour}</Text>
                {rdvJour.length === 0
                  ? <Text style={s.empty}>Aucune réservation</Text>
                  : rdvJour.map(rdv => {
                    const done = encaissesIds.has(rdv.id)
                    const f = encForms[rdv.id] ?? { pourboire: '', penalite: '', methode: 'comptant' as const }
                    const base = Number(rdv.prix ?? 0)
                    const total = base + Number(f.pourboire || 0) + Number(f.penalite || 0)
                    return (
                      <View key={rdv.id} style={s.rdvCard}>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                          <Text style={{ fontWeight: '700', color: '#111827' }}>{rdv.heure_rdv} — {clientLabel(rdv)}</Text>
                          <Text style={{ color: '#6b7280', fontSize: 13 }}>{rdv.service ?? '—'}</Text>
                        </View>
                        <Text style={{ color: '#374151', fontSize: 13, marginBottom: 8 }}>
                          Prix de base : <Text style={{ fontWeight: '600', color: '#059669' }}>{fmt(base)} $</Text>
                        </Text>
                        {done ? (
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                            <View style={{ backgroundColor: '#d1fae5', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 }}>
                              <Text style={{ color: '#059669', fontWeight: '700' }}>Encaissé — {fmt(encaissesTotals[rdv.id] ?? 0)} $</Text>
                            </View>
                          </View>
                        ) : (
                          <View>
                            <View style={{ flexDirection: 'row', gap: 8, marginBottom: 8 }}>
                              <View style={{ flex: 1 }}>
                                <Text style={s.fieldLabel}>Pourboire</Text>
                                <TextInput
                                  style={s.input}
                                  keyboardType="numeric"
                                  placeholder="0"
                                  value={f.pourboire}
                                  onChangeText={v => setEncForms(prev => ({ ...prev, [rdv.id]: { ...f, pourboire: v } }))}
                                />
                              </View>
                              <View style={{ flex: 1 }}>
                                <Text style={s.fieldLabel}>Pénalité</Text>
                                <TextInput
                                  style={s.input}
                                  keyboardType="numeric"
                                  placeholder="0"
                                  value={f.penalite}
                                  onChangeText={v => setEncForms(prev => ({ ...prev, [rdv.id]: { ...f, penalite: v } }))}
                                />
                              </View>
                            </View>
                            <Text style={[s.fieldLabel, { marginBottom: 6 }]}>Méthode</Text>
                            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 10 }}>
                              {METHODE_OPTIONS.map(m => (
                                <MethodePill
                                  key={m}
                                  value={m}
                                  selected={f.methode === m}
                                  onPress={() => setEncForms(prev => ({ ...prev, [rdv.id]: { ...f, methode: m } }))}
                                />
                              ))}
                            </ScrollView>
                            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                              <Text style={{ color: '#374151', fontWeight: '600' }}>Total : {fmt(total)} $</Text>
                              <TouchableOpacity
                                style={s.encaisserBtn}
                                onPress={() => handleEncaisser(rdv)}
                                disabled={!!encLoading[rdv.id]}
                              >
                                {encLoading[rdv.id]
                                  ? <ActivityIndicator size="small" color="#fff" />
                                  : <Text style={s.encaisserBtnText}>ENCAISSER</Text>
                                }
                              </TouchableOpacity>
                            </View>
                          </View>
                        )}
                      </View>
                    )
                  })
                }
              </View>

              {/* Historique */}
              <View style={s.section}>
                <Text style={s.sectionTitle}>Historique encaissements</Text>
                <View style={{ flexDirection: 'row', gap: 8, marginBottom: 8 }}>
                  <TextInput style={[s.input, { flex: 1 }]} placeholder="Début" value={histStart} onChangeText={setHistStart} />
                  <TextInput style={[s.input, { flex: 1 }]} placeholder="Fin" value={histEnd} onChangeText={setHistEnd} />
                </View>
                <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }}>
                  <View style={{ flex: 1 }}>
                    <Text style={s.fieldLabel}>Employé</Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
                      <TouchableOpacity onPress={() => setHistEmp('')} style={[s.filterChip, !histEmp && s.filterChipActive]}>
                        <Text style={[s.filterLabel, !histEmp && s.filterLabelActive]}>Tous</Text>
                      </TouchableOpacity>
                      {employes.map(e => (
                        <TouchableOpacity key={e.id} onPress={() => setHistEmp(histEmp === e.id ? '' : e.id)} style={[s.filterChip, histEmp === e.id && s.filterChipActive]}>
                          <Text style={[s.filterLabel, histEmp === e.id && s.filterLabelActive]}>{e.nom}</Text>
                        </TouchableOpacity>
                      ))}
                    </ScrollView>
                  </View>
                </View>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, marginBottom: 12 }}>
                  <TouchableOpacity onPress={() => setHistMeth('')} style={[s.filterChip, !histMeth && s.filterChipActive]}>
                    <Text style={[s.filterLabel, !histMeth && s.filterLabelActive]}>Toutes méthodes</Text>
                  </TouchableOpacity>
                  {METHODE_OPTIONS.map(m => (
                    <TouchableOpacity key={m} onPress={() => setHistMeth(histMeth === m ? '' : m)} style={[s.filterChip, histMeth === m && s.filterChipActive]}>
                      <Text style={[s.filterLabel, histMeth === m && s.filterLabelActive]}>{METHODES_LABELS[m]}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
                {filteredEnc.length === 0
                  ? <Text style={s.empty}>Aucun encaissement</Text>
                  : filteredEnc.map(e => (
                    <TouchableOpacity key={e.id} style={s.encCard} onPress={() => setDetailEnc(e)}>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                        <Text style={{ fontWeight: '700', color: '#111827' }}>{e.client_nom ?? '—'}</Text>
                        <Text style={{ fontWeight: '700', color: '#059669' }}>{fmt(e.total)} $</Text>
                      </View>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 }}>
                        <Text style={{ color: '#6b7280', fontSize: 13 }}>{e.service ?? '—'} · {e.date_encaissement}</Text>
                        <Badge label={METHODES_LABELS[e.methode_paiement]} color="#7c3aed" bg="#ede9fe" />
                      </View>
                    </TouchableOpacity>
                  ))
                }
              </View>
            </View>
          )}

          {/* ── DÉPENSES ── */}
          {tab === 'depenses' && (
            <View>
              <TouchableOpacity style={[s.addBtn, { alignSelf: 'flex-start', marginBottom: 16 }]} onPress={() => setShowDepense(true)}>
                <Text style={s.addBtnText}>+ Nouvelle dépense</Text>
              </TouchableOpacity>

              <View style={s.section}>
                <Text style={s.sectionTitle}>Historique dépenses</Text>
                <View style={{ flexDirection: 'row', gap: 8, marginBottom: 8 }}>
                  <TextInput style={[s.input, { flex: 1 }]} placeholder="Début" value={depStart} onChangeText={setDepStart} />
                  <TextInput style={[s.input, { flex: 1 }]} placeholder="Fin" value={depEnd} onChangeText={setDepEnd} />
                </View>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, marginBottom: 12 }}>
                  <TouchableOpacity onPress={() => setDepCat('')} style={[s.filterChip, !depCat && s.filterChipActive]}>
                    <Text style={[s.filterLabel, !depCat && s.filterLabelActive]}>Toutes</Text>
                  </TouchableOpacity>
                  {CATEGORIE_OPTIONS.map(c => (
                    <TouchableOpacity key={c} onPress={() => setDepCat(depCat === c ? '' : c)} style={[s.filterChip, depCat === c && s.filterChipActive]}>
                      <Text style={[s.filterLabel, depCat === c && s.filterLabelActive]}>{CATEGORIES_LABELS[c]}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
                {filteredDep.length === 0
                  ? <Text style={s.empty}>Aucune dépense</Text>
                  : filteredDep.map(d => (
                    <View key={d.id} style={s.depCard}>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                        <Text style={{ fontWeight: '700', color: '#111827' }}>{d.description || CATEGORIES_LABELS[d.categorie]}</Text>
                        <Text style={{ fontWeight: '700', color: '#dc2626' }}>{fmt(d.montant)} $</Text>
                      </View>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                        <View style={{ flexDirection: 'row', gap: 6 }}>
                          <Badge label={CATEGORIES_LABELS[d.categorie]} color="#7c3aed" bg="#ede9fe" />
                          <Badge
                            label={d.type_charge === 'fixe' ? 'Fixe' : 'Variable'}
                            color={d.type_charge === 'fixe' ? '#7c3aed' : '#6b7280'}
                            bg={d.type_charge === 'fixe' ? '#ede9fe' : '#f3f4f6'}
                          />
                        </View>
                        <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
                          <Text style={{ color: '#9ca3af', fontSize: 12 }}>{d.date_depense}</Text>
                          <TouchableOpacity onPress={() => setDeleteDepId(d.id)}>
                            <Text style={{ color: '#dc2626', fontSize: 13, fontWeight: '600' }}>Suppr.</Text>
                          </TouchableOpacity>
                        </View>
                      </View>
                    </View>
                  ))
                }
              </View>
            </View>
          )}

          {/* ── RAPPORTS ── */}
          {tab === 'rapports' && (
            <View>
              <View style={s.kpiGrid}>
                <KpiCard label="Recettes"       value={`${fmt(totalRecettes)} $`}   color="#059669" />
                <KpiCard label="Dépenses"       value={`${fmt(totalDepenses)} $`}   color="#dc2626" />
                <KpiCard label="Charges fixes"  value={`${fmt(chargesFixe)} $`}     color="#7c3aed" />
                <KpiCard label="Ch. variables"  value={`${fmt(chargesVariable)} $`} color="#d97706" />
              </View>

              <View style={[s.section, { backgroundColor: benefice >= 0 ? '#f0fdf4' : '#fef2f2', borderColor: benefice >= 0 ? '#a7f3d0' : '#fecaca', borderWidth: 1, borderRadius: 16 }]}>
                <Text style={{ textAlign: 'center', color: '#6b7280', marginBottom: 4 }}>Bénéfice net</Text>
                <Text style={{ textAlign: 'center', fontSize: 36, fontWeight: '800', color: benefice >= 0 ? '#059669' : '#dc2626' }}>
                  {benefice >= 0 ? '+' : ''}{fmt(benefice)} $
                </Text>
              </View>

              <View style={s.section}>
                <Text style={s.sectionTitle}>Recettes par employé</Text>
                {recettesParEmp.map(e => <HBar key={e.nom} label={e.nom} value={e.total} max={maxEmp} color="#7c3aed" />)}
              </View>

              <View style={s.section}>
                <Text style={s.sectionTitle}>Dépenses par catégorie</Text>
                {depensesParCat.map(d => <HBar key={d.cat} label={CATEGORIES_LABELS[d.cat] ?? d.cat} value={d.total} max={maxCat} color="#dc2626" />)}
              </View>

              <View style={s.section}>
                <Text style={s.sectionTitle}>Évolution 12 mois</Text>
                <View style={[s.tableRow, { backgroundColor: '#f3f4f6' }]}>
                  <Text style={[s.tableHeader, { flex: 2 }]}>Mois</Text>
                  <Text style={[s.tableHeader, { flex: 2, textAlign: 'right' }]}>Recettes</Text>
                  <Text style={[s.tableHeader, { flex: 2, textAlign: 'right' }]}>Dépenses</Text>
                  <Text style={[s.tableHeader, { flex: 2, textAlign: 'right' }]}>Bénéfice</Text>
                </View>
                {monthData.map(m => {
                  const ben = m.recettes - m.depenses
                  return (
                    <View key={m.ym} style={s.tableRow}>
                      <Text style={[s.tableCell, { flex: 2 }]}>{m.label}</Text>
                      <Text style={[s.tableCell, { flex: 2, textAlign: 'right', color: '#059669' }]}>{fmt(m.recettes)}</Text>
                      <Text style={[s.tableCell, { flex: 2, textAlign: 'right', color: '#dc2626' }]}>{fmt(m.depenses)}</Text>
                      <Text style={[s.tableCell, { flex: 2, textAlign: 'right', fontWeight: '700', color: ben >= 0 ? '#059669' : '#dc2626' }]}>{fmt(ben)}</Text>
                    </View>
                  )
                })}
              </View>
            </View>
          )}

          {/* ── GRAPHIQUES ── */}
          {tab === 'graphiques' && (
            <View>
              {/* Évolution recettes vs dépenses */}
              <View style={s.section}>
                <Text style={s.sectionTitle}>Recettes vs Dépenses (12 mois)</Text>
                <View style={{ flexDirection: 'row', gap: 12, marginBottom: 8 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                    <View style={{ width: 12, height: 12, borderRadius: 2, backgroundColor: '#7c3aed' }} />
                    <Text style={{ fontSize: 12, color: '#6b7280' }}>Recettes</Text>
                  </View>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                    <View style={{ width: 12, height: 12, borderRadius: 2, backgroundColor: '#dc2626' }} />
                    <Text style={{ fontSize: 12, color: '#6b7280' }}>Dépenses</Text>
                  </View>
                </View>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  <View style={{ flexDirection: 'row', alignItems: 'flex-end', height: 140, gap: 2 }}>
                    {monthData.map((m, i) => (
                      <View key={i} style={{ alignItems: 'center', width: 36 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 2, height: 110 }}>
                          <View style={{ width: 14, backgroundColor: '#7c3aed', borderRadius: 3, height: Math.max(2, (m.recettes / maxMonth) * 110) }} />
                          <View style={{ width: 14, backgroundColor: '#fca5a5', borderRadius: 3, height: Math.max(2, (m.depenses / maxMonth) * 110) }} />
                        </View>
                        <Text style={{ fontSize: 9, color: '#6b7280', marginTop: 4 }} numberOfLines={1}>{m.label}</Text>
                      </View>
                    ))}
                  </View>
                </ScrollView>
              </View>

              {/* Revenus par jour */}
              <View style={s.section}>
                <Text style={s.sectionTitle}>Recettes par jour de semaine</Text>
                <View style={{ flexDirection: 'row', alignItems: 'flex-end', height: 140, gap: 4 }}>
                  {recettesParJour.map((j, i) => (
                    <View key={i} style={{ flex: 1, alignItems: 'center' }}>
                      <Text style={{ fontSize: 10, color: '#059669', marginBottom: 4, fontWeight: '600' }}>
                        {j.value > 0 ? `${Math.round(j.value)}` : ''}
                      </Text>
                      <View style={{
                        width: '80%',
                        height: Math.max(4, (j.value / maxJour) * 90),
                        backgroundColor: '#059669',
                        borderRadius: 4,
                      }} />
                      <Text style={{ fontSize: 11, color: '#6b7280', marginTop: 4 }}>{j.label}</Text>
                    </View>
                  ))}
                </View>
              </View>

              {/* Recettes par employé (barres horizontales) */}
              <View style={s.section}>
                <Text style={s.sectionTitle}>Recettes par employé</Text>
                {recettesParEmp.length === 0
                  ? <Text style={s.empty}>Aucune donnée</Text>
                  : recettesParEmp.map(e => <HBar key={e.nom} label={e.nom} value={e.total} max={maxEmp} color="#7c3aed" />)
                }
              </View>

              {/* Dépenses par catégorie */}
              <View style={s.section}>
                <Text style={s.sectionTitle}>Dépenses par catégorie</Text>
                {depensesParCat.length === 0
                  ? <Text style={s.empty}>Aucune donnée</Text>
                  : depensesParCat.map(d => <HBar key={d.cat} label={CATEGORIES_LABELS[d.cat] ?? d.cat} value={d.total} max={maxCat} color="#dc2626" />)
                }
              </View>
            </View>
          )}

          {/* ── RÉMUNÉRATIONS ── */}
          {tab === 'remunerations' && (
            <View>
              <View style={s.kpiGrid}>
                <KpiCard label="Total rémunérations" value={`${fmt(totalRemu)} $`}     color="#7c3aed" />
                <KpiCard label="Recettes période"    value={`${fmt(totalRecettes)} $`} color="#059669" />
                <KpiCard label="Ratio masse sal."    value={`${ratioMasse.toFixed(1)}%`} color="#d97706" sub="des recettes" />
              </View>

              {hasUnconfigured && (
                <View style={{ backgroundColor: '#fffbeb', borderColor: '#fde68a', borderWidth: 1, borderRadius: 12, padding: 12, marginBottom: 16 }}>
                  <Text style={{ color: '#92400e', fontWeight: '600' }}>
                    Certains employés n'ont pas de mode de rémunération configuré.
                  </Text>
                </View>
              )}

              <View style={s.section}>
                <Text style={s.sectionTitle}>Détail par employé</Text>
                {remuData.map(r => (
                  <View key={r.emp.id} style={s.remuCard}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                      <Text style={{ fontWeight: '700', color: '#111827', fontSize: 15 }}>{r.emp.nom}</Text>
                      <Badge
                        label={r.mode === 'aucun' ? 'Non configuré' : r.mode === 'commission' ? 'Commission' : r.mode === 'fixe' ? 'Fixe' : 'Horaire'}
                        color={r.mode === 'aucun' ? '#6b7280' : '#7c3aed'}
                        bg={r.mode === 'aucun' ? '#f3f4f6' : '#ede9fe'}
                      />
                    </View>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                      <Text style={{ color: '#6b7280', fontSize: 13 }}>Recettes générées</Text>
                      <Text style={{ color: '#059669', fontWeight: '600', fontSize: 13 }}>{fmt(r.recettes)} $</Text>
                    </View>
                    {r.mode === 'horaire' && (
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                        <Text style={{ color: '#6b7280', fontSize: 13 }}>Heures travaillées :</Text>
                        <TextInput
                          style={[s.input, { flex: 1, height: 32, paddingVertical: 4 }]}
                          keyboardType="numeric"
                          placeholder="0"
                          value={heuresEmp[r.emp.id] ?? ''}
                          onChangeText={v => setHeuresEmp(prev => ({ ...prev, [r.emp.id]: v }))}
                        />
                      </View>
                    )}
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 2 }}>
                      <Text style={{ color: '#6b7280', fontSize: 13 }}>Rémunération</Text>
                      <Text style={{ color: '#7c3aed', fontWeight: '700', fontSize: 14 }}>{fmt(r.remuneration)} $</Text>
                    </View>
                    <Text style={{ color: '#9ca3af', fontSize: 11 }}>{r.detail}</Text>
                  </View>
                ))}

                {/* Total */}
                <View style={[s.remuCard, { backgroundColor: '#ede9fe' }]}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Text style={{ fontWeight: '800', color: '#111827', fontSize: 16 }}>Total rémunérations</Text>
                    <Text style={{ fontWeight: '800', color: '#7c3aed', fontSize: 18 }}>{fmt(totalRemu)} $</Text>
                  </View>
                </View>
              </View>

              <TouchableOpacity
                style={[s.addBtn, { marginBottom: 16 }]}
                onPress={() => {
                  const headers = ['Employé', 'Mode', 'Recettes ($)', 'Rémunération ($)', 'Détail']
                  const rows = remuData.map(r => [r.emp.nom, r.mode, fmt(r.recettes), fmt(r.remuneration), r.detail])
                  exportCSV([headers, ...rows], 'remunerations.csv')
                }}
              >
                <Text style={s.addBtnText}>Exporter CSV</Text>
              </TouchableOpacity>
            </View>
          )}
        </ScrollView>
      )}

      {/* ── Modal Encaissement Manuel ── */}
      <Modal visible={showManual} transparent animationType="slide" presentationStyle={Platform.OS === 'ios' ? 'pageSheet' : undefined}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={s.modalOverlay}>
            <View style={s.modalSheet}>
              <View style={s.modalHeader}>
                <Text style={s.modalTitle}>Encaissement manuel</Text>
                <TouchableOpacity onPress={() => setShowManual(false)}>
                  <Text style={s.modalClose}>✕</Text>
                </TouchableOpacity>
              </View>
              <ScrollView contentContainerStyle={{ padding: 20, gap: 12 }}>
                <Text style={s.fieldLabel}>Client</Text>
                <TextInput style={s.input} placeholder="Nom du client" value={manualForm.client_nom} onChangeText={v => setManualForm(p => ({ ...p, client_nom: v }))} />
                <Text style={s.fieldLabel}>Service</Text>
                <TextInput style={s.input} placeholder="Service" value={manualForm.service} onChangeText={v => setManualForm(p => ({ ...p, service: v }))} />
                <Text style={s.fieldLabel}>Employé</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, paddingBottom: 4 }}>
                  <TouchableOpacity onPress={() => setManualForm(p => ({ ...p, employe_id: '' }))} style={[s.filterChip, !manualForm.employe_id && s.filterChipActive]}>
                    <Text style={[s.filterLabel, !manualForm.employe_id && s.filterLabelActive]}>Aucun</Text>
                  </TouchableOpacity>
                  {employes.map(e => (
                    <TouchableOpacity key={e.id} onPress={() => setManualForm(p => ({ ...p, employe_id: e.id }))} style={[s.filterChip, manualForm.employe_id === e.id && s.filterChipActive]}>
                      <Text style={[s.filterLabel, manualForm.employe_id === e.id && s.filterLabelActive]}>{e.nom}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <View style={{ flex: 1 }}>
                    <Text style={s.fieldLabel}>Montant base *</Text>
                    <TextInput style={s.input} keyboardType="numeric" placeholder="0.00" value={manualForm.montant_base} onChangeText={v => setManualForm(p => ({ ...p, montant_base: v }))} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.fieldLabel}>Pourboire</Text>
                    <TextInput style={s.input} keyboardType="numeric" placeholder="0.00" value={manualForm.pourboire} onChangeText={v => setManualForm(p => ({ ...p, pourboire: v }))} />
                  </View>
                </View>
                <Text style={s.fieldLabel}>Méthode</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, paddingBottom: 4 }}>
                  {METHODE_OPTIONS.map(m => (
                    <MethodePill key={m} value={m} selected={manualForm.methode_paiement === m} onPress={() => setManualForm(p => ({ ...p, methode_paiement: m }))} />
                  ))}
                </ScrollView>
                <Text style={s.fieldLabel}>Note</Text>
                <TextInput style={[s.input, { height: 60 }]} multiline placeholder="Note optionnelle" value={manualForm.note} onChangeText={v => setManualForm(p => ({ ...p, note: v }))} />
                <Text style={s.fieldLabel}>Date</Text>
                <TextInput style={s.input} placeholder="AAAA-MM-JJ" value={manualForm.date_encaissement} onChangeText={v => setManualForm(p => ({ ...p, date_encaissement: v }))} />
                <TouchableOpacity style={s.saveBtn} onPress={handleManual} disabled={saving || !manualForm.montant_base}>
                  {saving ? <ActivityIndicator color="#fff" /> : <Text style={s.saveBtnText}>Enregistrer</Text>}
                </TouchableOpacity>
              </ScrollView>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ── Modal Nouvelle Dépense ── */}
      <Modal visible={showDepense} transparent animationType="slide" presentationStyle={Platform.OS === 'ios' ? 'pageSheet' : undefined}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={s.modalOverlay}>
            <View style={s.modalSheet}>
              <View style={s.modalHeader}>
                <Text style={s.modalTitle}>Nouvelle dépense</Text>
                <TouchableOpacity onPress={() => setShowDepense(false)}>
                  <Text style={s.modalClose}>✕</Text>
                </TouchableOpacity>
              </View>
              <ScrollView contentContainerStyle={{ padding: 20, gap: 12 }}>
                <Text style={s.fieldLabel}>Date *</Text>
                <TextInput style={s.input} placeholder="AAAA-MM-JJ" value={depenseForm.date_depense} onChangeText={v => setDepenseForm(p => ({ ...p, date_depense: v }))} />
                <Text style={s.fieldLabel}>Catégorie *</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, paddingBottom: 4 }}>
                  {CATEGORIE_OPTIONS.map(c => (
                    <TouchableOpacity key={c} onPress={() => setDepenseForm(p => ({ ...p, categorie: c }))} style={[s.filterChip, depenseForm.categorie === c && s.filterChipActive]}>
                      <Text style={[s.filterLabel, depenseForm.categorie === c && s.filterLabelActive]}>{CATEGORIES_LABELS[c]}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
                <Text style={s.fieldLabel}>Type de charge *</Text>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  {CHARGE_OPTIONS.map(c => (
                    <TouchableOpacity key={c} onPress={() => setDepenseForm(p => ({ ...p, type_charge: c }))} style={[s.filterChip, { flex: 1, justifyContent: 'center' }, depenseForm.type_charge === c && s.filterChipActive]}>
                      <Text style={[s.filterLabel, depenseForm.type_charge === c && s.filterLabelActive]}>{c === 'fixe' ? 'Fixe' : 'Variable'}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <Text style={s.fieldLabel}>Description</Text>
                <TextInput style={s.input} placeholder="Description" value={depenseForm.description} onChangeText={v => setDepenseForm(p => ({ ...p, description: v }))} />
                <Text style={s.fieldLabel}>Montant *</Text>
                <TextInput style={s.input} keyboardType="numeric" placeholder="0.00" value={depenseForm.montant} onChangeText={v => setDepenseForm(p => ({ ...p, montant: v }))} />
                <TouchableOpacity style={s.saveBtn} onPress={handleAddDepense} disabled={saving || !depenseForm.montant}>
                  {saving ? <ActivityIndicator color="#fff" /> : <Text style={s.saveBtnText}>Ajouter la dépense</Text>}
                </TouchableOpacity>
              </ScrollView>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ── Modal Détail Encaissement ── */}
      <Modal visible={!!detailEnc} transparent animationType="slide" presentationStyle={Platform.OS === 'ios' ? 'pageSheet' : undefined}>
        <View style={s.modalOverlay}>
          <View style={s.modalSheet}>
            <View style={s.modalHeader}>
              <Text style={s.modalTitle}>Détail encaissement</Text>
              <TouchableOpacity onPress={() => setDetailEnc(null)}>
                <Text style={s.modalClose}>✕</Text>
              </TouchableOpacity>
            </View>
            {detailEnc && (
              <ScrollView contentContainerStyle={{ padding: 20, gap: 10 }}>
                <Row label="Client"     value={detailEnc.client_nom ?? '—'} />
                <Row label="Service"    value={detailEnc.service ?? '—'} />
                <Row label="Date"       value={detailEnc.date_encaissement} />
                <Row label="Méthode"    value={METHODES_LABELS[detailEnc.methode_paiement]} />
                <Row label="Base"       value={`${fmt(detailEnc.montant_base)} $`} />
                <Row label="Pourboire"  value={`${fmt(detailEnc.pourboire)} $`} />
                <Row label="Pénalité"   value={`${fmt(detailEnc.penalite)} $`} />
                <View style={{ borderTopWidth: 1, borderColor: '#e5e7eb', paddingTop: 10, flexDirection: 'row', justifyContent: 'space-between' }}>
                  <Text style={{ fontWeight: '700', fontSize: 16 }}>Total</Text>
                  <Text style={{ fontWeight: '800', fontSize: 16, color: '#059669' }}>{fmt(detailEnc.total)} $</Text>
                </View>
                {detailEnc.note && <Text style={{ color: '#6b7280', fontSize: 13, marginTop: 4 }}>Note : {detailEnc.note}</Text>}
                <TouchableOpacity
                  style={[s.saveBtn, { backgroundColor: '#dc2626', marginTop: 8 }]}
                  onPress={() => { setDetailEnc(null); setAnnulerEnc(detailEnc) }}
                >
                  <Text style={s.saveBtnText}>Annuler cet encaissement</Text>
                </TouchableOpacity>
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>

      {/* ── Dialog Annuler Encaissement ── */}
      <Modal visible={!!annulerEnc} transparent animationType="fade">
        <View style={s.dialogOverlay}>
          <View style={s.dialogBox}>
            <Text style={s.dialogTitle}>Annuler l'encaissement ?</Text>
            <Text style={s.dialogMsg}>Cette action est irréversible.</Text>
            <View style={{ flexDirection: 'row', gap: 12, marginTop: 16 }}>
              <TouchableOpacity style={[s.dialogBtn, { flex: 1, backgroundColor: '#f3f4f6' }]} onPress={() => setAnnulerEnc(null)}>
                <Text style={{ color: '#374151', fontWeight: '600' }}>Annuler</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[s.dialogBtn, { flex: 1, backgroundColor: '#dc2626' }]} onPress={handleAnnuler} disabled={saving}>
                {saving ? <ActivityIndicator color="#fff" size="small" /> : <Text style={{ color: '#fff', fontWeight: '600' }}>Confirmer</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── Dialog Supprimer Dépense ── */}
      <Modal visible={!!deleteDepId} transparent animationType="fade">
        <View style={s.dialogOverlay}>
          <View style={s.dialogBox}>
            <Text style={s.dialogTitle}>Supprimer la dépense ?</Text>
            <Text style={s.dialogMsg}>Cette action est irréversible.</Text>
            <View style={{ flexDirection: 'row', gap: 12, marginTop: 16 }}>
              <TouchableOpacity style={[s.dialogBtn, { flex: 1, backgroundColor: '#f3f4f6' }]} onPress={() => setDeleteDepId(null)}>
                <Text style={{ color: '#374151', fontWeight: '600' }}>Annuler</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[s.dialogBtn, { flex: 1, backgroundColor: '#dc2626' }]} onPress={handleDeleteDep} disabled={saving}>
                {saving ? <ActivityIndicator color="#fff" size="small" /> : <Text style={{ color: '#fff', fontWeight: '600' }}>Supprimer</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  )
}

// ── Detail Row helper ──────────────────────────────────────────────────────────

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 }}>
      <Text style={{ color: '#6b7280', fontSize: 14 }}>{label}</Text>
      <Text style={{ color: '#111827', fontWeight: '600', fontSize: 14 }}>{value}</Text>
    </View>
  )
}

// ── Styles ─────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 20, paddingTop: 8, paddingBottom: 4,
  },
  headerTitle: { fontSize: 24, fontWeight: '800', color: '#111827' },
  addBtn: {
    backgroundColor: '#7c3aed', paddingHorizontal: 14, paddingVertical: 8,
    borderRadius: 20,
  },
  addBtnText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  tabsScroll: { flexGrow: 0 },
  tabChip: {
    paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20,
    backgroundColor: '#fff', borderWidth: 1, borderColor: '#e5e7eb',
  },
  tabChipActive: { backgroundColor: '#7c3aed', borderColor: '#7c3aed' },
  tabLabel: { fontSize: 13, fontWeight: '600', color: '#6b7280' },
  tabLabelActive: { color: '#fff' },
  periodChip: {
    paddingHorizontal: 14, paddingVertical: 6, borderRadius: 16,
    backgroundColor: '#fff', borderWidth: 1, borderColor: '#e5e7eb',
  },
  periodChipActive: { backgroundColor: '#ede9fe', borderColor: '#7c3aed' },
  periodLabel: { fontSize: 13, color: '#6b7280', fontWeight: '500' },
  periodLabelActive: { color: '#7c3aed', fontWeight: '700' },
  kpiGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 16 },
  kpiCard: {
    flex: 1, minWidth: '45%', backgroundColor: '#fff', borderRadius: 12,
    padding: 14, borderLeftWidth: 4,
    shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 6, elevation: 2,
  },
  kpiLabel: { fontSize: 12, color: '#6b7280', marginBottom: 4 },
  kpiValue: { fontSize: 20, fontWeight: '800' },
  kpiSub: { fontSize: 11, color: '#9ca3af', marginTop: 2 },
  section: {
    backgroundColor: '#fff', borderRadius: 16, padding: 16, marginBottom: 16,
    shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 6, elevation: 2,
  },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: '#111827', marginBottom: 12 },
  empty: { color: '#9ca3af', fontSize: 14, textAlign: 'center', paddingVertical: 12 },
  tableRow: { flexDirection: 'row', paddingVertical: 8, borderBottomWidth: 1, borderColor: '#f3f4f6' },
  tableHeader: { fontSize: 12, fontWeight: '700', color: '#6b7280', flex: 1 },
  tableCell: { fontSize: 13, color: '#374151', flex: 1 },
  rdvCard: {
    backgroundColor: '#f9fafb', borderRadius: 12, padding: 14,
    marginBottom: 12, borderWidth: 1, borderColor: '#e5e7eb',
  },
  encCard: {
    backgroundColor: '#f9fafb', borderRadius: 12, padding: 14,
    marginBottom: 10, borderWidth: 1, borderColor: '#e5e7eb',
  },
  depCard: {
    backgroundColor: '#f9fafb', borderRadius: 12, padding: 14,
    marginBottom: 10, borderWidth: 1, borderColor: '#e5e7eb',
  },
  remuCard: {
    backgroundColor: '#f9fafb', borderRadius: 12, padding: 14,
    marginBottom: 12, borderWidth: 1, borderColor: '#e5e7eb',
  },
  encaisserBtn: {
    backgroundColor: '#059669', paddingHorizontal: 16, paddingVertical: 8,
    borderRadius: 8,
  },
  encaisserBtnText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  filterChip: {
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16,
    backgroundColor: '#f3f4f6', borderWidth: 1, borderColor: '#e5e7eb',
  },
  filterChipActive: { backgroundColor: '#ede9fe', borderColor: '#7c3aed' },
  filterLabel: { fontSize: 13, color: '#6b7280', fontWeight: '500' },
  filterLabelActive: { color: '#7c3aed', fontWeight: '700' },
  fieldLabel: { fontSize: 13, fontWeight: '600', color: '#374151', marginBottom: 4 },
  input: {
    borderWidth: 1, borderColor: '#ddd6fe', borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 10, fontSize: 14,
    backgroundColor: '#faf5ff', color: '#111827',
  },
  saveBtn: {
    backgroundColor: '#7c3aed', borderRadius: 12, paddingVertical: 14,
    alignItems: 'center', marginTop: 8,
  },
  saveBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  modalOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24,
    maxHeight: '90%',
  },
  modalHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    padding: 20, borderBottomWidth: 1, borderColor: '#f3f4f6',
  },
  modalTitle: { fontSize: 18, fontWeight: '800', color: '#111827' },
  modalClose: { fontSize: 20, color: '#9ca3af', fontWeight: '700' },
  dialogOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center',
    alignItems: 'center', padding: 24,
  },
  dialogBox: {
    backgroundColor: '#fff', borderRadius: 20, padding: 24, width: '100%', maxWidth: 360,
  },
  dialogTitle: { fontSize: 17, fontWeight: '800', color: '#111827', marginBottom: 8 },
  dialogMsg: { fontSize: 14, color: '#6b7280' },
  dialogBtn: {
    paddingVertical: 12, borderRadius: 10, alignItems: 'center',
  },
})
