// Send-notifications — job handler. Used to be the send-notifications edge
// function, which scanned the queue and pushed every due notification in one
// 150s call. Now split:
//   - `send-notifications:scan` (entrypoint enqueues this) → marks expireds and
//      fans out one `send-notifications:send` job per due notification.
//   - `send-notifications:send` → loads one notification by id, looks up the
//      user's push token, posts to the provider, and updates the row.
// Per-handler 25s cap means scan stays cheap (just inserts) while sends
// happen in parallel across workers.

import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { enqueueJobsBatch } from '../enqueue-job.ts'

interface ScheduledNotification {
  id: string
  user_id: string
  notification_type: string
  scheduled_for: string
  expires_at: string | null
  payload: {
    title: string
    body: string
    action?: string
    data?: Record<string, unknown>
  }
  points_potential: number
  bonus_multiplier: number
  status: string
}

interface UserNotificationSettings {
  user_id: string
  push_token: string | null
  push_provider: string | null
}

export interface SendNotificationsScanPayload { /* none */ }

export interface SendNotificationsSendPayload {
  notification_id: string
}

// ── Scan: produce one fan-out job per due notification ─────────────────

export async function runSendNotificationsScan(
  supabase: SupabaseClient,
): Promise<Record<string, unknown>> {
  const now = new Date().toISOString()

  const { data: expired, error: expiredError } = await supabase
    .from('scheduled_notifications')
    .update({ status: 'expired' })
    .eq('status', 'pending')
    .not('expires_at', 'is', null)
    .lt('expires_at', now)
    .select('id')

  if (expiredError) console.error('Failed to mark expired notifications:', expiredError)
  const expiredCount = expired?.length || 0

  const { data: due, error: dueError } = await supabase
    .from('scheduled_notifications')
    .select('id')
    .eq('status', 'pending')
    .lte('scheduled_for', now)
    .order('scheduled_for', { ascending: true })
    .limit(100)

  if (dueError) throw new Error(`scan failed: ${dueError.message}`)

  if (!due || due.length === 0) {
    return { fanned_out: 0, expired: expiredCount }
  }

  // Mark each as 'queued_send' to prevent dupe fan-out across overlapping
  // scans. The send handler flips to 'sent' / 'failed' downstream.
  const ids = due.map((n: { id: string }) => n.id)
  await supabase
    .from('scheduled_notifications')
    .update({ status: 'queued_send' })
    .in('id', ids)
    .eq('status', 'pending')

  const enqueued = await enqueueJobsBatch(
    supabase,
    ids.map((notification_id) => ({
      kind: 'send-notifications:send',
      payload: { notification_id },
      priority: 7,
    })),
  )

  return { fanned_out: enqueued.length, expired: expiredCount }
}

// ── Send: deliver a single notification ─────────────────────────────────

export async function runSendNotificationsSend(
  supabase: SupabaseClient,
  payload: SendNotificationsSendPayload,
): Promise<Record<string, unknown>> {
  const id = payload.notification_id
  if (!id) throw new Error('notification_id required')

  const { data: notification, error: fetchErr } = await supabase
    .from('scheduled_notifications')
    .select('*')
    .eq('id', id)
    .maybeSingle()

  if (fetchErr) throw new Error(`fetch notification failed: ${fetchErr.message}`)
  if (!notification) return { skipped: 'not_found', notification_id: id }

  const n = notification as ScheduledNotification

  const { data: settings } = await supabase
    .from('user_notification_settings')
    .select('user_id, push_token, push_provider')
    .eq('user_id', n.user_id)
    .eq('notifications_enabled', true)
    .maybeSingle()

  const userToken = settings as UserNotificationSettings | null
  const now = new Date().toISOString()

  if (!userToken?.push_token) {
    // No push token — mark as sent (user will see in-app).
    await supabase
      .from('scheduled_notifications')
      .update({ status: 'sent', sent_at: now })
      .eq('id', id)
    return { sent: true, channel: 'in_app_only', notification_id: id }
  }

  const success = await sendPushNotification(
    userToken.push_token,
    userToken.push_provider || 'expo',
    n,
  )

  await supabase
    .from('scheduled_notifications')
    .update({
      status: success ? 'sent' : 'failed',
      sent_at: success ? now : null,
    })
    .eq('id', id)

  if (!success) {
    // Throw so the worker records the failure and (if attempts < max) retries.
    throw new Error(`push provider rejected (provider=${userToken.push_provider || 'expo'})`)
  }

  return { sent: true, channel: userToken.push_provider || 'expo', notification_id: id }
}

