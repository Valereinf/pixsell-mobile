import { Tabs } from 'expo-router'
import { StyleSheet } from 'react-native'
import { Ionicons } from '@expo/vector-icons'

export default function ClientLayout() {
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
      <Tabs.Screen name="home"     options={{ title: 'Accueil',    tabBarIcon: ({ color }) => <Ionicons name="home-outline"          size={22} color={color} /> }} />
      <Tabs.Screen name="booking"  options={{ title: 'Réserver',   tabBarIcon: ({ color }) => <Ionicons name="calendar-outline"     size={22} color={color} /> }} />
      <Tabs.Screen name="account"  options={{ title: 'Mon compte', tabBarIcon: ({ color }) => <Ionicons name="person-outline"       size={22} color={color} /> }} />
      <Tabs.Screen name="fidelite" options={{ title: 'Fidélité',   tabBarIcon: ({ color }) => <Ionicons name="star-outline"         size={22} color={color} /> }} />
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
