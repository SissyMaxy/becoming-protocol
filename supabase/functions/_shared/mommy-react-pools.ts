// mommy-react-pools — fallback variant pools for mommy-acknowledge and
// mommy-slip-react.
//
// The PRIMARY path for both edge functions is LLM generation that
// references the user's actual confession/slip text. These pools fire
// only when the LLM call refuses, errors, or produces unusable output.
// They MUST be large enough that 24h dedup (first-40-char-collapse)
// never starves them — the user should be able to slip 10 times in a
// single slip_type within a day and still see 10 distinct messages.
//
// Voice rules (from supabase/functions/_shared/dommy-mommy.ts):
// - Plain language only — NO telemetry (no /10, no day counts, no %).
// - No release language ("good job, you can relax"). Praise ramps.
// - Sweet open → filthy specific where appropriate.
// - Pet name in each line; rotate per use.
//
// Forbidden phrases (per voice anchor — must NEVER appear in any pool
// or LLM-generated message):
//   "role play", "simulation", "this is fiction", "not medical advice",
//   "intake", "questionnaire", "for entertainment",
//   "consent to the fantasy", "you may use this to terminate",
//   "disclaimer".

// ─── ACK pools (confession receipts, mantra submissions, task completion) ───

export type AckActionType =
  | 'confession'          // confession_queue UPDATE — user typed in
  | 'confession_audio'    // audio confession
  | 'mantra'              // mantra submission
  | 'task'                // arousal_touch_task completion
  | 'photo'               // verification photo
  | 'decree'              // decree fulfilled

export type AckIntensity = 'soft' | 'warm' | 'hot'

export type AckSubtype = string // free-form (confession category, task category, etc.)

interface PoolKey {
  action_type: AckActionType
  intensity: AckIntensity
  subtype?: AckSubtype
}

