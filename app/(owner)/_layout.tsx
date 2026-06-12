import { useState, useContext } from 'react'
import { View, Text, TouchableOpacity, Linking } from 'react-native'
import { Stack } from 'expo-router'
import { OwnerContext } from '../../lib/ownerContext'
import type { Company } from '../../lib/types'

function BlockedScreen({ company }: { company: Company }) {
  return (
    <View style={{ flex: 1, backgroundColor: '#111', justifyContent: 'center', alignItems: 'center', padding: 32 }}>
      <Text style={{ fontSize: 48 }}>🔒</Text>
      <Text style={{ color: 'white', fontSize: 22, fontWeight: 'bold', textAlign: 'center', marginTop: 16 }}>
        Période d'essai terminée
      </Text>
      <Text style={{ color: '#9ca3af', textAlign: 'center', marginTop: 12 }}>
        Vous avez atteint vos {company.quota_gratuit ?? 120} réservations gratuites.
        Contactez-nous pour continuer.
      </Text>
      <TouchableOpacity
        onPress={() => Linking.openURL('mailto:contact@pixsellmedia.ca')}
        style={{ backgroundColor: '#7c3aed', borderRadius: 12, padding: 14, marginTop: 24, paddingHorizontal: 32 }}
      >
        <Text style={{ color: 'white', fontWeight: 'bold' }}>Nous contacter</Text>
      </TouchableOpacity>
    </View>
  )
}

function OwnerLayoutInner() {
  const { company } = useContext(OwnerContext)

  if (company?.subscription_status === 'blocked') {
    return <BlockedScreen company={company} />
  }

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="reservation/[id]" />
    </Stack>
  )
}

export default function OwnerLayout() {
  const [company, setCompany] = useState<Company | null>(null)
  return (
    <OwnerContext.Provider value={{ company, setCompany }}>
      <OwnerLayoutInner />
    </OwnerContext.Provider>
  )
}
