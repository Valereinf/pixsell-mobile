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
  const [appReady, setAppReady]               = useState(false)
  const [splashDone, setSplashDone]           = useState(false)
  const [isTransitioning, setIsTransitioning] = useState(false)

  // Bird
  const birdTranslateX = useRef(new Animated.Value(-width * 0.6)).current
  const birdTranslateY = useRef(new Animated.Value(0)).current
  const birdScale      = useRef(new Animated.Value(0.3)).current

  // Text
  const textOpacity    = useRef(new Animated.Value(0)).current
  const textTranslateX = useRef(new Animated.Value(20)).current

  // Slide transition
  const splashSlide = useRef(new Animated.Value(0)).current
  const loginSlide  = useRef(new Animated.Value(width)).current

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

  // ── Splash animation ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!appReady) return
    SplashScreen.hideAsync()

    // Phase 1→2 : oiseau vole de gauche à droite avec arc (0→900ms)
    Animated.parallel([
      // Vol horizontal
      Animated.timing(birdTranslateX, {
        toValue: width * 0.7,
        duration: 900,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      // Grossit pendant le vol
      Animated.timing(birdScale, {
        toValue: 1.2,
        duration: 900,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
      // Arc vertical : monte puis redescend
      Animated.sequence([
        Animated.timing(birdTranslateY, {
          toValue: -40,
          duration: 450,
          easing: Easing.out(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(birdTranslateY, {
          toValue: 0,
          duration: 450,
          easing: Easing.in(Easing.sin),
          useNativeDriver: true,
        }),
      ]),
    ]).start(() => {
      // Phase 4 : oiseau sort par la droite (900→1100ms)
      Animated.timing(birdTranslateX, {
        toValue: width * 1.2,
        duration: 200,
        easing: Easing.in(Easing.quad),
        useNativeDriver: true,
      }).start()
    })

    // Phase 3 : texte se dévoile à t=200ms pendant 600ms
    const textTimeout = setTimeout(() => {
      Animated.parallel([
        Animated.timing(textOpacity, {
          toValue: 1,
          duration: 600,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(textTranslateX, {
          toValue: 0,
          duration: 600,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
      ]).start()
    }, 200)

    // Phase 5→6 : pause 500ms puis slide transition à t=1600ms
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
    }, 1600)

    return () => {
      clearTimeout(textTimeout)
      clearTimeout(slideTimeout)
    }
  }, [appReady])

  if (!splashDone) {
    return (
      <View style={styles.container}>
        {/* Page Connexion proxy glissant depuis la droite */}
        {isTransitioning && (
          <Animated.View style={[
            StyleSheet.absoluteFill,
            { backgroundColor: '#f5f3ff', transform: [{ translateX: loginSlide }] },
          ]} />
        )}

        {/* Écran splash glissant vers la gauche */}
        <Animated.View style={[styles.splash, { transform: [{ translateX: splashSlide }] }]}>

          {/* Texte "Pixsell" centré — se dévoile pendant le vol */}
          <Animated.View style={{
            position: 'absolute',
            top: height * 0.45,
            left: 0,
            right: 0,
            alignItems: 'center',
            opacity: textOpacity,
            transform: [{ translateX: textTranslateX }],
          }}>
            <Text style={{ fontSize: 64, fontWeight: '800' }}>
              <Text style={{ color: '#4D15CD' }}>Pix</Text>
              <Text style={{ color: '#F79B12' }}>sell</Text>
            </Text>
          </Animated.View>

          {/* Oiseau — survole l'écran de gauche à droite */}
          <Animated.View style={{
            position: 'absolute',
            top: height * 0.35,
            left: 0,
            width: 100,
            height: 100,
            transform: [
              { translateX: birdTranslateX },
              { translateY: birdTranslateY },
              { scale: birdScale },
            ],
          }}>
            <Image
              source={require('../assets/android-icon-foreground.png')}
              style={{ width: 100, height: 100 }}
              resizeMode="contain"
            />
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
  },
})
