import { createClient } from '@supabase/supabase-js'

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send'

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

interface PushMessage {
  to: string
  title: string
  body: string
  data?: Record<string, unknown>
  sound: 'default'
  badge: number
}

interface NetlifyEvent {
  httpMethod: string
  body: string | null
  headers: Record<string, string>
}

export const handler = async (event: NetlifyEvent) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Content-Type': 'application/json',
  }

  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' }
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method Not Allowed' }) }

  const { tokens, title, body, data } = JSON.parse(event.body ?? '{}') as {
    tokens: string[]
    title: string
    body: string
    data?: Record<string, unknown>
  }

  if (!tokens?.length || !title || !body) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'tokens, title, body requis' }) }
  }

  const validTokens = tokens.filter(t => t.startsWith('ExponentPushToken['))
  if (!validTokens.length) {
    return { statusCode: 200, headers, body: JSON.stringify({ sent: 0, removed: 0 }) }
  }

  const messages: PushMessage[] = validTokens.map(token => ({
    to: token,
    title,
    body,
    data: data ?? {},
    sound: 'default',
    badge: 1,
  }))

  const res = await fetch(EXPO_PUSH_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(messages),
  })

  const result = await res.json() as { data?: { status: string; details?: { error?: string } }[] }

  // Supprimer les tokens invalides
  const invalidTokens: string[] = []
  if (result.data) {
    result.data.forEach((item, idx) => {
      if (
        item.status === 'error' &&
        (item.details?.error === 'DeviceNotRegistered' ||
          item.details?.error === 'InvalidCredentials')
      ) {
        invalidTokens.push(validTokens[idx])
      }
    })
  }

  if (invalidTokens.length > 0) {
    await supabase.from('push_tokens').delete().in('token', invalidTokens)
  }

  return {
    statusCode: 200,
    headers,
    body: JSON.stringify({ sent: validTokens.length - invalidTokens.length, removed: invalidTokens.length }),
  }
}
