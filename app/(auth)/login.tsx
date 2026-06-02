import { useState } from 'react'
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, KeyboardAvoidingView, Platform, ActivityIndicator,
} from 'react-native'
import { useRouter } from 'expo-router'
import { supabase } from '../../lib/supabase'

export default function Login() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleLogin() {
    setLoading(true)
    setError('')

    const { data, error: authError } = await supabase.auth.signInWithPassword({ email, password })

    if (authError || !data.session) {
      setError(authError?.message ?? 'Identifiants incorrects')
      setLoading(false)
      return
    }

    const role = data.session.user.app_metadata?.role ?? 'owner'

    if (role === 'employee') {
      router.replace('/(employee)/agenda')
    } else {
      router.replace('/(owner)/dashboard')
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View style={styles.inner}>
        {/* Logo */}
        <View style={styles.logoRow}>
          <View style={styles.logoBox}>
            <Text style={styles.logoLetter}>P</Text>
          </View>
          <Text style={styles.logoText}>Pixsell</Text>
        </View>

        <Text style={styles.title}>Connexion</Text>
        <Text style={styles.subtitle}>Accédez à votre espace professionnel</Text>

        {/* Email */}
        <View style={styles.field}>
          <Text style={styles.label}>Email</Text>
          <TextInput
            style={styles.input}
            value={email}
            onChangeText={setEmail}
            placeholder="contact@monsalon.com"
            placeholderTextColor="#555"
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
            placeholderTextColor="#555"
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
          style={[styles.button, loading && styles.buttonDisabled]}
          onPress={handleLogin}
          disabled={loading}
          activeOpacity={0.85}
        >
          {loading
            ? <ActivityIndicator color="#fff" size="small" />
            : <Text style={styles.buttonText}>Se connecter →</Text>
          }
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  container:      { flex: 1, backgroundColor: '#000' },
  inner:          { flex: 1, paddingHorizontal: 28, paddingTop: 80, paddingBottom: 40 },
  logoRow:        { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 40 },
  logoBox:        { width: 40, height: 40, borderRadius: 10, backgroundColor: '#7c3aed', alignItems: 'center', justifyContent: 'center' },
  logoLetter:     { color: '#fff', fontSize: 20, fontWeight: '900' },
  logoText:       { color: '#fff', fontSize: 22, fontWeight: '700' },
  title:          { color: '#fff', fontSize: 26, fontWeight: '700', marginBottom: 6 },
  subtitle:       { color: '#666', fontSize: 14, marginBottom: 36 },
  field:          { marginBottom: 18 },
  label:          { color: '#aaa', fontSize: 13, fontWeight: '600', marginBottom: 8 },
  input:          { backgroundColor: '#111', borderWidth: 1, borderColor: '#222', borderRadius: 10, paddingVertical: 13, paddingHorizontal: 16, color: '#fff', fontSize: 15 },
  errorBox:       { backgroundColor: '#1a0000', borderWidth: 1, borderColor: '#7f1d1d', borderRadius: 10, padding: 12, marginBottom: 16 },
  errorText:      { color: '#fca5a5', fontSize: 13 },
  button:         { backgroundColor: '#7c3aed', paddingVertical: 15, borderRadius: 12, alignItems: 'center', marginTop: 8 },
  buttonDisabled: { opacity: 0.5 },
  buttonText:     { color: '#fff', fontSize: 16, fontWeight: '700' },
})
