import { createClient } from '@supabase/supabase-js'
import type { SupabaseClient } from '@supabase/supabase-js'

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send'

export const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Content-Type': 'application/json',
}

export interface NetlifyEvent {
  httpMethod: string
  body: string | null
  headers: Record<string, string>
}

export function getSupabase(): SupabaseClient {
  return createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

export async function getOwnerTokens(supabase: SupabaseClient, companyId: string): Promise<string[]> {
  const { data: company } = await supabase
    .from('companies').select('owner_email').eq('id', companyId).single()
  if (!company?.owner_email) return []

  const { data: adminData } = await supabase.auth.admin.listUsers({ perPage: 1000 })
  const owner = adminData?.users?.find(
    (u: { email?: string; id: string }) => u.email === company.owner_email
  )
  if (!owner) return []

  const { data: rows } = await supabase
    .from('push_tokens').select('token').eq('owner_id', owner.id)
  return (rows ?? []).map((r: { token: string }) => r.token)
}

export async function getEmployeeTokens(supabase: SupabaseClient, employeeId: string): Promise<string[]> {
  if (!employeeId) return []
  const { data: rows } = await supabase
    .from('push_tokens').select('token').eq('employe_id', employeeId)
  return (rows ?? []).map((r: { token: string }) => r.token)
}

export async function sendPushNotifications(
  supabase: SupabaseClient,
  tokens: string[],
  title: string,
  body: string,
  data: Record<string, unknown> = {}
): Promise<{ sent: number; removed: number }> {
  const valid = tokens.filter(t => t.startsWith('ExponentPushToken['))
  if (!valid.length) return { sent: 0, removed: 0 }

  const messages = valid.map(token => ({
    to: token, title, body, data,
    sound: 'default' as const, badge: 1,
  }))

  const res = await fetch(EXPO_PUSH_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(messages),
  })
  const result = await res.json() as { data?: { status: string; details?: { error?: string } }[] }

  const invalid: string[] = []
  result.data?.forEach((item, idx) => {
    if (
      item.status === 'error' &&
      (item.details?.error === 'DeviceNotRegistered' ||
        item.details?.error === 'InvalidCredentials')
    ) {
      invalid.push(valid[idx])
    }
  })
  if (invalid.length) {
    await supabase.from('push_tokens').delete().in('token', invalid)
  }
  return { sent: valid.length - invalid.length, removed: invalid.length }
}
