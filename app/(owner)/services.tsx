import { useEffect, useState } from 'react'
import {
  View, Text, FlatList, TouchableOpacity, TextInput, Modal,
  StyleSheet, ActivityIndicator, Image, ScrollView, Platform,
  KeyboardAvoidingView,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import * as ImagePicker from 'expo-image-picker'
import { supabase } from '../../lib/supabase'
import type { Company } from '../../lib/types'
import { useOwnerContext } from '../../lib/ownerContext'

// ── Types ──────────────────────────────────────────────────────────────────────

interface ServiceRow {
  id: string
  nom: string
  description: string | null
  prix: number
  duree_minutes: number
  actif: boolean
  ordre: number
  image_url?: string | null
}

interface FormData {
  nom: string
  description: string
  prix: string
  duree: string
}

const EMPTY_FORM: FormData = { nom: '', description: '', prix: '', duree: '' }

// ── Main Component ─────────────────────────────────────────────────────────────

export default function ServicesScreen() {
  const { company } = useOwnerContext()
  const [services, setServices]   = useState<ServiceRow[]>([])
  const [loading, setLoading]     = useState(true)
  const [saving, setSaving]       = useState(false)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)

  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing]     = useState<ServiceRow | null>(null)
  const [form, setForm]           = useState<FormData>({ ...EMPTY_FORM })

  const [imageUri, setImageUri]       = useState<string | null>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const [removeImage, setRemoveImage] = useState(false)

  // ── Load ────────────────────────────────────────────────────────────
  useEffect(() => { if (company) load() }, [company?.id])

  async function load() {
    setLoading(true)
    const { data } = await supabase
      .from('services_catalogue')
      .select('id, nom, description, prix, duree_minutes, actif, ordre, image_url')
      .eq('company_id', company!.id)
      .order('ordre', { ascending: true })
    setServices((data ?? []) as ServiceRow[])
    setLoading(false)
  }

  // ── Actions ─────────────────────────────────────────────────────────

  function openAdd() {
    setEditing(null)
    setForm({ ...EMPTY_FORM })
    setImageUri(null)
    setImagePreview(null)
    setRemoveImage(false)
    setShowModal(true)
  }

  function openEdit(s: ServiceRow) {
    setEditing(s)
    setForm({
      nom: s.nom,
      description: s.description ?? '',
      prix: String(s.prix),
      duree: s.duree_minutes ? String(s.duree_minutes) : '',
    })
    setImageUri(null)
    setImagePreview(null)
    setRemoveImage(false)
    setShowModal(true)
  }

  function closeModal() {
    setShowModal(false)
    setEditing(null)
    setForm({ ...EMPTY_FORM })
    setImageUri(null)
    setImagePreview(null)
    setRemoveImage(false)
  }

  async function toggleActif(s: ServiceRow) {
    await supabase.from('services_catalogue').update({ actif: !s.actif }).eq('id', s.id)
    setServices(prev => prev.map(r => r.id === s.id ? { ...r, actif: !r.actif } : r))
  }

  async function handleDelete(id: string) {
    await supabase.from('services_catalogue').delete().eq('id', id)
    setServices(prev => prev.filter(r => r.id !== id))
    setConfirmDelete(null)
  }

  async function pickImage() {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync()
    if (status !== 'granted') return
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [4, 3],
      quality: 0.8,
    })
    if (!result.canceled && result.assets[0]) {
      setImagePreview(result.assets[0].uri)
      setImageUri(result.assets[0].uri)
      setRemoveImage(false)
    }
  }

  async function uploadImage(serviceId: string, uri: string): Promise<string | null> {
    try {
      const ext = uri.split('.').pop() ?? 'jpg'
      const path = `${company!.id}/services/${serviceId}_${Date.now()}.${ext}`
      const response = await fetch(uri)
      const blob = await response.blob()
      const { error } = await supabase.storage
        .from('company-assets')
        .upload(path, blob, { upsert: true })
      if (error) return null
      const { data: { publicUrl } } = supabase.storage.from('company-assets').getPublicUrl(path)
      return publicUrl
    } catch {
      return null
    }
  }

  async function handleSave() {
    if (!company || !form.nom.trim() || !form.prix) return
    setSaving(true)
    const payload = {
      nom: form.nom.trim(),
      description: form.description.trim() || null,
      prix: parseFloat(form.prix),
      duree_minutes: form.duree ? parseInt(form.duree) : 0,
    }

    let serviceId: string
    if (editing) {
      await supabase.from('services_catalogue').update(payload).eq('id', editing.id)
      serviceId = editing.id
    } else {
      const { data } = await supabase.from('services_catalogue').insert({
        company_id: company.id,
        ...payload,
        ordre: services.length,
      }).select('id').single()
      serviceId = data?.id ?? ''
    }

    // Image
    if (serviceId) {
      if (imageUri) {
        const url = await uploadImage(serviceId, imageUri)
        if (url) {
          await supabase.from('services_catalogue').update({ image_url: url }).eq('id', serviceId)
        }
      } else if (removeImage) {
        await supabase.from('services_catalogue').update({ image_url: null }).eq('id', serviceId)
      }
    }

    await load()
    closeModal()
    setSaving(false)
  }

  // ── Render item ──────────────────────────────────────────────────────

  function renderItem({ item: svc }: { item: ServiceRow }) {
    return (
      <View style={s.card}>
        <View style={{ flexDirection: 'row', gap: 12, alignItems: 'flex-start' }}>
          {/* Image ou icône */}
          {svc.image_url ? (
            <Image source={{ uri: svc.image_url }} style={s.thumb} />
          ) : (
            <View style={s.iconBox}>
              <Ionicons name="cut-outline" size={22} color="#7c3aed" />
            </View>
          )}

          {/* Infos */}
          <View style={{ flex: 1 }}>
            <Text style={s.svcName}>{svc.nom}</Text>
            {svc.description ? (
              <Text style={s.svcDesc} numberOfLines={1}>{svc.description}</Text>
            ) : null}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 }}>
              {svc.duree_minutes > 0 && (
                <View style={s.dureeBadge}>
                  <Text style={s.dureeText}>{svc.duree_minutes} min</Text>
                </View>
              )}
              <Text style={s.prix}>{svc.prix.toFixed(2)} $</Text>
            </View>
          </View>

          {/* Statut + Actions */}
          <View style={{ alignItems: 'flex-end', gap: 8 }}>
            <TouchableOpacity onPress={() => toggleActif(svc)}>
              <View style={[s.statusBadge, { backgroundColor: svc.actif ? 'rgba(16,185,129,0.12)' : 'rgba(107,114,128,0.12)' }]}>
                <Text style={{ fontSize: 11, fontWeight: '700', color: svc.actif ? '#059669' : '#6b7280' }}>
                  {svc.actif ? 'Actif' : 'Inactif'}
                </Text>
              </View>
            </TouchableOpacity>
            <View style={{ flexDirection: 'row', gap: 6 }}>
              <TouchableOpacity style={s.actionBtn} onPress={() => openEdit(svc)}>
                <Ionicons name="pencil-outline" size={16} color="#7c3aed" />
              </TouchableOpacity>
              {confirmDelete === svc.id ? (
                <>
                  <TouchableOpacity style={[s.actionBtn, { backgroundColor: 'rgba(239,68,68,0.1)' }]} onPress={() => handleDelete(svc.id)}>
                    <Ionicons name="checkmark" size={16} color="#ef4444" />
                  </TouchableOpacity>
                  <TouchableOpacity style={s.actionBtn} onPress={() => setConfirmDelete(null)}>
                    <Ionicons name="close" size={16} color="#6b7280" />
                  </TouchableOpacity>
                </>
              ) : (
                <TouchableOpacity style={[s.actionBtn, { backgroundColor: 'rgba(239,68,68,0.08)' }]} onPress={() => setConfirmDelete(svc.id)}>
                  <Ionicons name="trash-outline" size={16} color="#ef4444" />
                </TouchableOpacity>
              )}
            </View>
          </View>
        </View>
      </View>
    )
  }

  // ── Main render ──────────────────────────────────────────────────────

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#f5f3ff' }} edges={['top']}>
      {/* Header */}
      <View style={s.header}>
        <View>
          <Text style={s.headerTitle}>Services</Text>
          <Text style={s.headerSub}>{services.filter(s => s.actif).length} actif{services.filter(s => s.actif).length !== 1 ? 's' : ''} · {services.length} total</Text>
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
          data={services}
          keyExtractor={s => s.id}
          renderItem={renderItem}
          contentContainerStyle={{ padding: 16, paddingBottom: 100, gap: 12 }}
          ListEmptyComponent={
            <View style={{ alignItems: 'center', paddingTop: 60, gap: 16 }}>
              <View style={{ width: 80, height: 80, borderRadius: 40, backgroundColor: '#ede9fe', alignItems: 'center', justifyContent: 'center' }}>
                <Ionicons name="cut-outline" size={40} color="#c4b5fd" />
              </View>
              <Text style={{ color: '#6b7280', fontSize: 16, fontWeight: '600' }}>Aucun service</Text>
              <Text style={{ color: '#9ca3af', fontSize: 14, textAlign: 'center' }}>
                Créez votre premier service pour commencer à accepter des réservations.
              </Text>
              <TouchableOpacity style={s.addBtn} onPress={openAdd}>
                <Ionicons name="add" size={16} color="#fff" />
                <Text style={s.addBtnText}>Créer un service</Text>
              </TouchableOpacity>
            </View>
          }
        />
      )}

      {/* FAB */}
      <TouchableOpacity style={s.fab} onPress={openAdd}>
        <Ionicons name="add" size={28} color="#fff" />
      </TouchableOpacity>

      {/* ── Modal service ── */}
      <Modal
        visible={showModal}
        animationType="slide"
        presentationStyle={Platform.OS === 'ios' ? 'pageSheet' : undefined}
        transparent={Platform.OS !== 'ios'}
      >
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          {Platform.OS !== 'ios' && (
            <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' }} />
          )}
          <SafeAreaView style={[s.modalSheet, Platform.OS !== 'ios' && { position: 'absolute', bottom: 0, left: 0, right: 0 }]} edges={['bottom']}>
            {/* Header */}
            <View style={s.modalHeader}>
              <Text style={s.modalTitle}>{editing ? 'Modifier le service' : 'Nouveau service'}</Text>
              <TouchableOpacity onPress={closeModal}>
                <Text style={s.modalClose}>✕</Text>
              </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40, gap: 4 }}>
              {/* Nom */}
              <Text style={s.fieldLabel}>Nom *</Text>
              <TextInput
                style={s.input}
                placeholder="Ex : Coupe homme"
                value={form.nom}
                onChangeText={v => setForm(p => ({ ...p, nom: v }))}
              />

              {/* Description */}
              <Text style={s.fieldLabel}>Description</Text>
              <TextInput
                style={[s.input, { height: 72, textAlignVertical: 'top' }]}
                multiline
                placeholder="Description optionnelle du service"
                value={form.description}
                onChangeText={v => setForm(p => ({ ...p, description: v }))}
              />

              {/* Durée + Prix */}
              <View style={{ flexDirection: 'row', gap: 12 }}>
                <View style={{ flex: 1 }}>
                  <Text style={s.fieldLabel}>Durée (min)</Text>
                  <TextInput
                    style={s.input}
                    keyboardType="numeric"
                    placeholder="60"
                    value={form.duree}
                    onChangeText={v => setForm(p => ({ ...p, duree: v }))}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.fieldLabel}>Prix ($) *</Text>
                  <TextInput
                    style={s.input}
                    keyboardType="decimal-pad"
                    placeholder="0.00"
                    value={form.prix}
                    onChangeText={v => setForm(p => ({ ...p, prix: v }))}
                  />
                </View>
              </View>

              {/* Photo */}
              <Text style={s.fieldLabel}>Photo</Text>
              {(imagePreview || (editing?.image_url && !removeImage)) ? (
                <View style={{ marginBottom: 12 }}>
                  <Image
                    source={{ uri: imagePreview ?? (editing?.image_url ?? undefined) }}
                    style={{ width: '100%', height: 140, borderRadius: 12, marginBottom: 8 }}
                    resizeMode="cover"
                  />
                  <TouchableOpacity
                    style={s.outlineBtn}
                    onPress={() => { setImagePreview(null); setImageUri(null); setRemoveImage(true) }}
                  >
                    <Ionicons name="trash-outline" size={16} color="#dc2626" />
                    <Text style={{ color: '#dc2626', fontWeight: '600', fontSize: 13 }}>Supprimer la photo</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <TouchableOpacity style={s.uploadZone} onPress={pickImage}>
                  <Ionicons name="image-outline" size={28} color="#c4b5fd" />
                  <Text style={{ color: '#7c3aed', fontWeight: '600', marginTop: 6 }}>Choisir une photo</Text>
                  <Text style={{ color: '#9ca3af', fontSize: 12, marginTop: 2 }}>Bibliothèque de photos</Text>
                </TouchableOpacity>
              )}

              {/* Boutons */}
              <View style={{ flexDirection: 'row', gap: 12, marginTop: 8 }}>
                <TouchableOpacity style={s.cancelBtn} onPress={closeModal}>
                  <Text style={s.cancelBtnText}>Annuler</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[s.saveBtn, { opacity: (!form.nom.trim() || !form.prix || saving) ? 0.5 : 1 }]}
                  onPress={handleSave}
                  disabled={!form.nom.trim() || !form.prix || saving}
                >
                  {saving
                    ? <ActivityIndicator color="#fff" size="small" />
                    : <Text style={s.saveBtnText}>{editing ? 'Enregistrer' : 'Créer le service'}</Text>
                  }
                </TouchableOpacity>
              </View>
            </ScrollView>
          </SafeAreaView>
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
    backgroundColor: 'rgba(255,255,255,0.92)', borderRadius: 20, padding: 16,
    shadowColor: '#7c3aed', shadowOpacity: 0.1, shadowRadius: 10, shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  thumb: { width: 52, height: 52, borderRadius: 12 },
  iconBox: {
    width: 52, height: 52, borderRadius: 12,
    backgroundColor: 'rgba(124,58,237,0.08)',
    alignItems: 'center', justifyContent: 'center',
  },
  svcName: { fontSize: 16, fontWeight: '800', color: '#111827' },
  svcDesc: { fontSize: 13, color: '#6b7280', marginTop: 2 },
  dureeBadge: {
    paddingHorizontal: 10, paddingVertical: 3, borderRadius: 999,
    backgroundColor: '#ede9fe',
  },
  dureeText: { fontSize: 12, color: '#7c3aed', fontWeight: '700' },
  prix: { fontSize: 15, fontWeight: '700', color: '#111827' },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  actionBtn: {
    width: 30, height: 30, borderRadius: 8, backgroundColor: '#ede9fe',
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
    maxHeight: '92%',
  },
  modalHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    padding: 20, borderBottomWidth: 1, borderColor: '#f3f4f6',
  },
  modalTitle: { fontSize: 18, fontWeight: '800', color: '#111827' },
  modalClose: { fontSize: 20, color: '#9ca3af', fontWeight: '700' },
  fieldLabel: { fontSize: 13, fontWeight: '600', color: '#374151', marginBottom: 6 },
  input: {
    borderWidth: 1, borderColor: '#ddd6fe', borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 10, fontSize: 14,
    backgroundColor: '#faf5ff', color: '#111827', marginBottom: 14,
  },
  uploadZone: {
    borderWidth: 2, borderColor: '#ddd6fe', borderStyle: 'dashed', borderRadius: 14,
    alignItems: 'center', justifyContent: 'center', paddingVertical: 28,
    backgroundColor: '#faf5ff', marginBottom: 14,
  },
  outlineBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10,
    borderWidth: 1.5, borderColor: '#dc2626', justifyContent: 'center',
  },
  cancelBtn: {
    flex: 1, borderWidth: 1.5, borderColor: '#e5e7eb', borderRadius: 12,
    paddingVertical: 13, alignItems: 'center',
  },
  cancelBtnText: { color: '#374151', fontWeight: '600', fontSize: 14 },
  saveBtn: {
    flex: 2, backgroundColor: '#7c3aed', borderRadius: 12,
    paddingVertical: 13, alignItems: 'center',
  },
  saveBtnText: { color: '#fff', fontWeight: '800', fontSize: 14 },
})
