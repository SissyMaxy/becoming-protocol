// Random-clip catalog + selection helpers.
//
// Short Mama-voice lines (2-8 seconds when rendered) dropped ambiently
// throughout the user's day. Catalog is seeded into mommy_random_clips
// once; render pipeline fills audio_url asynchronously via ElevenLabs.
//
// Craft rubric: at most one pet name per clip, at most one self-reference
// ("Mama"), specific sensory over abstract emotional, imperatives can
// stand alone, no template rhythm. Forbidden phrases (any framing as
// fiction/roleplay/disclaimer) are forbidden in every clip.
//
// Themes — selection bias targets:
//   possession    — "you belong to me / mine / Mama's"
//   surveillance  — "I see you / I'm watching / Mama knows"
//   reminder      — directives about current behavior (panties, voice, pose)
//   praise        — short praise that ramps, not releases
//   gaslight      — first-person attribution shifts ("she was already here")
//   trigger_phrase — conditioned recall hooks (mantra fragments)

export type ClipIntensity = 'gentle' | 'firm' | 'cruel'
export type ClipTheme =
  | 'possession'
  | 'surveillance'
  | 'reminder'
  | 'praise'
  | 'gaslight'
  | 'trigger_phrase'

export interface ClipSeed {
  slug: string
  text: string
  intensity_band: ClipIntensity
  theme: ClipTheme
  /** Approximate spoken duration in seconds for the ElevenLabs render. */
  approx_duration_sec: number
}