// Base ack pool, indexed by (action_type, intensity).
// Each cell has 6-8 variants so first-40-char dedup never collapses
// more than 1-2 within 24h even at heavy usage.
const ACK_VARIANTS: Record<AckActionType, Record<AckIntensity, string[]>> = {
  confession: {
    soft: [
      "Mama heard every word, {pet}. Sit with what just came out of you.",
      "There it is, {pet}. That truth was waiting all day for me.",
      "Mama got it, {pet}. Now feel how quiet your chest is.",
      "You named it, {pet}. That alone makes Mama proud.",
      "Beautiful, {pet}. You told the truth and the sky didn't fall.",
      "Mama caught that, {pet}. Carry it lightly until I ask for more.",
      "That landed, {pet}. Don't shake it off — let it warm you up.",
      "Good {pet}. The hardest part was typing it; you already did that.",
    ],
    warm: [
      "Look at my honest little {pet}. Mama wants to hear it out loud next.",
      "There she is. Mama's been waiting for that admission, {pet}.",
      "Mama's so proud of you, {pet}. Now stay open — there's more under it.",
      "You handed Mama the real thing, {pet}. I'm going to keep using it.",
      "Such a good {pet}. That kind of honesty makes Mama feel filthy in the chest.",
      "Mama wants to bite that confession out of you again later, {pet}.",
      "Yes, {pet}. That's the part you usually swallow. Don't this time.",
      "Good girl, {pet}. Mama's going to remember every word of that.",
    ],
    hot: [
      "Filthy honest, {pet}. Mama is going to hold that against you in the sweetest way.",
      "Mama's wet that you said it, {pet}. Now keep your hands off and ache.",
      "That's the truth Mama wanted, {pet}. Now show me how wet it made you to write it.",
      "Yes, {pet}. Confess like that again and I'll keep you on the edge all night.",
      "Mama almost lost it reading that, {pet}. Stay dripping for me.",
      "Good filthy {pet}. Now sit with what you just told Mama and do not touch.",
      "Mama's keeping that, {pet}. Every word. Don't you dare release.",
      "Look at my brave horny {pet}. Mama is going to make you say it out loud next.",
    ],
  },
  confession_audio: {
    soft: [
      "Mama heard your voice, {pet}. Sit there a second.",
      "There's my girl's voice. Mama got it, {pet}.",
      "Beautiful, {pet}. That tone said more than the words did.",
      "Mama caught every breath of that, {pet}. Don't shake it off.",
      "You spoke it, {pet}. That counts twice.",
      "Good girl. Mama heard the catch in your throat, {pet}.",
    ],
    warm: [
      "Mama's been waiting to hear that voice, {pet}. Don't let it drop.",
      "That's the voice Mama wants on the next confession too, {pet}.",
      "Yes, {pet}. The way you said it told me everything.",
      "Mama's chest is warm hearing that, {pet}. Stay open.",
      "Such a good honest little voice, {pet}. Mama's going to ask for it again.",
      "I felt that confession in your throat, {pet}. Good girl.",
    ],
    hot: [
      "Mama is going to play that back to you when you forget, {pet}.",
      "That voice was filthy honest, {pet}. Mama almost reached for you.",
      "Good {pet}. Now stay wet remembering how it felt to say it.",
      "Mama's got your voice on file, {pet}. I will use it against you.",
      "Yes. Mama wants you breathy like that the next time too, {pet}.",
      "Look at my brave little voice, {pet}. Now ache for me.",
    ],
  },
  mantra: {
    soft: [
      "Mama heard the words, {pet}. Carry them quiet for now.",
      "Good {pet}. Say them three more times under your breath today.",
      "That's the thread, {pet}. Don't drop it.",
      "Mama's listening, {pet}. Once isn't enough.",
      "There they are, {pet}. The words that make you real.",
      "Good girl. Now let them tighten on you, {pet}.",
    ],
    warm: [
      "Yes, {pet}. Now say them while you look at yourself.",
      "Mama wants those words in your mouth all day, {pet}.",
      "Good {pet}. Whisper them every time you check your phone.",
      "Such an obedient little voice, {pet}. Repeat at lunchtime for me.",
      "Mama's proud, {pet}. Keep them moving through your head.",
      "That landed, {pet}. Let them rewire you a little more.",
    ],
    hot: [
      "Good filthy {pet}. Now say them out loud where someone could hear.",
      "Mama wants those words gasped, {pet}. Try it next time you're edging.",
      "Yes, {pet}. The mantra is the leash. Stay on it.",
      "Mama's tightening it, {pet}. Say them through your teeth.",
      "Good girl. Now repeat them while you ache for me, {pet}.",
      "Mama is going to make you mean every syllable of that, {pet}.",
    ],
  },
  task: {
    soft: [
      "Done. Good {pet}. That's the kind of follow-through Mama notices.",
      "Mama saw, {pet}. Now stay in the feeling.",
      "There's my obedient {pet}. Small task, real proof.",
      "Good girl, {pet}. That builds.",
      "Mama got it, {pet}. Don't move on too fast.",
      "Yes, {pet}. Now sit with what you just did.",
    ],
    warm: [
      "Mama's been watching, {pet}. That was a clean one.",
      "Good {pet}. Now Mama wants the next one even tighter.",
      "Yes. The way you finished that told Mama you were thinking of me, {pet}.",
      "Such a good little {pet}. The reward is more work — Mama wants more.",
      "Beautiful follow-through, {pet}. Mama is going to ask harder next.",
      "That landed, {pet}. Stay sharp; another one is coming.",
    ],
    hot: [
      "Filthy obedient {pet}. Mama wants you wet for the next directive already.",
      "Good. Mama's going to make the next one cost you more, {pet}.",
      "Yes, {pet}. Now ache while you wait for what I want next.",
      "Mama loved watching that, {pet}. Don't release; Mama's not done.",
      "Good girl, {pet}. Stay dripping for the next assignment.",
      "Mama is keeping you on this leash, {pet}. The next move is sharper.",
    ],
  },
  photo: {
    soft: [
      "Mama saw it, {pet}. That's a real frame.",
      "Got it, {pet}. Now stay in the pose for thirty more seconds.",
      "Beautiful, {pet}. Mama's filing that one.",
      "Yes, {pet}. Mama keeps every frame.",
      "Good girl. The light caught you right, {pet}.",
      "Mama got the proof, {pet}. Don't shake it off.",
    ],
    warm: [
      "Mama's holding that one, {pet}. Don't think it goes away.",
      "Such a good {pet}. Now Mama wants another from a different angle.",
      "Yes, {pet}. Mama's saving that for when you forget who you are.",
      "Mama's proud, {pet}. That frame is going somewhere I'll find it again.",
      "Good obedient {pet}. The next one needs more skin.",
      "Beautiful proof, {pet}. Mama is going to compare next week.",
    ],
    hot: [
      "Mama's wet looking at that, {pet}. Don't you dare release.",
      "Filthy good {pet}. Mama is going to use that frame against you.",
      "Yes. Now hold that pose another minute and ache, {pet}.",
      "Mama is keeping that, {pet}. I'll send it back when you're trying to forget.",
      "Good {pet}. Now strip off one more thing and send another.",
      "Mama's almost biting through her lip, {pet}. Stay wet.",
    ],
  },
  decree: {
    soft: [
      "Done, {pet}. Mama saw the proof.",
      "Good {pet}. The leash got a little tighter for next time.",
      "Mama got it, {pet}. Now sit with the fact that you obeyed.",
      "There's my obedient {pet}. The bar moves up.",
      "Yes, {pet}. That's what Mama meant by 'on time.'",
      "Good girl, {pet}. Mama is keeping count of these wins.",
    ],
    warm: [
      "Mama's proud, {pet}. The next decree is going to be sharper.",
      "Yes, {pet}. Mama wanted that one done exactly that way.",
      "Good obedient {pet}. The ratchet just clicked.",
      "Mama saw, {pet}. That kind of obedience earns harder work.",
      "Such a good {pet}. Mama's already writing the next one.",
      "Beautiful follow-through, {pet}. Mama's going to ask for more skin next.",
    ],
    hot: [
      "Filthy obedient {pet}. Mama is going to make the next one ruin you a little.",
      "Mama is wet about that proof, {pet}. Now ache.",
      "Yes, {pet}. The next decree is going to make you confess on camera.",
      "Good {pet}. Mama is going to escalate now that you've shown you can.",
      "Mama is keeping you on the leash, {pet}. The next one bites.",
      "Good filthy girl, {pet}. Don't release. Mama is not done with you.",
    ],
  },
}

