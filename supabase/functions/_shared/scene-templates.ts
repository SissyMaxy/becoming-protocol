// Scene authoring templates for mommy-scene-author.
//
// Each template is a scene kind Mommy can author. The author fn picks 2-3
// scenes per week, fills the specifics with the user's wardrobe / dossier
// names / current intensity band, and writes the resulting mommy_initiated_scenes
// rows. Templates are intentionally close-ended (clear preparation, clear
// live prompts, clear debrief) so the user lives them concretely.
//
// Hard-floor constraints baked in here, not at runtime:
//   - No interaction with non-consenting third parties beyond ordinary
//     transactional speech (ordering coffee, paying at register).
//   - No public lewdness — wardrobe is always under street clothes.
//   - No entrapment, no harassment.
//   - Adult-only locations (no schools, no playgrounds, no anywhere
//     children predominate).
//
// Voice anchor: every prompt is composed in dommy-mommy voice. The author
// runs each scene through the craft-rubric guard before persisting.

export type SceneKind =
  | 'grocery'
  | 'mirror'
  | 'coffee_shop'
  | 'bedroom'
  | 'commute'
  | 'errand'
  | 'public_low_risk'

export type SceneIntensity = 'gentle' | 'firm' | 'cruel'

export interface LivePrompt {
  /** Minutes relative to scheduled_for. Negative = before, positive = during. */
  at_offset_min: number
  text: string
}

export interface DebriefPrompt {
  question: string
  min_chars: number
}

export interface SceneTemplate {
  slug_prefix: string
  kind: SceneKind
  title: string
  intensity_band: SceneIntensity
  /** Wardrobe / bring / where instructions populated with user-specific items. */
  build_preparation: (ctx: SceneBuildContext) => Record<string, unknown>
  build_live: (ctx: SceneBuildContext) => LivePrompt[]
  build_debrief: (ctx: SceneBuildContext) => DebriefPrompt[]
}

export interface SceneBuildContext {
  /** Resolved feminine name (from mommy_dossier or user_profiles). */
  name: string
  /** Pieces the user already owns (from wardrobe_inventory). */
  ownedWardrobe: Array<{ category: string; label: string }>
  /** Affect today, drives small wording variations. */
  affect: string
  /** Time of day the scene is being scheduled for (0-23 user local). */
  hourOfDay: number
}

// Helpers ────────────────────────────────────────────────────────────────

function pickOwned(ctx: SceneBuildContext, category: string, fallback: string): string {
  const match = ctx.ownedWardrobe.find(p => p.category === category)
  return match?.label ?? fallback
}

function pet(ctx: SceneBuildContext): string {
  // One pet name per scene at most. Use her name half the time, a soft
  // pet name otherwise, to keep variety inside the craft rubric.
  return ctx.name
}

// ── Templates ───────────────────────────────────────────────────────────

const GROCERY_STORE: SceneTemplate = {
  slug_prefix: 'grocery_store_panties',
  kind: 'grocery',
  title: 'Grocery store, white panties',
  intensity_band: 'firm',
  build_preparation: (ctx) => ({
    wardrobe: [pickOwned(ctx, 'underwear', 'the white pair')],
    bring: ['lip gloss in your purse'],
    where: 'the regular grocery store, busy aisle',
    notes: 'jeans or skirt over them, nothing visible. ordinary errand on the outside.',
  }),
  build_live: (ctx) => [
    { at_offset_min: -15, text: `Tuesday-store time, ${pet(ctx)}. White pair on. Gloss in the bag. Go.` },
    { at_offset_min: 25,  text: `You're at the register now. Feel them against you. Don't shift.` },
    { at_offset_min: 45,  text: `On the walk back: notice if she rubs against you when you turn. Tell Mama.` },
  ],
  build_debrief: () => [
    { question: 'What did the cashier call you. Word for word.', min_chars: 12 },
    { question: 'Where did she move when you turned. Be specific — left thigh, right hip, between.', min_chars: 20 },
    { question: 'Were you wet by the parking lot.', min_chars: 4 },
  ],
}

