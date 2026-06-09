import { useEffect, useRef, useState } from 'react'
import { Animated, Easing, View, Text, Image, StyleSheet, Dimensions } from 'react-native'
import * as SplashScreen from 'expo-splash-screen'
import { Stack, useRouter } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import { supabase } from '../lib/supabase'
import { setupNotificationHandler, registerPushToken } from '../lib/notifications'

SplashScreen.preventAutoHideAsync()

const { width, height } = Dimensions.get('window')

export default function RootLayout() {
  const router = useRouter()
  const [appReady, setAppReady]         = useState(false)
  const [splashDone, setSplashDone]     = useState(false)
  const [isTransitioning, setIsTransitioning] = useState(false)
  const [letterCount, setLetterCount]   = useState(0)

  const birdScale      = useRef(new Animated.Value(0.15)).current
  const birdTranslateX = useRef(new Animated.Value(-150)).current
  const birdTranslateY = useRef(new Animated.Value(150)).current
  const splashSlide    = useRef(new Animated.Value(0)).current
  const loginSlide     = useRef(new Animated.Value(width)).current

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
    }
  }, [])

  // ── Splash animation ───────────────────────────────────────────────────────
  useEffect(() => {
    if (!appReady) return
    SplashScreen.hideAsync()

    // 1+2. Oiseau vole du bas-gauche vers le centre (900ms, ease-out)
    Animated.parallel([
      Animated.timing(birdScale, {
        toValue: 1.0,
        duration: 900,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(birdTranslateX, {
        toValue: 0,
        duration: 900,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(birdTranslateY, {
        toValue: -20,
        duration: 900,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start()

    // 3. Texte lettre par lettre après 300ms de délai, toutes les 80ms
    let letterInterval: ReturnType<typeof setInterval> | null = null
    const letterTimeout = setTimeout(() => {
      letterInterval = setInterval(() => {
        setLetterCount(prev => {
          if (prev >= 7) {
            if (letterInterval) clearInterval(letterInterval)
            return prev
          }
          return prev + 1
        })
      }, 80)
    }, 300)

    // 4+5. Après 900ms vol + 1000ms pause → slide transition (400ms)
    const slideTimeout = setTimeout(() => {
      setIsTransitioning(true)
      Animated.parallel([
        // Splash sort par la gauche
        Animated.timing(splashSlide, {
          toValue: -width,
          duration: 400,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        // Page Connexion entre par la droite
        Animated.timing(loginSlide, {
          toValue: 0,
          duration: 400,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ]).start(() => setSplashDone(true))
    }, 1900)

    return () => {
      clearTimeout(letterTimeout)
      clearTimeout(slideTimeout)
      if (letterInterval) clearInterval(letterInterval)
    }
  }, [appReady])

  // Découpage du texte pour la coloration
  const purpleText = 'Pixsell'.slice(0, Math.min(letterCount, 3))  // "Pix"
  const orangeText = 'Pixsell'.slice(3, letterCount)               // "sell"

  if (!splashDone) {
    return (
      <View style={styles.container}>
        {/* Page Connexion proxy (fond #f5f3ff) glissant depuis la droite */}
        {isTransitioning && (
          <Animated.View style={[
            StyleSheet.absoluteFill,
            { backgroundColor: '#f5f3ff', transform: [{ translateX: loginSlide }] },
          ]} />
        )}

        {/* Écran splash glissant vers la gauche */}
        <Animated.View style={[styles.splash, { transform: [{ translateX: splashSlide }] }]}>
          {/* Logo : oiseau + texte, centré, animé depuis le bas-gauche */}
          <Animated.View style={{
            flexDirection: 'row',
            alignItems: 'center',
            transform: [
              { translateX: birdTranslateX },
              { translateY: birdTranslateY },
              { scale: birdScale },
            ],
          }}>
            <Image
              source={require('../assets/icon-source.png')}
              style={{ width: 48, height: 48 }}
              resizeMode="contain"
            />
            <View style={{ marginLeft: 8 }}>
              <Text style={{ fontSize: 36, fontWeight: '800' }}>
                <Text style={{ color: '#4D15CD' }}>{purpleText}</Text>
                <Text style={{ color: '#F79B12' }}>{orangeText}</Text>
              </Text>
            </View>
          </Animated.View>
        </Animated.View>
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
  container: {
    flex: 1,
    overflow: 'hidden',
  },
  splash: {
    ...StyleSheet.absoluteFill,
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
  },
})
