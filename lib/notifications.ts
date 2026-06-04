import * as Device from 'expo-device'
import Constants from 'expo-constants'
import { Platform } from 'react-native'

const NETLIFY_URL = 'https://app.pixsellmedia.ca'

// SDK 56 : appOwnership peut être null dans un EAS build — on vérifie les deux
const isExpoGo =
  Constants.appOwnership === 'expo' ||
  (Constants as unknown as { executionEnvironment?: string }).executionEnvironment === 'storeClient'

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
      console.log('[notifications] setNotificationHandler OK')
    } catch (e) { console.warn('[notifications] setNotificationHandler error:', e) }
  }).catch(e => console.warn('[notifications] import expo-notifications error:', e))
}

export async function registerPushToken({
  ownerId,
  employeId,
}: {
  ownerId?: string
  employeId?: string
}) {
  console.log('[registerPushToken] ▶ START', {
    isExpoGo,
    appOwnership: Constants.appOwnership,
    executionEnvironment: (Constants as unknown as { executionEnvironment?: string }).executionEnvironment,
    isDevice: Device.isDevice,
    platform: Platform.OS,
    ownerId: ownerId ?? 'undefined',
    employeId: employeId ?? 'undefined',
  })

  if (isExpoGo) { console.log('[registerPushToken] Expo Go — skip'); return }
  if (!Device.isDevice) { console.log('[registerPushToken] émulateur — skip'); return }

  try {
    const Notifications = await import('expo-notifications')
    console.log('[registerPushToken] expo-notifications importé')

    // ── Permissions ───────────────────────────────────────────────
    const { status: existing } = await Notifications.getPermissionsAsync()
    console.log('[registerPushToken] permission actuelle:', existing)

    let finalStatus = existing
    if (existing !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync()
      finalStatus = status
      console.log('[registerPushToken] permission après demande:', finalStatus)
    }
    if (finalStatus !== 'granted') {
      console.warn('[registerPushToken] ✗ permission refusée:', finalStatus)
      return
    }
    console.log('[registerPushToken] ✓ permission OK')

    // ── Project ID ────────────────────────────────────────────────
    const projectId = Constants.expoConfig?.extra?.eas?.projectId
    console.log('[registerPushToken] projectId:', projectId ?? 'MANQUANT')
    if (!projectId) { console.warn('[registerPushToken] ✗ projectId manquant dans app.json extra.eas'); return }

    // ── Expo Push Token ───────────────────────────────────────────
    console.log('[registerPushToken] appel getExpoPushTokenAsync...')
    let pushToken: string
    try {
      const tokenResult = await Notifications.getExpoPushTokenAsync({ projectId })
      pushToken = tokenResult.data
      console.log('[registerPushToken] ✓ pushToken:', pushToken)
    } catch (tokenErr) {
      console.error('[registerPushToken] ✗ getExpoPushTokenAsync failed:', tokenErr instanceof Error ? tokenErr.message : String(tokenErr))
      return
    }
    if (!pushToken) { console.warn('[registerPushToken] ✗ pushToken vide'); return }

    // ── Android notification channel ──────────────────────────────
    if (Platform.OS === 'android') {
      try {
        await Notifications.setNotificationChannelAsync('default', {
          name: 'default',
          importance: Notifications.AndroidImportance.MAX,
          vibrationPattern: [0, 250, 250, 250],
          lightColor: '#7c3aed',
        })
        console.log('[registerPushToken] ✓ canal Android créé')
      } catch (chErr) {
        console.warn('[registerPushToken] canal Android error (non bloquant):', chErr)
      }
    }

    // ── Netlify function — service role key, bypass RLS ───────────
    const url = `${NETLIFY_URL}/.netlify/functions/register-push-token`
    const payload = { token: pushToken, owner_id: ownerId ?? null, employe_id: employeId ?? null, device_type: Platform.OS }
    console.log('[registerPushToken] fetch Netlify:', url, payload)

    let res: Response
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
    } catch (netErr) {
      console.error('[registerPushToken] ✗ fetch réseau failed:', netErr instanceof Error ? netErr.message : String(netErr))
      return
    }

    const text = await res.text()
    console.log('[registerPushToken] Netlify réponse status:', res.status, 'body:', text)

    if (!res.ok) {
      console.error('[registerPushToken] ✗ Netlify error:', res.status, text)
    } else {
      console.log('[registerPushToken] ✓ token sauvegardé avec succès')
    }
  } catch (e) {
    console.error('[registerPushToken] ✗ exception inattendue:', e instanceof Error ? e.message : String(e))
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