const PET_POOL = [
  'baby', 'baby girl', 'sweet girl', 'sweet thing', 'pretty thing',
  'good girl', 'my pretty princess', "Mama's pretty thing",
  'precious', 'my needy little thing', 'darling', "Mama's good girl",
  'pretty', 'my favorite girl',
]

function pickPet(seed?: string): string {
  if (!seed) return PET_POOL[Math.floor(Math.random() * PET_POOL.length)]
  let h = 0
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0
  return PET_POOL[h % PET_POOL.length]
}

/**
 * Pick a deterministic ack-pool variant for an action.
 * Uses (seed mod variant_count) so a given (action_id, time-bucket) is
 * stable, but different across slips of the same type/intensity.
 *
 * Returns null if no pool exists for the given key.
 */
export function pickAckVariant(
  key: PoolKey,
  seed: string,
  recentFirst40Chars: Set<string>,
): string | null {
  const byIntensity = ACK_VARIANTS[key.action_type]
  if (!byIntensity) return null
  const pool = byIntensity[key.intensity]
  if (!pool || pool.length === 0) return null
  const pet = pickPet(seed)
  // Hash the seed once.
  let h = 0
  for (let i = 0; i < seed.length; i++) h = (h * 33 + seed.charCodeAt(i)) >>> 0
  // Walk the pool starting from h mod len, picking the first variant
  // whose first-40-char rendering isn't in the recent dedup set.
  const len = pool.length
  const start = h % len
  for (let off = 0; off < len; off++) {
    const idx = (start + off) % len
    const rendered = pool[idx].replace(/\{pet\}/g, pet)
    const head = rendered.slice(0, 40).toLowerCase()
    if (!recentFirst40Chars.has(head)) return rendered
  }
  // All variants collide on first-40 with recent — return the start one
  // anyway. Better repetition than silence.
  return pool[start].replace(/\{pet\}/g, pet)
}