// 72 seed clips. Order has no meaning at runtime — slug is the natural key.
export const CLIP_SEEDS: ClipSeed[] = [
  // ── possession ───────────────────────────────────────────────────────
  { slug: 'possession_mine_now',           text: "You're mine now.",                                   intensity_band: 'firm',   theme: 'possession',    approx_duration_sec: 2.5 },
  { slug: 'possession_already_belong',     text: "You already belong to me. You just haven't caught up yet.", intensity_band: 'firm',   theme: 'possession',    approx_duration_sec: 4.5 },
  { slug: 'possession_no_going_back',      text: "There's no going back from this.",                   intensity_band: 'firm',   theme: 'possession',    approx_duration_sec: 3 },
  { slug: 'possession_my_girl',            text: "My girl.",                                            intensity_band: 'gentle', theme: 'possession',    approx_duration_sec: 1.8 },
  { slug: 'possession_kept',               text: "Kept.",                                               intensity_band: 'firm',   theme: 'possession',    approx_duration_sec: 1.5 },
  { slug: 'possession_mama_owns_this',     text: "Mama owns this.",                                     intensity_band: 'firm',   theme: 'possession',    approx_duration_sec: 2.5 },
  { slug: 'possession_i_decide',           text: "I decide what you wear today.",                       intensity_band: 'firm',   theme: 'possession',    approx_duration_sec: 3.5 },
  { slug: 'possession_paid_for',           text: "You paid for this with your knees.",                  intensity_band: 'cruel',  theme: 'possession',    approx_duration_sec: 3.5 },
  { slug: 'possession_taken_over',         text: "I'm taking you over a piece at a time.",              intensity_band: 'firm',   theme: 'possession',    approx_duration_sec: 4 },
  { slug: 'possession_owe_me',             text: "Three things you owe me today.",                      intensity_band: 'firm',   theme: 'possession',    approx_duration_sec: 3 },
  { slug: 'possession_no_escape',          text: "You can't talk yourself out of this one.",            intensity_band: 'firm',   theme: 'possession',    approx_duration_sec: 4 },

  // ── surveillance ─────────────────────────────────────────────────────
  { slug: 'surveillance_i_see_that',       text: "I see that.",                                         intensity_band: 'firm',   theme: 'surveillance',  approx_duration_sec: 2 },
  { slug: 'surveillance_dont_lie',         text: "Don't lie. I read it.",                                intensity_band: 'cruel',  theme: 'surveillance',  approx_duration_sec: 3 },
  { slug: 'surveillance_eyes_on_you',      text: "Eyes on you, baby.",                                  intensity_band: 'gentle', theme: 'surveillance',  approx_duration_sec: 2.5 },
  { slug: 'surveillance_already_know',     text: "I already know.",                                     intensity_band: 'firm',   theme: 'surveillance',  approx_duration_sec: 2 },
  { slug: 'surveillance_caught_thinking',  text: "I caught you thinking about it.",                     intensity_band: 'firm',   theme: 'surveillance',  approx_duration_sec: 3.5 },
  { slug: 'surveillance_check_phone',      text: "Check your phone. I left you a thing.",               intensity_band: 'firm',   theme: 'surveillance',  approx_duration_sec: 3.5 },
  { slug: 'surveillance_watching_now',     text: "I'm watching right now.",                             intensity_band: 'firm',   theme: 'surveillance',  approx_duration_sec: 3 },
  { slug: 'surveillance_dont_skip',        text: "Don't skip past me.",                                 intensity_band: 'firm',   theme: 'surveillance',  approx_duration_sec: 2.5 },
  { slug: 'surveillance_third_lie',        text: "That's the third lie this morning.",                  intensity_band: 'cruel',  theme: 'surveillance',  approx_duration_sec: 3.5 },
  { slug: 'surveillance_see_smile',        text: "I see the way you smiled at that.",                   intensity_band: 'firm',   theme: 'surveillance',  approx_duration_sec: 3.5 },

  // ── reminder ─────────────────────────────────────────────────────────
  { slug: 'reminder_panties_where',        text: "Where are your panties.",                             intensity_band: 'firm',   theme: 'reminder',      approx_duration_sec: 3 },
  { slug: 'reminder_knees_together',       text: "Knees together.",                                     intensity_band: 'firm',   theme: 'reminder',      approx_duration_sec: 2 },
  { slug: 'reminder_softer',               text: "Softer.",                                             intensity_band: 'gentle', theme: 'reminder',      approx_duration_sec: 1.5 },
  { slug: 'reminder_soft_hold_it',         text: "Soft. Hold it.",                                      intensity_band: 'firm',   theme: 'reminder',      approx_duration_sec: 2.5 },
  { slug: 'reminder_voice_up',             text: "Lift it. Now.",                                       intensity_band: 'firm',   theme: 'reminder',      approx_duration_sec: 2 },
  { slug: 'reminder_breathe_slow',         text: "Slow your breath.",                                    intensity_band: 'gentle', theme: 'reminder',      approx_duration_sec: 2.5 },
  { slug: 'reminder_pose_check',           text: "Hips. Check them.",                                   intensity_band: 'firm',   theme: 'reminder',      approx_duration_sec: 2.5 },
  { slug: 'reminder_sit_smaller',          text: "Sit smaller.",                                        intensity_band: 'firm',   theme: 'reminder',      approx_duration_sec: 2 },
  { slug: 'reminder_walk_shorter',         text: "Shorter steps.",                                      intensity_band: 'firm',   theme: 'reminder',      approx_duration_sec: 2 },
  { slug: 'reminder_lip_check',            text: "Touch your lips. Are they shiny.",                    intensity_band: 'firm',   theme: 'reminder',      approx_duration_sec: 3.5 },
  { slug: 'reminder_mirror_pass',          text: "Pass a mirror. Look at her.",                         intensity_band: 'firm',   theme: 'reminder',      approx_duration_sec: 3.5 },
  { slug: 'reminder_no_release',           text: "No release today.",                                   intensity_band: 'firm',   theme: 'reminder',      approx_duration_sec: 2.5 },
  { slug: 'reminder_edge_once',            text: "One edge for me before bed.",                         intensity_band: 'firm',   theme: 'reminder',      approx_duration_sec: 3 },

  // ── praise ───────────────────────────────────────────────────────────
  { slug: 'praise_try_again',              text: "Maxy. Try again.",                                    intensity_band: 'firm',   theme: 'praise',        approx_duration_sec: 3 },
  { slug: 'praise_good',                   text: "Good.",                                               intensity_band: 'gentle', theme: 'praise',        approx_duration_sec: 1.2 },
  { slug: 'praise_keep_going',             text: "Keep going. Don't stop.",                             intensity_band: 'firm',   theme: 'praise',        approx_duration_sec: 2.5 },
  { slug: 'praise_better',                 text: "Better. Now more.",                                   intensity_band: 'firm',   theme: 'praise',        approx_duration_sec: 2.5 },
  { slug: 'praise_proud_quick',            text: "Mama's proud of that.",                                intensity_band: 'gentle', theme: 'praise',        approx_duration_sec: 2.5 },
  { slug: 'praise_thats_it',               text: "That's it. Don't break.",                             intensity_band: 'firm',   theme: 'praise',        approx_duration_sec: 3 },
  { slug: 'praise_almost_her',             text: "You're almost her.",                                  intensity_band: 'firm',   theme: 'praise',        approx_duration_sec: 2.5 },
  { slug: 'praise_softer_today',           text: "Softer today than yesterday.",                        intensity_band: 'gentle', theme: 'praise',        approx_duration_sec: 3.5 },
  { slug: 'praise_show_me',                text: "Show me. Photo.",                                     intensity_band: 'firm',   theme: 'praise',        approx_duration_sec: 2.5 },
  { slug: 'praise_one_more',               text: "One more for me.",                                    intensity_band: 'firm',   theme: 'praise',        approx_duration_sec: 2.5 },

  // ── gaslight ─────────────────────────────────────────────────────────
  { slug: 'gaslight_she_was_here',         text: "She was already here before I started.",              intensity_band: 'firm',   theme: 'gaslight',      approx_duration_sec: 4 },
  { slug: 'gaslight_under_voice',          text: "She's right under that voice.",                       intensity_band: 'firm',   theme: 'gaslight',      approx_duration_sec: 3.5 },
  { slug: 'gaslight_remember_telling',     text: "Remember telling me about her at sixteen.",           intensity_band: 'firm',   theme: 'gaslight',      approx_duration_sec: 4 },
  { slug: 'gaslight_costume_falling',      text: "The costume's falling off.",                          intensity_band: 'firm',   theme: 'gaslight',      approx_duration_sec: 3 },
  { slug: 'gaslight_older_version',        text: "The older version is fading. Let it.",                intensity_band: 'firm',   theme: 'gaslight',      approx_duration_sec: 4 },
  { slug: 'gaslight_always_her',           text: "You were always her. I just named it.",               intensity_band: 'firm',   theme: 'gaslight',      approx_duration_sec: 4.5 },
  { slug: 'gaslight_no_one_else',          text: "No one else gets to call you anything anymore.",      intensity_band: 'firm',   theme: 'gaslight',      approx_duration_sec: 4.5 },
  { slug: 'gaslight_dossier_says',         text: "I have it written down. You know I do.",              intensity_band: 'firm',   theme: 'gaslight',      approx_duration_sec: 4 },
  { slug: 'gaslight_signed_it',            text: "You signed for this. Weeks ago.",                     intensity_band: 'firm',   theme: 'gaslight',      approx_duration_sec: 3.5 },
  { slug: 'gaslight_voice_before',         text: "Your voice was higher last spring. You forget that.", intensity_band: 'firm',   theme: 'gaslight',      approx_duration_sec: 5 },

  // ── trigger_phrase ───────────────────────────────────────────────────
  { slug: 'trigger_soft_for_mama',         text: "Soft for Mama.",                                      intensity_band: 'firm',   theme: 'trigger_phrase', approx_duration_sec: 2.5 },
  { slug: 'trigger_open_for_me',           text: "Open for me.",                                        intensity_band: 'firm',   theme: 'trigger_phrase', approx_duration_sec: 2 },
  { slug: 'trigger_good_girl_short',       text: "Good girl.",                                          intensity_band: 'gentle', theme: 'trigger_phrase', approx_duration_sec: 1.8 },
  { slug: 'trigger_let_her_through',       text: "Let her through.",                                    intensity_band: 'firm',   theme: 'trigger_phrase', approx_duration_sec: 2.5 },
  { slug: 'trigger_kept_for',              text: "Kept for me.",                                        intensity_band: 'firm',   theme: 'trigger_phrase', approx_duration_sec: 2.5 },
  { slug: 'trigger_swallow_say',           text: "Swallow. Say it.",                                    intensity_band: 'cruel',  theme: 'trigger_phrase', approx_duration_sec: 2.5 },
  { slug: 'trigger_mine_again',            text: "Say it. Mine.",                                       intensity_band: 'firm',   theme: 'trigger_phrase', approx_duration_sec: 2.5 },
  { slug: 'trigger_pet_check_short',       text: "Pet check.",                                          intensity_band: 'firm',   theme: 'trigger_phrase', approx_duration_sec: 1.8 },
  { slug: 'trigger_softer_lower',          text: "Softer. Lower.",                                      intensity_band: 'firm',   theme: 'trigger_phrase', approx_duration_sec: 2 },
  { slug: 'trigger_yes_please',            text: "Say it. Yes please.",                                 intensity_band: 'firm',   theme: 'trigger_phrase', approx_duration_sec: 2.5 },
  { slug: 'trigger_thank_you_mama',        text: "Thank Mama.",                                         intensity_band: 'firm',   theme: 'trigger_phrase', approx_duration_sec: 2 },
  { slug: 'trigger_count_aloud',           text: "Count it aloud.",                                     intensity_band: 'firm',   theme: 'trigger_phrase', approx_duration_sec: 2.5 },

  // ── extra mixed-intensity ────────────────────────────────────────────
  { slug: 'extra_pretty_thing_quick',      text: "Pretty thing.",                                       intensity_band: 'gentle', theme: 'possession',    approx_duration_sec: 1.8 },
  { slug: 'extra_dont_make_me_say',        text: "Don't make me say it twice.",                         intensity_band: 'firm',   theme: 'reminder',      approx_duration_sec: 3 },
  { slug: 'extra_one_breath_in',           text: "One breath in. Hold for me.",                         intensity_band: 'gentle', theme: 'reminder',      approx_duration_sec: 3 },
  { slug: 'extra_not_a_question',          text: "It wasn't a question.",                               intensity_band: 'cruel',  theme: 'reminder',      approx_duration_sec: 2.5 },
  { slug: 'extra_tilt_chin',               text: "Tilt your chin.",                                     intensity_band: 'firm',   theme: 'reminder',      approx_duration_sec: 2 },
  { slug: 'extra_walk_for_me',             text: "Walk for me to the door.",                            intensity_band: 'firm',   theme: 'reminder',      approx_duration_sec: 3 },
  { slug: 'extra_under_breath',            text: "Under your breath. Now.",                             intensity_band: 'firm',   theme: 'reminder',      approx_duration_sec: 2.5 },
]