// ── Provider helpers (unchanged) ────────────────────────────────────────

async function sendPushNotification(
  token: string,
  provider: string,
  notification: ScheduledNotification,
): Promise<boolean> {
  const { payload, points_potential, bonus_multiplier, notification_type, id } = notification
  const notificationData = {
    notification_id: id,
    type: notification_type,
    points: points_potential,
    multiplier: bonus_multiplier,
    expires_at: notification.expires_at,
    ...payload.data,
  }
  switch (provider) {
    case 'expo': return sendExpoPush(token, payload, notificationData)
    case 'fcm':  return sendFCMPush(token, payload, notificationData)
    case 'apns': return sendAPNSPush(token, payload, notificationData)
    default:
      console.warn('Unknown push provider:', provider)
      return sendExpoPush(token, payload, notificationData)
  }
}

async function sendExpoPush(
  token: string,
  payload: ScheduledNotification['payload'],
  data: Record<string, unknown>,
): Promise<boolean> {
  try {
    const response = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Accept-Encoding': 'gzip, deflate',
      },
      body: JSON.stringify({
        to: token,
        title: payload.title,
        body: payload.body,
        data,
        sound: 'default',
        badge: 1,
        channelId: 'default',
        priority: 'high',
        categoryId: payload.action ? 'action' : undefined,
      }),
    })
    const result = await response.json()
    if (result.data?.status === 'ok') return true
    if (result.data?.status === 'error') {
      console.error('Expo push error:', result.data.message)
      return false
    }
    return response.ok
  } catch (error) {
    console.error('Expo push failed:', error)
    return false
  }
}

async function sendFCMPush(
  token: string,
  payload: ScheduledNotification['payload'],
  data: Record<string, unknown>,
): Promise<boolean> {
  const fcmKey = Deno.env.get('FCM_SERVER_KEY')
  if (!fcmKey) {
    console.warn('FCM_SERVER_KEY not configured, skipping FCM push')
    return false
  }
  try {
    const response = await fetch('https://fcm.googleapis.com/fcm/send', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `key=${fcmKey}`,
      },
      body: JSON.stringify({
        to: token,
        notification: {
          title: payload.title,
          body: payload.body,
          sound: 'default',
        },
        data: Object.fromEntries(
          Object.entries(data).map(([k, v]) => [k, String(v)]),
        ),
        priority: 'high',
      }),
    })
    const result = await response.json()
    return result.success === 1
  } catch (error) {
    console.error('FCM push failed:', error)
    return false
  }
}

async function sendAPNSPush(
  token: string,
  _payload: ScheduledNotification['payload'],
  _data: Record<string, unknown>,
): Promise<boolean> {
  const teamId = Deno.env.get('APNS_TEAM_ID')
  const keyId = Deno.env.get('APNS_KEY_ID')
  const bundleId = Deno.env.get('APNS_BUNDLE_ID')
  if (!teamId || !keyId || !bundleId) {
    console.warn('APNS not fully configured, skipping APNS push')
    return false
  }
  // APNS full implementation pending — falls back to no-op until JWT/.p8 wiring lands.
  console.warn('APNS full implementation pending — token suppressed:', token.slice(0, 4) + '…')
  return false
}
