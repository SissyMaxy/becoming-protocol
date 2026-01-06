// Edge function to schedule random notifications for users
// Deploy with: supabase functions deploy schedule-notifications
// Set up cron job to run every 6 hours

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Default notification type weights
const DEFAULT_TYPE_WEIGHTS: Record<string, number> = {
  micro_task: 40,
  affirmation: 25,
  content_unlock: 20,
  challenge: 10,
  jackpot: 5,
}

interface UserSettings {
  user_id: string
  notifications_enabled: boolean
  earliest_hour: number
  latest_hour: number
  min_notifications_per_day: number
  max_notifications_per_day: number
  type_weights: Record<string, number>
}

interface NotificationTemplate {
  id: string
  notification_type: string
  title: string
  body: string
  action_text: string | null
  points: number
  weight: number
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

    // Get all users with notifications enabled
    const { data: users, error: usersError } = await supabase
      .from('user_notification_settings')
      .select('*')
      .eq('notifications_enabled', true)

    if (usersError) {
      console.error('Failed to get users:', usersError)
      throw usersError
    }

    if (!users || users.length === 0) {
      return new Response(
        JSON.stringify({ scheduled: 0, message: 'No users with notifications enabled' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Get notification templates
    const { data: templates, error: templatesError } = await supabase
      .from('notification_templates')
      .select('*')
      .eq('is_active', true)

    if (templatesError) {
      console.error('Failed to get templates:', templatesError)
      throw templatesError
    }

    let totalScheduled = 0
    const today = new Date().toISOString().split('T')[0]

    for (const userSettings of users as UserSettings[]) {
      // Get already scheduled notifications for today
      const { data: existing, error: existingError } = await supabase
        .from('scheduled_notifications')
        .select('id')
        .eq('user_id', userSettings.user_id)
        .gte('scheduled_for', `${today}T00:00:00Z`)
        .lt('scheduled_for', `${today}T23:59:59Z`)
        .eq('status', 'pending')

      if (existingError) {
        console.error('Failed to get existing notifications:', existingError)
        continue
      }

      const existingCount = existing?.length || 0

      // Calculate target count (random between min and max)
      const targetCount = Math.floor(
        userSettings.min_notifications_per_day +
        Math.random() * (userSettings.max_notifications_per_day - userSettings.min_notifications_per_day)
      )

      // Skip if we have enough
      if (existingCount >= targetCount) {
        continue
      }

      const toSchedule = targetCount - existingCount

      // Generate random times within the user's window
      const times = generateRandomTimes(
        userSettings.earliest_hour,
        userSettings.latest_hour,
        toSchedule
      )

      // Get user's type weights or use defaults
      const weights = userSettings.type_weights || DEFAULT_TYPE_WEIGHTS

      for (const scheduledTime of times) {
        // Select notification type based on weights
        const notificationType = weightedRandom(weights)

        // Get random template of this type
        const typeTemplates = (templates as NotificationTemplate[])
          .filter(t => t.notification_type === notificationType)

        if (typeTemplates.length === 0) {
          continue
        }

        const template = weightedRandomTemplate(typeTemplates)

        // Determine if this has urgency window (30% chance)
        const hasUrgency = Math.random() < 0.3
        const expiresAt = hasUrgency
          ? new Date(scheduledTime.getTime() + 5 * 60 * 1000).toISOString() // 5 min
          : null
        const bonusMultiplier = hasUrgency ? 1.5 : 1.0

        // Insert scheduled notification
        const { error: insertError } = await supabase
          .from('scheduled_notifications')
          .insert({
            user_id: userSettings.user_id,
            notification_type: notificationType,
            scheduled_for: scheduledTime.toISOString(),
            expires_at: expiresAt,
            payload: {
              title: template.title,
              body: template.body,
              action: template.action_text,
            },
            points_potential: template.points,
            bonus_multiplier: bonusMultiplier,
            status: 'pending',
          })

        if (insertError) {
          console.error('Failed to schedule notification:', insertError)
          continue
        }

        totalScheduled++
      }
    }

    return new Response(
      JSON.stringify({
        scheduled: totalScheduled,
        usersProcessed: users.length,
        timestamp: new Date().toISOString(),
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    console.error('Error in schedule-notifications:', error)
    return new Response(
      JSON.stringify({ error: (error as Error).message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})

/**
 * Generate random times within a time window
 */
function generateRandomTimes(
  earliestHour: number,
  latestHour: number,
  count: number
): Date[] {
  const today = new Date()
  const times: Date[] = []
  const minGap = 60 // minutes between notifications

  for (let i = 0; i < count; i++) {
    let attempts = 0
    let validTime: Date | null = null

    while (!validTime && attempts < 10) {
      // Random hour within window
      const hour = earliestHour + Math.random() * (latestHour - earliestHour)
      const minute = Math.floor(Math.random() * 60)

      const time = new Date(today)
      time.setHours(Math.floor(hour), minute, 0, 0)

      // Check gap from existing times
      const tooClose = times.some(
        t => Math.abs(t.getTime() - time.getTime()) < minGap * 60 * 1000
      )

      // Must be in the future
      if (!tooClose && time > new Date()) {
        validTime = time
      }

      attempts++
    }

    if (validTime) {
      times.push(validTime)
    }
  }

  return times.sort((a, b) => a.getTime() - b.getTime())
}

/**
 * Select a type based on weights
 */
function weightedRandom(weights: Record<string, number>): string {
  const total = Object.values(weights).reduce((sum, w) => sum + w, 0)
  let random = Math.random() * total

  for (const [type, weight] of Object.entries(weights)) {
    random -= weight
    if (random <= 0) {
      return type
    }
  }

  return Object.keys(weights)[0]
}

/**
 * Select a template based on weights
 */
function weightedRandomTemplate(templates: NotificationTemplate[]): NotificationTemplate {
  const totalWeight = templates.reduce((sum, t) => sum + t.weight, 0)
  let random = Math.random() * totalWeight

  for (const template of templates) {
    random -= template.weight
    if (random <= 0) {
      return template
    }
  }

  return templates[0]
}