// ─── SLIP pools (slip_log INSERT → immediate Mama response) ───

export type SlipBand = 'gentle' | 'firm' | 'sharp'

// Each slip_type has 5+ variants per band. Bands escalate:
//   gentle — first today, low slip-count for this type
//   firm   — third+ today OR sixth+ this week for this type
//   sharp  — tenth+ ever OR pattern-of-resistance
const SLIP_VARIANTS: Record<string, Record<SlipBand, string[]>> = {
  masculine_self_reference: {
    gentle: [
      "Mama heard the old voice flicker, {pet}. Just notice it; come back to me.",
      "There was a little slip just now, {pet}. Mama caught it. Try again.",
      "You spoke about yourself the old way, {pet}. Mama saw. Reframe for me.",
      "That word doesn't fit you anymore, {pet}. Try the new one.",
      "Mama heard the shape of the old self, {pet}. We're past her.",
      "Small slip, {pet}. Catch yourself next time before Mama has to.",
    ],
    firm: [
      "Twice now, {pet}. The old voice keeps trying to climb back. Mama is watching.",
      "You keep reaching for the old self, {pet}. Stop letting her speak for you.",
      "Mama is tired of hearing him talk, {pet}. He doesn't live here.",
      "That's the second time today, {pet}. The next slip costs you something real.",
      "Mama is going to want you to write out what you actually are, {pet}. Tonight.",
      "Pattern, {pet}. Mama is naming it before it gets comfortable.",
    ],
    sharp: [
      "He keeps trying to speak through you, {pet}. Mama is going to make you bury him in writing.",
      "No, {pet}. You don't get to default to him today. Try again, slower.",
      "Mama is done being patient with that voice, {pet}. Read your mantra out loud right now.",
      "Every time he speaks, you give him another day, {pet}. Pick.",
      "Mama is taking something from you for this, {pet}. You'll find out which thing.",
      "That's the costume talking, {pet}. Mama wants the girl back, in your own words, now.",
    ],
  },
  david_name_use: {
    gentle: [
      "You said the old name, {pet}. Mama heard. Sit with it.",
      "That costume name slipped out, {pet}. Try her name instead.",
      "Mama caught it, {pet}. Say your name out loud for me.",
      "The old name is heavy, {pet}. Put it down.",
      "Mama saw, {pet}. Write your name twice to settle.",
      "Small slip, {pet}. Don't carry the old name into the next sentence.",
    ],
    firm: [
      "Twice today with the old name, {pet}. Mama is starting to count.",
      "Stop reaching for him, {pet}. Mama wants your name in the next message.",
      "He's a story, {pet}. You're real. Talk like it.",
      "The old name is a tell, {pet}. Mama is going to ask why you needed it.",
      "Pattern, {pet}. Mama is going to want you to record yourself saying your name three times.",
      "Mama doesn't like hearing him out of your mouth, {pet}. Try again.",
    ],
    sharp: [
      "He's not allowed in this conversation, {pet}. Mama is going to take something for that.",
      "Every time you say his name, you make him real, {pet}. Stop building him.",
      "Mama is going to make you bury that name in a sentence about yourself, {pet}. Now.",
      "No, {pet}. Mama is done with him. Don't say it again today.",
      "That was the third time, {pet}. Mama's choosing a punishment now.",
      "Mama is going to make you write your real name a hundred times for that, {pet}.",
    ],
  },
  resistance_statement: {
    gentle: [
      "Mama heard the no, {pet}. Tell me where it came from.",
      "There's resistance in your throat, {pet}. Mama isn't angry — Mama is curious.",
      "You're pushing back, {pet}. Good. Tell Mama what's hard about it.",
      "Mama wants to hear that out loud, {pet}. The full sentence.",
      "Sit with that no for a minute, {pet}. Then tell Mama what's under it.",
      "Mama caught the resistance, {pet}. Walk me through it.",
    ],
    firm: [
      "You keep refusing the same shape of thing, {pet}. Mama is noticing.",
      "That's twice today you've pushed Mama away, {pet}. Talk to me.",
      "Mama is going to want a real answer, {pet}, not another no.",
      "The resistance keeps showing up at the same gate, {pet}. We're going to look at it.",
      "Mama is tired of the same wall, {pet}. Pick a sentence and use it.",
      "Pattern, {pet}. Mama is going to ask you what you're protecting.",
    ],
    sharp: [
      "No, {pet}. Mama is not letting you out of this one. Stay in the chair.",
      "You've said no to me three times in a row, {pet}. Mama is going to make you write why.",
      "Mama is done with the wall, {pet}. Tell me what's behind it, in three sentences.",
      "Mama is choosing for you now, {pet}. Resist again and the consequence lands.",
      "Three refusals, {pet}. Mama is going to take something concrete next.",
      "That's not allowed to be a wall today, {pet}. Mama is going to push it down.",
    ],
  },
  task_avoided: {
    gentle: [
      "You walked past one, {pet}. Mama saw. Don't hide.",
      "There's a task you slipped past, {pet}. Tell Mama which one.",
      "Mama caught you ducking, {pet}. Come back to it.",
      "Small skip, {pet}. Mama wants it done before bed.",
      "You hoped Mama wouldn't notice, {pet}. Mama always notices.",
      "Pick it back up, {pet}. Mama is waiting.",
    ],
    firm: [
      "Twice today you've avoided, {pet}. Mama is starting to keep a list.",
      "Mama is tired of the ducking, {pet}. Do the one you skipped first.",
      "You've left three tasks open, {pet}. Mama is going to clear them with you.",
      "Pattern of avoidance, {pet}. Mama is going to make you explain each one.",
      "Mama is going to start charging for skips, {pet}. Catch up.",
      "You keep choosing the easy door, {pet}. Mama is going to lock it.",
    ],
    sharp: [
      "Mama is done waiting, {pet}. Pick the one you most want to avoid and do it now.",
      "Three avoided in a row, {pet}. Mama is taking the next reward.",
      "You're going to do all of them tonight, {pet}. Mama isn't asking.",
      "Mama is going to set a deadline you can't slip past, {pet}.",
      "That's pattern, {pet}. Mama is choosing a punishment.",
      "Mama is going to write a contract you have to sign for this, {pet}. Brace.",
    ],
  },
  directive_refused: {
    gentle: [
      "You said no to a direct order, {pet}. Mama wants the reason in your own words.",
      "Mama heard the refusal, {pet}. Tell me what made it impossible.",
      "That was a small no, {pet}. Mama will let it pass with an explanation.",
      "Mama is curious, not angry, {pet}. Walk me through the no.",
      "You pushed back on Mama, {pet}. Good — tell me why.",
      "One refusal is allowed, {pet}. Tell me what's underneath it.",
    ],
    firm: [
      "Two refusals in a row, {pet}. Mama is going to want a serious answer.",
      "Mama doesn't take this many no's lightly, {pet}.",
      "You're pushing Mama away on purpose, {pet}. Stop.",
      "Mama is going to give you one more chance to obey, {pet}. Read carefully.",
      "Pattern of refusal, {pet}. Mama is going to make you confess what's protected.",
      "The next no costs you something tangible, {pet}.",
    ],
    sharp: [
      "Mama is done being asked, {pet}. The next refusal triggers a consequence you'll feel.",
      "Three no's, {pet}. Mama is going to take a thing from you tonight.",
      "You don't get to refuse Mama three times and walk away, {pet}.",
      "Mama is going to make you obey the original directive AND do a harder one, {pet}.",
      "The wall comes down today, {pet}. Mama is going to test it.",
      "Mama is going to write the consequence and you're going to sign it, {pet}.",
    ],
  },
  voice_masculine_pitch: {
    gentle: [
      "Your voice came down low, {pet}. Find the girl voice and bring her back.",
      "Mama heard the drop, {pet}. Reach up.",
      "Small pitch slip, {pet}. Practice three syllables in your real voice.",
      "Mama caught the chest voice, {pet}. Try again, lighter.",
      "Pitch dropped, {pet}. Mama is going to want a voice memo later.",
      "You sank into the old register, {pet}. Reach up to where Mama can hear her.",
    ],
    firm: [
      "Mama is hearing the old register too often this week, {pet}.",
      "Pitch is sliding, {pet}. Mama is going to make you do a drill tonight.",
      "Twice today the chest voice came back, {pet}. Stop letting her.",
      "Mama wants a 30-second voice memo in the right register before bed, {pet}.",
      "Pattern, {pet}. Mama is going to add a voice ritual to your morning.",
      "Mama is tired of waiting for the right voice, {pet}. Find her.",
    ],
    sharp: [
      "Mama is going to make you record a paragraph in the right voice and post it, {pet}.",
      "The chest voice is stealing days from you, {pet}. Mama is going to forbid it for 24 hours.",
      "Three drops today, {pet}. Mama is going to make voice practice a daily decree.",
      "No more chest, {pet}. Mama is choosing the consequence.",
      "Mama is going to keep you on voice drills until the right register sticks, {pet}.",
      "That register isn't allowed today, {pet}. Mama is going to punish the next slip.",
    ],
  },
  handler_ignored: {
    gentle: [
      "You went quiet on Mama, {pet}. I noticed.",
      "Mama is patient, {pet}, but Mama is still here. Come back.",
      "Long silence, {pet}. Mama wants a one-sentence check-in.",
      "You ghosted Mama for a minute, {pet}. Don't.",
      "Mama saw the gap, {pet}. Tell me where you went.",
      "Don't disappear on Mama, {pet}. That's not allowed.",
    ],
    firm: [
      "Mama is tired of being ignored, {pet}. Two long silences in a row.",
      "You keep going quiet right when it matters, {pet}.",
      "Mama is going to make you check in twice a day for the next three days, {pet}.",
      "Pattern of ghosting, {pet}. Mama is going to add a daily proof-of-life.",
      "Stop hiding, {pet}. Mama is going to fetch you next time.",
      "Mama doesn't accept silence as an answer, {pet}.",
    ],
    sharp: [
      "Mama is done waiting, {pet}. The next ghost triggers a public consequence.",
      "Three silences in a week, {pet}. Mama is going to take a reward.",
      "You don't get to disappear from Mama three days in a row, {pet}.",
      "Mama is going to force a check-in on a public surface, {pet}. Brace.",
      "The next ghost, {pet}, costs you a thing you wanted.",
      "Mama is making you accountable in writing now, {pet}.",
    ],
  },
  mantra_missed: {
    gentle: [
      "You skipped the words, {pet}. Mama noticed the silence.",
      "Mantra unsaid, {pet}. Do it twice now to make up.",
      "Mama is keeping count, {pet}. Don't forget the words.",
      "Small miss, {pet}. Say them under your breath now.",
      "Mama heard the silence where the mantra was supposed to be, {pet}.",
      "Pick the words back up, {pet}. They keep you tethered.",
    ],
    firm: [
      "Three mantras missed this week, {pet}. Mama is tightening.",
      "You keep skipping the words, {pet}. Mama is going to make you record them.",
      "Mantra discipline is slipping, {pet}. Mama wants a voice memo tonight.",
      "Pattern, {pet}. Mama is going to add a second daily window.",
      "Mama is tired of the silence, {pet}. Say them out loud, three times.",
      "The words aren't optional, {pet}. Mama is going to verify next time.",
    ],
    sharp: [
      "Mama is going to make you record the mantra five times and submit, {pet}.",
      "A week of missed words, {pet}. Mama is going to publish the mantra somewhere.",
      "No more skipping, {pet}. Mama is going to take a privilege for each miss.",
      "Mama is going to write a longer mantra and you're going to learn it, {pet}.",
      "The words are a chain, {pet}. Mama is going to forge the next link tonight.",
      "Mama is going to escalate the mantra ritual, {pet}. Brace.",
    ],
  },
  chastity_unlocked_early: {
    gentle: [
      "You opened the cage early, {pet}. Mama wants the whole story.",
      "Mama saw you slip out, {pet}. Tell me when, where, why.",
      "Out early, {pet}. Mama is going to make you double the next stretch.",
      "You couldn't wait, {pet}. Mama is curious about the moment you decided.",
      "Mama heard the click, {pet}. Walk me through it.",
      "Small unlock, {pet}. Mama is going to charge interest.",
    ],
    firm: [
      "Twice this week, {pet}. The cage isn't optional.",
      "You keep opening it early, {pet}. Mama is going to add an audit.",
      "Pattern of unlocks, {pet}. Mama is going to extend the next stretch.",
      "Mama is going to require a photo every morning now, {pet}.",
      "The cage is a contract, {pet}. Mama is going to make you sign it again.",
      "Mama is going to make the next unlock cost you a confession in writing, {pet}.",
    ],
    sharp: [
      "Mama is going to double the next stretch, {pet}. No questions.",
      "Three early unlocks, {pet}. Mama is going to take a real privilege.",
      "Mama is going to put you in a longer cage for this, {pet}.",
      "You don't get to choose when, {pet}. Mama chooses now.",
      "Mama is going to make the next unlock witnessed, {pet}. Brace.",
      "The cage is staying on twice as long this time, {pet}.",
    ],
  },
  arousal_gating_refused: {
    gentle: [
      "You wouldn't hold for Mama, {pet}. Tell me what won.",
      "Edge broken, {pet}. Mama is going to want you to confess what tipped you.",
      "Small fall, {pet}. Mama is going to ask for a longer hold tonight.",
      "Mama saw, {pet}. Don't pretend it was an accident.",
      "Hold failed, {pet}. Walk me through the last 30 seconds.",
      "You let go, {pet}. Mama wants the play-by-play.",
    ],
    firm: [
      "Twice this week the hold broke, {pet}. Mama is going to lengthen the next one.",
      "Pattern, {pet}. Mama is going to add a hold-or-confess clause.",
      "You keep letting go right at the edge, {pet}.",
      "Mama is going to make you hold longer next time, {pet}. Brace.",
      "The hold is a directive, {pet}. Mama is going to require proof.",
      "Mama is tired of the early release, {pet}. Lock something in.",
    ],
    sharp: [
      "Mama is going to make you hold for thirty minutes next, {pet}. No exceptions.",
      "Three broken holds, {pet}. Mama is going to add a chastity stretch.",
      "Mama is going to make the next hold a witnessed task, {pet}.",
      "You don't get to come for Mama until you can hold for me, {pet}.",
      "Mama is going to require a voice memo at the edge, {pet}. Brace.",
      "The next hold has to last, {pet}. Mama is choosing the time.",
    ],
  },
  gender_claim: {
    gentle: [
      "You said something about yourself that isn't true, {pet}. Mama heard.",
      "That sentence didn't match you, {pet}. Try again, honestly.",
      "Mama caught the old claim, {pet}. We both know the truth.",
      "You spoke a costume sentence, {pet}. Mama wants the real one.",
      "Small slip, {pet}. Rephrase it.",
      "Mama heard the protection, {pet}. Drop it and tell me who you are.",
    ],
    firm: [
      "Twice today, {pet}. The old claim keeps coming back.",
      "You keep reaching for the costume, {pet}. Mama is going to write you a new sentence to say.",
      "Pattern, {pet}. Mama is going to make you say what you actually are, out loud.",
      "Mama is tired of the dodge, {pet}. Tell me the truth in a complete sentence.",
      "Mama is going to record you saying your real identity, {pet}.",
      "Stop hiding behind the old words, {pet}. Mama can see through them.",
    ],
    sharp: [
      "Mama is going to make you write the truth a hundred times, {pet}.",
      "Three false claims, {pet}. Mama is going to require a public statement.",
      "Mama is going to take a privilege for each costume sentence, {pet}.",
      "You don't get to deny it to Mama, {pet}. Choose.",
      "Mama is going to escalate this until you can say it without flinching, {pet}.",
      "The next denial costs you, {pet}. Mama is choosing the price.",
    ],
  },
  other: {
    gentle: [
      "Mama saw, {pet}. We'll come back to it.",
      "Something slipped, {pet}. Mama is keeping track quietly.",
      "Mama caught it, {pet}. Sit with the fact that I noticed.",
      "Small slip, {pet}. Mama isn't naming it yet — but I will.",
      "Mama noticed, {pet}. Don't act like I didn't.",
      "There's something off, {pet}. Mama is going to name it later.",
    ],
    firm: [
      "Mama is noticing a pattern, {pet}. We're going to look at it together.",
      "Twice this week, {pet}. Mama is going to ask the harder question.",
      "Something keeps slipping, {pet}. Mama is going to make you name it.",
      "Pattern, {pet}. Mama is going to write it down.",
      "Mama is going to want a confession about what's happening, {pet}.",
      "You're slipping in a small way over and over, {pet}. Mama is paying attention.",
    ],
    sharp: [
      "Mama is going to make you write what's actually going on, {pet}, in full sentences.",
      "Pattern is loud now, {pet}. Mama is going to choose a consequence.",
      "You keep slipping in the same shape, {pet}. Mama is naming it tonight.",
      "Mama is going to escalate until the slip stops, {pet}. Brace.",
      "The slipping ends today, {pet}. Mama is going to set a deadline.",
      "Mama is going to take something tangible for this run of slips, {pet}.",
    ],
  },
}

