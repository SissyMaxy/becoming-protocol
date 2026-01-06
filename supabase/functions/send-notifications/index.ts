// Edge function to send pending notifications
// Deploy with: supabase functions deploy send-notifications
// Set up cron job to run every minute

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

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

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error('Missing Supabase environment variables')
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey)
    const now = new Date().toISOString()

    // Mark expired notifications
    const { data: expired, error: expiredError } = await supabase
      .from('scheduled_notifications')
      .update({ status: 'expired' })
      .eq('status', 'pending')
      .not('expires_at', 'is', null)
      .lt('expires_at', now)
      .select('id')

    if (expiredError) {
      console.error('Failed to mark expired notifications:', expiredError)
    }

    const expiredCount = expired?.length || 0

    // Get pending notifications that are due
    const { data: notifications, error: notificationsError } = await supabase
      .from('scheduled_notifications')
      .select('*')
      .eq('status', 'pending')
      .lte('scheduled_for', now)
      .order('scheduled_for', { ascending: true })
      .limit(100) // Process in batches

    if (notificationsError) {
      console.error('Failed to get pending notifications:', notificationsError)
      throw notificationsError
    }

    if (!notifications || notifications.length === 0) {
      return new Response(
        JSON.stringify({
          sent: 0,
          expired: expiredCount,
          message: 'No pending notifications to send',
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Get unique user IDs
    const userIds = [...new Set(notifications.map((n: ScheduledNotification) => n.user_id))]

    // Get push tokens for all users
    const { data: userSettings, error: settingsError } = await supabase
      .from('user_notification_settings')
      .select('user_id, push_token, push_provider')
      .in('user_id', userIds)
      .eq('notifications_enabled', true)

    if (settingsError) {
      console.error('Failed to get user settings:', settingsError)
      throw settingsError
    }

    // Create lookup map
    const tokenMap = new Map<string, UserNotificationSettings>()
    for (const settings of (userSettings || []) as UserNotificationSettings[]) {
      if (settings.push_token) {
        tokenMap.set(settings.user_id, settings)
      }
    }

    let sentCount = 0
    let failedCount = 0

    // Process each notification
    for (const notification of notifications as ScheduledNotification[]) {
      const userToken = tokenMap.get(notification.user_id)

      if (!userToken?.push_token) {
        // No push token - mark as sent anyway (user will see in-app)
        await supabase
          .from('scheduled_notifications')
          .update({
            status: 'sent',
            sent_at: now,
          })
          .eq('id', notification.id)

        sentCount++
        continue
      }

      try {
        // Send push notification based on provider
        const success = await sendPushNotification(
          userToken.push_token,
          userToken.push_provider || 'expo',
          notification
        )

        if (success) {
          await supabase
            .from('scheduled_notifications')
            .update({
              status: 'sent',
              sent_at: now,
            })
            .eq('id', notification.id)

          sentCount++
        } else {
          failedCount++
        }
      } catch (error) {
        console.error('Failed to send notification:', notification.id, error)
        failedCount++
      }
    }

    return new Response(
      JSON.stringify({
        sent: sentCount,
        failed: failedCount,
        expired: expiredCount,
        timestamp: now,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    console.error('Error in send-notifications:', error)
    return new Response(
      JSON.stringify({ error: (error as Error).message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})

/**
 * Send push notification via the appropriate provider
 */
async function sendPushNotification(
  token: string,
  provider: string,
  notification: ScheduledNotification
): Promise<boolean> {
  const { payload, points_potential, bonus_multiplier, notification_type, id } = notification

  // Build notification data
  const notificationData = {
    notification_id: id,
    type: notification_type,
    points: points_potential,
    multiplier: bonus_multiplier,
    expires_at: notification.expires_at,
    ...payload.data,
  }

  switch (provider) {
    case 'expo':
      return sendExpoPush(token, payload, notificationData)
    case 'fcm':
      return sendFCMPush(token, payload, notificationData)
    case 'apns':
      return sendAPNSPush(token, payload, notificationData)
    default:
      console.warn('Unknown push provider:', provider)
      return sendExpoPush(token, payload, notificationData) // Default to Expo
  }
}

/**
 * Send via Expo Push API
 */
async function sendExpoPush(
  token: string,
  payload: ScheduledNotification['payload'],
  data: Record<string, unknown>
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
        data: data,
        sound: 'default',
        badge: 1,
        channelId: 'default',
        priority: 'high',
        // Add action button if specified
        categoryId: payload.action ? 'action' : undefined,
      }),
    })

    const result = await response.json()

    if (result.data?.status === 'ok') {
      return true
    }

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

/**
 * Send via Firebase Cloud Messaging
 */
async function sendFCMPush(
  token: string,
  payload: ScheduledNotification['payload'],
  data: Record<string, unknown>
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
          Object.entries(data).map(([k, v]) => [k, String(v)])
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

/**
 * Send via Apple Push Notification Service
 * Note: APNS requires JWT authentication and is more complex
 */
async function sendAPNSPush(
  token: string,
  payload: ScheduledNotification['payload'],
  data: Record<string, unknown>
): Promise<boolean> {
  const teamId = Deno.env.get('APNS_TEAM_ID')
  const keyId = Deno.env.get('APNS_KEY_ID')
  const bundleId = Deno.env.get('APNS_BUNDLE_ID')

  if (!teamId || !keyId || !bundleId) {
    console.warn('APNS not fully configured, skipping APNS push')
    return false
  }

  // APNS requires JWT token generation with private key
  // This is a simplified placeholder - full implementation would need:
  // 1. Load .p8 private key from secrets
  // 2. Generate JWT with ES256 algorithm
  // 3. Make request to api.push.apple.com

  console.warn('APNS full implementation pending - using Expo fallback')
  return false
}