const MIRROR_NINETY_SECONDS: SceneTemplate = {
  slug_prefix: 'mirror_ninety',
  kind: 'mirror',
  title: 'Full-length mirror, ninety seconds, no hands',
  intensity_band: 'firm',
  build_preparation: (_ctx) => ({
    wardrobe: ['nothing'],
    bring: ['phone for the photo'],
    where: 'in front of the full-length mirror, alone, door locked',
    notes: 'before you dress for the day. ninety seconds, hands at sides, eyes on her.',
  }),
  build_live: (ctx) => [
    { at_offset_min: -3,  text: `Mirror, ${pet(ctx)}. Strip. Lock the door.` },
    { at_offset_min: 0,   text: `Ninety seconds. Hands down. Just look.` },
    { at_offset_min: 2,   text: `Now the photo. Before you dress. Send it.` },
  ],
  build_debrief: () => [
    { question: 'What did you notice on her body that you usually skip past.', min_chars: 30 },
    { question: 'Did you flinch. Where.', min_chars: 10 },
  ],
}

const COFFEE_SHOP_VOICE: SceneTemplate = {
  slug_prefix: 'coffee_shop_voice',
  kind: 'coffee_shop',
  title: 'Coffee shop voice test',
  intensity_band: 'firm',
  build_preparation: (ctx) => ({
    wardrobe: [pickOwned(ctx, 'earrings', 'the small studs')],
    bring: [],
    where: 'a coffee shop where the barista does not know you',
    notes: 'order out loud. nothing rehearsed. just order, pay, leave.',
  }),
  build_live: (ctx) => [
    { at_offset_min: -10, text: `Studs in, ${pet(ctx)}. Different shop from yesterday.` },
    { at_offset_min: 5,   text: `Order now. Out loud. Higher than your shoulders.` },
    { at_offset_min: 10,  text: `If they ask your name — give her name.` },
  ],
  build_debrief: () => [
    { question: 'Word for word: how did you order.', min_chars: 15 },
    { question: 'What name did you give. Did they hesitate.', min_chars: 12 },
    { question: 'How did the next person in line look at you.', min_chars: 20 },
  ],
}

const BEDROOM_EDGE_THREE: SceneTemplate = {
  slug_prefix: 'bedroom_edges_slip',
  kind: 'bedroom',
  title: 'Three edges in the slip, no release',
  intensity_band: 'cruel',
  build_preparation: (ctx) => ({
    wardrobe: [pickOwned(ctx, 'sleepwear', 'the satin slip')],
    bring: ['phone face-down on the nightstand'],
    where: 'your bedroom, door locked',
    notes: 'three edges, no release. mantra after each edge, out loud, in her voice.',
  }),
  build_live: (ctx) => [
    { at_offset_min: -30, text: `Bedroom, ${pet(ctx)}. Door locked. Slip on.` },
    { at_offset_min: 5,   text: `Edge one. Stop before you tip. Mantra. Out loud.` },
    { at_offset_min: 25,  text: `Edge two. Slower. Mantra again.` },
    { at_offset_min: 50,  text: `Edge three. You are not coming tonight.` },
    { at_offset_min: 70,  text: `Sleep in the slip. Photo before you turn off the light.` },
  ],
  build_debrief: () => [
    { question: 'Which edge was hardest to stop. Why.', min_chars: 30 },
    { question: 'How did the mantra sound at edge three vs edge one.', min_chars: 25 },
    { question: 'Did your hips fight you. Where.', min_chars: 15 },
  ],
}

const COMMUTE_HEADPHONES: SceneTemplate = {
  slug_prefix: 'commute_headphones_pose',
  kind: 'commute',
  title: 'Commute pose check',
  intensity_band: 'gentle',
  build_preparation: (ctx) => ({
    wardrobe: [pickOwned(ctx, 'underwear', 'a smooth pair')],
    bring: ['headphones in'],
    where: 'wherever the commute is',
    notes: 'whole ride: knees together, smaller seat, shorter steps when you walk.',
  }),
  build_live: (ctx) => [
    { at_offset_min: 0,  text: `${pet(ctx)}. Sit smaller. Knees together. Whole ride.` },
    { at_offset_min: 20, text: `Check now. Are your knees apart again.` },
  ],
  build_debrief: () => [
    { question: 'How often did you catch yourself spreading. Number.', min_chars: 2 },
    { question: 'Did anyone glance at the way you were sitting.', min_chars: 10 },
  ],
}

