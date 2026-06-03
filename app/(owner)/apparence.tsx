import { useEffect, useState } from 'react'
import {
  View, Text, ScrollView, TouchableOpacity, TextInput,
  StyleSheet, ActivityIndicator, Switch, Image,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { LinearGradient } from 'expo-linear-gradient'
import * as ImagePicker from 'expo-image-picker'
import { supabase } from '../../lib/supabase'
import type { Company } from '../../lib/types'
import { useOwnerContext } from '../../lib/ownerContext'

// ── Types ──────────────────────────────────────────────────────────────────────

interface HoraireDay { ouvert: boolean; debut: string; fin: string }

interface AppForm {
  name: string; slug: string; tagline: string; categorie: string; business_type: string
  logo_url: string; primary_color: string; secondary_color: string
  font_heading: string; font_body: string
  hero_titre: string; hero_description: string; hero_image_url: string; hero_video_url: string
  galerie_urls: string[]
  horaires: Record<string, HoraireDay>
  email: string; domain: string; timezone: string
  reseaux_sociaux: Record<string, string>
  adresse: string; ville: string; code_postal: string; province: string; telephone: string
  latitude: string; longitude: string
  seo_title: string; seo_description: string; seo_keywords: string; og_image_url: string
  terme_employe_singulier: string; terme_employe_pluriel: string
  terme_service: string; terme_etablissement: string
  stripe_actif: boolean; stripe_public_key: string
  stripe_penalite_pct: string; delai_annulation_heures: string
  politique_annulation: string
  politique_clause_acceptation: boolean; politique_clause_frais: boolean; politique_clause_delai: boolean
}

// ── Constants ──────────────────────────────────────────────────────────────────

const TABS = [
  { id: 'identite',  label: 'Identité' },
  { id: 'couleurs',  label: 'Couleurs' },
  { id: 'accueil',   label: 'Accueil' },
  { id: 'horaires',  label: 'Horaires' },
  { id: 'contact',   label: 'Contact' },
  { id: 'seo',       label: 'SEO' },
  { id: 'paiements', label: 'Paiements' },
] as const
type TabId = typeof TABS[number]['id']

const JOURS = ['lundi','mardi','mercredi','jeudi','vendredi','samedi','dimanche']
const JOURS_FR: Record<string, string> = {
  lundi:'Lundi', mardi:'Mardi', mercredi:'Mercredi',
  jeudi:'Jeudi', vendredi:'Vendredi', samedi:'Samedi', dimanche:'Dimanche',
}
const DEFAULT_HORAIRES: Record<string, HoraireDay> = Object.fromEntries(
  JOURS.map(j => [j, { ouvert: j !== 'dimanche', debut: '09:00', fin: '18:00' }])
)
const CATEGORIES = ['Barbershop','Salon de coiffure','Spa & bien-être',"Salon d'ongles",'Tattoo','Maquillage','Autre']
const HEADING_FONTS = ['Playfair Display','Montserrat','Oswald','Raleway','Anton','Bebas Neue','Cormorant Garamond','Cinzel','Abril Fatface','Libre Baskerville']
const BODY_FONTS = ['Inter','Roboto','Open Sans','Lato','Poppins','Source Sans 3','Nunito','DM Sans','Figtree','Outfit']
const TIMEZONES = [
  { value: 'America/Toronto',     label: 'Toronto / Montréal (ET)' },
  { value: 'America/New_York',    label: 'New York (ET)' },
  { value: 'America/Chicago',     label: 'Chicago (CT)' },
  { value: 'America/Los_Angeles', label: 'Los Angeles (PT)' },
  { value: 'Europe/Paris',        label: 'Paris (CET)' },
  { value: 'Europe/London',       label: 'Londres (GMT)' },
]
const RESEAUX = [
  { key: 'instagram', label: 'Instagram', placeholder: 'https://instagram.com/…' },
  { key: 'facebook',  label: 'Facebook',  placeholder: 'https://facebook.com/…' },
  { key: 'tiktok',    label: 'TikTok',    placeholder: 'https://tiktok.com/@…' },
  { key: 'twitter',   label: 'Twitter/X', placeholder: 'https://twitter.com/…' },
  { key: 'youtube',   label: 'YouTube',   placeholder: 'https://youtube.com/@…' },
]

// ── Init helper ────────────────────────────────────────────────────────────────

function initFromCompany(c: Company): AppForm {
  return {
    name: c.name ?? '', slug: c.slug ?? '', tagline: c.tagline ?? '',
    categorie: c.categorie ?? '', business_type: c.business_type ?? '',
    logo_url: c.logo_url ?? '', primary_color: c.primary_color ?? '#7c3aed',
    secondary_color: c.secondary_color ?? '#ec4899',
    font_heading: c.font_heading ?? 'Playfair Display', font_body: c.font_body ?? 'Inter',
    hero_titre: c.hero_titre ?? '', hero_description: c.hero_description ?? '',
    hero_image_url: c.hero_image_url ?? '', hero_video_url: c.hero_video_url ?? '',
    galerie_urls: c.galerie_urls ?? [],
    horaires: (c.horaires as Record<string, HoraireDay>) ?? DEFAULT_HORAIRES,
    email: c.email ?? '', domain: c.domain ?? '', timezone: c.timezone ?? 'America/Toronto',
    reseaux_sociaux: (c.reseaux_sociaux as Record<string, string>) ?? {},
    adresse: c.adresse ?? '', ville: c.ville ?? '', code_postal: c.code_postal ?? '',
    province: c.province ?? '', telephone: c.telephone ?? '',
    latitude: c.latitude != null ? String(c.latitude) : '',
    longitude: c.longitude != null ? String(c.longitude) : '',
    seo_title: c.seo_title ?? '', seo_description: c.seo_description ?? '',
    seo_keywords: c.seo_keywords ?? '', og_image_url: c.og_image_url ?? '',
    terme_employe_singulier: c.terme_employe_singulier ?? '',
    terme_employe_pluriel: c.terme_employe_pluriel ?? '',
    terme_service: c.terme_service ?? '',
    terme_etablissement: c.terme_etablissement ?? '',
    stripe_actif: c.stripe_actif ?? false,
    stripe_public_key: c.stripe_public_key ?? '',
    stripe_penalite_pct: String(c.stripe_penalite_pct ?? 50),
    delai_annulation_heures: String(c.delai_annulation_heures ?? 3),
    politique_annulation: c.politique_annulation ?? '',
    politique_clause_acceptation: c.politique_clause_acceptation ?? false,
    politique_clause_frais: c.politique_clause_frais ?? false,
    politique_clause_delai: c.politique_clause_delai ?? false,
  }
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function SectionCard({ title, children }: { title?: string; children: React.ReactNode }) {
  return (
    <View style={s.sectionCard}>
      {title ? <Text style={s.sectionTitle}>{title}</Text> : null}
      <View style={{ gap: 12, marginTop: title ? 12 : 0 }}>{children}</View>
    </View>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={{ gap: 4 }}>
      <Text style={s.fieldLabel}>{label}</Text>
      {children}
    </View>
  )
}

function InputField({ label, value, onChangeText, placeholder, multiline, keyboardType, secureTextEntry, editable, numberOfLines }: {
  label: string; value: string; onChangeText: (v: string) => void
  placeholder?: string; multiline?: boolean; keyboardType?: 'default' | 'numeric' | 'decimal-pad' | 'email-address'
  secureTextEntry?: boolean; editable?: boolean; numberOfLines?: number
}) {
  return (
    <Field label={label}>
      <TextInput
        value={value} onChangeText={onChangeText} placeholder={placeholder}
        multiline={multiline} keyboardType={keyboardType}
        secureTextEntry={secureTextEntry} editable={editable}
        numberOfLines={numberOfLines}
        style={[
          s.input,
          multiline && { height: (numberOfLines ?? 3) * 24, textAlignVertical: 'top' },
          editable === false && { backgroundColor: '#f9fafb', color: '#9ca3af' },
        ]}
        placeholderTextColor="#9ca3af"
      />
    </Field>
  )
}

function ChipPicker({ label, options, value, onChange }: { label: string; options: string[]; value: string; onChange: (v: string) => void }) {
  return (
    <Field label={label}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -4 }}>
        <View style={{ flexDirection: 'row', gap: 8, paddingHorizontal: 4, paddingVertical: 4 }}>
          {options.map(o => (
            <TouchableOpacity key={o} onPress={() => onChange(o)} style={[s.chip, value === o && s.chipActive]}>
              <Text style={[s.chipText, value === o && s.chipTextActive]}>{o}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>
    </Field>
  )
}

function ImageField({ label, uri, onPress, uploading }: { label: string; uri: string; onPress: () => void; uploading: boolean }) {
  return (
    <Field label={label}>
      <TouchableOpacity onPress={onPress} style={s.imageBox}>
        {uploading ? (
          <ActivityIndicator color="#7c3aed" />
        ) : uri ? (
          <Image source={{ uri }} style={s.imagePreview} resizeMode="cover" />
        ) : (
          <View style={{ alignItems: 'center', gap: 6 }}>
            <Ionicons name="image-outline" size={32} color="#c4b5fd" />
            <Text style={{ fontSize: 13, color: '#9ca3af' }}>Appuyer pour choisir</Text>
          </View>
        )}
        {uri ? (
          <View style={s.imageEditOverlay}>
            <Ionicons name="pencil-outline" size={14} color="#fff" />
          </View>
        ) : null}
      </TouchableOpacity>
    </Field>
  )
}

// ── Main Component ─────────────────────────────────────────────────────────────

export default function ApparenceOwner() {
  const { company } = useOwnerContext()
  const [form, setForm]           = useState<AppForm | null>(null)
  const [loading, setLoading]     = useState(true)
  const [tab, setTab]             = useState<TabId>('identite')
  const [saving, setSaving]       = useState(false)
  const [saved, setSaved]         = useState(false)
  const [uploading, setUploading] = useState<string | null>(null)

  useEffect(() => {
    if (!company) return
    setForm(initFromCompany(company))
    setLoading(false)
  }, [company?.id])

  const setField = <K extends keyof AppForm>(k: K, v: AppForm[K]) =>
    setForm(f => f ? { ...f, [k]: v } : f)

  const updateHoraire = (jour: string, patch: Partial<HoraireDay>) =>
    setForm(f => {
      if (!f) return f
      const existing = f.horaires[jour] ?? DEFAULT_HORAIRES[jour]
      return { ...f, horaires: { ...f.horaires, [jour]: { ...existing, ...patch } } }
    })

  const pickAndUpload = async (path: string, fieldKey: keyof AppForm, isGalerie = false) => {
    if (!company) return
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync()
    if (!perm.granted) return
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: !isGalerie, quality: 0.85,
    })
    if (!result.canceled && result.assets[0]) {
      setUploading(String(fieldKey))
      const uri = result.assets[0].uri
      const ext = uri.split('.').pop() ?? 'jpg'
      const fullPath = `${company.id}/${path}.${ext}`
      const response = await fetch(uri)
      const blob = await response.blob()
      await supabase.storage.from('company-assets').upload(fullPath, blob, { upsert: true })
      const { data: { publicUrl } } = supabase.storage.from('company-assets').getPublicUrl(fullPath)
      if (isGalerie) {
        setForm(f => f ? { ...f, galerie_urls: [...f.galerie_urls, publicUrl] } : f)
      } else {
        setField(fieldKey, publicUrl as AppForm[typeof fieldKey])
      }
      setUploading(null)
    }
  }

  const handleSave = async () => {
    if (!company || !form) return
    setSaving(true)
    await supabase.from('companies').update({
      name: form.name, slug: form.slug, tagline: form.tagline,
      categorie: form.categorie, business_type: form.business_type, logo_url: form.logo_url,
      primary_color: form.primary_color, secondary_color: form.secondary_color,
      font_heading: form.font_heading, font_body: form.font_body,
      hero_titre: form.hero_titre, hero_description: form.hero_description,
      hero_image_url: form.hero_image_url, hero_video_url: form.hero_video_url || null,
      galerie_urls: form.galerie_urls,
      horaires: form.horaires,
      email: form.email || null, domain: form.domain,
      timezone: form.timezone, reseaux_sociaux: form.reseaux_sociaux,
      adresse: form.adresse || null, ville: form.ville || null,
      code_postal: form.code_postal || null, province: form.province || null,
      telephone: form.telephone || null,
      latitude: form.latitude ? parseFloat(form.latitude) : null,
      longitude: form.longitude ? parseFloat(form.longitude) : null,
      seo_title: form.seo_title || null, seo_description: form.seo_description || null,
      seo_keywords: form.seo_keywords || null, og_image_url: form.og_image_url || null,
      terme_employe_singulier: form.terme_employe_singulier || null,
      terme_employe_pluriel: form.terme_employe_pluriel || null,
      terme_service: form.terme_service || null, terme_etablissement: form.terme_etablissement || null,
      stripe_actif: form.stripe_actif, stripe_public_key: form.stripe_public_key || null,
      stripe_penalite_pct: form.stripe_penalite_pct ? parseInt(form.stripe_penalite_pct) : 50,
      delai_annulation_heures: form.delai_annulation_heures ? parseInt(form.delai_annulation_heures) : 3,
      politique_annulation: form.politique_annulation || null,
      politique_clause_acceptation: form.politique_clause_acceptation,
      politique_clause_frais: form.politique_clause_frais,
      politique_clause_delai: form.politique_clause_delai,
    }).eq('id', company.id)
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 3000)
  }

  if (loading || !form) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: '#f5f3ff', alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator size="large" color="#7c3aed" />
      </SafeAreaView>
    )
  }

  // ── Tab contents ─────────────────────────────────────────────────────────────

  function TabIdentite() {
    return (
      <View style={{ gap: 16, paddingBottom: 40 }}>
        <SectionCard title="Logo">
          <ImageField
            label="Logo du salon"
            uri={form!.logo_url}
            uploading={uploading === 'logo_url'}
            onPress={() => pickAndUpload('logo', 'logo_url')}
          />
        </SectionCard>

        <SectionCard title="Informations générales">
          <InputField label="Nom du salon *" value={form!.name} onChangeText={v => setField('name', v)} placeholder="Mon Salon" />
          <InputField label="Slug (URL)" value={form!.slug} onChangeText={v => setField('slug', v.toLowerCase().replace(/[^a-z0-9-]/g, '-'))} placeholder="mon-salon" />
          <InputField label="Tagline" value={form!.tagline} onChangeText={v => setField('tagline', v)} placeholder="Votre slogan" />
        </SectionCard>

        <SectionCard title="Type d'établissement">
          <ChipPicker label="Catégorie" options={CATEGORIES} value={form!.categorie} onChange={v => setField('categorie', v)} />
          <ChipPicker
            label="Type"
            options={['salon','garage','clinic','spa','other']}
            value={form!.business_type}
            onChange={v => setField('business_type', v)}
          />
        </SectionCard>

        <SectionCard title="Terminologie personnalisée">
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <View style={{ flex: 1 }}>
              <InputField label="Employé (sing.)" value={form!.terme_employe_singulier} onChangeText={v => setField('terme_employe_singulier', v)} placeholder="barbier" />
            </View>
            <View style={{ flex: 1 }}>
              <InputField label="Employé (plur.)" value={form!.terme_employe_pluriel} onChangeText={v => setField('terme_employe_pluriel', v)} placeholder="barbiers" />
            </View>
          </View>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <View style={{ flex: 1 }}>
              <InputField label="Service" value={form!.terme_service} onChangeText={v => setField('terme_service', v)} placeholder="coupe" />
            </View>
            <View style={{ flex: 1 }}>
              <InputField label="Établissement" value={form!.terme_etablissement} onChangeText={v => setField('terme_etablissement', v)} placeholder="salon" />
            </View>
          </View>
        </SectionCard>
      </View>
    )
  }

  function TabCouleurs() {
    return (
      <View style={{ gap: 16, paddingBottom: 40 }}>
        <SectionCard title="Couleurs de la marque">
          <Field label="Couleur principale">
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <View style={[s.colorCircle, { backgroundColor: form!.primary_color }]} />
              <TextInput
                value={form!.primary_color}
                onChangeText={v => setField('primary_color', v)}
                placeholder="#7c3aed"
                style={[s.input, { flex: 1 }]}
                placeholderTextColor="#9ca3af"
                maxLength={7}
              />
            </View>
            <Text style={s.hintText}>Entrez une couleur hexadécimale (ex: #7c3aed)</Text>
          </Field>

          <Field label="Couleur secondaire">
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <View style={[s.colorCircle, { backgroundColor: form!.secondary_color }]} />
              <TextInput
                value={form!.secondary_color}
                onChangeText={v => setField('secondary_color', v)}
                placeholder="#ec4899"
                style={[s.input, { flex: 1 }]}
                placeholderTextColor="#9ca3af"
                maxLength={7}
              />
            </View>
            <Text style={s.hintText}>Entrez une couleur hexadécimale (ex: #ec4899)</Text>
          </Field>
        </SectionCard>

        <SectionCard title="Aperçu gradient">
          <LinearGradient
            colors={[form!.primary_color || '#7c3aed', form!.secondary_color || '#ec4899']}
            style={{ height: 48, borderRadius: 12, alignItems: 'center', justifyContent: 'center' }}
            start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
          >
            <Text style={{ color: '#fff', fontWeight: '700' }}>Aperçu bouton</Text>
          </LinearGradient>
        </SectionCard>

        <SectionCard title="Typographie">
          <ChipPicker label="Police des titres" options={HEADING_FONTS} value={form!.font_heading} onChange={v => setField('font_heading', v)} />
          <Text style={s.hintText}>Police sélectionnée : <Text style={{ fontWeight: '700' }}>{form!.font_heading}</Text></Text>
          <ChipPicker label="Police du corps" options={BODY_FONTS} value={form!.font_body} onChange={v => setField('font_body', v)} />
          <Text style={s.hintText}>Police sélectionnée : {form!.font_body}</Text>
        </SectionCard>
      </View>
    )
  }

  function TabAccueil() {
    return (
      <View style={{ gap: 16, paddingBottom: 40 }}>
        <SectionCard title="Section héro">
          <InputField label="Titre héro" value={form!.hero_titre} onChangeText={v => setField('hero_titre', v)} placeholder="Bienvenue chez nous" />
          <InputField label="Description héro" value={form!.hero_description} onChangeText={v => setField('hero_description', v)} placeholder="Votre description…" multiline numberOfLines={3} />
          <ImageField
            label="Image héro"
            uri={form!.hero_image_url}
            uploading={uploading === 'hero_image_url'}
            onPress={() => pickAndUpload(`hero-images/hero-image-${company!.id}-${Date.now()}`, 'hero_image_url')}
          />
          <InputField label="URL vidéo héro (optionnel)" value={form!.hero_video_url} onChangeText={v => setField('hero_video_url', v)} placeholder="https://youtube.com/…" />
        </SectionCard>

        <SectionCard title="Galerie photos">
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
            {form!.galerie_urls.map((uri, idx) => (
              <View key={idx} style={{ position: 'relative' }}>
                <Image source={{ uri }} style={s.galerieThumb} resizeMode="cover" />
                <TouchableOpacity
                  style={s.galerieRemove}
                  onPress={() => setField('galerie_urls', form!.galerie_urls.filter((_, i) => i !== idx))}
                >
                  <Ionicons name="close" size={12} color="#fff" />
                </TouchableOpacity>
              </View>
            ))}
            <TouchableOpacity
              style={s.galerieAdd}
              onPress={() => pickAndUpload(`galerie/${company!.id}-${Date.now()}`, 'galerie_urls', true)}
            >
              {uploading === 'galerie_urls'
                ? <ActivityIndicator size="small" color="#7c3aed" />
                : <Ionicons name="add" size={28} color="#7c3aed" />
              }
            </TouchableOpacity>
          </View>
          <Text style={s.hintText}>Ajoutez des photos de votre établissement</Text>
        </SectionCard>
      </View>
    )
  }

  function TabHoraires() {
    return (
      <View style={{ gap: 16, paddingBottom: 40 }}>
        <SectionCard title="Horaires d'ouverture">
          {JOURS.map(jour => {
            const h = form!.horaires[jour] ?? DEFAULT_HORAIRES[jour]
            return (
              <View key={jour} style={[s.horaireRow, h.ouvert && s.horaireRowOpen]}>
                <Text style={[s.jourLabel, h.ouvert && { color: '#111827' }]}>{JOURS_FR[jour]}</Text>
                <Switch
                  value={h.ouvert}
                  onValueChange={v => updateHoraire(jour, { ouvert: v })}
                  thumbColor="#fff"
                  trackColor={{ false: '#d1d5db', true: '#7c3aed' }}
                />
                {h.ouvert ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <TextInput
                      value={h.debut}
                      onChangeText={v => updateHoraire(jour, { debut: v })}
                      placeholder="09:00"
                      style={s.timeInput}
                      placeholderTextColor="#9ca3af"
                    />
                    <Text style={{ color: '#6b7280', fontWeight: '700' }}>–</Text>
                    <TextInput
                      value={h.fin}
                      onChangeText={v => updateHoraire(jour, { fin: v })}
                      placeholder="18:00"
                      style={s.timeInput}
                      placeholderTextColor="#9ca3af"
                    />
                  </View>
                ) : (
                  <Text style={s.fermeText}>Fermé</Text>
                )}
              </View>
            )
          })}
        </SectionCard>
      </View>
    )
  }

  function TabContact() {
    return (
      <View style={{ gap: 16, paddingBottom: 40 }}>
        <SectionCard title="Coordonnées">
          <InputField label="Email du salon" value={form!.email} onChangeText={v => setField('email', v)} placeholder="contact@monsalon.com" keyboardType="email-address" />
          <InputField label="Téléphone" value={form!.telephone} onChangeText={v => setField('telephone', v)} placeholder="+1 514 000 0000" />
          <InputField label="Domaine personnalisé" value={form!.domain} onChangeText={v => setField('domain', v)} placeholder="monsalon.com" />
          <Field label="Fuseau horaire">
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -4 }}>
              <View style={{ flexDirection: 'row', gap: 8, paddingHorizontal: 4, paddingVertical: 4 }}>
                {TIMEZONES.map(tz => (
                  <TouchableOpacity key={tz.value} onPress={() => setField('timezone', tz.value)} style={[s.chip, form!.timezone === tz.value && s.chipActive]}>
                    <Text style={[s.chipText, form!.timezone === tz.value && s.chipTextActive]}>{tz.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>
          </Field>
        </SectionCard>

        <SectionCard title="Réseaux sociaux">
          {RESEAUX.map(r => (
            <InputField
              key={r.key} label={r.label}
              value={form!.reseaux_sociaux[r.key] ?? ''}
              onChangeText={v => setField('reseaux_sociaux', { ...form!.reseaux_sociaux, [r.key]: v })}
              placeholder={r.placeholder}
            />
          ))}
        </SectionCard>

        <SectionCard title="Politique d'annulation">
          <InputField
            label="Délai d'annulation (heures)"
            value={form!.delai_annulation_heures}
            onChangeText={v => setField('delai_annulation_heures', v)}
            keyboardType="numeric" placeholder="3"
          />
          <InputField
            label="Texte de la politique"
            value={form!.politique_annulation}
            onChangeText={v => setField('politique_annulation', v)}
            multiline numberOfLines={4}
            placeholder="Décrivez votre politique d'annulation…"
          />
          <View style={{ gap: 10 }}>
            {([
              { key: 'politique_clause_acceptation' as const, label: "Clause d'acceptation — le client confirme avoir lu la politique" },
              { key: 'politique_clause_frais' as const, label: "Clause de frais — mention des frais en cas d'annulation tardive" },
              { key: 'politique_clause_delai' as const, label: 'Clause de délai — mention du délai minimum requis' },
            ] as { key: 'politique_clause_acceptation' | 'politique_clause_frais' | 'politique_clause_delai'; label: string }[]).map(clause => (
              <View key={clause.key} style={s.switchRow}>
                <Text style={{ flex: 1, fontSize: 13, color: '#374151', lineHeight: 18 }}>{clause.label}</Text>
                <Switch
                  value={form![clause.key]}
                  onValueChange={v => setField(clause.key, v)}
                  thumbColor="#fff"
                  trackColor={{ false: '#d1d5db', true: '#7c3aed' }}
                />
              </View>
            ))}
          </View>
        </SectionCard>
      </View>
    )
  }

  function TabSeo() {
    return (
      <View style={{ gap: 16, paddingBottom: 40 }}>
        <SectionCard title="Localisation">
          <InputField label="Adresse" value={form!.adresse} onChangeText={v => setField('adresse', v)} placeholder="123 rue Principale" />
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <View style={{ flex: 1 }}>
              <InputField label="Ville" value={form!.ville} onChangeText={v => setField('ville', v)} placeholder="Montréal" />
            </View>
            <View style={{ width: 110 }}>
              <InputField label="Code postal" value={form!.code_postal} onChangeText={v => setField('code_postal', v)} placeholder="H1A 1A1" />
            </View>
          </View>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <View style={{ flex: 1 }}>
              <InputField label="Province / État" value={form!.province} onChangeText={v => setField('province', v)} placeholder="QC" />
            </View>
            <View style={{ flex: 1 }}>
              <InputField label="Téléphone" value={form!.telephone} onChangeText={v => setField('telephone', v)} placeholder="+1 514 000 0000" />
            </View>
          </View>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <View style={{ flex: 1 }}>
              <InputField label="Latitude" value={form!.latitude} onChangeText={v => setField('latitude', v)} keyboardType="decimal-pad" placeholder="45.5017" />
            </View>
            <View style={{ flex: 1 }}>
              <InputField label="Longitude" value={form!.longitude} onChangeText={v => setField('longitude', v)} keyboardType="decimal-pad" placeholder="-73.5673" />
            </View>
          </View>
        </SectionCard>

        <SectionCard title="SEO">
          <InputField label="Titre SEO" value={form!.seo_title} onChangeText={v => setField('seo_title', v)} placeholder="Mon Salon — Barbershop Montréal" />
          <Field label={`Description SEO (${form!.seo_description.length}/160)`}>
            <TextInput
              value={form!.seo_description}
              onChangeText={v => setField('seo_description', v)}
              placeholder="Décrivez votre établissement en 160 caractères max…"
              multiline numberOfLines={3} maxLength={160}
              style={[s.input, { height: 72, textAlignVertical: 'top' }]}
              placeholderTextColor="#9ca3af"
            />
          </Field>
          <InputField label="Mots-clés" value={form!.seo_keywords} onChangeText={v => setField('seo_keywords', v)} placeholder="barbershop, coupe, barbe…" />
          <InputField label="Image OG (URL)" value={form!.og_image_url} onChangeText={v => setField('og_image_url', v)} placeholder="https://…" />
        </SectionCard>

        {(form!.seo_title || form!.seo_description) ? (
          <SectionCard title="Aperçu Google">
            <View style={s.googlePreview}>
              <Text style={{ fontSize: 11, color: '#202124', fontWeight: '700' }} numberOfLines={1}>
                {form!.seo_title || form!.name}
              </Text>
              <Text style={{ fontSize: 12, color: '#1a0dab' }} numberOfLines={1}>
                {form!.domain || `pixsell.app/${form!.slug}`}
              </Text>
              <Text style={{ fontSize: 12, color: '#4d5156', marginTop: 2 }} numberOfLines={2}>
                {form!.seo_description}
              </Text>
            </View>
          </SectionCard>
        ) : null}
      </View>
    )
  }

  function TabPaiements() {
    return (
      <View style={{ gap: 16, paddingBottom: 40 }}>
        <SectionCard title="Stripe">
          <View style={s.switchRow}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 14, fontWeight: '700', color: '#111827' }}>Paiements Stripe actifs</Text>
              <Text style={s.hintText}>Acceptez les paiements en ligne et pénalités de no-show</Text>
            </View>
            <Switch
              value={form!.stripe_actif}
              onValueChange={v => setField('stripe_actif', v)}
              thumbColor="#fff"
              trackColor={{ false: '#d1d5db', true: '#7c3aed' }}
            />
          </View>

          {form!.stripe_actif && (
            <View style={{ gap: 12 }}>
              <InputField label="Clé publique (pk_…)" value={form!.stripe_public_key} onChangeText={v => setField('stripe_public_key', v)} placeholder="pk_live_…" />

              <View style={{ backgroundColor: '#fef3c7', borderRadius: 12, padding: 12, borderWidth: 1, borderColor: '#fcd34d' }}>
                <View style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-start' }}>
                  <Ionicons name="warning-outline" size={16} color="#92400e" />
                  <Text style={{ flex: 1, fontSize: 12, color: '#92400e', lineHeight: 18 }}>
                    Utilisez des clés de test (pk_test_…) pendant les tests, et des clés de production (pk_live_…) uniquement pour les vraies transactions. Ne partagez jamais votre clé secrète.
                  </Text>
                </View>
              </View>

              <InputField label="Pénalité no-show (%)" value={form!.stripe_penalite_pct} onChangeText={v => setField('stripe_penalite_pct', v)} keyboardType="numeric" placeholder="50" />
            </View>
          )}
        </SectionCard>
      </View>
    )
  }

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#f5f3ff' }} edges={['top']}>
      {/* Header */}
      <View style={s.header}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 }}>
          <LinearGradient colors={['#7c3aed', '#ec4899']} style={s.headerIcon}>
            <Ionicons name="color-palette-outline" size={20} color="#fff" />
          </LinearGradient>
          <View>
            <Text style={s.headerTitle}>Apparence</Text>
            <Text style={s.headerSub}>Identité visuelle et mini-site</Text>
          </View>
        </View>
        <TouchableOpacity onPress={handleSave} disabled={saving}>
          <LinearGradient
            colors={saved ? ['#059669', '#10b981'] : ['#7c3aed', '#ec4899']}
            style={s.saveBtn}
            start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
          >
            {saving
              ? <ActivityIndicator size="small" color="#fff" />
              : <Ionicons name={saved ? 'checkmark' : 'save-outline'} size={15} color="#fff" />
            }
            <Text style={{ color: '#fff', fontWeight: '700', fontSize: 13 }}>
              {saving ? 'Sauvegarde…' : saved ? 'Sauvegardé !' : 'Sauvegarder'}
            </Text>
          </LinearGradient>
        </TouchableOpacity>
      </View>

      {/* Tabs */}
      <ScrollView
        horizontal showsHorizontalScrollIndicator={false}
        style={{ backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#f3f4f6', maxHeight: 52 }}
        contentContainerStyle={{ paddingHorizontal: 12, paddingVertical: 8, gap: 8 }}
      >
        {TABS.map(t => (
          <TouchableOpacity key={t.id} onPress={() => setTab(t.id)} style={[s.tabChip, tab === t.id && s.tabChipActive]}>
            <Text style={[s.tabChipText, tab === t.id && s.tabChipTextActive]}>{t.label}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Content */}
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16 }} keyboardShouldPersistTaps="handled">
        {tab === 'identite'  && <TabIdentite />}
        {tab === 'couleurs'  && <TabCouleurs />}
        {tab === 'accueil'   && <TabAccueil />}
        {tab === 'horaires'  && <TabHoraires />}
        {tab === 'contact'   && <TabContact />}
        {tab === 'seo'       && <TabSeo />}
        {tab === 'paiements' && <TabPaiements />}
      </ScrollView>
    </SafeAreaView>
  )
}

