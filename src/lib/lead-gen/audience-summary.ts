// audience-summary — src/lib mirror of supabase/functions/_shared/audience-summary.ts.
// Keep parallel. Pure aggregation; no DB/no LLM.

export interface FunnelEventRow {
  event_type: string
  channel: string
  value_cents: number
  occurred_at: string
  contact_id: string | null
}

export interface ContactRow {
  id: string
  source: string
  status: string
  value_tier: number
  archetype: string | null
  first_contact_at: string
  realized_value_cents: number
  projected_ltv_cents: number
  source_handle: string
  last_message_excerpt: string | null
}

export interface FunnelDigest {
  week_start: string
  week_end: string
  new_followers_count: number
  new_responses_count: number
  new_purchases_count: number
  new_subs_count: number
  blocked_count: number
  total_new_contacts: number
  total_revenue_cents: number
  hottest_channel: string | null
  hottest_channel_acquired: number
  top_contacts: Array<{ handle: string; archetype: string | null; tier: number; reason: string }>
  observations: string[]
}

export function weekBoundsUtc(now: Date): { weekStart: Date; weekEnd: Date } {
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
  const dow = today.getUTCDay()
  const daysBackToMonday = dow === 0 ? 6 : dow - 1
  const weekStart = new Date(today.getTime() - daysBackToMonday * 86400000)
  const weekEnd = new Date(weekStart.getTime() + 6 * 86400000)
  return { weekStart, weekEnd }
}

export function aggregateWeeklyFunnel(args: {
  weekStart: Date
  weekEnd: Date
  events: FunnelEventRow[]
  contacts: ContactRow[]
}): FunnelDigest {
  const startIso = args.weekStart.toISOString().slice(0, 10)
  const endIso = args.weekEnd.toISOString().slice(0, 10)
  const inWindow = (iso: string) => { const d = iso.slice(0, 10); return d >= startIso && d <= endIso }

  const events = args.events.filter(e => inWindow(e.occurred_at))
  const newContactsThisWeek = args.contacts.filter(c => inWindow(c.first_contact_at))

  let new_followers_count = 0, new_responses_count = 0, new_purchases_count = 0
  let new_subs_count = 0, blocked_count = 0, total_revenue_cents = 0
  const channelAcquired: Record<string, number> = {}

  for (const c of newContactsThisWeek) channelAcquired[c.source] = (channelAcquired[c.source] ?? 0) + 1
  for (const e of events) {
    if (e.event_type === 'social_followed') new_followers_count += 1
    else if (e.event_type === 'response_received') new_responses_count += 1
    else if (e.event_type === 'content_purchased') new_purchases_count += 1
    else if (e.event_type === 'subscription_started' || e.event_type === 'subscription_renewed') new_subs_count += 1
    else if (e.event_type === 'blocked') blocked_count += 1
    total_revenue_cents += e.value_cents ?? 0
  }

  let hottest_channel: string | null = null
  let hottest_channel_acquired = 0
  for (const [chan, n] of Object.entries(channelAcquired)) {
    if (n > hottest_channel_acquired) { hottest_channel = chan; hottest_channel_acquired = n }
  }

  const top_contacts = [...newContactsThisWeek]
    .filter(c => c.status !== 'blocked')
    .sort((a, b) => (b.value_tier - a.value_tier) || (b.realized_value_cents - a.realized_value_cents))
    .slice(0, 3)
    .map(c => ({
      handle: c.source_handle,
      archetype: c.archetype,
      tier: c.value_tier,
      reason: c.realized_value_cents > 0 ? 'already paying'
        : c.archetype === 'paying_first_time' ? 'pricing-ready'
        : c.value_tier >= 4 ? 'high signal' : 'warming',
    }))

  const observations: string[] = []
  if (new_followers_count > 0) observations.push(`${new_followers_count} new follower${new_followers_count === 1 ? '' : 's'} this week`)
  if (new_purchases_count > 0) observations.push(`${new_purchases_count} content purchase${new_purchases_count === 1 ? '' : 's'}`)
  if (new_subs_count > 0) observations.push(`${new_subs_count} new subscriber${new_subs_count === 1 ? '' : 's'}`)
  if (blocked_count > 0) observations.push(`${blocked_count} blocked for safety reasons`)
  if (hottest_channel && hottest_channel_acquired >= 2) observations.push(`${hottest_channel} is the hottest acquisition channel`)
  const respondedSubset = top_contacts.filter(t => t.archetype !== 'chatter_only').length
  if (respondedSubset > 0) observations.push(`${respondedSubset} new contact${respondedSubset === 1 ? '' : 's'} already messaged her`)

  return {
    week_start: startIso, week_end: endIso,
    new_followers_count, new_responses_count, new_purchases_count, new_subs_count, blocked_count,
    total_new_contacts: newContactsThisWeek.length,
    total_revenue_cents,
    hottest_channel, hottest_channel_acquired,
    top_contacts, observations,
  }
}

export function digestToPlainVoice(d: FunnelDigest): string {
  const parts: string[] = []
  if (d.total_new_contacts === 0) {
    parts.push('Quiet week. No new contacts came in.')
  } else {
    parts.push(`New people showed up this week.`)
    if (d.new_followers_count > 0) parts.push(`Some followed her on her socials.`)
    if (d.new_responses_count > 0) parts.push(`Some already wrote back.`)
    if (d.new_purchases_count > 0) parts.push(`Some bought something.`)
    if (d.new_subs_count > 0) parts.push(`Some subscribed.`)
  }
  if (d.hottest_channel) parts.push(`${d.hottest_channel.charAt(0).toUpperCase()}${d.hottest_channel.slice(1)} is the loudest channel right now.`)
  if (d.top_contacts.length > 0) {
    const teaser = d.top_contacts.map(t => `${t.handle} (${t.reason})`).join(', ')
    parts.push(`The ones worth watching: ${teaser}.`)
  }
  if (d.blocked_count > 0) parts.push(`Some were blocked for safety reasons.`)
  return parts.join(' ')
}
