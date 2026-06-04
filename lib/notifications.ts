import * as Device from 'expo-device'
import Constants from 'expo-constants'
import { Platform } from 'react-native'
import { supabase } from './supabase'

// Must be evaluated before any expo-notifications import
const isExpoGo = Constants.appOwnership === 'expo'

export function setupNotificationHandler() {
  if (isExpoGo) { console.log('[notifications] Expo Go — setup ignoré'); return }
  import('expo-notifications').then(Notifications => {
    try {
      Notifications.setNotificationHandler({
        handleNotification: async () => ({
          shouldShowBanner: true,
          shouldShowList: true,
          shouldPlaySound: true,
          shouldSetBadge: true,
        }),
      })
    } catch { /* ignore */ }
  }).catch(() => {})
}

export async function registerPushToken({
  ownerId,
  employeId,
}: {
  ownerId?: string
  employeId?: string
}) {
  if (isExpoGo) { console.log('[notifications] Expo Go — registerPushToken ignoré'); return }
  if (!Device.isDevice) return

  try {
    const Notifications = await import('expo-notifications')

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
  } catch { /* ignore */ }
}

export async function setBadgeCount(count: number) {
  if (isExpoGo) return
  try {
    const Notifications = await import('expo-notifications')
    await Notifications.setBadgeCountAsync(count)
  } catch { /* ignore */ }
}

export async function clearBadge() {
  if (isExpoGo) return
  try {
    const Notifications = await import('expo-notifications')
    await Notifications.setBadgeCountAsync(0)
  } catch { /* ignore */ }
}
