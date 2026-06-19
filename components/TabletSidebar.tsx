import { useState, useEffect } from 'react'
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, Image } from 'react-native'
import { useRouter, usePathname } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { supabase } from '../lib/supabase'
import { useOwnerContext } from '../lib/ownerContext'

const NAV_ITEMS = [
  { route: '/(owner)/(tabs)/dashboard',     segment: 'dashboard',     icon: 'grid-outline',            label: 'Dashboard' },
  { route: '/(owner)/(tabs)/calendrier',    segment: 'calendrier',    icon: 'calendar-clear-outline',  label: 'Calendrier' },
  { route: '/(owner)/(tabs)/reservations',  segment: 'reservations',  icon: 'calendar-outline',        label: 'Réservations' },
  { route: '/(owner)/(tabs)/clients',       segment: 'clients',       icon: 'people-circle-outline',   label: 'Clients' },
  { route: '/(owner)/(tabs)/marketing',     segment: 'marketing',     icon: 'megaphone-outline',       label: 'Marketing' },
  { route: '/(owner)/(tabs)/employes',      segment: 'employes',      icon: 'people-outline',          label: 'Employés' },
  { route: '/(owner)/(tabs)/agenda-collab', segment: 'agenda-collab', icon: 'calendar-number-outline', label: 'Agenda collab.' },
  { route: '/(owner)/(tabs)/services',      segment: 'services',      icon: 'cut-outline',             label: 'Services' },
  { route: '/(owner)/(tabs)/comptabilite',  segment: 'comptabilite',  icon: 'receipt-outline',         label: 'Comptabilité' },
  { route: '/(owner)/(tabs)/liste-attente', segment: 'liste-attente', icon: 'time-outline',            label: "Liste d'attente" },
  { route: '/(owner)/(tabs)/statistiques',  segment: 'statistiques',  icon: 'bar-chart-outline',       label: 'Statistiques' },
  { route: '/(owner)/(tabs)/avis',          segment: 'avis',          icon: 'star-outline',            label: 'Avis clients' },
  { route: '/(owner)/(tabs)/apparence',     segment: 'apparence',     icon: 'color-palette-outline',   label: 'Apparence' },
] as const

export default function TabletSidebar() {
  const router   = useRouter()
  const pathname = usePathname()
  const insets   = useSafeAreaInsets()
  const { company } = useOwnerContext()
  const [isAdmin, setIsAdmin] = useState(false)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      const role = data.session?.user?.app_metadata?.role
      setIsAdmin(role === 'pixsell_admin')
    })
  }, [])

  const navItems = NAV_ITEMS.filter(item =>
    item.segment !== 'apparence' || isAdmin
  )

  async function handleLogout() {
    await supabase.auth.signOut()
    router.replace('/(auth)/login')
  }

  return (
    <View style={[s.sidebar, { paddingTop: insets.top + 8, paddingBottom: insets.bottom + 8 }]}>
      {/* ── Entête sidebar ── */}
      <View style={{ paddingHorizontal: 16, paddingTop: 16, paddingBottom: 12 }}>

        {/* Logo Pixsell */}
        <Image
          source={require('../assets/pixsell_new_logo.png')}
          style={{ width: 130, height: 36, resizeMode: 'contain', marginBottom: 12 }}
        />

        {/* Logo + Nom du salon */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8,
          backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 10, padding: 8 }}>
          {company?.logo_url ? (
            <Image
              source={{ uri: company.logo_url }}
              style={{ width: 32, height: 32, borderRadius: 8 }}
            />
          ) : (
            <View style={{ width: 32, height: 32, borderRadius: 8,
              backgroundColor: '#7c3aed', justifyContent: 'center', alignItems: 'center' }}>
              <Text style={{ color: '#fff', fontWeight: '800', fontSize: 14 }}>
                {company?.name?.[0] ?? 'S'}
              </Text>
            </View>
          )}
          <Text style={{ color: '#fff', fontWeight: '600', fontSize: 13, flex: 1 }}
            numberOfLines={1}>
            {company?.name ?? 'Mon salon'}
          </Text>
        </View>

      </View>

      <View style={s.divider} />

      {/* Nav items */}
      <ScrollView showsVerticalScrollIndicator={false} style={{ flex: 1 }}>
        {navItems.map(item => {
          const active = pathname.includes(item.segment)
          return (
            <TouchableOpacity
              key={item.route}
              onPress={() => router.push(item.route)}
              style={[s.navItem, active && s.navItemActive]}
              activeOpacity={0.7}
            >
              <Ionicons
                name={item.icon as keyof typeof Ionicons.glyphMap}
                size={18}
                color={active ? '#fff' : '#6b7280'}
              />
              <Text style={[s.navLabel, active && s.navLabelActive]} numberOfLines={1}>
                {item.label}
              </Text>
            </TouchableOpacity>
          )
        })}
      </ScrollView>

      <View style={s.divider} />

      {/* Logout */}
      <TouchableOpacity style={s.logoutBtn} onPress={handleLogout} activeOpacity={0.7}>
        <Ionicons name="log-out-outline" size={18} color="#ef4444" />
        <Text style={s.logoutLabel}>Déconnexion</Text>
      </TouchableOpacity>
    </View>
  )
}

const s = StyleSheet.create({
  sidebar:       { width: 240, backgroundColor: '#f5f3ff', borderRightWidth: 1, borderRightColor: 'rgba(124,58,237,0.1)', paddingHorizontal: 12 },
  divider:       { height: 1, backgroundColor: 'rgba(124,58,237,0.1)', marginVertical: 8 },
  navItem:       { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, paddingHorizontal: 12, borderRadius: 10, marginBottom: 2 },
  navItemActive: { backgroundColor: '#7c3aed' },
  navLabel:      { fontSize: 13, fontWeight: '500', color: '#374151', flex: 1 },
  navLabelActive:{ color: '#fff', fontWeight: '600' },
  logoutBtn:     { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, paddingHorizontal: 12, borderRadius: 10 },
  logoutLabel:   { fontSize: 13, fontWeight: '500', color: '#ef4444' },
})
