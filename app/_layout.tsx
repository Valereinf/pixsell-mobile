import { useEffect, useRef, useState } from 'react'
import { Animated, AppState, Easing, View, StyleSheet, Dimensions } from 'react-native'
import LottieView from 'lottie-react-native'
import * as SplashScreen from 'expo-splash-screen'
import { Stack, useRouter } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import * as Linking from 'expo-linking'
import { supabase } from '../lib/supabase'
import { setupNotificationHandler, registerPushToken } from '../lib/notifications'

SplashScreen.preventAutoHideAsync()

const { width } = Dimensions.get('window')

export default function RootLayout() {
  const router = useRouter()
  const [appReady, setAppReady]   = useState(false)
  const [splashDone, setSplashDone] = useState(false)

  const slideAnim = useRef(new Animated.Value(0)).current

  useEffect(() => {
    setTimeout(() => setAppReady(true), 300)
  }, [])

  // Setup notification handler + auth listener + tap listener
  useEffect(() => {
    setupNotificationHandler()

    // ── Deep link handler — pixsell://king-cuts ────────────────────
    const handleDeepLink = (url: string) => {
      const parsed = Linking.parse(url)
      const slug = parsed.hostname ?? parsed.path?.replace('/', '')
      if (slug && slug !== 'reservation') {
        router.push(`/(client)/salon?slug=${slug}` as Parameters<typeof router.push>[0])
      }
    }

    const linkingSub = Linking.addEventListener('url', ({ url }) => {
      handleDeepLink(url)
    })

    Linking.getInitialURL().then(url => {
      if (url) handleDeepLink(url)
    })

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
      responseSub = Notifications.addNotificationResponseReceivedListener(async response => {
        const data = response.notification.request.content.data as {
          event?: string
          reservation_id?: string
          company_id?: string
        }
        if (!data?.reservation_id) return
        if (data?.event !== 'new_reservation' && data?.event !== 'cancelled') return
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return  // employé connecté → ne pas naviguer
        router.push(`/(owner)/reservation/${data.reservation_id}` as Parameters<typeof router.push>[0])
      })

      // Cold start : app fermée, user tape la notification
      Notifications.getLastNotificationResponseAsync().then(async response => {
        if (!response) return
        const data = response.notification.request.content.data as {
          event?: string
          reservation_id?: string
        }
        if (!data?.reservation_id) return
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return  // employé connecté → ignorer
        setTimeout(() => {
          router.push(`/(owner)/reservation/${data.reservation_id}` as Parameters<typeof router.push>[0])
        }, 1800)
      }).catch(() => {})
    }).catch(() => {})

    return () => {
      subscription.unsubscribe()
      responseSub?.remove()
      linkingSub.remove()
    }
  }, [])

  useEffect(() => {
    const sub = AppState.addEventListener('change', async (state) => {
      if (state === 'active') {
        await supabase.auth.refreshSession()
      }
    })
    return () => sub.remove()
  }, [])

  useEffect(() => {
    if (!appReady) return
    SplashScreen.hideAsync()
  }, [appReady])

  if (!splashDone) {
    return (
      <Animated.View style={[{ flex: 1, backgroundColor: '#ffffff' }, { transform: [{ translateX: slideAnim }] }]}>
        {!appReady ? null : (
          <LottieView
            source={require('../assets/animations/splash.json')}
            autoPlay
            loop={false}
            style={{ width: '100%', height: '100%' }}
            onAnimationFinish={() => {
              Animated.timing(slideAnim, {
                toValue: -width,
                duration: 400,
                easing: Easing.inOut(Easing.quad),
                useNativeDriver: true,
              }).start(() => setSplashDone(true))
            }}
          />
        )}
      </Animated.View>
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
    backgroundColor: '#ffffff',
    justifyContent: 'center',
    alignItems: 'center',
  },
})
