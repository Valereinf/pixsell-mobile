import { useEffect, useState, useMemo } from 'react'
import {
  View, Text, ScrollView, TouchableOpacity, TextInput, Modal,
  StyleSheet, ActivityIndicator, Switch, Platform, KeyboardAvoidingView,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { supabase } from '../../../lib/supabase'
import type { Company } from '../../../lib/types'
import { useOwnerContext } from '../../../lib/ownerContext'

const NETLIFY_URL = 'https://app.pixsellmedia.ca'

// ── Types ──────────────────────────────────────────────────────────────────────

type TabId = 'overview' | 'campagnes' | 'fidelite' | 'relances' | 'promos' | 'remplissage' | 'parrainage'
type SegmentCible = 'tous' | 'nouveau' | 'regulier' | 'frequent' | 'vip' | 'inactif' | 'anniversaire'
type CampCanal = 'email' | 'sms' | 'les_deux'
type CampStatut = 'brouillon' | 'planifie' | 'en_cours' | 'envoye' | 'erreur'
type RelanceType = 'rappel_rdv' | 'rappel_rdv_h2' | 'inactif' | 'anniversaire' | 'no_show'

interface CampagneRow {
  id: string; nom: string; canal: CampCanal; segment_cible: SegmentCible
  statut: CampStatut; nb_destinataires: number | null; nb_rdv_generes: number | null
  revenus_generes: number | null; nb_envoyes: number | null; created_at: string
  sujet_email?: string | null; message_email?: string | null; message_sms?: string | null
}

interface RelanceConfig {
  id?: string; company_id?: string; type: RelanceType; actif: boolean
  canal: CampCanal; delai_jours: number; sujet_email: string
  message_email: string; message_sms: string
}

interface CodePromo {
  id: string; code: string; nom: string; type_remise: 'pourcentage' | 'montant_fixe'
  valeur_remise: number; type_promo: string; nb_utilisations_max: number | null
  nb_utilisations: number; actif: boolean; date_debut: string | null; date_fin: string | null
}

interface ClientRow {
  id: string; prenom: string | null; nom: string | null; email: string | null
  points_fidelite: number; total_visites: number; total_depenses: number
  derniere_visite: string | null
}

interface SoldeVacancesRow { employe_id: string; prenom: string | null; nom: string; points_fidelite?: number }
interface ParrainageRow { id: string; parrain_email: string | null; filleul_email: string | null; code: string | null; statut: string; created_at: string }
interface RemplissageRow { id: string; date_creneau: string | null; heure_creneau: string | null; statut: string; created_at: string }

// ── Constants ──────────────────────────────────────────────────────────────────

const TABS: { id: TabId; label: string }[] = [
  { id: 'overview',    label: '📊 Vue d\'ensemble' },
  { id: 'campagnes',   label: '📧 Campagnes' },
  { id: 'fidelite',    label: '⭐ Fidélité' },
  { id: 'relances',    label: '🔔 Relances auto' },
  { id: 'promos',      label: '🏷️ Codes promo' },
  { id: 'remplissage', label: '📅 Remplissage' },
  { id: 'parrainage',  label: '👥 Parrainage' },
]

const SEGMENTS: { id: SegmentCible; label: string }[] = [
  { id: 'tous',         label: 'Tous les clients' },
  { id: 'nouveau',      label: 'Nouveaux (< 30j)' },
  { id: 'regulier',     label: 'Réguliers' },
  { id: 'frequent',     label: 'Fréquents' },
  { id: 'vip',          label: 'VIP' },
  { id: 'inactif',      label: 'Inactifs (> 60j)' },
  { id: 'anniversaire', label: 'Anniversaire ce mois' },
]

const CANAUX: { id: CampCanal; label: string }[] = [
  { id: 'email',    label: 'Email uniquement' },
  { id: 'sms',      label: 'SMS uniquement' },
  { id: 'les_deux', label: 'Email + SMS' },
]

const CAMP_STATUT_META: Record<CampStatut, { label: string; color: string; bg: string }> = {
  brouillon: { label: 'Brouillon',  color: '#6b7280', bg: 'rgba(107,114,128,0.12)' },
  planifie:  { label: 'Planifié',   color: '#d97706', bg: 'rgba(245,158,11,0.12)'  },
  en_cours:  { label: 'En cours',   color: '#7c3aed', bg: 'rgba(124,58,237,0.12)'  },
  envoye:    { label: 'Envoyé',     color: '#059669', bg: 'rgba(16,185,129,0.12)'  },
  erreur:    { label: 'Erreur',     color: '#dc2626', bg: 'rgba(239,68,68,0.12)'   },
}

const RELANCES_CONFIG: { type: RelanceType; label: string; desc: string; emoji: string }[] = [
  { type: 'rappel_rdv',    label: 'Rappel J-1',       desc: 'Rappel la veille du RDV',      emoji: '📅' },
  { type: 'rappel_rdv_h2', label: 'Rappel H-6',       desc: 'Rappel 6h avant le RDV',       emoji: '⏰' },
  { type: 'inactif',       label: 'Clients inactifs', desc: 'Clients sans visite récente',  emoji: '😴' },
  { type: 'anniversaire',  label: 'Anniversaire',     desc: 'Message jour J de naissance',  emoji: '🎂' },
  { type: 'no_show',       label: 'Après no-show',    desc: 'Relance après absence',        emoji: '❌' },
]

const DEFAULT_RELANCE: RelanceConfig = {
  type: 'rappel_rdv', actif: false, canal: 'email', delai_jours: 1,
  sujet_email: '', message_email: '', message_sms: '',
}

const PROMO_TYPES = [
  { id: 'standard',      label: 'Standard' },
  { id: 'happy_hour',    label: 'Happy Hour' },
  { id: 'nouveau_client', label: 'Nouveau client' },
  { id: 'limite',        label: 'Limité' },
]

// ── Helpers ────────────────────────────────────────────────────────────────────

function todayISO() { return new Date().toLocaleDateString('en-CA') }
function fmt(n: number) { return n.toFixed(2) }

function Badge({ label, color, bg }: { label: string; color: string; bg: string }) {
  return (
    <View style={{ paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, backgroundColor: bg, alignSelf: 'flex-start' }}>
      <Text style={{ fontSize: 11, color, fontWeight: '700' }}>{label}</Text>
    </View>
  )
}

function SectionCard({ title, children }: { title?: string; children: React.ReactNode }) {
  return (
    <View style={s.section}>
      {title ? <Text style={s.sectionTitle}>{title}</Text> : null}
      {children}
    </View>
  )
}

// ── Main Component ─────────────────────────────────────────────────────────────

export default function MarketingScreen() {
  const { company: ctxCompany } = useOwnerContext()
  const [company, setCompany] = useState(ctxCompany)

  useEffect(() => {
    if (ctxCompany) { setCompany(ctxCompany); return }
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return
      supabase.from('companies').select('*').eq('owner_email', user.email).single()
        .then(({ data }) => { if (data) setCompany(data as Company) })
    })
  }, [ctxCompany])

  const [tab, setTab]         = useState<TabId>('overview')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving]   = useState(false)

  // Data
  const [campagnes, setCampagnes]         = useState<CampagneRow[]>([])
  const [clients, setClients]             = useState<ClientRow[]>([])
  const [relancesConfigs, setRelancesConfigs] = useState<RelanceConfig[]>([])
  const [relancesEnvoyees, setRelancesEnvoyees] = useState<{ id: string; type: string; canal: string; statut: string; created_at: string }[]>([])
  const [codePromos, setCodePromos]       = useState<CodePromo[]>([])
  const [remplissages, setRemplissages]   = useState<RemplissageRow[]>([])
  const [parrainages, setParrainages]     = useState<ParrainageRow[]>([])
  const [topClients, setTopClients]       = useState<{ id: string; prenom: string | null; nom: string | null; points_fidelite: number }[]>([])

  // Fidelite settings
  const [fidActif, setFidActif]                     = useState(false)
  const [fidPointsRdv, setFidPointsRdv]             = useState('10')
  const [fidPointsDollar, setFidPointsDollar]       = useState('1')
  const [fidSeuil, setFidSeuil]                     = useState('100')
  const [fidValeur, setFidValeur]                   = useState('5')
  const [fidExpiration, setFidExpiration]           = useState('365')

  // Remplissage
  const [rempActif, setRempActif]               = useState(false)
  const [rempDelai, setRempDelai]               = useState('24')
  const [rempRemise, setRempRemise]             = useState('20')
  const [rempNbClients, setRempNbClients]       = useState('10')
  const [rempMessage, setRempMessage]           = useState('')

  // Parrainage
  const [parrActif, setParrActif]               = useState(false)
  const [parrRemiseParrain, setParrRemiseParrain] = useState('10')
  const [parrRemiseFilleul, setParrRemiseFilleul] = useState('10')
  const [parrMessage, setParrMessage]           = useState('')

  // Campagne modal
  const [showCampModal, setShowCampModal]     = useState(false)
  const [campStep, setCampStep]               = useState(1)
  const [campNom, setCampNom]                 = useState('')
  const [campSegment, setCampSegment]         = useState<SegmentCible>('tous')
  const [campCanal, setCampCanal]             = useState<CampCanal>('email')
  const [campSujet, setCampSujet]             = useState('')
  const [campMsgEmail, setCampMsgEmail]       = useState('')
  const [campMsgSms, setCampMsgSms]           = useState('')
  const [campSaving, setCampSaving]           = useState(false)

  // Relance modal
  const [relanceModal, setRelanceModal]       = useState<RelanceConfig | null>(null)
  const [relanceSaving, setRelanceSaving]     = useState(false)

  // Promo modal
  const [showPromoModal, setShowPromoModal]   = useState(false)
  const [promoCode, setPromoCode]             = useState('')
  const [promoNom, setPromoNom]               = useState('')
  const [promoTypeRemise, setPromoTypeRemise] = useState<'pourcentage' | 'montant_fixe'>('pourcentage')
  const [promoValeur, setPromoValeur]         = useState('')
  const [promoTypePromo, setPromoTypePromo]   = useState('standard')
  const [promoLimite, setPromoLimite]         = useState('')
  const [promoDebut, setPromoDebut]           = useState(todayISO())
  const [promoFin, setPromoFin]               = useState('')
  const [promoSaving, setPromoSaving]         = useState(false)

  const [confirmDelCamp, setConfirmDelCamp]   = useState<string | null>(null)
  const [confirmDelPromo, setConfirmDelPromo] = useState<string | null>(null)

  // ── Init settings from context ────────────────────────────────────────
  useEffect(() => {
    if (!company) return
    const c = company as Company & Record<string, unknown>
    setFidActif(!!(c.fidelite_actif))
    setFidPointsRdv(String(c.fidelite_points_par_rdv ?? 10))
    setFidPointsDollar(String(c.fidelite_points_par_dollar ?? 1))
    setFidSeuil(String(c.fidelite_seuil_cadeau ?? 100))
    setFidValeur(String(c.fidelite_valeur_cadeau ?? 5))
    setFidExpiration(String(c.fidelite_expiration_jours ?? 365))
    setRempActif(!!(c.remplissage_actif))
    setRempDelai(String(c.remplissage_delai_heures ?? 24))
    setRempRemise(String(c.remplissage_remise_pct ?? 20))
    setRempNbClients(String(c.remplissage_nb_clients ?? 10))
    setRempMessage(String(c.remplissage_message ?? ''))
    setParrActif(!!(c.parrainage_actif))
    setParrRemiseParrain(String(c.parrainage_remise_parrain ?? 10))
    setParrRemiseFilleul(String(c.parrainage_remise_filleul ?? 10))
    setParrMessage(String(c.parrainage_message ?? ''))
  }, [company?.id])

  useEffect(() => { if (company) loadAll() }, [company?.id])

  async function loadAll() {
    setLoading(true)
    const cid = company!.id
    const [campRes, clientRes, relConf, relEnv, promoRes, rempRes, parrRes, topRes] = await Promise.all([
      supabase.from('v_campagnes_stats').select('*').eq('company_id', cid).order('created_at', { ascending: false }),
      supabase.from('clients').select('id,prenom,nom,email,telephone,points_fidelite,total_visites,total_depenses,derniere_visite').eq('company_id', cid).eq('est_bloque', false),
      supabase.from('relances_config').select('*').eq('company_id', cid),
      supabase.from('relances_envoyees').select('id,company_id,client_email,type,canal,statut,created_at').eq('company_id', cid).order('created_at', { ascending: false }).limit(20),
      supabase.from('codes_promo').select('*').eq('company_id', cid).order('created_at', { ascending: false }),
      supabase.from('remplissage_offres').select('*').eq('company_id', cid).order('created_at', { ascending: false }).limit(200),
      supabase.from('parrainages').select('*').eq('company_id', cid).order('created_at', { ascending: false }),
      supabase.from('clients').select('id,prenom,nom,points_fidelite').eq('company_id', cid).order('points_fidelite', { ascending: false }).limit(5),
    ])
    setCampagnes((campRes.data ?? []) as CampagneRow[])
    setClients((clientRes.data ?? []) as ClientRow[])
    setRelancesConfigs((relConf.data ?? []) as RelanceConfig[])
    setRelancesEnvoyees(relEnv.data ?? [])
    setCodePromos((promoRes.data ?? []) as CodePromo[])
    setRemplissages((rempRes.data ?? []) as RemplissageRow[])
    setParrainages((parrRes.data ?? []) as ParrainageRow[])
    setTopClients(topRes.data ?? [])
    setLoading(false)
  }

  // ── Computed ──────────────────────────────────────────────────────────

  const nbDestinataires = useMemo(() => {
    if (campSegment === 'tous') return clients.length
    if (campSegment === 'nouveau') return clients.filter(c => c.total_visites <= 1).length
    if (campSegment === 'regulier') return clients.filter(c => c.total_visites >= 3 && c.total_visites < 8).length
    if (campSegment === 'frequent') return clients.filter(c => c.total_visites >= 8 && c.total_visites < 20).length
    if (campSegment === 'vip') return clients.filter(c => c.total_visites >= 20 || c.total_depenses >= 1000).length
    if (campSegment === 'inactif') {
      const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - 60)
      return clients.filter(c => !c.derniere_visite || new Date(c.derniere_visite) < cutoff).length
    }
    return clients.length
  }, [clients, campSegment])

  // ── Actions ──────────────────────────────────────────────────────────

  function getRelanceConfig(type: RelanceType): RelanceConfig {
    return relancesConfigs.find(r => r.type === type) ?? { ...DEFAULT_RELANCE, type }
  }

  async function toggleRelance(type: RelanceType) {
    if (!company) return
    const cfg = getRelanceConfig(type)
    const next = !cfg.actif
    await supabase.from('relances_config').upsert(
      { ...cfg, company_id: company.id, actif: next },
      { onConflict: 'company_id,type' }
    )
    setRelancesConfigs(prev => {
      const exists = prev.find(r => r.type === type)
      if (exists) return prev.map(r => r.type === type ? { ...r, actif: next } : r)
      return [...prev, { ...cfg, actif: next }]
    })
  }

  async function saveRelance() {
    if (!company || !relanceModal) return
    setRelanceSaving(true)
    await supabase.from('relances_config').upsert(
      { ...relanceModal, company_id: company.id },
      { onConflict: 'company_id,type' }
    )
    setRelancesConfigs(prev => {
      const exists = prev.find(r => r.type === relanceModal.type)
      if (exists) return prev.map(r => r.type === relanceModal.type ? relanceModal : r)
      return [...prev, relanceModal]
    })
    setRelanceModal(null)
    setRelanceSaving(false)
  }

  async function saveFidelite() {
    if (!company) return
    setSaving(true)
    await supabase.from('companies').update({
      fidelite_actif: fidActif, fidelite_points_par_rdv: Number(fidPointsRdv),
      fidelite_points_par_dollar: Number(fidPointsDollar), fidelite_seuil_cadeau: Number(fidSeuil),
      fidelite_valeur_cadeau: Number(fidValeur), fidelite_expiration_jours: Number(fidExpiration),
    }).eq('id', company.id)
    setSaving(false)
  }

  async function saveRemplissage() {
    if (!company) return
    setSaving(true)
    await supabase.from('companies').update({
      remplissage_actif: rempActif, remplissage_delai_heures: Number(rempDelai),
      remplissage_remise_pct: Number(rempRemise), remplissage_nb_clients: Number(rempNbClients),
      remplissage_message: rempMessage,
    }).eq('id', company.id)
    setSaving(false)
  }

  async function saveParrainage() {
    if (!company) return
    setSaving(true)
    await supabase.from('companies').update({
      parrainage_actif: parrActif, parrainage_remise_parrain: Number(parrRemiseParrain),
      parrainage_remise_filleul: Number(parrRemiseFilleul), parrainage_message: parrMessage,
    }).eq('id', company.id)
    setSaving(false)
  }

  async function handleCreateCampagne() {
    if (!company || !campNom.trim()) return
    setCampSaving(true)
    const { data: camp } = await supabase.from('campagnes').insert({
      company_id: company.id, nom: campNom, canal: campCanal,
      segment_cible: campSegment, sujet_email: campSujet, message_email: campMsgEmail,
      message_sms: campMsgSms, statut: 'en_cours', nb_destinataires: nbDestinataires,
    }).select('id').single()
    if (camp?.id) {
      await fetch(`${NETLIFY_URL}/.netlify/functions/campagne-send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ campagne_id: camp.id, company_id: company.id }),
      })
    }
    await loadAll()
    setShowCampModal(false)
    setCampStep(1); setCampNom(''); setCampSujet(''); setCampMsgEmail(''); setCampMsgSms('')
    setCampSaving(false)
  }

  async function dupliquerCamp(c: CampagneRow) {
    if (!company) return
    await supabase.from('campagnes').insert({
      company_id: company.id, nom: `${c.nom} (copie)`, canal: c.canal,
      segment_cible: c.segment_cible, sujet_email: c.sujet_email,
      message_email: c.message_email, message_sms: c.message_sms, statut: 'brouillon',
    })
    await loadAll()
  }

  async function deleteCamp(id: string) {
    await supabase.from('campagnes').delete().eq('id', id)
    setCampagnes(prev => prev.filter(c => c.id !== id))
    setConfirmDelCamp(null)
  }

  async function handleCreatePromo() {
    if (!company || !promoCode.trim() || !promoValeur) return
    setPromoSaving(true)
    await supabase.from('codes_promo').insert({
      company_id: company.id, code: promoCode.toUpperCase(), nom: promoNom,
      type_remise: promoTypeRemise, valeur_remise: Number(promoValeur),
      type_promo: promoTypePromo, nb_utilisations_max: promoLimite ? Number(promoLimite) : null,
      actif: true, date_debut: promoDebut || null, date_fin: promoFin || null,
    })
    await loadAll()
    setShowPromoModal(false)
    setPromoCode(''); setPromoNom(''); setPromoValeur(''); setPromoLimite(''); setPromoFin('')
    setPromoSaving(false)
  }

  async function togglePromo(id: string, current: boolean) {
    await supabase.from('codes_promo').update({ actif: !current }).eq('id', id)
    setCodePromos(prev => prev.map(p => p.id === id ? { ...p, actif: !current } : p))
  }

  async function deletePromo(id: string) {
    await supabase.from('codes_promo').delete().eq('id', id)
    setCodePromos(prev => prev.filter(p => p.id !== id))
    setConfirmDelPromo(null)
  }

  // ── Tab content renderers ─────────────────────────────────────────────

  function OverviewTab() {
    const totalEnvoyes = campagnes.reduce((s, c) => s + (c.nb_envoyes ?? 0), 0)
    const totalRdv = campagnes.reduce((s, c) => s + (c.nb_rdv_generes ?? 0), 0)
    const totalRevenues = campagnes.reduce((s, c) => s + (c.revenus_generes ?? 0), 0)
    return (
      <View style={{ gap: 12 }}>
        <View style={s.kpiGrid}>
          <KpiCard label="Clients actifs"  value={`${clients.length}`}         color="#7c3aed" />
          <KpiCard label="Emails envoyés"  value={`${totalEnvoyes}`}           color="#2563eb" />
          <KpiCard label="RDV générés"     value={`${totalRdv}`}               color="#059669" />
          <KpiCard label="Revenus campag." value={`${fmt(totalRevenues)} $`}   color="#d97706" />
        </View>
        <SectionCard title="Campagnes récentes">
          {campagnes.slice(0, 3).map(c => {
            const meta = CAMP_STATUT_META[c.statut]
            return (
              <View key={c.id} style={[s.row, { borderBottomWidth: 1, borderColor: '#f3f4f6', paddingBottom: 8, marginBottom: 8 }]}>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontWeight: '700', color: '#111827' }}>{c.nom}</Text>
                  <Text style={{ fontSize: 12, color: '#6b7280' }}>{SEGMENTS.find(s => s.id === c.segment_cible)?.label}</Text>
                </View>
                <Badge label={meta.label} color={meta.color} bg={meta.bg} />
              </View>
            )
          })}
          {campagnes.length === 0 && <Text style={s.empty}>Aucune campagne</Text>}
        </SectionCard>
        <SectionCard title="Relances actives">
          {relancesConfigs.filter(r => r.actif).map(r => {
            const info = RELANCES_CONFIG.find(rc => rc.type === r.type)
            return (
              <View key={r.type} style={[s.row, { gap: 8 }]}>
                <Text style={{ fontSize: 16 }}>{info?.emoji}</Text>
                <Text style={{ flex: 1, color: '#374151', fontWeight: '600' }}>{info?.label}</Text>
                <Badge label="Actif" color="#059669" bg="rgba(16,185,129,0.12)" />
              </View>
            )
          })}
          {relancesConfigs.filter(r => r.actif).length === 0 && <Text style={s.empty}>Aucune relance active</Text>}
        </SectionCard>
      </View>
    )
  }

  function CampagnesTab() {
    return (
      <View style={{ gap: 12 }}>
        <TouchableOpacity style={s.primaryBtn} onPress={() => { setShowCampModal(true); setCampStep(1) }}>
          <Ionicons name="add" size={16} color="#fff" />
          <Text style={s.primaryBtnText}>Nouvelle campagne</Text>
        </TouchableOpacity>
        {campagnes.map(c => {
          const meta = CAMP_STATUT_META[c.statut]
          const conv = c.nb_destinataires && c.nb_destinataires > 0
            ? ((c.nb_rdv_generes ?? 0) / c.nb_destinataires * 100).toFixed(1)
            : '0'
          return (
            <View key={c.id} style={s.section}>
              <View style={[s.row, { marginBottom: 8 }]}>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontWeight: '800', color: '#111827', fontSize: 15 }}>{c.nom}</Text>
                  <Text style={{ fontSize: 12, color: '#6b7280' }}>
                    {SEGMENTS.find(sg => sg.id === c.segment_cible)?.label} · {CANAUX.find(cn => cn.id === c.canal)?.label}
                  </Text>
                </View>
                <Badge label={meta.label} color={meta.color} bg={meta.bg} />
              </View>
              <View style={{ flexDirection: 'row', gap: 12, marginBottom: 10 }}>
                <View style={{ alignItems: 'center' }}>
                  <Text style={s.statVal}>{c.nb_envoyes ?? 0}</Text>
                  <Text style={s.statLbl}>Envoyés</Text>
                </View>
                <View style={{ alignItems: 'center' }}>
                  <Text style={s.statVal}>{c.nb_rdv_generes ?? 0}</Text>
                  <Text style={s.statLbl}>RDV</Text>
                </View>
                <View style={{ alignItems: 'center' }}>
                  <Text style={s.statVal}>{fmt(c.revenus_generes ?? 0)} $</Text>
                  <Text style={s.statLbl}>Revenus</Text>
                </View>
                <View style={{ alignItems: 'center' }}>
                  <Text style={s.statVal}>{conv}%</Text>
                  <Text style={s.statLbl}>Taux conv.</Text>
                </View>
              </View>
              <View style={s.row}>
                <TouchableOpacity style={s.outlineBtn} onPress={() => dupliquerCamp(c)}>
                  <Ionicons name="copy-outline" size={14} color="#7c3aed" />
                  <Text style={{ color: '#7c3aed', fontSize: 12, fontWeight: '600' }}>Dupliquer</Text>
                </TouchableOpacity>
                {confirmDelCamp === c.id ? (
                  <View style={{ flexDirection: 'row', gap: 6 }}>
                    <TouchableOpacity style={[s.iconBtn, { backgroundColor: 'rgba(239,68,68,0.1)' }]} onPress={() => deleteCamp(c.id)}>
                      <Ionicons name="checkmark" size={14} color="#dc2626" />
                    </TouchableOpacity>
                    <TouchableOpacity style={s.iconBtn} onPress={() => setConfirmDelCamp(null)}>
                      <Ionicons name="close" size={14} color="#6b7280" />
                    </TouchableOpacity>
                  </View>
                ) : (
                  <TouchableOpacity style={[s.iconBtn, { backgroundColor: 'rgba(239,68,68,0.08)' }]} onPress={() => setConfirmDelCamp(c.id)}>
                    <Ionicons name="trash-outline" size={14} color="#dc2626" />
                  </TouchableOpacity>
                )}
              </View>
            </View>
          )
        })}
        {campagnes.length === 0 && (
          <SectionCard><Text style={s.empty}>Aucune campagne. Créez-en une !</Text></SectionCard>
        )}
      </View>
    )
  }

  function FideliteTab() {
    return (
      <View style={{ gap: 12 }}>
        <SectionCard title="Programme de fidélité">
          <View style={s.switchRow}>
            <Text style={s.fieldLabel}>Activer le programme</Text>
            <Switch value={fidActif} onValueChange={setFidActif} trackColor={{ false: '#d1d5db', true: '#c4b5fd' }} thumbColor={fidActif ? '#7c3aed' : '#f4f4f5'} />
          </View>
          {[
            { label: 'Points par RDV', value: fidPointsRdv, set: setFidPointsRdv },
            { label: 'Points par dollar dépensé', value: fidPointsDollar, set: setFidPointsDollar },
            { label: 'Seuil cadeau (points)', value: fidSeuil, set: setFidSeuil },
            { label: 'Valeur du cadeau ($)', value: fidValeur, set: setFidValeur },
            { label: 'Expiration (jours)', value: fidExpiration, set: setFidExpiration },
          ].map(f => (
            <View key={f.label}>
              <Text style={s.fieldLabel}>{f.label}</Text>
              <TextInput style={s.input} keyboardType="numeric" value={f.value} onChangeText={f.set} />
            </View>
          ))}
          <TouchableOpacity style={s.saveBtn} onPress={saveFidelite} disabled={saving}>
            {saving ? <ActivityIndicator color="#fff" size="small" /> : <Text style={s.saveBtnText}>Enregistrer</Text>}
          </TouchableOpacity>
        </SectionCard>
        {topClients.length > 0 && (
          <SectionCard title="🏆 Top 5 clients">
            {topClients.map((c, i) => (
              <View key={c.id} style={[s.row, { paddingVertical: 6, borderBottomWidth: 1, borderColor: '#f3f4f6' }]}>
                <Text style={{ width: 24, fontWeight: '800', color: '#7c3aed' }}>#{i + 1}</Text>
                <Text style={{ flex: 1, fontWeight: '600', color: '#374151' }}>
                  {[c.prenom, c.nom].filter(Boolean).join(' ') || '—'}
                </Text>
                <Badge label={`${c.points_fidelite} pts`} color="#7c3aed" bg="#ede9fe" />
              </View>
            ))}
          </SectionCard>
        )}
      </View>
    )
  }

  function RelancesTab() {
    return (
      <View style={{ gap: 12 }}>
        {RELANCES_CONFIG.map(rc => {
          const cfg = getRelanceConfig(rc.type)
          return (
            <View key={rc.type} style={s.section}>
              <View style={[s.row, { marginBottom: 8 }]}>
                <Text style={{ fontSize: 20, marginRight: 8 }}>{rc.emoji}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontWeight: '800', color: '#111827', fontSize: 15 }}>{rc.label}</Text>
                  <Text style={{ fontSize: 12, color: '#6b7280' }}>{rc.desc}</Text>
                </View>
                <Switch value={cfg.actif} onValueChange={() => toggleRelance(rc.type)} trackColor={{ false: '#d1d5db', true: '#c4b5fd' }} thumbColor={cfg.actif ? '#7c3aed' : '#f4f4f5'} />
              </View>
              <TouchableOpacity style={s.outlineBtn} onPress={() => setRelanceModal({ ...cfg })}>
                <Ionicons name="settings-outline" size={14} color="#7c3aed" />
                <Text style={{ color: '#7c3aed', fontSize: 13, fontWeight: '600' }}>Configurer</Text>
              </TouchableOpacity>
            </View>
          )
        })}
        {relancesEnvoyees.length > 0 && (
          <SectionCard title="Historique récent">
            {relancesEnvoyees.slice(0, 10).map(r => (
              <View key={r.id} style={[s.row, { paddingVertical: 5, borderBottomWidth: 1, borderColor: '#f3f4f6' }]}>
                <Text style={{ flex: 1, fontSize: 12, color: '#374151' }}>{r.type} · {r.canal}</Text>
                <Badge label={r.statut} color={r.statut === 'envoye' ? '#059669' : '#dc2626'} bg={r.statut === 'envoye' ? 'rgba(16,185,129,0.12)' : 'rgba(239,68,68,0.12)'} />
              </View>
            ))}
          </SectionCard>
        )}
      </View>
    )
  }

  function PromosTab() {
    const actifs = codePromos.filter(p => p.actif).length
    const totalUtil = codePromos.reduce((s, p) => s + p.nb_utilisations, 0)
    return (
      <View style={{ gap: 12 }}>
        <View style={s.kpiGrid}>
          <KpiCard label="Codes actifs"   value={`${actifs}`}    color="#7c3aed" />
          <KpiCard label="Total utilisé"  value={`${totalUtil}`} color="#059669" />
        </View>
        <TouchableOpacity style={s.primaryBtn} onPress={() => setShowPromoModal(true)}>
          <Ionicons name="add" size={16} color="#fff" />
          <Text style={s.primaryBtnText}>Créer un code promo</Text>
        </TouchableOpacity>
        {codePromos.map(p => (
          <View key={p.id} style={s.section}>
            <View style={[s.row, { marginBottom: 8 }]}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontWeight: '800', color: '#7c3aed', fontSize: 16 }}>{p.code}</Text>
                <Text style={{ fontSize: 13, color: '#374151' }}>{p.nom || p.type_promo}</Text>
              </View>
              <Text style={{ fontWeight: '800', color: '#111827', fontSize: 15 }}>
                {p.valeur_remise}{p.type_remise === 'pourcentage' ? '%' : '$'}
              </Text>
            </View>
            <View style={[s.row, { marginBottom: 10 }]}>
              <Text style={{ fontSize: 12, color: '#6b7280', flex: 1 }}>
                {p.nb_utilisations}/{p.nb_utilisations_max ?? '∞'} utilisations
              </Text>
              {p.date_fin ? <Text style={{ fontSize: 12, color: '#9ca3af' }}>→ {p.date_fin}</Text> : null}
            </View>
            <View style={s.row}>
              <TouchableOpacity style={[s.outlineBtn, { flex: 1 }]} onPress={() => togglePromo(p.id, p.actif)}>
                <Text style={{ color: p.actif ? '#dc2626' : '#059669', fontWeight: '600', fontSize: 13 }}>
                  {p.actif ? 'Désactiver' : 'Activer'}
                </Text>
              </TouchableOpacity>
              {confirmDelPromo === p.id ? (
                <View style={{ flexDirection: 'row', gap: 6 }}>
                  <TouchableOpacity style={[s.iconBtn, { backgroundColor: 'rgba(239,68,68,0.1)' }]} onPress={() => deletePromo(p.id)}>
                    <Ionicons name="checkmark" size={14} color="#dc2626" />
                  </TouchableOpacity>
                  <TouchableOpacity style={s.iconBtn} onPress={() => setConfirmDelPromo(null)}>
                    <Ionicons name="close" size={14} color="#6b7280" />
                  </TouchableOpacity>
                </View>
              ) : (
                <TouchableOpacity style={[s.iconBtn, { backgroundColor: 'rgba(239,68,68,0.08)' }]} onPress={() => setConfirmDelPromo(p.id)}>
                  <Ionicons name="trash-outline" size={14} color="#dc2626" />
                </TouchableOpacity>
              )}
            </View>
          </View>
        ))}
        {codePromos.length === 0 && <SectionCard><Text style={s.empty}>Aucun code promo</Text></SectionCard>}
      </View>
    )
  }

  function RemplissageTab() {
    const mois = remplissages.filter(r => r.created_at.slice(0, 7) === new Date().toLocaleDateString('en-CA').slice(0, 7))
    const convertis = remplissages.filter(r => r.statut === 'converti')
    return (
      <View style={{ gap: 12 }}>
        <View style={s.kpiGrid}>
          <KpiCard label="Offres ce mois"  value={`${mois.length}`}     color="#7c3aed" />
          <KpiCard label="Réservations"    value={`${convertis.length}`} color="#059669" />
          <KpiCard label="Taux conv."      value={remplissages.length > 0 ? `${Math.round(convertis.length / remplissages.length * 100)}%` : '—'} color="#d97706" />
          <KpiCard label="Total créneaux"  value={`${remplissages.length}`} color="#2563eb" />
        </View>
        <SectionCard title="Configuration">
          <View style={s.switchRow}>
            <Text style={s.fieldLabel}>Activer le remplissage automatique</Text>
            <Switch value={rempActif} onValueChange={setRempActif} trackColor={{ false: '#d1d5db', true: '#c4b5fd' }} thumbColor={rempActif ? '#7c3aed' : '#f4f4f5'} />
          </View>
          {[
            { label: 'Délai avant créneau (heures)', value: rempDelai, set: setRempDelai },
            { label: 'Remise offerte (%)', value: rempRemise, set: setRempRemise },
            { label: 'Nb clients à notifier', value: rempNbClients, set: setRempNbClients },
          ].map(f => (
            <View key={f.label}>
              <Text style={s.fieldLabel}>{f.label}</Text>
              <TextInput style={s.input} keyboardType="numeric" value={f.value} onChangeText={f.set} />
            </View>
          ))}
          <Text style={s.fieldLabel}>Message personnalisé</Text>
          <TextInput style={[s.input, { height: 70, textAlignVertical: 'top' }]} multiline placeholder="Message envoyé aux clients..." value={rempMessage} onChangeText={setRempMessage} />
          <TouchableOpacity style={s.saveBtn} onPress={saveRemplissage} disabled={saving}>
            {saving ? <ActivityIndicator color="#fff" size="small" /> : <Text style={s.saveBtnText}>Enregistrer</Text>}
          </TouchableOpacity>
        </SectionCard>
        <SectionCard title="Créneaux détectés récents">
          {remplissages.slice(0, 5).map(r => (
            <View key={r.id} style={[s.row, { paddingVertical: 5, borderBottomWidth: 1, borderColor: '#f3f4f6' }]}>
              <Text style={{ flex: 1, fontSize: 13, color: '#374151' }}>{r.date_creneau} {r.heure_creneau ?? ''}</Text>
              <Badge label={r.statut} color={r.statut === 'converti' ? '#059669' : '#6b7280'} bg={r.statut === 'converti' ? 'rgba(16,185,129,0.12)' : 'rgba(107,114,128,0.12)'} />
            </View>
          ))}
          {remplissages.length === 0 && <Text style={s.empty}>Aucun créneau détecté</Text>}
        </SectionCard>
      </View>
    )
  }

  function ParrainageTab() {
    const enAttente = parrainages.filter(p => p.statut === 'en_attente').length
    const completesMonth = parrainages.filter(p => p.statut === 'complete' && p.created_at.slice(0, 7) === new Date().toLocaleDateString('en-CA').slice(0, 7)).length
    return (
      <View style={{ gap: 12 }}>
        <View style={s.kpiGrid}>
          <KpiCard label="En attente"  value={`${enAttente}`}       color="#d97706" />
          <KpiCard label="Ce mois"     value={`${completesMonth}`}  color="#7c3aed" />
          <KpiCard label="Total"       value={`${parrainages.length}`} color="#2563eb" />
        </View>
        <SectionCard title="Configuration">
          <View style={s.switchRow}>
            <Text style={s.fieldLabel}>Activer le parrainage</Text>
            <Switch value={parrActif} onValueChange={setParrActif} trackColor={{ false: '#d1d5db', true: '#c4b5fd' }} thumbColor={parrActif ? '#7c3aed' : '#f4f4f5'} />
          </View>
          {[
            { label: 'Remise parrain ($)', value: parrRemiseParrain, set: setParrRemiseParrain },
            { label: 'Remise filleul ($)', value: parrRemiseFilleul, set: setParrRemiseFilleul },
          ].map(f => (
            <View key={f.label}>
              <Text style={s.fieldLabel}>{f.label}</Text>
              <TextInput style={s.input} keyboardType="numeric" value={f.value} onChangeText={f.set} />
            </View>
          ))}
          <Text style={s.fieldLabel}>Message de parrainage</Text>
          <TextInput style={[s.input, { height: 70, textAlignVertical: 'top' }]} multiline placeholder="Message envoyé au filleul..." value={parrMessage} onChangeText={setParrMessage} />
          <TouchableOpacity style={s.saveBtn} onPress={saveParrainage} disabled={saving}>
            {saving ? <ActivityIndicator color="#fff" size="small" /> : <Text style={s.saveBtnText}>Enregistrer</Text>}
          </TouchableOpacity>
        </SectionCard>
        <SectionCard title="Parrainages récents">
          {parrainages.slice(0, 10).map(p => (
            <View key={p.id} style={[s.row, { paddingVertical: 6, borderBottomWidth: 1, borderColor: '#f3f4f6' }]}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 13, color: '#374151', fontWeight: '600' }}>{p.parrain_email ?? '—'}</Text>
                <Text style={{ fontSize: 12, color: '#9ca3af' }}>→ {p.filleul_email ?? '—'}</Text>
              </View>
              <Badge label={p.statut} color={p.statut === 'complete' ? '#059669' : '#d97706'} bg={p.statut === 'complete' ? 'rgba(16,185,129,0.12)' : 'rgba(245,158,11,0.12)'} />
            </View>
          ))}
          {parrainages.length === 0 && <Text style={s.empty}>Aucun parrainage</Text>}
        </SectionCard>
      </View>
    )
  }

  // ── Render ─────────────────────────────────────────────────────────────

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#f5f3ff' }} edges={['top']}>
      {/* Header */}
      <View style={s.header}>
        <Text style={s.headerTitle}>Marketing</Text>
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
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 60, gap: 12 }}>
          {tab === 'overview'    && <OverviewTab />}
          {tab === 'campagnes'   && <CampagnesTab />}
          {tab === 'fidelite'    && <FideliteTab />}
          {tab === 'relances'    && <RelancesTab />}
          {tab === 'promos'      && <PromosTab />}
          {tab === 'remplissage' && <RemplissageTab />}
          {tab === 'parrainage'  && <ParrainageTab />}
        </ScrollView>
      )}

      {/* ── Campagne Modal (3 étapes) ── */}
      <Modal visible={showCampModal} animationType="slide" presentationStyle={Platform.OS === 'ios' ? 'pageSheet' : undefined} transparent={Platform.OS !== 'ios'}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          {Platform.OS !== 'ios' && <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' }} />}
          <View style={[s.modalSheet, Platform.OS !== 'ios' && { position: 'absolute', bottom: 0, left: 0, right: 0 }]}>
            <View style={s.modalHeader}>
              <Text style={s.modalTitle}>Nouvelle campagne — Étape {campStep}/3</Text>
              <TouchableOpacity onPress={() => setShowCampModal(false)}>
                <Text style={s.modalClose}>✕</Text>
              </TouchableOpacity>
            </View>
            <ScrollView contentContainerStyle={{ padding: 20, gap: 12 }}>
              {campStep === 1 && (
                <>
                  <Text style={s.fieldLabel}>Nom de la campagne *</Text>
                  <TextInput style={s.input} placeholder="Ex : Offre été 2025" value={campNom} onChangeText={setCampNom} />
                  <Text style={s.fieldLabel}>Segment cible</Text>
                  {SEGMENTS.map(sg => (
                    <TouchableOpacity key={sg.id} onPress={() => setCampSegment(sg.id)} style={[s.segRow, campSegment === sg.id && s.segRowActive]}>
                      <Text style={[s.segLabel, campSegment === sg.id && s.segLabelActive]}>{sg.label}</Text>
                      {campSegment === sg.id && <Ionicons name="checkmark-circle" size={18} color="#7c3aed" />}
                    </TouchableOpacity>
                  ))}
                  <View style={{ backgroundColor: '#ede9fe', borderRadius: 10, padding: 12, marginTop: 4 }}>
                    <Text style={{ color: '#7c3aed', fontWeight: '700' }}>{nbDestinataires} destinataires</Text>
                  </View>
                  <TouchableOpacity style={[s.saveBtn, { opacity: campNom.trim() ? 1 : 0.5 }]} onPress={() => campNom.trim() && setCampStep(2)}>
                    <Text style={s.saveBtnText}>Suivant →</Text>
                  </TouchableOpacity>
                </>
              )}
              {campStep === 2 && (
                <>
                  <Text style={s.fieldLabel}>Canal d'envoi</Text>
                  {CANAUX.map(cn => (
                    <TouchableOpacity key={cn.id} onPress={() => setCampCanal(cn.id)} style={[s.segRow, campCanal === cn.id && s.segRowActive]}>
                      <Text style={[s.segLabel, campCanal === cn.id && s.segLabelActive]}>{cn.label}</Text>
                      {campCanal === cn.id && <Ionicons name="checkmark-circle" size={18} color="#7c3aed" />}
                    </TouchableOpacity>
                  ))}
                  {(campCanal === 'email' || campCanal === 'les_deux') && (
                    <>
                      <Text style={s.fieldLabel}>Sujet email</Text>
                      <TextInput style={s.input} placeholder="Objet de votre email" value={campSujet} onChangeText={setCampSujet} />
                      <Text style={s.fieldLabel}>Message email</Text>
                      <TextInput style={[s.input, { height: 100, textAlignVertical: 'top' }]} multiline placeholder="Corps de l'email... Utilisez {{prenom}}, {{nom}}, {{salon}}" value={campMsgEmail} onChangeText={setCampMsgEmail} />
                    </>
                  )}
                  {(campCanal === 'sms' || campCanal === 'les_deux') && (
                    <>
                      <Text style={s.fieldLabel}>Message SMS</Text>
                      <TextInput style={[s.input, { height: 80, textAlignVertical: 'top' }]} multiline placeholder="Message SMS (160 car. max)..." value={campMsgSms} onChangeText={setCampMsgSms} />
                    </>
                  )}
                  <View style={{ flexDirection: 'row', gap: 10 }}>
                    <TouchableOpacity style={[s.outlineBtn, { flex: 1 }]} onPress={() => setCampStep(1)}>
                      <Text style={{ color: '#7c3aed', fontWeight: '600' }}>← Retour</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={[s.saveBtn, { flex: 1 }]} onPress={() => setCampStep(3)}>
                      <Text style={s.saveBtnText}>Suivant →</Text>
                    </TouchableOpacity>
                  </View>
                </>
              )}
              {campStep === 3 && (
                <>
                  <SectionCard title="Récapitulatif">
                    <View style={[s.row, { paddingVertical: 5 }]}>
                      <Text style={{ color: '#6b7280' }}>Nom</Text>
                      <Text style={{ fontWeight: '700', color: '#111827' }}>{campNom}</Text>
                    </View>
                    <View style={[s.row, { paddingVertical: 5 }]}>
                      <Text style={{ color: '#6b7280' }}>Segment</Text>
                      <Text style={{ fontWeight: '700', color: '#111827' }}>{SEGMENTS.find(s => s.id === campSegment)?.label}</Text>
                    </View>
                    <View style={[s.row, { paddingVertical: 5 }]}>
                      <Text style={{ color: '#6b7280' }}>Canal</Text>
                      <Text style={{ fontWeight: '700', color: '#111827' }}>{CANAUX.find(c => c.id === campCanal)?.label}</Text>
                    </View>
                    <View style={[s.row, { paddingVertical: 5 }]}>
                      <Text style={{ color: '#6b7280' }}>Destinataires</Text>
                      <Text style={{ fontWeight: '700', color: '#7c3aed' }}>{nbDestinataires}</Text>
                    </View>
                  </SectionCard>
                  <View style={{ flexDirection: 'row', gap: 10 }}>
                    <TouchableOpacity style={[s.outlineBtn, { flex: 1 }]} onPress={() => setCampStep(2)}>
                      <Text style={{ color: '#7c3aed', fontWeight: '600' }}>← Retour</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={[s.saveBtn, { flex: 1, opacity: campSaving ? 0.6 : 1 }]} onPress={handleCreateCampagne} disabled={campSaving}>
                      {campSaving ? <ActivityIndicator color="#fff" size="small" /> : <Text style={s.saveBtnText}>🚀 Envoyer</Text>}
                    </TouchableOpacity>
                  </View>
                </>
              )}
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ── Relance Modal ── */}
      <Modal visible={!!relanceModal} animationType="slide" presentationStyle={Platform.OS === 'ios' ? 'pageSheet' : undefined} transparent={Platform.OS !== 'ios'}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          {Platform.OS !== 'ios' && <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' }} />}
          <View style={[s.modalSheet, Platform.OS !== 'ios' && { position: 'absolute', bottom: 0, left: 0, right: 0 }]}>
            <View style={s.modalHeader}>
              <Text style={s.modalTitle}>Configurer la relance</Text>
              <TouchableOpacity onPress={() => setRelanceModal(null)}><Text style={s.modalClose}>✕</Text></TouchableOpacity>
            </View>
            {relanceModal && (
              <ScrollView contentContainerStyle={{ padding: 20, gap: 12 }}>
                <Text style={s.fieldLabel}>Canal</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
                  {CANAUX.map(cn => (
                    <TouchableOpacity key={cn.id} onPress={() => setRelanceModal(r => r ? { ...r, canal: cn.id } : r)} style={[s.chip, relanceModal.canal === cn.id && s.chipActive]}>
                      <Text style={[s.chipText, relanceModal.canal === cn.id && s.chipTextActive]}>{cn.label}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
                {relanceModal.type === 'inactif' && (
                  <>
                    <Text style={s.fieldLabel}>Délai (jours sans visite)</Text>
                    <TextInput style={s.input} keyboardType="numeric" value={String(relanceModal.delai_jours)} onChangeText={v => setRelanceModal(r => r ? { ...r, delai_jours: Number(v) || 1 } : r)} />
                  </>
                )}
                {(relanceModal.canal === 'email' || relanceModal.canal === 'les_deux') && (
                  <>
                    <Text style={s.fieldLabel}>Sujet email</Text>
                    <TextInput style={s.input} value={relanceModal.sujet_email} onChangeText={v => setRelanceModal(r => r ? { ...r, sujet_email: v } : r)} placeholder="Objet..." />
                    <Text style={s.fieldLabel}>Message email</Text>
                    <TextInput style={[s.input, { height: 90, textAlignVertical: 'top' }]} multiline value={relanceModal.message_email} onChangeText={v => setRelanceModal(r => r ? { ...r, message_email: v } : r)} placeholder="Corps du message..." />
                  </>
                )}
                {(relanceModal.canal === 'sms' || relanceModal.canal === 'les_deux') && (
                  <>
                    <Text style={s.fieldLabel}>Message SMS</Text>
                    <TextInput style={[s.input, { height: 70, textAlignVertical: 'top' }]} multiline value={relanceModal.message_sms} onChangeText={v => setRelanceModal(r => r ? { ...r, message_sms: v } : r)} placeholder="SMS..." />
                  </>
                )}
                <TouchableOpacity style={s.saveBtn} onPress={saveRelance} disabled={relanceSaving}>
                  {relanceSaving ? <ActivityIndicator color="#fff" size="small" /> : <Text style={s.saveBtnText}>Enregistrer</Text>}
                </TouchableOpacity>
              </ScrollView>
            )}
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ── Promo Modal ── */}
      <Modal visible={showPromoModal} animationType="slide" presentationStyle={Platform.OS === 'ios' ? 'pageSheet' : undefined} transparent={Platform.OS !== 'ios'}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          {Platform.OS !== 'ios' && <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' }} />}
          <View style={[s.modalSheet, Platform.OS !== 'ios' && { position: 'absolute', bottom: 0, left: 0, right: 0 }]}>
            <View style={s.modalHeader}>
              <Text style={s.modalTitle}>Créer un code promo</Text>
              <TouchableOpacity onPress={() => setShowPromoModal(false)}><Text style={s.modalClose}>✕</Text></TouchableOpacity>
            </View>
            <ScrollView contentContainerStyle={{ padding: 20, gap: 12 }}>
              <Text style={s.fieldLabel}>Code *</Text>
              <TextInput style={s.input} placeholder="PROMO20" autoCapitalize="characters" value={promoCode} onChangeText={setPromoCode} />
              <Text style={s.fieldLabel}>Nom / Description</Text>
              <TextInput style={s.input} placeholder="Description du code" value={promoNom} onChangeText={setPromoNom} />
              <Text style={s.fieldLabel}>Type de remise</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
                {(['pourcentage', 'montant_fixe'] as const).map(t => (
                  <TouchableOpacity key={t} onPress={() => setPromoTypeRemise(t)} style={[s.chip, promoTypeRemise === t && s.chipActive]}>
                    <Text style={[s.chipText, promoTypeRemise === t && s.chipTextActive]}>{t === 'pourcentage' ? 'Pourcentage (%)' : 'Montant fixe ($)'}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
              <Text style={s.fieldLabel}>Valeur *</Text>
              <TextInput style={s.input} keyboardType="numeric" placeholder={promoTypeRemise === 'pourcentage' ? '20' : '10'} value={promoValeur} onChangeText={setPromoValeur} />
              <Text style={s.fieldLabel}>Type de promo</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
                {PROMO_TYPES.map(pt => (
                  <TouchableOpacity key={pt.id} onPress={() => setPromoTypePromo(pt.id)} style={[s.chip, promoTypePromo === pt.id && s.chipActive]}>
                    <Text style={[s.chipText, promoTypePromo === pt.id && s.chipTextActive]}>{pt.label}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <View style={{ flex: 1 }}>
                  <Text style={s.fieldLabel}>Date début</Text>
                  <TextInput style={s.input} placeholder="AAAA-MM-JJ" value={promoDebut} onChangeText={setPromoDebut} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.fieldLabel}>Date fin</Text>
                  <TextInput style={s.input} placeholder="AAAA-MM-JJ" value={promoFin} onChangeText={setPromoFin} />
                </View>
              </View>
              <Text style={s.fieldLabel}>Limite d'utilisations</Text>
              <TextInput style={s.input} keyboardType="numeric" placeholder="Illimité" value={promoLimite} onChangeText={setPromoLimite} />
              <TouchableOpacity style={[s.saveBtn, { opacity: (!promoCode.trim() || !promoValeur) ? 0.5 : 1 }]} onPress={handleCreatePromo} disabled={promoSaving || !promoCode.trim() || !promoValeur}>
                {promoSaving ? <ActivityIndicator color="#fff" size="small" /> : <Text style={s.saveBtnText}>Créer le code promo</Text>}
              </TouchableOpacity>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  )
}

// ── Shared sub-components ─────────────────────────────────────────────────────

function KpiCard({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <View style={[s.kpiCard, { borderLeftColor: color }]}>
      <Text style={s.kpiLabel}>{label}</Text>
      <Text style={[s.kpiValue, { color }]}>{value}</Text>
    </View>
  )
}

// ── Styles ─────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  header: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 4 },
  headerTitle: { fontSize: 24, fontWeight: '800', color: '#111827' },
  tabsScroll: { flexGrow: 0, flexShrink: 0 },
  tabChip: {
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20,
    backgroundColor: '#fff', borderWidth: 1, borderColor: '#e5e7eb',
  },
  tabChipActive: { backgroundColor: '#7c3aed', borderColor: '#7c3aed' },
  tabLabel: { fontSize: 13, fontWeight: '600', color: '#6b7280' },
  tabLabelActive: { color: '#fff' },
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
    shadowColor: '#7c3aed', shadowOpacity: 0.07, shadowRadius: 8, elevation: 2,
  },
  sectionTitle: { fontSize: 14, fontWeight: '800', color: '#7c3aed', marginBottom: 12 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  statVal: { fontSize: 16, fontWeight: '800', color: '#111827', textAlign: 'center' },
  statLbl: { fontSize: 10, color: '#9ca3af', textAlign: 'center' },
  switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  empty: { color: '#9ca3af', textAlign: 'center', fontSize: 14, paddingVertical: 12 },
  primaryBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: '#7c3aed', borderRadius: 12, paddingVertical: 12, paddingHorizontal: 16,
    justifyContent: 'center',
  },
  primaryBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  outlineBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 12, paddingVertical: 7, borderRadius: 10,
    borderWidth: 1.5, borderColor: '#ddd6fe', justifyContent: 'center',
  },
  iconBtn: {
    width: 30, height: 30, borderRadius: 8, backgroundColor: '#f3f4f6',
    alignItems: 'center', justifyContent: 'center',
  },
  chip: {
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16,
    backgroundColor: '#f3f4f6', borderWidth: 1, borderColor: '#e5e7eb',
  },
  chipActive: { backgroundColor: '#ede9fe', borderColor: '#7c3aed' },
  chipText: { fontSize: 13, color: '#6b7280', fontWeight: '500' },
  chipTextActive: { color: '#7c3aed', fontWeight: '700' },
  segRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: 10, paddingHorizontal: 12, borderRadius: 10,
    borderWidth: 1.5, borderColor: '#e5e7eb', marginBottom: 6,
  },
  segRowActive: { borderColor: '#7c3aed', backgroundColor: '#faf5ff' },
  segLabel: { fontSize: 14, color: '#374151', fontWeight: '500' },
  segLabelActive: { color: '#7c3aed', fontWeight: '700' },
  fieldLabel: { fontSize: 13, fontWeight: '600', color: '#374151', marginBottom: 6 },
  input: {
    borderWidth: 1, borderColor: '#ddd6fe', borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 10, fontSize: 14,
    backgroundColor: '#faf5ff', color: '#111827', marginBottom: 4,
  },
  saveBtn: {
    backgroundColor: '#7c3aed', borderRadius: 12, paddingVertical: 13,
    alignItems: 'center', marginTop: 4,
  },
  saveBtnText: { color: '#fff', fontWeight: '800', fontSize: 14 },
  modalSheet: {
    backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '92%',
  },
  modalHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    padding: 20, borderBottomWidth: 1, borderColor: '#f3f4f6',
  },
  modalTitle: { fontSize: 17, fontWeight: '800', color: '#111827', flex: 1, marginRight: 8 },
  modalClose: { fontSize: 20, color: '#9ca3af', fontWeight: '700' },
})