// ── Styles ─────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingTop: 8, paddingBottom: 12,
    backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#f3f4f6',
  },
  headerIcon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 18, fontWeight: '800', color: '#111827' },
  headerSub: { fontSize: 12, color: '#9ca3af' },
  saveBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 8 },

  tabChip: {
    paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20,
    backgroundColor: '#f3f4f6', borderWidth: 1, borderColor: '#e5e7eb',
  },
  tabChipActive: { backgroundColor: '#7c3aed', borderColor: '#7c3aed' },
  tabChipText: { fontSize: 13, color: '#374151', fontWeight: '600' },
  tabChipTextActive: { color: '#fff', fontWeight: '700' },

  sectionCard: {
    backgroundColor: 'rgba(255,255,255,0.92)', borderRadius: 20, padding: 16,
    shadowColor: '#7c3aed', shadowOpacity: 0.07, shadowRadius: 10, elevation: 3,
  },
  sectionTitle: { fontSize: 14, fontWeight: '800', color: '#374151' },

  fieldLabel: { fontSize: 13, fontWeight: '600', color: '#374151' },
  input: {
    backgroundColor: '#fff', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10,
    fontSize: 14, color: '#111827', borderWidth: 1, borderColor: '#e5e7eb',
  },
  hintText: { fontSize: 11, color: '#9ca3af', marginTop: 2 },

  chip: {
    paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20,
    backgroundColor: '#f3f4f6', borderWidth: 1, borderColor: '#e5e7eb',
  },
  chipActive: { backgroundColor: '#7c3aed', borderColor: '#7c3aed' },
  chipText: { fontSize: 12, color: '#374151', fontWeight: '500' },
  chipTextActive: { color: '#fff', fontWeight: '700' },

  colorCircle: { width: 40, height: 40, borderRadius: 20, borderWidth: 2, borderColor: '#e5e7eb' },

  imageBox: {
    height: 140, backgroundColor: '#f5f3ff', borderRadius: 16,
    borderWidth: 2, borderColor: '#ede9fe', borderStyle: 'dashed',
    alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
  },
  imagePreview: { width: '100%', height: '100%' },
  imageEditOverlay: {
    position: 'absolute', bottom: 8, right: 8,
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center',
  },

  galerieThumb: { width: 80, height: 80, borderRadius: 10 },
  galerieRemove: {
    position: 'absolute', top: -6, right: -6,
    width: 20, height: 20, borderRadius: 10, backgroundColor: '#ef4444',
    alignItems: 'center', justifyContent: 'center',
  },
  galerieAdd: {
    width: 80, height: 80, borderRadius: 10,
    backgroundColor: '#f5f3ff', borderWidth: 2, borderColor: '#ede9fe', borderStyle: 'dashed',
    alignItems: 'center', justifyContent: 'center',
  },

  horaireRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 10, paddingHorizontal: 12, borderRadius: 12,
    backgroundColor: '#f9fafb', borderWidth: 1, borderColor: '#f3f4f6',
    gap: 8,
  },
  horaireRowOpen: { backgroundColor: '#faf5ff', borderColor: '#e9d5ff' },
  jourLabel: { width: 80, fontSize: 13, fontWeight: '600', color: '#9ca3af' },
  timeInput: {
    backgroundColor: '#fff', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 6,
    fontSize: 14, color: '#111827', borderWidth: 1, borderColor: '#e5e7eb',
    width: 68, textAlign: 'center',
  },
  fermeText: { fontSize: 13, color: '#9ca3af', fontStyle: 'italic' },

  switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },

  googlePreview: { backgroundColor: '#fff', borderRadius: 12, padding: 12, borderWidth: 1, borderColor: '#e5e7eb' },
})
