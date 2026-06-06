import { useState } from 'react'
import { Stack } from 'expo-router'
import { OwnerContext } from '../../lib/ownerContext'
import type { Company } from '../../lib/types'

export default function OwnerLayout() {
  const [company, setCompany] = useState<Company | null>(null)
  return (
    <OwnerContext.Provider value={{ company, setCompany }}>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="reservation/[id]" />
      </Stack>
    </OwnerContext.Provider>
  )
}