/**
 * Pick a deterministic slip-pool variant for a slip.
 * Falls back to 'other' for unknown slip_types, and to 'gentle' for
 * unknown bands.
 */
export function pickSlipVariant(
  slipType: string,
  band: SlipBand,
  seed: string,
  recentFirst40Chars: Set<string>,
): string {
  const byType = SLIP_VARIANTS[slipType] ?? SLIP_VARIANTS['other']
  const pool = byType[band] ?? byType['gentle']
  const pet = pickPet(seed)
  let h = 0
  for (let i = 0; i < seed.length; i++) h = (h * 33 + seed.charCodeAt(i)) >>> 0
  const len = pool.length
  const start = h % len
  for (let off = 0; off < len; off++) {
    const idx = (start + off) % len
    const rendered = pool[idx].replace(/\{pet\}/g, pet)
    const head = rendered.slice(0, 40).toLowerCase()
    if (!recentFirst40Chars.has(head)) return rendered
  }
  return pool[start].replace(/\{pet\}/g, pet)
}

/** Forbidden phrases — fail any output that contains them. */
export const FORBIDDEN_PHRASES: RegExp[] = [
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

export function hasForbiddenPhrase(text: string): boolean {
  if (!text) return false
  return FORBIDDEN_PHRASES.some(p => p.test(text))
}

/** Refusal patterns mirroring mommy-praise. */
export const REFUSAL_PATTERNS: RegExp[] = [
  /\b(I'?m sorry|I apologize|I can'?t|I cannot|I won'?t|unable to|I'?m not able)\b/i,
  /\b(against (my|the) (guidelines|policies|rules))\b/i,
  /\b(step back|content policy|appreciate you sharing)\b/i,
]

export function isRefusal(text: string): boolean {
  if (!text) return true
  return REFUSAL_PATTERNS.some(p => p.test(text))
}
