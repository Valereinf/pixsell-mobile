// TODO: Tab navigator Employé
import { Tabs } from 'expo-router'

export default function EmployeeLayout() {
  return (
    <Tabs screenOptions={{ headerShown: false, tabBarStyle: { backgroundColor: '#111' }, tabBarActiveTintColor: '#7c3aed' }}>
      <Tabs.Screen name="agenda" options={{ title: 'Agenda' }} />
      <Tabs.Screen name="rdv-today" options={{ title: "Aujourd'hui" }} />
      <Tabs.Screen name="stats" options={{ title: 'Stats' }} />
    </Tabs>
  )
}
