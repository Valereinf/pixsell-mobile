import { Tabs, useRouter } from 'expo-router'
import { StyleSheet } from 'react-native'
import { Ionicons } from '@expo/vector-icons'

export default function EmployeeLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: styles.tabBar,
        tabBarActiveTintColor: '#7c3aed',
        tabBarInactiveTintColor: '#6b7280',
        tabBarLabelStyle: { fontSize: 10, fontWeight: '600' },
      }}
    >
      <Tabs.Screen name="agenda"      options={{ title: 'Agenda',    tabBarIcon: ({ color }) => <Ionicons name="calendar-clear-outline" size={22} color={color} /> }} />
      <Tabs.Screen name="rdv-today"   options={{ title: "Auj.",      tabBarIcon: ({ color }) => <Ionicons name="time-outline"            size={22} color={color} /> }} />
      <Tabs.Screen name="rh-requests" options={{ title: 'RH',        tabBarIcon: ({ color }) => <Ionicons name="clipboard-outline"      size={22} color={color} /> }} />
      <Tabs.Screen name="stats"       options={{ title: 'Stats',     tabBarIcon: ({ color }) => <Ionicons name="bar-chart-outline"      size={22} color={color} /> }} />
      <Tabs.Screen name="profil"      options={{ title: 'Profil',    tabBarIcon: ({ color }) => <Ionicons name="person-outline"         size={22} color={color} /> }} />
    </Tabs>
  )
}

const styles = StyleSheet.create({
  tabBar: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    shadowColor: '#7c3aed',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
    elevation: 16,
    borderTopWidth: 0,
    height: 64,
  },
})
