import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const { data: users } = await supabase
      .from('enforcement_config')
      .select('user_id')
      .eq('enabled', true)

    if (!users || users.length === 0) {
      return new Response(JSON.stringify({ updated: 0 }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    let updated = 0

    for (const { user_id: userId } of users) {
      try {
        // Aggregate from all relevant tables
        const [
          photos, voice, journal, sessions, messages, directives,
          posts, denial, contracts, reframings,
        ] = await Promise.all([
          supabase.from('verification_photos').select('id', { count: 'exact', head: true }).eq('user_id', userId),
          supabase.from('voice_pitch_samples').select('id', { count: 'exact', head: true }).eq('user_id', userId),
          supabase.from('shame_journal').select('id', { count: 'exact', head: true }).eq('user_id', userId),
          supabase.from('conditioning_sessions_v2').select('id', { count: 'exact', head: true }).eq('user_id', userId),
          supabase.from('handler_messages').select('id', { count: 'exact', head: true }).eq('user_id', userId).eq('role', 'user'),
          supabase.from('handler_directives').select('id', { count: 'exact', head: true }).eq('user_id', userId).eq('action', 'send_device_command'),
          supabase.from('ai_generated_content').select('id', { count: 'exact', head: true }).eq('user_id', userId).eq('status', 'posted'),
          supabase.from('denial_streaks').select('days_completed').eq('user_id', userId).order('days_completed', { ascending: false }).limit(1),
          supabase.from('identity_contracts').select('id', { count: 'exact', head: true }).eq('user_id', userId),
          supabase.from('memory_reframings').select('id', { count: 'exact', head: true }).eq('user_id', userId),
        ])

        const photoCount = photos.count || 0
        const voiceCount = voice.count || 0
        const journalCount = journal.count || 0
        const sessionCount = sessions.count || 0
        const messageCount = messages.count || 0
        const directiveCount = directives.count || 0
        const postCount = posts.count || 0
        const longestDenial = denial.data?.[0]?.days_completed || 0

        // First engagement
        const { data: firstMsg } = await supabase
          .from('handler_messages')
          .select('created_at')
          .eq('user_id', userId)
          .order('created_at', { ascending: true })
          .limit(1)
          .maybeSingle()

        // Estimate minutes (2 min per message + 5 per session)
        const totalMinutes = messageCount * 2 + sessionCount * 5

        await supabase.from('feminization_investment').upsert({
          user_id: userId,
          total_minutes_in_app: totalMinutes,
          total_photos_submitted: photoCount,
          total_voice_recordings: voiceCount,
          total_journal_entries: journalCount,
          total_conditioning_sessions: sessionCount,
          total_handler_messages: messageCount,
          total_device_commands: directiveCount,
          total_public_posts: postCount,
          longest_denial_streak: longestDenial,
          first_engagement_at: firstMsg?.created_at || null,
          last_calculated_at: new Date().toISOString(),
        }, { onConflict: 'user_id' })

        updated++
      } catch (err) {
        console.error(`Investment update failed for ${userId}:`, err)
      }
    }

    return new Response(JSON.stringify({ updated }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : 'unknown' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
