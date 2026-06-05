import { useState } from 'react'
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, ActivityIndicator, ScrollView, Image,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { LinearGradient } from 'expo-linear-gradient'
import { useRouter } from 'expo-router'
import { supabase } from '../../lib/supabase'

type Tab = 'owner' | 'employee'

export default function Login() {
  const router = useRouter()
  const [tab, setTab] = useState<Tab>('owner')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [slug, setSlug] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleLogin() {
    if (!email || !password) { setError('Email et mot de passe requis'); return }
    if (tab === 'employee' && !slug) { setError("Identifiant de l'établissement requis"); return }
    setLoading(true)
    setError('')

    try {
      if (tab === 'owner') {
        const { data, error: authError } = await supabase.auth.signInWithPassword({ email, password })
        if (authError || !data.session) throw new Error(authError?.message ?? 'Identifiants incorrects')
        const role = data.session.user.app_metadata?.role ?? 'owner'
        router.replace(role === 'employee' ? '/(employee)/agenda' : '/(owner)/dashboard')
      } else {
        // Employee: appel Netlify function employe-login
        const cleanSlug = slug.toLowerCase().trim()
        const cleanEmail = email.toLowerCase().trim()

        const res = await fetch('https://app.pixsellmedia.ca/.netlify/functions/employe-login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ slug: cleanSlug, email: cleanEmail, password }),
        })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error ?? 'Identifiants invalides')
        if (!data.token) throw new Error('Token manquant')

        // Stocker le token dans AsyncStorage
        const AsyncStorage = (await import('@react-native-async-storage/async-storage')).default
        await AsyncStorage.setItem(`employe_token_${data.company_id}`, data.token)

        router.replace('/(employee)/agenda')
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Erreur de connexion')
    } finally {
      setLoading(false)
    }
  }

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1 }}>
    <LinearGradient colors={['#ddd6fe', '#f5d0fe', '#fce7f3']} style={{ flex: 1 }}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">

          {/* Logo */}
          <Image
            source={require('../../assets/logo-pixsell.png')}
            style={{ width: 220, height: 70, resizeMode: 'contain', marginBottom: 8 }}
          />

          <Text style={styles.title}>Connexion</Text>
          <Text style={styles.subtitle}>Accédez à votre espace professionnel</Text>

          {/* Glass card */}
          <View style={styles.card}>

            {/* Tabs */}
            <View style={styles.tabRow}>
              {(['owner', 'employee'] as Tab[]).map(t => (
                <TouchableOpacity
                  key={t}
                  onPress={() => { setTab(t); setError('') }}
                  style={[styles.tabBtn, tab === t && styles.tabBtnActive]}
                >
                  <Text style={[styles.tabLabel, tab === t && styles.tabLabelActive]}>
                    {t === 'owner' ? 'Owner / Admin' : 'Employé'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Slug field (employee only) */}
            {tab === 'employee' && (
              <View style={styles.field}>
                <Text style={styles.label}>Identifiant de l'établissement</Text>
                <TextInput
                  style={styles.input}
                  value={slug}
                  onChangeText={setSlug}
                  placeholder="ex: king-cuts"
                  placeholderTextColor="#9ca3af"
                  autoCapitalize="none"
                />
                <Text style={{ fontSize: 12, color: '#9ca3af', marginTop: -8, marginBottom: 4 }}>Fourni par votre responsable</Text>
              </View>
            )}

            {/* Email */}
            <View style={styles.field}>
              <Text style={styles.label}>Email</Text>
              <TextInput
                style={styles.input}
                value={email}
                onChangeText={setEmail}
                placeholder="votre@email.com"
                placeholderTextColor="#9ca3af"
                keyboardType="email-address"
                autoCapitalize="none"
                autoComplete="email"
              />
            </View>

            {/* Password */}
            <View style={styles.field}>
              <Text style={styles.label}>Mot de passe</Text>
              <TextInput
                style={styles.input}
                value={password}
                onChangeText={setPassword}
                placeholder="••••••••"
                placeholderTextColor="#9ca3af"
                secureTextEntry
                autoComplete="password"
              />
            </View>

            {/* Error */}
            {!!error && (
              <View style={styles.errorBox}>
                <Text style={styles.errorText}>{error}</Text>
              </View>
            )}

            {/* Submit */}
            <TouchableOpacity
              onPress={handleLogin}
              disabled={loading}
              style={[styles.btnWrapper, loading && { opacity: 0.6 }]}
            >
              <LinearGradient
                colors={['#7c3aed', '#ec4899']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.btn}
              >
                {loading
                  ? <ActivityIndicator color="#fff" size="small" />
                  : <Text style={styles.btnText}>Se connecter →</Text>
                }
              </LinearGradient>
            </TouchableOpacity>

            {/* Forgot password */}
            <TouchableOpacity style={styles.forgotRow}>
              <Text style={styles.forgotText}>Mot de passe oublié ?</Text>
            </TouchableOpacity>

          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </LinearGradient>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  scroll:         { flexGrow: 1, paddingHorizontal: 24, paddingTop: 80, paddingBottom: 48 },
  logoRow:        { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 32 },
  logoBox:        { width: 44, height: 44, borderRadius: 12, backgroundColor: '#7c3aed', alignItems: 'center', justifyContent: 'center' },
  logoLetter:     { color: '#fff', fontSize: 22, fontWeight: '900' },
  logoText:       { color: '#1e1b4b', fontSize: 22, fontWeight: '800', letterSpacing: 2 },
  title:          { color: '#1e1b4b', fontSize: 28, fontWeight: '700', marginBottom: 6 },
  subtitle:       { color: '#6b7280', fontSize: 14, marginBottom: 28 },
  card:           { backgroundColor: 'rgba(255,255,255,0.75)', borderRadius: 24, padding: 24, borderWidth: 1, borderColor: 'rgba(255,255,255,0.9)', shadowColor: '#7c3aed', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.15, shadowRadius: 24, elevation: 8 },
  tabRow:         { flexDirection: 'row', backgroundColor: 'rgba(124,58,237,0.08)', borderRadius: 12, padding: 4, marginBottom: 20 },
  tabBtn:         { flex: 1, paddingVertical: 8, alignItems: 'center', borderRadius: 10 },
  tabBtnActive:   { backgroundColor: '#fff', shadowColor: '#7c3aed', shadowOpacity: 0.1, shadowRadius: 4, elevation: 2 },
  tabLabel:       { color: '#9ca3af', fontSize: 13, fontWeight: '600' },
  tabLabelActive: { color: '#7c3aed' },
  field:          { marginBottom: 16 },
  label:          { color: '#374151', fontSize: 13, fontWeight: '600', marginBottom: 8 },
  input:          { backgroundColor: 'rgba(255,255,255,0.7)', borderWidth: 1, borderColor: 'rgba(124,58,237,0.15)', borderRadius: 14, paddingVertical: 13, paddingHorizontal: 16, color: '#111827', fontSize: 15 },
  errorBox:       { backgroundColor: 'rgba(239,68,68,0.08)', borderWidth: 1, borderColor: 'rgba(239,68,68,0.2)', borderRadius: 12, padding: 12, marginBottom: 12 },
  errorText:      { color: '#dc2626', fontSize: 13 },
  btnWrapper:     { borderRadius: 14, overflow: 'hidden', marginTop: 4 },
  btn:            { paddingVertical: 15, alignItems: 'center' },
  btnText:        { color: '#fff', fontSize: 16, fontWeight: '700' },
  forgotRow:      { alignItems: 'center', marginTop: 16 },
  forgotText:     { color: '#7c3aed', fontSize: 13, fontWeight: '500' },
})
