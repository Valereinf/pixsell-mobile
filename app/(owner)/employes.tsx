import { useEffect, useState, useMemo } from 'react'
import {
  View, Text, FlatList, TouchableOpacity, TextInput, Modal,
  StyleSheet, ActivityIndicator, Switch, Image, ScrollView,
  Platform, KeyboardAvoidingView, Alert,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { supabase } from '../../lib/supabase'
import type { Company } from '../../lib/types'
import { useOwnerContext } from '../../lib/ownerContext'

const NETLIFY_URL = 'https://aesthetic-yeot-2d7094.netlify.app'

// ── Types ──────────────────────────────────────────────────────────────────────

interface EmployeRow {
  id: string
  nom: string
  prenom: string | null
  genre: string
  photo_url: string | null
  actif: boolean
  created_at: string
  date_naissance: string | null
  telephone: string | null
  email: string | null
  adresse: string | null
  ville: string | null
  code_postal: string | null
  type_contrat: 'temps_plein' | 'temps_partiel' | 'sur_appel' | 'freelance' | null
  specialites: string[] | null
  bio: string | null
  date_embauche: string | null
  couleur_agenda: string | null
  visible_booking: boolean
  majoration_active: boolean | null
  majoration_sens: 'hausse' | 'baisse' | null
  majoration_type: 'pourcentage' | 'montant_fixe' | null
  majoration_valeur: number | null
  majoration_label: string | null
  jours_vacances_annuels: number | null
  titre: string | null
  mode_remuneration: 'aucun' | 'commission' | 'horaire' | 'fixe' | null
  taux_commission: number | null
  taux_horaire: number | null
  salaire_mensuel: number | null
}

interface FormData {
  nom: string; prenom: string; genre: string; photo_url: string; actif: boolean
  date_naissance: string; telephone: string; email: string
  adresse: string; ville: string; code_postal: string
  type_contrat: 'temps_plein' | 'temps_partiel' | 'sur_appel' | 'freelance'
  specialites: string[]; bio: string; date_embauche: string
  couleur_agenda: string; visible_booking: boolean
  majoration_active: boolean; majoration_sens: 'hausse' | 'baisse'
  majoration_type: 'pourcentage' | 'montant_fixe'
  majoration_valeur: string; majoration_label: string
  jours_vacances_annuels: number; titre: string
  mode_remuneration: 'aucun' | 'commission' | 'horaire' | 'fixe'
  taux_commission: string; taux_horaire: string; salaire_mensuel: string
}

// ── Constants ──────────────────────────────────────────────────────────────────

const CONTRAT_LABELS: Record<string, { label: string; bg: string; color: string }> = {
  temps_plein:   { label: 'Temps plein',   bg: 'rgba(59,130,246,0.12)',  color: '#1d4ed8' },
  temps_partiel: { label: 'Temps partiel', bg: 'rgba(245,158,11,0.12)',  color: '#b45309' },
  sur_appel:     { label: 'Sur appel',     bg: 'rgba(249,115,22,0.12)',  color: '#c2410c' },
  freelance:     { label: 'Freelance',     bg: 'rgba(124,58,237,0.12)', color: '#7c3aed' },
}

const EMPTY: FormData = {
  nom: '', prenom: '', genre: 'autre', photo_url: '', actif: true,
  date_naissance: '', telephone: '', email: '',
  adresse: '', ville: '', code_postal: '',
  type_contrat: 'temps_plein', specialites: [], bio: '',
  date_embauche: '', couleur_agenda: '#7c3aed',
  visible_booking: true,
  majoration_active: false, majoration_sens: 'hausse', majoration_type: 'pourcentage',
  majoration_valeur: '0', majoration_label: 'Spécialiste',
  jours_vacances_annuels: 0, titre: '',
  mode_remuneration: 'aucun', taux_commission: '', taux_horaire: '', salaire_mensuel: '',
}

const AGENDA_COLORS = ['#7c3aed', '#ec4899', '#ef4444', '#f59e0b', '#10b981', '#3b82f6']

const CONTRAT_OPTIONS: { value: FormData['type_contrat']; label: string }[] = [
  { value: 'temps_plein',   label: 'Temps plein' },
  { value: 'temps_partiel', label: 'Temps partiel' },
  { value: 'sur_appel',     label: 'Sur appel' },
  { value: 'freelance',     label: 'Freelance' },
]

const GENRE_OPTIONS = [
  { value: 'homme',     label: 'Homme' },
  { value: 'femme',     label: 'Femme' },
  { value: 'non_binaire', label: 'Non-binaire' },
  { value: 'autre',     label: 'Autre' },
]

const REMUN_OPTIONS: { value: FormData['mode_remuneration']; label: string }[] = [
  { value: 'aucun',      label: 'Aucun' },
  { value: 'commission', label: 'Commission (%)' },
  { value: 'horaire',    label: 'Taux horaire' },
  { value: 'fixe',       label: 'Salaire fixe mensuel' },
]

// ── Helpers ────────────────────────────────────────────────────────────────────

function fullName(e: Pick<EmployeRow, 'prenom' | 'nom'>): string {
  return [e.prenom, e.nom].filter(Boolean).join(' ') || e.nom
}

function initiales(e: Pick<EmployeRow, 'prenom' | 'nom'>): string {
  return [e.prenom, e.nom].filter(Boolean).map(s => s![0]).join('').toUpperCase().slice(0, 2) || '?'
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function ContratBadge({ type }: { type: string }) {
  const c = CONTRAT_LABELS[type]
  if (!c) return null
  return (
    <View style={{ paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, backgroundColor: c.bg, alignSelf: 'flex-start', marginTop: 4 }}>
      <Text style={{ fontSize: 11, color: c.color, fontWeight: '700' }}>{c.label}</Text>
    </View>
  )
}

function MajorationBadge({ e }: { e: EmployeRow }) {
  if (!e.majoration_active) return null
  const hausse = e.majoration_sens === 'hausse'
  const valStr = e.majoration_type === 'pourcentage'
    ? `${e.majoration_valeur}%`
    : `${e.majoration_valeur}$`
  return (
    <View style={{
      paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, alignSelf: 'flex-start', marginTop: 4,
      backgroundColor: hausse ? 'rgba(245,158,11,0.12)' : 'rgba(59,130,246,0.12)',
    }}>
      <Text style={{ fontSize: 11, fontWeight: '700', color: hausse ? '#b45309' : '#1d4ed8' }}>
        {hausse ? '▲' : '▼'} {valStr} — {e.majoration_label ?? (hausse ? 'Spécialiste' : 'Junior')}
      </Text>
    </View>
  )
}

function SpecTag({ label, onRemove }: { label: string; onRemove?: () => void }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#ede9fe', borderRadius: 12, paddingHorizontal: 10, paddingVertical: 4, marginRight: 6, marginBottom: 6 }}>
      <Text style={{ color: '#7c3aed', fontSize: 12, fontWeight: '600' }}>{label}</Text>
      {onRemove && (
        <TouchableOpacity onPress={onRemove} style={{ marginLeft: 4 }}>
          <Ionicons name="close-circle" size={14} color="#7c3aed" />
        </TouchableOpacity>
      )}
    </View>
  )
}

function Picker<T extends string>({ label, value, options, onChange }: {
  label: string
  value: T
  options: { value: T; label: string }[]
  onChange: (v: T) => void
}) {
  return (
    <View style={{ marginBottom: 12 }}>
      <Text style={s.fieldLabel}>{label}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingBottom: 2 }}>
        {options.map(o => (
          <TouchableOpacity
            key={o.value}
            onPress={() => onChange(o.value)}
            style={[s.pickChip, value === o.value && s.pickChipActive]}
          >
            <Text style={[s.pickLabel, value === o.value && s.pickLabelActive]}>{o.label}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  )
}

// ── Main Component ─────────────────────────────────────────────────────────────

export default function EmployesScreen() {
  const router = useRouter()
  const { company } = useOwnerContext()
  const [employes, setEmployes]   = useState<EmployeRow[]>([])
  const [soldesMap, setSoldesMap] = useState<Record<string, number>>({})
  const [loading, setLoading]     = useState(true)
  const [saving, setSaving]       = useState(false)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)

  // Modal employe
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing]     = useState<EmployeRow | null>(null)
  const [form, setForm]           = useState<FormData>({ ...EMPTY })
  const [specInput, setSpecInput] = useState('')

  // Modal mot de passe
  const [pwdModal, setPwdModal] = useState<EmployeRow | null>(null)
  const [pwdValue, setPwdValue] = useState('')
  const [pwdMsg, setPwdMsg]     = useState('')
  const [pwdLoading, setPwdLoading] = useState(false)

  // ── Load ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!company) return
    loadAll()
  }, [company?.id])

  async function loadAll() {
    setLoading(true)
    const cid = company!.id
    const [empRes, soldeRes] = await Promise.all([
      supabase.from('employes')
        .select('id, nom, prenom, genre, photo_url, actif, created_at, date_naissance, telephone, email, adresse, ville, code_postal, type_contrat, specialites, bio, date_embauche, couleur_agenda, visible_booking, majoration_active, majoration_sens, majoration_type, majoration_valeur, majoration_label, jours_vacances_annuels, titre, mode_remuneration, taux_commission, taux_horaire, salaire_mensuel')
        .eq('company_id', cid)
        .order('created_at', { ascending: true }),
      supabase.from('v_employe_solde_vacances')
        .select('employe_id, jours_restants')
        .eq('company_id', cid),
    ])
    setEmployes((empRes.data ?? []) as EmployeRow[])
    const map: Record<string, number> = {}
    ;(soldeRes.data ?? []).forEach((r: { employe_id: string; jours_restants: number }) => {
      map[r.employe_id] = Number(r.jours_restants)
    })
    setSoldesMap(map)
    setLoading(false)
  }

  const actifCount = useMemo(() => employes.filter(e => e.actif).length, [employes])

  // ── Actions ─────────────────────────────────────────────────────────

  function openAdd() {
    setEditing(null)
    setForm({ ...EMPTY })
    setSpecInput('')
    setShowModal(true)
  }

  function openEdit(e: EmployeRow) {
    setEditing(e)
    setForm({
      nom: e.nom,
      prenom: e.prenom ?? '',
      genre: e.genre ?? 'autre',
      photo_url: e.photo_url ?? '',
      actif: e.actif,
      date_naissance: e.date_naissance ?? '',
      telephone: e.telephone ?? '',
      email: e.email ?? '',
      adresse: e.adresse ?? '',
      ville: e.ville ?? '',
      code_postal: e.code_postal ?? '',
      type_contrat: e.type_contrat ?? 'temps_plein',
      specialites: e.specialites ?? [],
      bio: e.bio ?? '',
      date_embauche: e.date_embauche ?? '',
      couleur_agenda: e.couleur_agenda ?? '#7c3aed',
      visible_booking: e.visible_booking,
      majoration_active: e.majoration_active ?? false,
      majoration_sens: e.majoration_sens ?? 'hausse',
      majoration_type: e.majoration_type ?? 'pourcentage',
      majoration_valeur: String(e.majoration_valeur ?? '0'),
      majoration_label: e.majoration_label ?? 'Spécialiste',
      jours_vacances_annuels: e.jours_vacances_annuels ?? 0,
      titre: e.titre ?? '',
      mode_remuneration: e.mode_remuneration ?? 'aucun',
      taux_commission: e.taux_commission != null ? String(e.taux_commission) : '',
      taux_horaire: e.taux_horaire != null ? String(e.taux_horaire) : '',
      salaire_mensuel: e.salaire_mensuel != null ? String(e.salaire_mensuel) : '',
    })
    setSpecInput('')
    setShowModal(true)
  }

  async function toggleActif(e: EmployeRow) {
    await supabase.from('employes').update({ actif: !e.actif }).eq('id', e.id)
    setEmployes(prev => prev.map(emp => emp.id === e.id ? { ...emp, actif: !emp.actif } : emp))
  }

  async function handleDelete(id: string) {
    await supabase.from('employes').delete().eq('id', id)
    setEmployes(prev => prev.filter(e => e.id !== id))
    setConfirmDelete(null)
  }

  async function handleSave() {
    if (!company || !form.nom.trim()) return
    setSaving(true)
    const payload = {
      company_id: company.id,
      nom: form.nom.trim(),
      prenom: form.prenom.trim() || null,
      genre: form.genre,
      photo_url: form.photo_url || null,
      actif: form.actif,
      date_naissance: form.date_naissance || null,
      telephone: form.telephone.trim() || null,
      email: form.email.trim() || null,
      adresse: form.adresse.trim() || null,
      ville: form.ville.trim() || null,
      code_postal: form.code_postal.trim() || null,
      type_contrat: form.type_contrat,
      specialites: form.specialites,
      bio: form.bio.trim() || null,
      date_embauche: form.date_embauche || null,
      couleur_agenda: form.couleur_agenda || '#7c3aed',
      visible_booking: form.visible_booking,
      majoration_active: form.majoration_active,
      majoration_sens: form.majoration_active ? form.majoration_sens : null,
      majoration_type: form.majoration_active ? form.majoration_type : null,
      majoration_valeur: form.majoration_active ? (Number(form.majoration_valeur) || 0) : 0,
      majoration_label: form.majoration_active
        ? (form.majoration_label.trim() || (form.majoration_sens === 'baisse' ? 'Junior' : 'Spécialiste'))
        : null,
      jours_vacances_annuels: form.jours_vacances_annuels,
      titre: form.titre.trim() || null,
      mode_remuneration: form.mode_remuneration,
      taux_commission: form.mode_remuneration === 'commission' ? (Number(form.taux_commission) || null) : null,
      taux_horaire: form.mode_remuneration === 'horaire' ? (Number(form.taux_horaire) || null) : null,
      salaire_mensuel: form.mode_remuneration === 'fixe' ? (Number(form.salaire_mensuel) || null) : null,
    }
    if (editing) {
      await supabase.from('employes').update(payload).eq('id', editing.id)
    } else {
      await supabase.from('employes').insert(payload)
    }
    await loadAll()
    setShowModal(false)
    setSaving(false)
  }

  async function handleSetPassword() {
    if (!company || !pwdModal || pwdValue.length < 6) return
    setPwdLoading(true)
    setPwdMsg('')
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch(`${NETLIFY_URL}/.netlify/functions/employe-set-password`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token ?? ''}`,
        },
        body: JSON.stringify({ slug: (company as Company & { slug?: string }).slug, employe_id: pwdModal.id, password: pwdValue }),
      })
      if (res.ok) {
        setPwdMsg('Mot de passe défini avec succès !')
        setPwdValue('')
      } else {
        setPwdMsg('Erreur lors de la mise à jour.')
      }
    } catch {
      setPwdMsg('Erreur réseau.')
    }
    setPwdLoading(false)
  }

  function addSpec() {
    const v = specInput.trim()
    if (v && !form.specialites.includes(v)) {
      setForm(p => ({ ...p, specialites: [...p.specialites, v] }))
    }
    setSpecInput('')
  }

  function removeSpec(spec: string) {
    setForm(p => ({ ...p, specialites: p.specialites.filter(s => s !== spec) }))
  }

  // ── Render Card ──────────────────────────────────────────────────────

  function renderCard({ item: e }: { item: EmployeRow }) {
    const color = e.couleur_agenda ?? '#7c3aed'
    const solde = soldesMap[e.id] ?? 0
    return (
      <View style={s.card}>
        {/* Badges top */}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 10, minHeight: 4 }}>
          {!e.actif && (
            <View style={{ paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, backgroundColor: 'rgba(107,114,128,0.12)' }}>
              <Text style={{ color: '#6b7280', fontSize: 11, fontWeight: '700' }}>Inactif</Text>
            </View>
          )}
          {!e.visible_booking && (
            <View style={{ paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, backgroundColor: 'rgba(239,68,68,0.10)' }}>
              <Text style={{ color: '#dc2626', fontSize: 11, fontWeight: '700' }}>Hors réservation</Text>
            </View>
          )}
        </View>

        {/* Avatar + infos */}
        <View style={{ flexDirection: 'row', gap: 14, marginBottom: 12 }}>
          <View style={[s.avatar, { borderColor: color }]}>
            {e.photo_url
              ? <Image source={{ uri: e.photo_url }} style={{ width: 60, height: 60, borderRadius: 30 }} />
              : <Text style={[s.avatarText, { color }]}>{initiales(e)}</Text>
            }
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.empName}>{fullName(e)}</Text>
            {e.titre ? <Text style={{ color: '#7c3aed', fontSize: 13, fontWeight: '600', marginTop: 2 }}>{e.titre}</Text> : null}
            {e.type_contrat ? <ContratBadge type={e.type_contrat} /> : null}
            {e.majoration_active ? <MajorationBadge e={e} /> : null}
          </View>
        </View>

        {/* Spécialités */}
        {(e.specialites ?? []).length > 0 && (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginBottom: 8 }}>
            {(e.specialites ?? []).slice(0, 3).map(sp => <SpecTag key={sp} label={sp} />)}
            {(e.specialites ?? []).length > 3 && (
              <View style={{ backgroundColor: '#f3f4f6', borderRadius: 12, paddingHorizontal: 8, paddingVertical: 4 }}>
                <Text style={{ color: '#6b7280', fontSize: 12 }}>+{(e.specialites ?? []).length - 3}</Text>
              </View>
            )}
          </View>
        )}

        {/* Contact */}
        {(e.telephone || e.email) && (
          <View style={{ marginBottom: 8, gap: 3 }}>
            {e.telephone && <Text style={s.contactLine}>📞 {e.telephone}</Text>}
            {e.email && <Text style={s.contactLine}>✉️ {e.email}</Text>}
          </View>
        )}

        {/* Solde vacances */}
        {(e.jours_vacances_annuels ?? 0) > 0 && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 10 }}>
            <Text style={{ fontSize: 13, color: '#374151' }}>
              🏖️ {solde.toFixed(1)} / {e.jours_vacances_annuels} j. vacances
            </Text>
          </View>
        )}

        {/* Actions */}
        <View style={s.actionsRow}>
          <TouchableOpacity style={s.actionBtn} onPress={() => toggleActif(e)}>
            <Ionicons name={e.actif ? 'pause-circle-outline' : 'play-circle-outline'} size={18} color={e.actif ? '#dc2626' : '#059669'} />
            <Text style={{ fontSize: 11, color: e.actif ? '#dc2626' : '#059669', fontWeight: '600' }}>
              {e.actif ? 'Désactiver' : 'Activer'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity style={s.actionIconBtn} onPress={() => openEdit(e)}>
            <Ionicons name="pencil-outline" size={18} color="#7c3aed" />
          </TouchableOpacity>

          <TouchableOpacity
            style={s.actionIconBtn}
            onPress={() => router.push(`/(owner)/calendrier?employe_id=${e.id}` as Parameters<typeof router.push>[0])}
          >
            <Ionicons name="calendar-outline" size={18} color="#7c3aed" />
          </TouchableOpacity>

          <TouchableOpacity style={s.actionIconBtn} onPress={() => { setPwdModal(e); setPwdValue(''); setPwdMsg('') }}>
            <Ionicons name="key-outline" size={18} color="#7c3aed" />
          </TouchableOpacity>

          {confirmDelete === e.id ? (
            <View style={{ flexDirection: 'row', gap: 4 }}>
              <TouchableOpacity style={[s.actionIconBtn, { backgroundColor: 'rgba(220,38,38,0.1)' }]} onPress={() => handleDelete(e.id)}>
                <Ionicons name="checkmark" size={18} color="#dc2626" />
              </TouchableOpacity>
              <TouchableOpacity style={s.actionIconBtn} onPress={() => setConfirmDelete(null)}>
                <Ionicons name="close" size={18} color="#6b7280" />
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity style={[s.actionIconBtn, { backgroundColor: 'rgba(220,38,38,0.1)' }]} onPress={() => setConfirmDelete(e.id)}>
              <Ionicons name="trash-outline" size={18} color="#dc2626" />
            </TouchableOpacity>
          )}
        </View>
      </View>
    )
  }

  // ── Render ─────────────────────────────────────────────────────────

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#f5f3ff' }} edges={['top']}>
      {/* Header */}
      <View style={s.header}>
        <View>
          <Text style={s.headerTitle}>Profil des employés</Text>
          <Text style={s.headerSub}>{actifCount} membre{actifCount !== 1 ? 's' : ''} actif{actifCount !== 1 ? 's' : ''}</Text>
        </View>
        <TouchableOpacity style={s.addBtn} onPress={openAdd}>
          <Ionicons name="add" size={18} color="#fff" />
          <Text style={s.addBtnText}>Ajouter</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <ActivityIndicator style={{ marginTop: 40 }} size="large" color="#7c3aed" />
      ) : (
        <FlatList
          data={employes}
          keyExtractor={e => e.id}
          renderItem={renderCard}
          contentContainerStyle={{ padding: 16, paddingBottom: 100, gap: 12 }}
          ListEmptyComponent={
            <View style={{ alignItems: 'center', paddingTop: 60, gap: 12 }}>
              <Ionicons name="people-outline" size={56} color="#c4b5fd" />
              <Text style={{ color: '#6b7280', fontSize: 16, fontWeight: '600' }}>Aucun employé</Text>
              <TouchableOpacity style={s.addBtn} onPress={openAdd}>
                <Text style={s.addBtnText}>Ajouter le premier employé</Text>
              </TouchableOpacity>
            </View>
          }
        />
      )}

      {/* FAB */}
      <TouchableOpacity style={s.fab} onPress={openAdd}>
        <Ionicons name="add" size={28} color="#fff" />
      </TouchableOpacity>

      {/* ── Modal Employé ── */}
      <Modal visible={showModal} animationType="slide" presentationStyle={Platform.OS === 'ios' ? 'pageSheet' : undefined} transparent={Platform.OS !== 'ios'}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          {Platform.OS !== 'ios' && <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' }} />}
          <View style={[s.modalSheet, Platform.OS !== 'ios' && { position: 'absolute', bottom: 0, left: 0, right: 0 }]}>
            <View style={s.modalHeader}>
              <Text style={s.modalTitle}>{editing ? 'Modifier l\'employé' : 'Ajouter un employé'}</Text>
              <TouchableOpacity onPress={() => setShowModal(false)}>
                <Text style={s.modalClose}>✕</Text>
              </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 60 }}>
              {/* ─ Section 1 : Informations personnelles ─ */}
              <View style={s.sectionBox}>
                <Text style={s.sectionTitle}>Informations personnelles</Text>

                {/* Avatar initiales */}
                <View style={{ alignItems: 'center', marginBottom: 16 }}>
                  <View style={[s.avatar, { width: 72, height: 72, borderRadius: 36, borderColor: form.couleur_agenda, marginBottom: 8 }]}>
                    <Text style={[s.avatarText, { color: form.couleur_agenda, fontSize: 22 }]}>
                      {[form.prenom, form.nom].filter(Boolean).map(s => s[0]).join('').toUpperCase().slice(0, 2) || '?'}
                    </Text>
                  </View>
                  <Text style={{ fontSize: 12, color: '#9ca3af' }}>Upload photo non disponible sur mobile</Text>
                </View>

                <View style={{ flexDirection: 'row', gap: 10 }}>
                  <View style={{ flex: 1 }}>
                    <Text style={s.fieldLabel}>Prénom</Text>
                    <TextInput style={s.input} placeholder="Prénom" value={form.prenom} onChangeText={v => setForm(p => ({ ...p, prenom: v }))} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.fieldLabel}>Nom *</Text>
                    <TextInput style={s.input} placeholder="Nom" value={form.nom} onChangeText={v => setForm(p => ({ ...p, nom: v }))} />
                  </View>
                </View>

                <Picker label="Genre" value={form.genre as FormData['genre']} options={GENRE_OPTIONS as { value: FormData['genre']; label: string }[]} onChange={v => setForm(p => ({ ...p, genre: v }))} />

                <View style={{ flexDirection: 'row', gap: 10 }}>
                  <View style={{ flex: 1 }}>
                    <Text style={s.fieldLabel}>Date naissance</Text>
                    <TextInput style={s.input} placeholder="AAAA-MM-JJ" value={form.date_naissance} onChangeText={v => setForm(p => ({ ...p, date_naissance: v }))} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.fieldLabel}>Téléphone</Text>
                    <TextInput style={s.input} placeholder="+33 …" keyboardType="phone-pad" value={form.telephone} onChangeText={v => setForm(p => ({ ...p, telephone: v }))} />
                  </View>
                </View>

                <Text style={s.fieldLabel}>Email</Text>
                <TextInput style={s.input} placeholder="email@exemple.com" keyboardType="email-address" autoCapitalize="none" value={form.email} onChangeText={v => setForm(p => ({ ...p, email: v }))} />

                <Text style={s.fieldLabel}>Adresse</Text>
                <TextInput style={s.input} placeholder="Adresse" value={form.adresse} onChangeText={v => setForm(p => ({ ...p, adresse: v }))} />

                <View style={{ flexDirection: 'row', gap: 10 }}>
                  <View style={{ flex: 2 }}>
                    <Text style={s.fieldLabel}>Ville</Text>
                    <TextInput style={s.input} placeholder="Ville" value={form.ville} onChangeText={v => setForm(p => ({ ...p, ville: v }))} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.fieldLabel}>Code postal</Text>
                    <TextInput style={s.input} placeholder="75000" keyboardType="numeric" value={form.code_postal} onChangeText={v => setForm(p => ({ ...p, code_postal: v }))} />
                  </View>
                </View>
              </View>

              {/* ─ Section 2 : Informations professionnelles ─ */}
              <View style={s.sectionBox}>
                <Text style={s.sectionTitle}>Informations professionnelles</Text>

                <Picker label="Type de contrat" value={form.type_contrat} options={CONTRAT_OPTIONS} onChange={v => setForm(p => ({ ...p, type_contrat: v }))} />

                <Text style={s.fieldLabel}>Date d'embauche</Text>
                <TextInput style={s.input} placeholder="AAAA-MM-JJ" value={form.date_embauche} onChangeText={v => setForm(p => ({ ...p, date_embauche: v }))} />

                <Text style={s.fieldLabel}>Titre / Rôle</Text>
                <TextInput style={s.input} placeholder="Ex : Coiffeuse senior" value={form.titre} onChangeText={v => setForm(p => ({ ...p, titre: v }))} />

                <Text style={s.fieldLabel}>Jours vacances annuels</Text>
                <TextInput
                  style={s.input}
                  keyboardType="numeric"
                  placeholder="0"
                  value={String(form.jours_vacances_annuels)}
                  onChangeText={v => setForm(p => ({ ...p, jours_vacances_annuels: Number(v) || 0 }))}
                />

                <Text style={s.fieldLabel}>Spécialités</Text>
                <View style={{ flexDirection: 'row', gap: 8, marginBottom: 8 }}>
                  <TextInput
                    style={[s.input, { flex: 1 }]}
                    placeholder="Ajouter une spécialité"
                    value={specInput}
                    onChangeText={setSpecInput}
                    onSubmitEditing={addSpec}
                    returnKeyType="done"
                  />
                  <TouchableOpacity style={s.addBtn} onPress={addSpec}>
                    <Ionicons name="add" size={18} color="#fff" />
                  </TouchableOpacity>
                </View>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginBottom: 8 }}>
                  {form.specialites.map(sp => <SpecTag key={sp} label={sp} onRemove={() => removeSpec(sp)} />)}
                </View>

                <Text style={s.fieldLabel}>Bio</Text>
                <TextInput
                  style={[s.input, { height: 80, textAlignVertical: 'top' }]}
                  multiline
                  placeholder="Description courte"
                  value={form.bio}
                  onChangeText={v => setForm(p => ({ ...p, bio: v }))}
                />

                {/* Tarification spéciale */}
                <View style={s.switchRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={s.fieldLabel}>Tarification spéciale</Text>
                    <Text style={{ fontSize: 12, color: '#9ca3af' }}>Majoration ou réduction de tarif</Text>
                  </View>
                  <Switch
                    value={form.majoration_active}
                    onValueChange={v => setForm(p => ({ ...p, majoration_active: v }))}
                    trackColor={{ false: '#d1d5db', true: '#c4b5fd' }}
                    thumbColor={form.majoration_active ? '#7c3aed' : '#f4f4f5'}
                  />
                </View>
                {form.majoration_active && (
                  <View style={{ backgroundColor: '#f5f3ff', borderRadius: 12, padding: 12, marginBottom: 12, gap: 10 }}>
                    <Picker
                      label="Type d'ajustement"
                      value={form.majoration_sens}
                      options={[{ value: 'hausse', label: '▲ Hausse (spécialiste)' }, { value: 'baisse', label: '▼ Baisse (junior)' }]}
                      onChange={v => setForm(p => ({ ...p, majoration_sens: v }))}
                    />
                    <Picker
                      label="Type de valeur"
                      value={form.majoration_type}
                      options={[{ value: 'pourcentage', label: 'Pourcentage (%)' }, { value: 'montant_fixe', label: 'Montant fixe ($)' }]}
                      onChange={v => setForm(p => ({ ...p, majoration_type: v }))}
                    />
                    <View style={{ flexDirection: 'row', gap: 10 }}>
                      <View style={{ flex: 1 }}>
                        <Text style={s.fieldLabel}>Valeur</Text>
                        <TextInput
                          style={s.input}
                          keyboardType="numeric"
                          placeholder="0"
                          value={form.majoration_valeur}
                          onChangeText={v => setForm(p => ({ ...p, majoration_valeur: v }))}
                        />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={s.fieldLabel}>Label affiché</Text>
                        <TextInput
                          style={s.input}
                          placeholder="Spécialiste"
                          value={form.majoration_label}
                          onChangeText={v => setForm(p => ({ ...p, majoration_label: v }))}
                        />
                      </View>
                    </View>
                    <View style={{ backgroundColor: '#ede9fe', borderRadius: 10, padding: 10 }}>
                      <Text style={{ color: '#7c3aed', fontSize: 13, fontWeight: '600' }}>
                        Aperçu : {form.majoration_sens === 'hausse' ? '▲' : '▼'}{' '}
                        {form.majoration_valeur || '0'}{form.majoration_type === 'pourcentage' ? '%' : '$'} — {form.majoration_label || (form.majoration_sens === 'baisse' ? 'Junior' : 'Spécialiste')}
                      </Text>
                    </View>
                  </View>
                )}

                {/* Couleur agenda */}
                <Text style={[s.fieldLabel, { marginBottom: 8 }]}>Couleur agenda</Text>
                <View style={{ flexDirection: 'row', gap: 10, marginBottom: 14 }}>
                  {AGENDA_COLORS.map(c => (
                    <TouchableOpacity
                      key={c}
                      onPress={() => setForm(p => ({ ...p, couleur_agenda: c }))}
                      style={{
                        width: 32, height: 32, borderRadius: 16, backgroundColor: c,
                        borderWidth: form.couleur_agenda === c ? 3 : 0,
                        borderColor: '#111827',
                      }}
                    />
                  ))}
                </View>

                <View style={s.switchRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={s.fieldLabel}>Visible en réservation</Text>
                  </View>
                  <Switch
                    value={form.visible_booking}
                    onValueChange={v => setForm(p => ({ ...p, visible_booking: v }))}
                    trackColor={{ false: '#d1d5db', true: '#c4b5fd' }}
                    thumbColor={form.visible_booking ? '#7c3aed' : '#f4f4f5'}
                  />
                </View>

                <View style={s.switchRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={s.fieldLabel}>Employé actif</Text>
                  </View>
                  <Switch
                    value={form.actif}
                    onValueChange={v => setForm(p => ({ ...p, actif: v }))}
                    trackColor={{ false: '#d1d5db', true: '#c4b5fd' }}
                    thumbColor={form.actif ? '#7c3aed' : '#f4f4f5'}
                  />
                </View>
              </View>

              {/* ─ Section 3 : Rémunération ─ */}
              <View style={s.sectionBox}>
                <Text style={s.sectionTitle}>Rémunération</Text>

                <Picker label="Mode de rémunération" value={form.mode_remuneration} options={REMUN_OPTIONS} onChange={v => setForm(p => ({ ...p, mode_remuneration: v }))} />

                {form.mode_remuneration === 'commission' && (
                  <>
                    <Text style={s.fieldLabel}>Taux de commission (%)</Text>
                    <TextInput
                      style={s.input}
                      keyboardType="numeric"
                      placeholder="Ex : 40"
                      value={form.taux_commission}
                      onChangeText={v => setForm(p => ({ ...p, taux_commission: v }))}
                    />
                  </>
                )}
                {form.mode_remuneration === 'horaire' && (
                  <>
                    <Text style={s.fieldLabel}>Taux horaire ($/h)</Text>
                    <TextInput
                      style={s.input}
                      keyboardType="numeric"
                      placeholder="Ex : 18"
                      value={form.taux_horaire}
                      onChangeText={v => setForm(p => ({ ...p, taux_horaire: v }))}
                    />
                  </>
                )}
                {form.mode_remuneration === 'fixe' && (
                  <>
                    <Text style={s.fieldLabel}>Salaire mensuel ($)</Text>
                    <TextInput
                      style={s.input}
                      keyboardType="numeric"
                      placeholder="Ex : 2500"
                      value={form.salaire_mensuel}
                      onChangeText={v => setForm(p => ({ ...p, salaire_mensuel: v }))}
                    />
                  </>
                )}
              </View>

              {/* Sauvegarder */}
              <TouchableOpacity style={s.saveBtn} onPress={handleSave} disabled={saving || !form.nom.trim()}>
                {saving
                  ? <ActivityIndicator color="#fff" />
                  : <Text style={s.saveBtnText}>{editing ? 'Enregistrer les modifications' : 'Ajouter l\'employé'}</Text>
                }
              </TouchableOpacity>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ── Modal Mot de passe ── */}
      <Modal visible={!!pwdModal} animationType="slide" presentationStyle={Platform.OS === 'ios' ? 'pageSheet' : undefined} transparent={Platform.OS !== 'ios'}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          {Platform.OS !== 'ios' && <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' }} />}
          <View style={[s.modalSheet, Platform.OS !== 'ios' && { position: 'absolute', bottom: 0, left: 0, right: 0 }]}>
            <View style={s.modalHeader}>
              <Text style={s.modalTitle}>🔑 Accès portail employé</Text>
              <TouchableOpacity onPress={() => setPwdModal(null)}>
                <Text style={s.modalClose}>✕</Text>
              </TouchableOpacity>
            </View>
            <View style={{ padding: 24, gap: 14 }}>
              {pwdModal && (
                <Text style={{ color: '#6b7280', fontSize: 14 }}>
                  Définir le mot de passe de connexion pour{' '}
                  <Text style={{ fontWeight: '700', color: '#111827' }}>{fullName(pwdModal)}</Text>
                </Text>
              )}
              <Text style={s.fieldLabel}>Nouveau mot de passe (min. 6 caractères)</Text>
              <TextInput
                style={s.input}
                secureTextEntry
                placeholder="••••••••"
                value={pwdValue}
                onChangeText={v => { setPwdValue(v); setPwdMsg('') }}
              />
              {pwdMsg ? (
                <Text style={{ color: pwdMsg.includes('succès') ? '#059669' : '#dc2626', fontWeight: '600', fontSize: 14 }}>
                  {pwdMsg}
                </Text>
              ) : null}
              <TouchableOpacity
                style={[s.saveBtn, pwdValue.length < 6 && { opacity: 0.5 }]}
                onPress={handleSetPassword}
                disabled={pwdValue.length < 6 || pwdLoading}
              >
                {pwdLoading
                  ? <ActivityIndicator color="#fff" />
                  : <Text style={s.saveBtnText}>Définir le mot de passe</Text>
                }
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
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
  addBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: '#7c3aed', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20,
  },
  addBtnText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  card: {
    backgroundColor: 'rgba(255,255,255,0.95)', borderRadius: 20, padding: 16,
    shadowColor: '#7c3aed', shadowOpacity: 0.12, shadowRadius: 12, shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  avatar: {
    width: 64, height: 64, borderRadius: 32, borderWidth: 2.5,
    alignItems: 'center', justifyContent: 'center', backgroundColor: '#f5f3ff',
    overflow: 'hidden',
  },
  avatarText: { fontSize: 20, fontWeight: '800' },
  empName: { fontSize: 17, fontWeight: '800', color: '#111827' },
  contactLine: { fontSize: 13, color: '#6b7280' },
  actionsRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12,
    paddingTop: 12, borderTopWidth: 1, borderColor: '#f3f4f6',
  },
  actionBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: '#f3f4f6', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10,
  },
  actionIconBtn: {
    width: 34, height: 34, borderRadius: 8, backgroundColor: '#ede9fe',
    alignItems: 'center', justifyContent: 'center',
  },
  fab: {
    position: 'absolute', bottom: 24, right: 20, width: 56, height: 56,
    borderRadius: 28, backgroundColor: '#7c3aed',
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#7c3aed', shadowOpacity: 0.4, shadowRadius: 12, shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },
  modalSheet: {
    backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24,
    maxHeight: '94%',
  },
  modalHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    padding: 20, borderBottomWidth: 1, borderColor: '#f3f4f6',
  },
  modalTitle: { fontSize: 18, fontWeight: '800', color: '#111827' },
  modalClose: { fontSize: 20, color: '#9ca3af', fontWeight: '700' },
  sectionBox: {
    backgroundColor: '#fafafa', borderRadius: 16, padding: 16,
    marginBottom: 16, borderWidth: 1, borderColor: '#f3f4f6',
  },
  sectionTitle: {
    fontSize: 15, fontWeight: '800', color: '#7c3aed',
    marginBottom: 14, paddingBottom: 8, borderBottomWidth: 1, borderColor: '#ede9fe',
  },
  switchRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginBottom: 12, paddingVertical: 4,
  },
  fieldLabel: { fontSize: 13, fontWeight: '600', color: '#374151', marginBottom: 6 },
  input: {
    borderWidth: 1, borderColor: '#ddd6fe', borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 10, fontSize: 14,
    backgroundColor: '#faf5ff', color: '#111827', marginBottom: 12,
  },
  saveBtn: {
    backgroundColor: '#7c3aed', borderRadius: 14, paddingVertical: 15,
    alignItems: 'center', marginTop: 4,
  },
  saveBtnText: { color: '#fff', fontWeight: '800', fontSize: 15 },
  pickChip: {
    paddingHorizontal: 14, paddingVertical: 7, borderRadius: 16,
    backgroundColor: '#f3f4f6', borderWidth: 1, borderColor: '#e5e7eb',
  },
  pickChipActive: { backgroundColor: '#ede9fe', borderColor: '#7c3aed' },
  pickLabel: { fontSize: 13, color: '#6b7280', fontWeight: '500' },
  pickLabelActive: { color: '#7c3aed', fontWeight: '700' },
})
