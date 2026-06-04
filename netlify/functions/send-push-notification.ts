import { getSupabase, sendPushNotifications, CORS_HEADERS } from './_shared'
import type { NetlifyEvent } from './_shared'

export const handler = async (event: NetlifyEvent) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: CORS_HEADERS, body: '' }
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: CORS_HEADERS, body: JSON.stringify({ error: 'Method Not Allowed' }) }
  }

  const { tokens, title, body, data } = JSON.parse(event.body ?? '{}') as {
    tokens: string[]
    title: string
    body: string
    data?: Record<string, unknown>
  }

  if (!tokens?.length || !title || !body) {
    return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ error: 'tokens, title, body requis' }) }
  }

  const supabase = getSupabase()
  const result = await sendPushNotifications(supabase, tokens, title, body, data)
  return { statusCode: 200, headers: CORS_HEADERS, body: JSON.stringify(result) }
}
