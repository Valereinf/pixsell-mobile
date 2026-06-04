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
    } catch (e) { console.warn('[notifications] setNotificationHandler error:', e) }
  }).catch(e => console.warn('[notifications] import error:', e))
}

export async function registerPushToken({
  ownerId,
  employeId,
}: {
  ownerId?: string
  employeId?: string
}) {
  console.log('[registerPushToken] start', { isExpoGo, isDevice: Device.isDevice, ownerId, employeId })

  if (isExpoGo) { console.log('[registerPushToken] Expo Go — ignoré'); return }
  if (!Device.isDevice) { console.log('[registerPushToken] pas un vrai device — ignoré'); return }

  try {
    const Notifications = await import('expo-notifications')

    // ── Permissions ───────────────────────────────────────────────
    const { status: existing } = await Notifications.getPermissionsAsync()
    console.log('[registerPushToken] permission existante:', existing)

    let finalStatus = existing
    if (existing !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync()
      finalStatus = status
      console.log('[registerPushToken] permission demandée:', finalStatus)
    }
    if (finalStatus !== 'granted') {
      console.warn('[registerPushToken] permission refusée:', finalStatus)
      return
    }

    // ── Project ID ────────────────────────────────────────────────
    const projectId = Constants.expoConfig?.extra?.eas?.projectId
    console.log('[registerPushToken] projectId:', projectId)
    if (!projectId) { console.warn('[registerPushToken] projectId manquant dans app.json'); return }

    // ── Expo Push Token ───────────────────────────────────────────
    const tokenResult = await Notifications.getExpoPushTokenAsync({ projectId })
    const pushToken = tokenResult.data
    console.log('[registerPushToken] pushToken:', pushToken)
    if (!pushToken) { console.warn('[registerPushToken] pushToken vide'); return }

    // ── Android channel ───────────────────────────────────────────
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'default',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#7c3aed',
      })
    }

    // ── Supabase session debug ────────────────────────────────────
    const { data: { session } } = await supabase.auth.getSession()
    console.log('[registerPushToken] session uid:', session?.user?.id ?? 'null (pas de session)')

    // ── Upsert push_tokens ────────────────────────────────────────
    const { error } = await supabase.from('push_tokens').upsert(
      {
        token: pushToken,
        owner_id: ownerId ?? null,
        employe_id: employeId ?? null,
        device_type: Platform.OS,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'token' }
    )

    if (error) {
      console.error('[registerPushToken] erreur upsert Supabase:', error.code, error.message, error.details)
    } else {
      console.log('[registerPushToken] token sauvegardé avec succès ✓')
    }
  } catch (e) {
    console.error('[registerPushToken] exception inattendue:', e instanceof Error ? e.message : String(e))
  }
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
