import { useEffect, useRef, useState } from 'react'
import { Animated, View, StyleSheet, Dimensions } from 'react-native'
import * as SplashScreen from 'expo-splash-screen'
import { Stack } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import { supabase } from '../lib/supabase'
import { setupNotificationHandler, registerPushToken } from '../lib/notifications'

SplashScreen.preventAutoHideAsync()

const { width } = Dimensions.get('window')

export default function RootLayout() {
  const [appReady, setAppReady] = useState(false)
  const [splashDone, setSplashDone] = useState(false)

  const fadeAnim  = useRef(new Animated.Value(0)).current
  const scaleAnim = useRef(new Animated.Value(0.75)).current

  useEffect(() => {
    setTimeout(() => setAppReady(true), 300)
  }, [])

  // Setup notification handler + auth listener
  useEffect(() => {
    setupNotificationHandler()
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN' && session?.user) {
        registerPushToken({ ownerId: session.user.id })
      }
    })
    return () => {
      subscription.unsubscribe()
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