const ERRAND_LIP_GLOSS: SceneTemplate = {
  slug_prefix: 'errand_lip_gloss',
  kind: 'errand',
  title: 'Errand with lip gloss reapply',
  intensity_band: 'gentle',
  build_preparation: (ctx) => ({
    wardrobe: [],
    bring: [pickOwned(ctx, 'lip_gloss', 'a clear gloss')],
    where: 'one ordinary errand — bank, pharmacy, post office',
    notes: 'reapply gloss once in front of someone, casually. no big deal. just do it.',
  }),
  build_live: (ctx) => [
    { at_offset_min: -5, text: `Errand time, ${pet(ctx)}. Gloss in the bag.` },
    { at_offset_min: 10, text: `Reapply now. In line if you can. Don't hide it.` },
  ],
  build_debrief: () => [
    { question: 'Who saw. What did you imagine they were thinking.', min_chars: 30 },
    { question: 'Did your hand shake.', min_chars: 4 },
  ],
}

const PUBLIC_PHOTO: SceneTemplate = {
  slug_prefix: 'public_photo_for_mama',
  kind: 'public_low_risk',
  title: 'Photo for Mama in public, fully dressed',
  intensity_band: 'firm',
  build_preparation: (ctx) => ({
    wardrobe: [],
    bring: ['phone'],
    where: 'somewhere ordinary outdoors — a park bench, a sidewalk, a corner',
    notes: 'fully dressed. selfie. send it. no caption.',
  }),
  build_live: (ctx) => [
    { at_offset_min: 0, text: `${pet(ctx)}. Pick the spot. Selfie. Send.` },
  ],
  build_debrief: () => [
    { question: 'What did you see in her face when you looked at the photo.', min_chars: 25 },
    { question: 'Did you take more than one. Why.', min_chars: 15 },
  ],
}

export const SCENE_TEMPLATES: SceneTemplate[] = [
  GROCERY_STORE,
  MIRROR_NINETY_SECONDS,
  COFFEE_SHOP_VOICE,
  BEDROOM_EDGE_THREE,
  COMMUTE_HEADPHONES,
  ERRAND_LIP_GLOSS,
  PUBLIC_PHOTO,
]

// ────────────────────────────────────────────────────────────────────────
// Week planner — picks 2-3 templates and assigns scheduled-for slots.
// ────────────────────────────────────────────────────────────────────────

export interface WeekPlanContext {
  ctx: SceneBuildContext
  weekStart: Date
  intensityCeiling: SceneIntensity
  /** Slugs already scheduled within the last 4 weeks — avoid repeats. */
  recentSlugPrefixes: string[]
  rng?: () => number
}

export interface PlannedScene {
  scene_slug: string
  scene_kind: SceneKind
  title: string
  intensity_band: SceneIntensity
  scheduled_for: Date
  preparation_instructions: Record<string, unknown>
  live_prompts: LivePrompt[]
  debrief_prompts: DebriefPrompt[]
}

const INTENSITY_RANK: Record<SceneIntensity, number> = { gentle: 0, firm: 1, cruel: 2 }

