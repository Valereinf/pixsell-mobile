import { useState, useEffect } from 'react'
import { Tabs, useRouter } from 'expo-router'
import { Modal, View, Text, TouchableOpacity, StyleSheet, ScrollView, useWindowDimensions } from 'react-native'
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { supabase } from '../../../lib/supabase'
import TabletSidebar from '../../../components/TabletSidebar'

const EXTRA_ITEMS = [
  { route: '/(owner)/(tabs)/employes',      icon: 'people-outline',        label: 'Employés' },
  { route: '/(owner)/(tabs)/agenda-collab', icon: 'calendar-outline',      label: 'Agenda collab.' },
  { route: '/(owner)/(tabs)/services',      icon: 'cut-outline',           label: 'Services' },
  { route: '/(owner)/(tabs)/comptabilite',  icon: 'receipt-outline',       label: 'Comptabilité' },
  { route: '/(owner)/(tabs)/liste-attente', icon: 'time-outline',          label: "Liste d'attente" },
  { route: '/(owner)/(tabs)/statistiques',  icon: 'bar-chart-outline',     label: 'Statistiques' },
  { route: '/(owner)/(tabs)/avis',          icon: 'star-outline',          label: 'Avis clients' },
  { route: '/(owner)/(tabs)/apparence',     icon: 'color-palette-outline', label: 'Apparence' },
] as const

