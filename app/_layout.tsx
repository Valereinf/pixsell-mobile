import { useEffect, useRef, useState } from 'react'
import { Animated, View, StyleSheet, Dimensions } from 'react-native'
import * as SplashScreen from 'expo-splash-screen'
import { Stack, useRouter } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import { supabase } from '../lib/supabase'
import { setupNotificationHandler, registerPushToken } from '../lib/notifications'

SplashScreen.preventAutoHideAsync()

const { width } = Dimensions.get('window')

export default function RootLayout() {
  const router = useRouter()
  const [appReady, setAppReady] = useState(false)
  const [splashDone, setSplashDone] = useState(false)

  const fadeAnim  = useRef(new Animated.Value(0)).current
  const scaleAnim = useRef(new Animated.Value(0.75)).current

  useEffect(() => {
    setTimeout(() => setAppReady(true), 300)
  }, [])

  // Setup notification handler + auth listener + tap listener
  useEffect(() => {
    setupNotificationHandler()

    // ── Auth listener ──────────────────────────────────────────────
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      console.log('[_layout] auth event:', event, 'uid:', session?.user?.id ?? 'null')
      if ((event === 'SIGNED_IN' || event === 'INITIAL_SESSION') && session?.user) {
        registerPushToken({ ownerId: session.user.id })
      }
    })

    // ── Notification tap listener (import dynamique — même stratégie) ──
    let responseSub: { remove: () => void } | null = null
    import('expo-notifications').then(Notifications => {
      // Tap sur notification quand l'app est ouverte (foreground/background)
      responseSub = Notifications.addNotificationResponseReceivedListener(response => {
        const data = response.notification.request.content.data as {
          event?: string
          reservation_id?: string
          company_id?: string
        }
        if (data?.reservation_id &&
            (data?.event === 'new_reservation' || data?.event === 'cancelled')) {
          router.push(`/(owner)/reservation/${data.reservation_id}` as Parameters<typeof router.push>[0])
        }
      })

      // Cold start : app fermée, user tape la notification
      Notifications.getLastNotificationResponseAsync().then(response => {
        if (!response) return
        const data = response.notification.request.content.data as {
          event?: string
          reservation_id?: string
        }
        if (data?.reservation_id) {
          router.push(`/(owner)/reservation/${data.reservation_id}` as Parameters<typeof router.push>[0])
        }
      }).catch(() => {})
    }).catch(() => {})

    return () => {
      subscription.unsubscribe()
      responseSub?.remove()
    }
  }, [])

  useEffect(() => {
    if (!appReady) return
    SplashScreen.hideAsync()

    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 700,
        useNativeDriver: true,
      }),
      Animated.spring(scaleAnim, {
        toValue: 1,
        friction: 6,
        tension: 40,
        useNativeDriver: true,
      }),
    ]).start(() => {
      setTimeout(() => {
        Animated.timing(fadeAnim, {
          toValue: 0,
          duration: 400,
          useNativeDriver: true,
        }).start(() => setSplashDone(true))
      }, 800)
    })
  }, [appReady])

  if (!splashDone) {
    return (
      <View style={styles.splash}>
        <Animated.Image
          source={require('../assets/logo-pixsell.png')}
          style={[
            styles.logo,
            {
              opacity: fadeAnim,
              transform: [{ scale: scaleAnim }],
            },
          ]}
          resizeMode="contain"
        />
      </View>
    )
  }

  return (
    <>
      <StatusBar style="dark" />
      <Stack screenOptions={{ headerShown: false }} />
    </>
  )
}

const styles = StyleSheet.create({
  splash: {
    flex: 1,
    backgroundColor: '#000099',
    alignItems: 'center',
    justifyContent: 'center',
  },
  logo: {
    width: width * 0.65,
    height: 120,
  },
})
