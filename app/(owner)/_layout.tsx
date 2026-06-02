// TODO: Tab navigator Owner
import { Tabs } from 'expo-router'

export default function OwnerLayout() {
  return (
    <Tabs screenOptions={{ headerShown: false, tabBarStyle: { backgroundColor: '#111' }, tabBarActiveTintColor: '#7c3aed' }}>
      <Tabs.Screen name="dashboard" options={{ title: 'Dashboard' }} />
      <Tabs.Screen name="calendar" options={{ title: 'Calendrier' }} />
      <Tabs.Screen name="reservations" options={{ title: 'Réservations' }} />
      <Tabs.Screen name="clients" options={{ title: 'Clients' }} />
      <Tabs.Screen name="employees" options={{ title: 'Employés' }} />
      <Tabs.Screen name="comptabilite" options={{ title: 'Comptabilité' }} />
      <Tabs.Screen name="settings" options={{ title: 'Paramètres' }} />
    </Tabs>
  )
}