export default function TabsLayout() {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const { width } = useWindowDimensions()
  const isTablet = width >= 768
  const [moreOpen, setMoreOpen] = useState(false)
  const [isAdmin, setIsAdmin] = useState(false)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      const role = data.session?.user?.app_metadata?.role
      setIsAdmin(role === 'pixsell_admin')
    })
  }, [])

  const extraItems = EXTRA_ITEMS.filter(item =>
    item.route !== '/(owner)/(tabs)/apparence' || isAdmin
  )

  async function handleLogout() {
    await supabase.auth.signOut()
    router.replace('/(auth)/login')
  }

  const tabBarStyle = isTablet
    ? { display: 'none' as const }
    : {
        position: 'absolute' as const,
        backgroundColor: 'rgba(255,255,255,0.82)',
        borderTopWidth: 0,
        elevation: 0,
        height: 64 + insets.bottom,
        paddingBottom: insets.bottom > 0 ? insets.bottom : 8,
        borderTopLeftRadius: 20,
        borderTopRightRadius: 20,
        shadowColor: '#7c3aed',
        shadowOffset: { width: 0, height: -4 },
        shadowOpacity: 0.08,
        shadowRadius: 16,
      }

  const tabs = (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle,
          tabBarBackground: () => (
            <View style={{
              position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
              backgroundColor: 'rgba(255,255,255,0.72)',
              borderTopLeftRadius: 20,
              borderTopRightRadius: 20,
            }} />
          ),
          tabBarActiveTintColor: '#7c3aed',
          tabBarInactiveTintColor: '#6b7280',
          tabBarLabelStyle: { fontSize: 10, fontWeight: '600' },
        }}
      >
        <Tabs.Screen name="dashboard"    options={{ title: 'Dashboard',    tabBarIcon: ({ color }) => <Ionicons name="grid-outline"            size={22} color={color} /> }} />
        <Tabs.Screen name="calendrier"   options={{ title: 'Calendrier',   tabBarIcon: ({ color }) => <Ionicons name="calendar-clear-outline" size={22} color={color} /> }} />
        <Tabs.Screen name="reservations" options={{ title: 'Réservations', tabBarIcon: ({ color }) => <Ionicons name="calendar-outline"       size={22} color={color} /> }} />
        <Tabs.Screen name="clients"      options={{ title: 'Clients',      tabBarIcon: ({ color }) => <Ionicons name="people-circle-outline"   size={22} color={color} /> }} />
        <Tabs.Screen name="marketing"    options={{ title: 'Marketing',    tabBarIcon: ({ color }) => <Ionicons name="megaphone-outline"       size={22} color={color} /> }} />

        {/* "Plus" — 6th tab, intercepts press to open modal instead of navigating */}
        <Tabs.Screen
          name="__more__"
          options={{
            title: 'Plus',
            tabBarButton: () => (
              <TouchableOpacity
                onPress={() => setMoreOpen(true)}
                style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 2 }}
              >
                <Ionicons name="menu-outline" size={22} color="#6b7280" />
                <Text style={{ fontSize: 10, color: '#6b7280', fontWeight: '600' }}>Plus</Text>
              </TouchableOpacity>
            ),
          }}
        />

        {/* Hidden screens */}
        <Tabs.Screen name="employes"      options={{ href: null }} />
        <Tabs.Screen name="agenda-collab" options={{ href: null }} />
        <Tabs.Screen name="services"      options={{ href: null }} />
        <Tabs.Screen name="comptabilite"  options={{ href: null }} />
        <Tabs.Screen name="liste-attente" options={{ href: null }} />
        <Tabs.Screen name="statistiques"  options={{ href: null }} />
        <Tabs.Screen name="avis"          options={{ href: null }} />
        <Tabs.Screen name="apparence"     options={{ href: null }} />
      </Tabs>
  )

  return (
    <>
      {isTablet ? (
        <View style={{ flex: 1, flexDirection: 'row' }}>
          <TabletSidebar />
          <View style={{ flex: 1 }}>{tabs}</View>
        </View>
      ) : tabs}

      {/* More modal — phone only */}
      {!isTablet && (
        <Modal visible={moreOpen} animationType="slide" transparent onRequestClose={() => setMoreOpen(false)}>
          <TouchableOpacity style={modal.backdrop} activeOpacity={1} onPress={() => setMoreOpen(false)} />
          <SafeAreaView edges={['bottom']} style={modal.sheet}>
            <View style={modal.handle} />
            <Text style={modal.sheetTitle}>Autres sections</Text>
            <ScrollView>
              {extraItems.map(item => (
                <TouchableOpacity
                  key={item.route}
                  style={modal.row}
                  onPress={() => { setMoreOpen(false); router.push(item.route) }}
                >
                  <View style={modal.iconBox}>
                    <Ionicons name={item.icon as keyof typeof Ionicons.glyphMap} size={20} color="#7c3aed" />
                  </View>
                  <Text style={modal.rowLabel}>{item.label}</Text>
                  <Ionicons name="chevron-forward" size={16} color="#d1d5db" />
                </TouchableOpacity>
              ))}
              <TouchableOpacity style={[modal.row, { marginTop: 8 }]} onPress={handleLogout}>
                <View style={[modal.iconBox, { backgroundColor: 'rgba(239,68,68,0.08)' }]}>
                  <Ionicons name="log-out-outline" size={20} color="#ef4444" />
                </View>
                <Text style={[modal.rowLabel, { color: '#ef4444' }]}>Déconnexion</Text>
              </TouchableOpacity>
            </ScrollView>
          </SafeAreaView>
        </Modal>
      )}
    </>
  )
}

const modal = StyleSheet.create({
  backdrop:   { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)' },
  sheet:      { backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 20, paddingBottom: 16, maxHeight: '75%' },
  handle:     { width: 40, height: 4, backgroundColor: '#e5e7eb', borderRadius: 2, alignSelf: 'center', marginTop: 12, marginBottom: 20 },
  sheetTitle: { fontSize: 16, fontWeight: '700', color: '#111827', marginBottom: 12 },
  row:        { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, gap: 14 },
  iconBox:    { width: 38, height: 38, borderRadius: 10, backgroundColor: 'rgba(124,58,237,0.08)', alignItems: 'center', justifyContent: 'center' },
  rowLabel:   { flex: 1, fontSize: 15, color: '#111827', fontWeight: '500' },
})