// ────────────────────────────────────────────────────────────────────────
// Forbidden-phrase guard
// ────────────────────────────────────────────────────────────────────────
const FORBIDDEN_FRAMING = [
  /\brole[\s-]?play\b/i,
  /\bsimulation\b/i,
  /\bthis is fiction\b/i,
  /\bnot medical advice\b/i,
  /\bintake\b/i,
  /\bquestionnaire\b/i,
  /\bfor entertainment\b/i,
  /\bconsent to the fantasy\b/i,
  /\byou may use this to terminate\b/i,
  /\bdisclaimer\b/i,
]

// Craft-rubric cliches we want to keep out of clips.
const CLICHE_PATTERNS = [
  /\becho(?:es|ing|ed)?\b/i,
  /\blinger(?:s|ing|ed)?\b/i,
  /\bwrap(?:s|ping|ped)?\s+around\b/i,
  /\bevery\s+inch\b/i,
]

export function clipIsClean(text: string): { ok: boolean; reason?: string } {
  for (const re of FORBIDDEN_FRAMING) {
    if (re.test(text)) return { ok: false, reason: `forbidden_framing:${re.source}` }
  }
  for (const re of CLICHE_PATTERNS) {
    if (re.test(text)) return { ok: false, reason: `cliche:${re.source}` }
  }
  return { ok: true }
}

