import * as Notifications from 'expo-notifications'
import * as Device from 'expo-device'
import Constants from 'expo-constants'
import { Platform } from 'react-native'
import { supabase } from './supabase'

// Called once from app/_layout.tsx — NOT at module level to avoid import-time errors
export function setupNotificationHandler() {
  try {
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: true,
        shouldSetBadge: true,
      }),
    })
  } catch {
    // Silently fail in environments where expo-notifications isn't fully available
  }
}

export async function registerPushToken({
  ownerId,
  employeId,
}: {
  ownerId?: string
  employeId?: string
}) {
  if (!Device.isDevice) return

  try {
    const { status: existing } = await Notifications.getPermissionsAsync()
    let finalStatus = existing
    if (existing !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync()
      finalStatus = status
    }
    if (finalStatus !== 'granted') return

    const projectId = Constants.expoConfig?.extra?.eas?.projectId
    if (!projectId) return

    const { data: pushToken } = await Notifications.getExpoPushTokenAsync({ projectId })
    if (!pushToken) return

    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'default',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#7c3aed',
      })
    }

    await supabase.from('push_tokens').upsert(
      {
        token: pushToken,
        owner_id: ownerId ?? null,
        employe_id: employeId ?? null,
        device_type: Platform.OS,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'token' }
    )
  } catch {
    // Silently fail — push token registration is non-critical
  }
}

export async function setBadgeCount(count: number) {
  try { await Notifications.setBadgeCountAsync(count) } catch { /* ignore */ }
}

export async function clearBadge() {
  try { await Notifications.setBadgeCountAsync(0) } catch { /* ignore */ }
}
