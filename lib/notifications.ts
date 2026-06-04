import * as Notifications from 'expo-notifications'
import * as Device from 'expo-device'
import Constants from 'expo-constants'
import { Platform } from 'react-native'
import { supabase } from './supabase'

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
})

export async function registerPushToken({
  ownerId,
  employeId,
}: {
  ownerId?: string
  employeId?: string
}) {
  if (!Device.isDevice) return

  const { status: existing } = await Notifications.getPermissionsAsync()
  let finalStatus = existing
  if (existing !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync()
    finalStatus = status
  }
  if (finalStatus !== 'granted') return

  const projectId = Constants.expoConfig?.extra?.eas?.projectId
  if (!projectId) return

  try {
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
  await Notifications.setBadgeCountAsync(count)
}

export async function clearBadge() {
  await Notifications.setBadgeCountAsync(0)
}