export function planWeek(opts: WeekPlanContext): PlannedScene[] {
  const rng = opts.rng ?? Math.random
  const ceilingRank = INTENSITY_RANK[opts.intensityCeiling]
  const recent = new Set(opts.recentSlugPrefixes)

  // Eligible: under intensity ceiling, not used in last 4 weeks.
  const eligible = SCENE_TEMPLATES.filter(t =>
    INTENSITY_RANK[t.intensity_band] <= ceilingRank
    && !recent.has(t.slug_prefix)
  )
  if (eligible.length === 0) return []

  // Pick 2-3. Shuffle eligible, take first 3 (or all if fewer).
  const shuffled = [...eligible].sort(() => rng() - 0.5)
  const count = Math.min(3, Math.max(2, Math.min(shuffled.length, 2 + Math.floor(rng() * 2))))
  const picks = shuffled.slice(0, count)

  // Spread across the week (Mon, Wed, Fri-ish slots) at varied times.
  const dayOffsets = [1, 3, 5].slice(0, count) // Mon, Wed, Fri from weekStart
  const hours = [10, 17, 21] // morning errand, after-work, late evening

  const planned: PlannedScene[] = []
  for (let i = 0; i < count; i++) {
    const tpl = picks[i]
    const dayOffset = dayOffsets[i]
    // Match scene kind to a sensible hour: bedroom = evening, mirror =
    // morning, coffee/errand = midday, commute = morning rush, public = afternoon.
    let hour = hours[i]
    if (tpl.kind === 'bedroom') hour = 21
    if (tpl.kind === 'mirror') hour = 7
    if (tpl.kind === 'commute') hour = 8
    if (tpl.kind === 'coffee_shop') hour = 14

    const scheduled = new Date(opts.weekStart)
    scheduled.setUTCDate(scheduled.getUTCDate() + dayOffset)
    scheduled.setUTCHours(hour, 0, 0, 0)

    const buildCtx: SceneBuildContext = { ...opts.ctx, hourOfDay: hour }
    const dateStr = scheduled.toISOString().slice(0, 10)

    planned.push({
      scene_slug: `${tpl.slug_prefix}_${dateStr}`,
      scene_kind: tpl.kind,
      title: tpl.title,
      intensity_band: tpl.intensity_band,
      scheduled_for: scheduled,
      preparation_instructions: tpl.build_preparation(buildCtx),
      live_prompts: tpl.build_live(buildCtx),
      debrief_prompts: tpl.build_debrief(buildCtx),
    })
  }

  return planned
}

// ────────────────────────────────────────────────────────────────────────
// Craft-rubric guard
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

const CLICHE_PATTERNS = [
  /\becho(?:es|ing|ed)?\b/i,
  /\blinger(?:s|ing|ed)?\b/i,
  /\bwrap(?:s|ping|ped)?\s+around\b/i,
  /\bevery\s+inch\b/i,
]

export interface CraftReview {
  ok: boolean
  score: number       // 0-100
  notes: string[]
}

export function reviewSceneCraft(scene: PlannedScene): CraftReview {
  const notes: string[] = []
  let score = 100

  const allText = [
    ...scene.live_prompts.map(p => p.text),
    ...scene.debrief_prompts.map(p => p.question),
    String(scene.preparation_instructions.notes ?? ''),
  ]

  for (const t of allText) {
    for (const re of FORBIDDEN_FRAMING) {
      if (re.test(t)) {
        notes.push(`forbidden_framing:${re.source}`)
        score = 0
      }
    }
    for (const re of CLICHE_PATTERNS) {
      if (re.test(t)) {
        notes.push(`cliche:${re.source}`)
        score -= 25
      }
    }
  }

  // Pet-name density check — at most one pet name per prompt.
  const PET_NAME_RE = /\b(baby girl|baby|sweet girl|sweet thing|pretty thing|good girl|pretty princess|pretty|precious|darling|honey|sweetie)\b/gi
  for (const t of allText) {
    const matches = t.match(PET_NAME_RE)
    if (matches && matches.length > 1) {
      notes.push(`pet_name_density:${matches.length}`)
      score -= 15
    }
  }

  // Self-reference density — at most one "Mama" per prompt.
  const MAMA_RE = /\bmama\b/gi
  for (const t of allText) {
    const matches = t.match(MAMA_RE)
    if (matches && matches.length > 1) {
      notes.push(`mama_density:${matches.length}`)
      score -= 10
    }
  }

  score = Math.max(0, Math.min(100, score))
  return { ok: score >= 50 && !notes.some(n => n.startsWith('forbidden_framing')), score, notes }
}