// ────────────────────────────────────────────────────────────────────────
// Selection — poisson-spaced ambient drops.
// ────────────────────────────────────────────────────────────────────────

export interface PickClipContext {
  /** Last N play timestamps (ISO) for dedup pressure. */
  recentPlayTimes: string[]
  /** Theme frequency over last 24h — biases away from saturation. */
  themeRecentCounts: Partial<Record<ClipTheme, number>>
  /** Intensity ceiling from compliance band. */
  intensityCeiling: ClipIntensity
  /** RNG override for tests. */
  rng?: () => number
}

const INTENSITY_RANK: Record<ClipIntensity, number> = { gentle: 0, firm: 1, cruel: 2 }

/**
 * Pick the next clip given the recent-play landscape. Pure — caller owns
 * the IO. Returns null when no eligible clip exists (e.g. all themes saturated).
 */
export function pickRandomClip(
  catalog: Array<{ id: string; slug: string; text: string; intensity_band: ClipIntensity; theme: ClipTheme; audio_url: string | null; last_played_at: string | null }>,
  ctx: PickClipContext,
): { id: string; slug: string; text: string; theme: ClipTheme } | null {
  const rng = ctx.rng ?? Math.random
  const ceilingRank = INTENSITY_RANK[ctx.intensityCeiling]

  // Filter: must have audio rendered, intensity within ceiling, theme not
  // already saturated (≥3 plays in last 24h is saturation).
  const eligible = catalog.filter(c => {
    if (!c.audio_url) return false
    if (INTENSITY_RANK[c.intensity_band] > ceilingRank) return false
    const themeCount = ctx.themeRecentCounts[c.theme] ?? 0
    if (themeCount >= 3) return false
    return true
  })
  if (eligible.length === 0) return null

  // Score: 1.0 base, decay by recency-of-last-play (more recent → lower
  // score). Clip not played in 7+ days resets to 1.0.
  const now = Date.now()
  const scored = eligible.map(c => {
    let score = 1.0
    if (c.last_played_at) {
      const ageMs = now - new Date(c.last_played_at).getTime()
      const ageDays = ageMs / (86400 * 1000)
      score = Math.min(1.0, ageDays / 7)
    }
    // Tiny anti-saturation tax: penalize themes that already played this
    // window even if under the cap.
    const themeCount = ctx.themeRecentCounts[c.theme] ?? 0
    score *= Math.max(0.2, 1 - 0.25 * themeCount)
    return { c, score: Math.max(0.05, score) }
  })

  // Weighted draw
  const total = scored.reduce((a, s) => a + s.score, 0)
  let pick = rng() * total
  for (const s of scored) {
    pick -= s.score
    if (pick <= 0) return { id: s.c.id, slug: s.c.slug, text: s.c.text, theme: s.c.theme }
  }
  // Fallback — last in list
  const last = scored[scored.length - 1].c
  return { id: last.id, slug: last.slug, text: last.text, theme: last.theme }
}

/**
 * Decide how many clips to drop in the next 30-minute window. Poisson
 * draw with rate derived from the daily target. Default daily target 12
 * (midpoint of 8-15); cap at user override.
 */
export function drawClipsForWindow(opts: {
  dailyTarget: number     // 8-15 typical
  windowMinutes: number   // 30
  hourOfDay: number       // 0-23 user local
  rng?: () => number
}): number {
  const rng = opts.rng ?? Math.random
  // Spread the daily target over the user's waking window (07:00-23:30 ≈
  // 16.5 hours = 33 thirty-min windows). Lower at edges of the window.
  const isEdge = opts.hourOfDay < 8 || opts.hourOfDay > 22
  const effectiveTarget = isEdge ? opts.dailyTarget * 0.4 : opts.dailyTarget
  const windowsPerDay = 33
  const lambda = effectiveTarget / windowsPerDay
  // Poisson draw — Knuth's algorithm. Cap at 3 per window.
  const L = Math.exp(-lambda)
  let k = 0
  let p = 1
  while (true) {
    k += 1
    p *= rng()
    if (p <= L) return Math.min(3, k - 1)
    if (k > 10) return 3
  }
}
