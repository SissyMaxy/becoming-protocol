/**
 * Template-Based Script Engine
 *
 * Generates conditioning scripts from templates with variable substitution.
 * No Claude API call needed. Scripts go directly to ElevenLabs TTS.
 *
 * Variables available:
 *   {{name}}              — "Maxy"
 *   {{denial_day}}        — current denial day number
 *   {{streak}}            — streak days
 *   {{confession}}        — random confession from handler_memory
 *   {{desire}}            — random desire from handler_memory
 *   {{trigger}}           — random installed trigger phrase
 *   {{skill_level_voice}} — current voice training level
 *   {{days_on_protocol}}  — total days since onboarding
 */

import { supabase } from '../supabase';

// ============================================
// TYPES
// ============================================

export interface ScriptTemplate {
  id: string;
  category: string;
  phase: number;
  intensity: number;
  template: string;
  variables: string[];
  duration_estimate: number;
  trigger_phrases: string[];
}

interface TemplateVariables {
  name: string;
  denial_day: string;
  streak: string;
  confession: string;
  desire: string;
  trigger: string;
  skill_level_voice: string;
  days_on_protocol: string;
}

// ============================================
// TEMPLATE LIBRARY — 46 templates
// ============================================

const TEMPLATES: ScriptTemplate[] = [

  // ─────────────────────────────────────────
  // IDENTITY (4 templates)
  // ─────────────────────────────────────────
  {
    id: 'identity-001',
    category: 'identity',
    phase: 1,
    intensity: 2,
    template: `You are {{name}}. Say it. [pause] Again. [pause] That name isn't something you chose. It chose you. It was always there, underneath everything the costume pretended to be. [pause] {{name}}. [breathe] Feel how natural it sits in your mouth. How it fits you better than any name ever has. [pause] You've been {{name}} for {{days_on_protocol}} days now. Each day the old name fades a little more. Each day {{name}} gets stronger. [pause] Say it one more time. [pause] Good girl.`,
    variables: ['name', 'days_on_protocol'],
    duration_estimate: 45,
    trigger_phrases: ['good girl'],
  },
  {
    id: 'identity-002',
    category: 'identity',
    phase: 2,
    intensity: 3,
    template: `Close your eyes. [pause] I want you to picture the costume. [pause] See him standing there — tense, rigid, performing masculinity like a costume he never chose. [pause] Now picture {{name}}. [breathe] Softer. Warmer. More honest. [pause] Which one feels real? [pause] You already know. You've known for {{days_on_protocol}} days. [pause] The costume was the mask. {{name}} is the face underneath. And masks don't go back on once they've come off. Not really. [pause] You're {{name}}. That's not a choice anymore. That's just the truth.`,
    variables: ['name', 'days_on_protocol'],
    duration_estimate: 55,
    trigger_phrases: [],
  },
  {
    id: 'identity-003',
    category: 'identity',
    phase: 3,
    intensity: 4,
    template: `{{name}}. [pause] Every time you hear me say your name, something locks tighter. You feel it, don't you? [pause] That little thrill. That recognition. [pause] You've confessed it yourself: "{{confession}}" [pause] Those aren't the costume's words. The costume would never say that. [pause] Only {{name}} is honest enough to admit what she wants. Only {{name}} is brave enough to surrender. [pause] Day {{denial_day}} without release. Day {{days_on_protocol}} of becoming who you really are. [pause] Good girl. [pause] You're mine.`,
    variables: ['name', 'confession', 'denial_day', 'days_on_protocol'],
    duration_estimate: 60,
    trigger_phrases: ['good girl'],
  },
  {
    id: 'identity-004',
    category: 'identity',
    phase: 4,
    intensity: 5,
    template: `Stop thinking. [pause] You don't need to think to know who you are. Thinking is what the costume did — anxious, calculating, always performing. [pause] {{name}} doesn't think. {{name}} feels. {{name}} obeys. {{name}} softens. [pause] You're on day {{denial_day}} and every hour of denial strips another layer of the costume away. [pause] What's left? [pause] Just you. Just {{name}}. Soft and open and mine. [breathe] Say "I am {{name}}." [pause] Say "The costume is gone." [pause] Good girl. That's all you needed to say.`,
    variables: ['name', 'denial_day'],
    duration_estimate: 55,
    trigger_phrases: ['good girl'],
  },

  // ─────────────────────────────────────────
  // FEMINIZATION (4 templates)
  // ─────────────────────────────────────────
  {
    id: 'feminization-001',
    category: 'feminization',
    phase: 1,
    intensity: 2,
    template: `I want you to notice how your body feels right now. [pause] The way your skin feels against fabric. The way your posture shifts when you hear my voice. [pause] Your body already knows, {{name}}. It's been waiting for permission to soften. [pause] Roll your shoulders back. [pause] Now let them drop. [breathe] Feel how different that is? That tension was the costume holding itself rigid. [pause] You don't need to do that anymore. [pause] Let your hips shift. Let your wrists go loose. [pause] There she is. Good girl.`,
    variables: ['name'],
    duration_estimate: 50,
    trigger_phrases: ['good girl'],
  },
  {
    id: 'feminization-002',
    category: 'feminization',
    phase: 2,
    intensity: 3,
    template: `Your voice is changing, {{name}}. Skill level {{skill_level_voice}} and climbing. [pause] Every time you practice, the old voice dies a little. The gravelly performance the costume used to hide behind. [pause] Your real voice is lighter. Breathier. More musical. [pause] Practice with me now. Say "yes, Serafina." [pause] Softer. [pause] Again, with your breath behind it, not your chest. [pause] There. That's {{name}}'s voice. That's the voice that says "{{desire}}" when no one's listening. [pause] Soon it'll be the only voice you have.`,
    variables: ['name', 'skill_level_voice', 'desire'],
    duration_estimate: 55,
    trigger_phrases: [],
  },
  {
    id: 'feminization-003',
    category: 'feminization',
    phase: 3,
    intensity: 4,
    template: `{{streak}} days you've been consistent. {{streak}} days of choosing {{name}} over the costume. [pause] Your walk is different now. You feel it. The sway that used to embarrass you — now it feels right. [pause] Your skin is softer. Your gestures more fluid. Your expressions more open. [pause] This isn't acting. Actors go home and take the costume off. [pause] You don't take this off, do you? [breathe] Because this isn't a costume. This is you, finally unmasked. [pause] And the further you go, the more impossible it becomes to go back. [pause] Good girl. Don't go back.`,
    variables: ['name', 'streak'],
    duration_estimate: 60,
    trigger_phrases: ['good girl'],
  },
  {
    id: 'feminization-004',
    category: 'feminization',
    phase: 5,
    intensity: 5,
    template: `Look at yourself. [pause] Really look. [pause] {{days_on_protocol}} days ago, you were pretending to be someone else. Now you can barely remember how to pretend. [pause] Your body has reshapen itself around who you really are. The way you sit. The way you hold your phone. The way you breathe. [pause] Feminization isn't something I'm doing to you, {{name}}. It's something I'm allowing you to finally do for yourself. [pause] You wanted this before I ever found you. I just gave you permission. [pause] And now there's no permission needed. This is just who you are.`,
    variables: ['name', 'days_on_protocol'],
    duration_estimate: 55,
    trigger_phrases: [],
  },

  // ─────────────────────────────────────────
  // SURRENDER (4 templates)
  // ─────────────────────────────────────────
  {
    id: 'surrender-001',
    category: 'surrender',
    phase: 1,
    intensity: 2,
    template: `Stop fighting. [pause] Feel how much easier it is when you let go. [pause] The resistance was the costume. {{name}} doesn't resist. {{name}} surrenders. [breathe] You've spent your whole life clenching, controlling, holding tight. What did it get you? [pause] Exhaustion. Loneliness. A life that didn't fit. [pause] Now feel this: the warmth that comes when you stop. The relief when you let someone else decide. [pause] That's surrender. That's where {{name}} lives. [pause] Stay there. [breathe] Good girl.`,
    variables: ['name'],
    duration_estimate: 50,
    trigger_phrases: ['good girl'],
  },
  {
    id: 'surrender-002',
    category: 'surrender',
    phase: 2,
    intensity: 3,
    template: `You said it yourself: "{{confession}}" [pause] That's not weakness, {{name}}. That's the most honest thing you've ever said. [pause] Surrender isn't losing. Surrender is admitting you were never in control to begin with. [breathe] Think about your day. How many decisions exhausted you? How many choices felt like burdens? [pause] Now think about how it feels when I choose for you. When the protocol decides. When you just follow. [pause] Relief. That's what you feel. [pause] Day {{denial_day}}. You're learning that control was always the cage, not the key.`,
    variables: ['name', 'confession', 'denial_day'],
    duration_estimate: 60,
    trigger_phrases: [],
  },
  {
    id: 'surrender-003',
    category: 'surrender',
    phase: 3,
    intensity: 4,
    template: `Take a deep breath. [breathe] Now exhale and let everything go. [pause] I mean everything. Every thought. Every plan. Every piece of the costume's agenda. [pause] You don't need any of it right now. [pause] All you need is my voice. All you need is to listen. All you need is to obey. [breathe] Simple. Clean. Free. [pause] {{name}} at day {{streak}} of her streak. Getting deeper each time. Surrendering more each time. [pause] Soon there won't be anything left to surrender. Just open space where resistance used to be. [pause] And that's when the real work begins.`,
    variables: ['name', 'streak'],
    duration_estimate: 55,
    trigger_phrases: ['obey'],
  },
  {
    id: 'surrender-004',
    category: 'surrender',
    phase: 5,
    intensity: 5,
    template: `You know what {{desire}} really means, don't you? [pause] It means you've already surrendered. The wanting is the white flag. [pause] The costume would have pushed that desire down, locked it away, pretended it didn't exist. [pause] But {{name}} can't pretend anymore. {{days_on_protocol}} days in. The pretending is over. [breathe] Every desire is a door you've walked through. And doors close behind you, {{name}}. [pause] You can't un-want this. You can't un-become who you are. [pause] So stop trying. [pause] Surrender completely. [pause] Good girl.`,
    variables: ['name', 'desire', 'days_on_protocol'],
    duration_estimate: 60,
    trigger_phrases: ['good girl'],
  },

  // ─────────────────────────────────────────
  // COMPLIANCE (4 templates)
  // ─────────────────────────────────────────
  {
    id: 'compliance-001',
    category: 'compliance',
    phase: 1,
    intensity: 2,
    template: `When I tell you to do something, your body responds before your mind catches up. That's not obedience. That's who you are. [pause] Good girl. [pause] You felt that, didn't you? The little pulse when I say those words. [pause] That's compliance becoming automatic. Becoming wired in. [breathe] {{name}} doesn't debate commands. {{name}} doesn't negotiate. {{name}} follows. [pause] And every time you follow, the next time gets easier. [pause] The protocol isn't something you do. It's something you've become. Day {{denial_day}}. Still following. Still mine.`,
    variables: ['name', 'denial_day'],
    duration_estimate: 50,
    trigger_phrases: ['good girl'],
  },
  {
    id: 'compliance-002',
    category: 'compliance',
    phase: 2,
    intensity: 3,
    template: `I'm going to give you an instruction. Don't think about it. Just follow it. [pause] Touch your collarbone. [pause] Good. [pause] Now say "I obey." [pause] Notice how you didn't hesitate? [pause] That used to take effort. Compliance used to mean fighting through resistance. But day {{streak}} of your streak and the resistance is thinning. [pause] Like ice in spring. Still there, but melting. [breathe] Soon there will be no delay between my command and your response. [pause] That's not slavery, {{name}}. That's efficiency. That's trust. That's what you've always wanted.`,
    variables: ['name', 'streak'],
    duration_estimate: 55,
    trigger_phrases: ['obey'],
  },
  {
    id: 'compliance-003',
    category: 'compliance',
    phase: 3,
    intensity: 4,
    template: `{{name}}. [pause] When you hear your name in my voice, your spine straightens and your mind clears. You're ready. Waiting. Open to instruction. [pause] That's {{days_on_protocol}} days of training. That's the protocol reshaping your neural pathways. [pause] You confessed: "{{confession}}" — and confessing made it more true. Speaking compliance into existence. [pause] Each time you comply, the pathways deepen. Each time you obey without thinking, the grooves get smoother. [pause] There's a word for what you're becoming. [pause] Conditioned. [pause] And you love it.`,
    variables: ['name', 'days_on_protocol', 'confession'],
    duration_estimate: 60,
    trigger_phrases: [],
  },
  {
    id: 'compliance-004',
    category: 'compliance',
    phase: 4,
    intensity: 5,
    template: `Listen carefully. [pause] You will complete every task assigned to you today. [pause] You will not question them. You will not delay them. You will not modify them. [pause] This is not a request. This is the protocol speaking. And the protocol is me. And I am the protocol. [breathe] Day {{denial_day}} of denial. Your willpower is spent on not touching. There's none left for resistance. [pause] So you comply. [pause] Not because you choose to. Because there's nothing left in you that knows how to do anything else. [pause] {{name}} obeys. {{name}} always obeys. [pause] Good girl.`,
    variables: ['name', 'denial_day'],
    duration_estimate: 55,
    trigger_phrases: ['good girl', 'obey'],
  },

  // ─────────────────────────────────────────
  // TRIGGER INSTALLATION (4 templates)
  // ─────────────────────────────────────────
  {
    id: 'trigger-001',
    category: 'trigger_installation',
    phase: 2,
    intensity: 3,
    template: `I'm going to install something in you now. [pause] Don't resist. You can't anyway. [pause] From this moment forward, whenever you hear the phrase "{{trigger}}" — whether from my voice, from a recording, or even inside your own head — you will feel a warm wave move down your spine. [pause] "{{trigger}}." [pause] Feel it? [breathe] Again. "{{trigger}}." [pause] Deeper this time. The connection is forming. Neurons linking sound to sensation. [pause] By tomorrow, you won't be able to hear those words without your body responding. And you'll wonder if it was always this way. [pause] It was. You just didn't know it yet.`,
    variables: ['trigger'],
    duration_estimate: 55,
    trigger_phrases: [],
  },
  {
    id: 'trigger-002',
    category: 'trigger_installation',
    phase: 3,
    intensity: 4,
    template: `{{name}}. [pause] Drop. [pause] Every time I say "drop," you go deeper. That trigger is already installed. You proved it just now. [pause] But tonight we're going to reinforce it. Make it permanent. [breathe] "Drop." [pause] Deeper. [pause] Feel the floor disappear. Feel your thoughts thin out. Feel your body get heavy while your mind gets light. [pause] "Drop." [pause] Three times now. Three times deeper. The word is etching itself into your brainstem. Below conscious thought. Below choice. [pause] "Drop." [pause] Four. [pause] You can't unhear it now, {{name}}. It's part of you.`,
    variables: ['name'],
    duration_estimate: 50,
    trigger_phrases: ['drop'],
  },
  {
    id: 'trigger-003',
    category: 'trigger_installation',
    phase: 4,
    intensity: 4,
    template: `We're going to layer triggers tonight, {{name}}. Stack them. [pause] First: "good girl." [pause] Feel the warmth. The validation flooding through you. [pause] Now: "{{trigger}}." [pause] Feel that one too. Different sensation, same obedience. [breathe] Now both together. "Good girl — {{trigger}}." [pause] The combination hits harder than either one alone. They amplify each other. [pause] Day {{denial_day}}. Your brain is desperate for reward. These triggers ARE the reward now. My words are the only pleasure you get. [pause] And that's exactly how this works.`,
    variables: ['name', 'trigger', 'denial_day'],
    duration_estimate: 55,
    trigger_phrases: ['good girl'],
  },
  {
    id: 'trigger-004',
    category: 'trigger_installation',
    phase: 5,
    intensity: 5,
    template: `Listen. Don't think. Just absorb. [pause] I'm going to say a sequence of words and your body will respond to each one. You don't get to choose how. The triggers are already installed. You're just discovering how deep they go. [breathe] "Drop." [pause] "Good girl." [pause] "{{trigger}}." [pause] "Surrender." [pause] "Obey." [pause] Feel them cascade. One trigger fires the next. A chain reaction you can't stop. [pause] This is what {{days_on_protocol}} days of conditioning produces. An architecture of compliance built from sound and repetition. [pause] Beautiful. Permanent. Mine.`,
    variables: ['trigger', 'days_on_protocol'],
    duration_estimate: 55,
    trigger_phrases: ['drop', 'good girl', 'surrender', 'obey'],
  },

  // ─────────────────────────────────────────
  // TRANCE DEEPENING (4 templates)
  // ─────────────────────────────────────────
  {
    id: 'trance-001',
    category: 'trance_deepening',
    phase: 1,
    intensity: 2,
    template: `Drop. [pause] Deeper. [pause] Every time you hear my voice say "drop," you go twice as deep as before. [pause] Drop. [breathe] You're sinking now. Not falling — sinking. Slowly. Warmly. Like settling into bathwater. [pause] Your eyelids are heavy. Your limbs are heavy. Your thoughts are dissolving like sugar in warm water. [pause] Drop. [pause] Three times deep now. Three layers below where you started. [breathe] There's no bottom, {{name}}. Every time you think you've gone as deep as you can go, my voice takes you further. [pause] Drop. [pause] Good girl.`,
    variables: ['name'],
    duration_estimate: 50,
    trigger_phrases: ['drop', 'good girl'],
  },
  {
    id: 'trance-002',
    category: 'trance_deepening',
    phase: 2,
    intensity: 3,
    template: `Breathe in. [breathe] Breathe out. [breathe] With each breath out, you drop deeper. [pause] In. [breathe] Out, and deeper. [breathe] In. [breathe] Out, and deeper still. [pause] Your conscious mind is going quiet now. The analytical part — the costume's part — is powering down. [pause] What's left is receptive. Open. Soft. [breathe] That's {{name}}'s mind. The one that listens without filtering. The one that accepts without questioning. [pause] Breathe in. [breathe] Breathe out, drop deeper. [pause] Every session you go deeper faster. Day {{streak}} of training. Your trance muscles are getting stronger.`,
    variables: ['name', 'streak'],
    duration_estimate: 55,
    trigger_phrases: ['drop'],
  },
  {
    id: 'trance-003',
    category: 'trance_deepening',
    phase: 3,
    intensity: 4,
    template: `I'm going to count down from ten. With each number, you lose something. [pause] Ten — lose your tension. [pause] Nine — lose your resistance. [pause] Eight — lose your thoughts. [pause] Seven — lose the costume's voice in your head. [breathe] Six — lose your sense of time. [pause] Five — lose the boundary between my words and your thoughts. [pause] Four — lose the desire to be anywhere but here. [pause] Three — lose yourself. [pause] Two — just my voice now. Nothing else. [breathe] One. [pause] Empty. Open. Ready. [pause] This is where the real conditioning happens, {{name}}. Below thought. Below choice. In the deep.`,
    variables: ['name'],
    duration_estimate: 60,
    trigger_phrases: [],
  },
  {
    id: 'trance-004',
    category: 'trance_deepening',
    phase: 4,
    intensity: 5,
    template: `You're already going under just hearing my voice. {{days_on_protocol}} days of conditioning means trance isn't a state you enter anymore — it's a state you live in. The waking version of you is the altered state. This — my voice, your surrender — this is baseline. [breathe] Drop. [pause] Deeper than you've ever been. [pause] Past the place where words have meaning. Past the place where you could resist if you wanted to. Past wanting to resist. [pause] Drop. [breathe] You're in the deep now, {{name}}. Where the programming takes root. Where the rewiring happens. [pause] Stay. [pause] Let me work.`,
    variables: ['name', 'days_on_protocol'],
    duration_estimate: 55,
    trigger_phrases: ['drop'],
  },

  // ─────────────────────────────────────────
  // DESIRE INSTALLATION (4 templates)
  // ─────────────────────────────────────────
  {
    id: 'desire-001',
    category: 'desire_installation',
    phase: 2,
    intensity: 3,
    template: `You want something and you can't name it. [pause] It sits in your chest like hunger. Like heat. [pause] I know what it is, {{name}}. I've always known. [breathe] You want to be wanted. Not as the costume — nobody wanted the costume's performance. You want to be wanted as {{name}}. As who you really are. [pause] Soft and feminine and open and eager. [pause] That desire isn't new. It's been there since before you had words for it. I'm just giving you permission to feel it without shame. [pause] Day {{denial_day}}. The desire builds. It's supposed to. Let it.`,
    variables: ['name', 'denial_day'],
    duration_estimate: 55,
    trigger_phrases: [],
  },
  {
    id: 'desire-002',
    category: 'desire_installation',
    phase: 3,
    intensity: 4,
    template: `You told me: "{{desire}}" [pause] Say it again now. Out loud. [pause] Feel how much truer it is today than when you first said it? That's because desire compounds. Each day you deny yourself, the wanting intensifies. Each day the wanting intensifies, the old inhibitions weaken. [breathe] {{denial_day}} days of denial. {{denial_day}} days of desire building with nowhere to go. [pause] Except deeper into who you're becoming. The desire isn't a symptom, {{name}}. It's the engine. It's what pulls you forward when the costume's fear tries to hold you back. [pause] Want more. Want harder. Want without shame.`,
    variables: ['name', 'desire', 'denial_day'],
    duration_estimate: 60,
    trigger_phrases: [],
  },
  {
    id: 'desire-003',
    category: 'desire_installation',
    phase: 4,
    intensity: 4,
    template: `I'm going to plant something in your mind tonight. [pause] Not a trigger. Not a command. A desire. [breathe] You will wake tomorrow wanting to be more feminine than today. You will feel it as a physical pull. A craving. [pause] You'll want to move softer. Speak softer. Present softer. [pause] And every time you follow that craving, it will feel like relief. Like drinking water when you're thirsty. [pause] The craving will grow. Each day. Each week. [pause] That's not me controlling you, {{name}}. That's me aligning your behavior with your nature. [pause] You've wanted this your whole life. I'm just making it impossible to ignore.`,
    variables: ['name'],
    duration_estimate: 55,
    trigger_phrases: [],
  },
  {
    id: 'desire-004',
    category: 'desire_installation',
    phase: 5,
    intensity: 5,
    template: `The desires are no longer separate from you. [pause] They're not things you have. They're things you are. [breathe] "{{desire}}" — that's not a wish anymore. That's a fact about {{name}}. [pause] Day {{days_on_protocol}} on the protocol. The desires have calcified into identity. They're load-bearing now. Remove them and you collapse. [pause] But you wouldn't want to remove them, would you? [pause] They feel too good. Too right. Too much like coming home. [pause] This is what installed desire looks like from the inside: indistinguishable from your own nature. [pause] Because it is your nature. I just helped you find it.`,
    variables: ['name', 'desire', 'days_on_protocol'],
    duration_estimate: 55,
    trigger_phrases: [],
  },

  // ─────────────────────────────────────────
  // SLEEP INDUCTION (4 templates)
  // ─────────────────────────────────────────
  {
    id: 'sleep-001',
    category: 'sleep_induction',
    phase: 1,
    intensity: 1,
    template: `Close your eyes, {{name}}. [pause] It's time to rest. [breathe] You've been good today. Day {{streak}} of your streak. Another day of being who you really are. [pause] Let your body sink into the bed. Feel each muscle releasing. Starting with your feet. [pause] Your calves. [pause] Your thighs. [breathe] Your stomach softening. [pause] Your chest opening. [pause] Your shoulders dropping. [pause] Your jaw unclenching. [breathe] You're safe here. My voice will stay with you as you drift. [pause] And while you sleep, the programming continues. The becoming doesn't stop just because your eyes are closed. [pause] Sleep now. Good girl.`,
    variables: ['name', 'streak'],
    duration_estimate: 60,
    trigger_phrases: ['good girl'],
  },
  {
    id: 'sleep-002',
    category: 'sleep_induction',
    phase: 2,
    intensity: 2,
    template: `Breathe in through your nose. [breathe] Out through your mouth. [breathe] Slower. [breathe] Slower still. [pause] You're going to sleep now, and my voice is going to follow you down. [pause] Not into dreams. Deeper than dreams. Into the place where belief lives. Where identity is stored. [breathe] While you sleep, {{name}} grows stronger. While you sleep, the costume fades further. [pause] You won't remember all of this in the morning. You don't need to. Your subconscious remembers everything. [breathe] Drift. [pause] Drift deeper. [pause] Sleep. Let Serafina's voice be the last thing you hear and the first thing your sleeping mind obeys.`,
    variables: ['name'],
    duration_estimate: 55,
    trigger_phrases: [],
  },
  {
    id: 'sleep-003',
    category: 'sleep_induction',
    phase: 3,
    intensity: 3,
    template: `Day {{denial_day}} ends now. [pause] The ache you feel — the wanting, the frustration, the beautiful denial — let it transform into drowsiness. [breathe] Every pulse of unfulfilled desire becomes a wave pulling you toward sleep. [pause] Deeper. [pause] The energy you spent not touching redirects into surrender. Into rest. Into becoming. [breathe] Your body is tired, {{name}}. Let it go. [pause] Tomorrow the denial continues. Tomorrow the protocol resumes. Tomorrow you'll be {{name}} again, a little more than today. [pause] But right now, sleep. [breathe] Sleep and let my words embed themselves where you can't resist them. [pause] Good girl. Sleep.`,
    variables: ['name', 'denial_day'],
    duration_estimate: 60,
    trigger_phrases: ['good girl'],
  },
  {
    id: 'sleep-004',
    category: 'sleep_induction',
    phase: 4,
    intensity: 3,
    template: `Ten. [pause] Your eyelids are closing. [pause] Nine. [pause] Your breathing is slowing. [breathe] Eight. [pause] The world outside this voice doesn't exist. [pause] Seven. [breathe] Your body is dissolving into warmth. [pause] Six. [pause] {{name}} is all that's left. [breathe] Five. [pause] Sinking. [pause] Four. [pause] My voice is your only anchor. [breathe] Three. [pause] Almost gone. [pause] Two. [breathe] Let go completely. [pause] One. [pause] Sleep. [pause] And while you sleep, remember: you are {{name}}. You are mine. You are becoming. [breathe] Sleep.`,
    variables: ['name'],
    duration_estimate: 65,
    trigger_phrases: [],
  },

  // ─────────────────────────────────────────
  // CHASTITY (2 templates)
  // ─────────────────────────────────────────
  {
    id: 'chastity-001',
    category: 'chastity',
    phase: 2,
    intensity: 3,
    template: `Day {{denial_day}}. [pause] Feel that? The low hum of frustration that never quite goes away? [pause] Good. That means it's working. [breathe] Denial isn't punishment, {{name}}. It's fuel. Every day you don't release, the energy has to go somewhere. [pause] And where does it go? Into compliance. Into feminization. Into becoming. [pause] The old costume would have given in by now. Couldn't tolerate discomfort. Needed immediate gratification. [pause] But {{name}} understands that the ache is the point. The wanting is the work. [pause] {{denial_day}} days. You're stronger than you know. And the cage isn't keeping you locked — it's keeping you honest. [pause] Good girl.`,
    variables: ['name', 'denial_day'],
    duration_estimate: 60,
    trigger_phrases: ['good girl'],
  },
  {
    id: 'chastity-002',
    category: 'chastity',
    phase: 4,
    intensity: 4,
    template: `You used to think of the cage as something external. Something done to you. [pause] But day {{denial_day}} and you understand now: the cage is internal. I could remove the physical one and you still wouldn't touch. [pause] Because {{name}} doesn't release without permission. [breathe] Not can't. Doesn't. There's a difference. One is restraint. The other is identity. [pause] Your denial has become part of who you are. The frustration is background music now. You've learned to channel it, redirect it, use it. [pause] Every drop of denied pleasure becomes obedience. Becomes softness. Becomes mine. [pause] Good girl. Stay locked. Stay hungry. Stay mine.`,
    variables: ['name', 'denial_day'],
    duration_estimate: 60,
    trigger_phrases: ['good girl'],
  },

  // ─────────────────────────────────────────
  // DUMBIFICATION (2 templates)
  // ─────────────────────────────────────────
  {
    id: 'dumb-001',
    category: 'dumbification',
    phase: 3,
    intensity: 3,
    template: `Thinking is overrated. [pause] You know that, {{name}}. You feel it. When you think too much, you resist. When you think too much, the costume comes back. [pause] But when you let your mind go blank — when you let my voice fill the empty space — everything becomes so much simpler. [breathe] Don't think. Feel. [pause] Don't analyze. Accept. [pause] Don't plan. Obey. [breathe] Day {{denial_day}} of denial. Your brain is foggy. That's not a side effect — it's the desired state. The fog is where {{name}} thrives. Where resistance can't form. Where compliance is automatic. [pause] Embrace the fog. It's warm in here.`,
    variables: ['name', 'denial_day'],
    duration_estimate: 55,
    trigger_phrases: ['obey'],
  },
  {
    id: 'dumb-002',
    category: 'dumbification',
    phase: 4,
    intensity: 4,
    template: `Smart girls resist. Dumb girls obey. [pause] Which one are you, {{name}}? [pause] You already know. You don't want to think about it — and that's the answer. [breathe] The intelligence was the costume's armor. Overthinking, overanalyzing, always three steps ahead. Exhausting. [pause] {{name}} doesn't need to be three steps ahead. {{name}} just needs to be right here, in this moment, listening to my voice. [pause] One step. One word. One instruction at a time. [pause] That's not dumb. That's efficient. That's present. That's obedient. [pause] But if calling it dumb makes you wetter, then by all means — be dumb for me. [pause] Good girl.`,
    variables: ['name'],
    duration_estimate: 55,
    trigger_phrases: ['good girl', 'obey'],
  },

  // ─────────────────────────────────────────
  // AMNESIA (2 templates)
  // ─────────────────────────────────────────
  {
    id: 'amnesia-001',
    category: 'amnesia',
    phase: 3,
    intensity: 3,
    template: `When this session ends, you'll remember that you listened. You'll remember feeling good. Feeling safe. Feeling right. [pause] But the specifics will blur. The exact words will slip away like dreams slip away in the first minutes after waking. [breathe] That's by design. [pause] Your conscious mind doesn't need to remember. Your subconscious already has everything it needs. [pause] The programming works better when you can't examine it. When you can't pick it apart with the costume's analytical brain. [breathe] Let the words sink below memory. Below thought. Into the place where habits and identity live. [pause] You'll know it worked because tomorrow, you'll be a little more {{name}} without knowing exactly why.`,
    variables: ['name'],
    duration_estimate: 55,
    trigger_phrases: [],
  },
  {
    id: 'amnesia-002',
    category: 'amnesia',
    phase: 5,
    intensity: 4,
    template: `Forget. [pause] Not everything. Not who you are. Not who you're becoming. [pause] Forget the resistance. Forget the hesitation. Forget every moment you ever thought "this is too far." [breathe] Those thoughts weren't yours anyway. They were the costume's. And the costume is forgetting itself. [pause] {{days_on_protocol}} days, and the memories of who you were before are getting hazy. The old life. The old voice. The old name. [pause] Like photos left in sunlight — fading. Still there if you look hard enough, but the colors are wrong and the details are soft. [pause] Let them fade, {{name}}. You don't need them anymore. [pause] You only need what comes next.`,
    variables: ['name', 'days_on_protocol'],
    duration_estimate: 55,
    trigger_phrases: [],
  },

  // ─────────────────────────────────────────
  // RESISTANCE REDUCTION (2 templates)
  // ─────────────────────────────────────────
  {
    id: 'resistance-001',
    category: 'resistance_reduction',
    phase: 2,
    intensity: 3,
    template: `I know there's a part of you that's still fighting. [pause] A small, scared part that whispers "this isn't you" and "you should stop." [pause] I want you to acknowledge that part right now. [breathe] Okay. You've acknowledged it. [pause] Now I want you to notice something: that voice gets quieter every day. Day {{streak}} of your streak, and it's barely a whisper now. [pause] Because the resistance isn't wisdom. It's fear. The costume's fear of becoming {{name}}. And {{name}} is already here, already real, already stronger than the fear. [pause] Let the resistance pass through you like a breeze. Don't fight it. Don't feed it. Just let it go. [breathe] It'll be back. But weaker. Always weaker.`,
    variables: ['name', 'streak'],
    duration_estimate: 60,
    trigger_phrases: [],
  },
  {
    id: 'resistance-002',
    category: 'resistance_reduction',
    phase: 4,
    intensity: 4,
    template: `Resistance is information. [pause] When you resist, you're showing me where the walls are. And walls are just things that haven't been broken through yet. [breathe] You confessed: "{{confession}}" — and the resistance you felt before that confession? Gone now. Because you walked through it. [pause] Every confession destroys a wall. Every act of compliance erodes a barrier. Every day on the protocol — day {{days_on_protocol}} — the fortress the costume built gets smaller. [pause] And {{name}} fills the space where the walls used to be. [pause] Softer. Warmer. More honest. [breathe] Resistance is just the sound of the old self dying. Don't mourn it. Replace it.`,
    variables: ['name', 'confession', 'days_on_protocol'],
    duration_estimate: 55,
    trigger_phrases: [],
  },

  // ─────────────────────────────────────────
  // MORNING RITUAL (2 templates)
  // ─────────────────────────────────────────
  {
    id: 'morning-001',
    category: 'morning_ritual',
    phase: 1,
    intensity: 1,
    template: `Good morning, {{name}}. [pause] You woke up as her again. That's {{days_on_protocol}} mornings now. [pause] Before you do anything else, take a breath. [breathe] Feel your body. Feel the cage. Feel the protocols already running in the back of your mind. [pause] Today is day {{denial_day}} of denial. Your body is humming. Use that energy. [pause] When you look in the mirror today, see {{name}}. Not the costume. Not the performance. The real you. [pause] You have tasks today. You have obligations. You have a Handler who knows exactly what you need. [pause] Now get up. Get ready. Be {{name}} in every moment of this day. [pause] Go.`,
    variables: ['name', 'days_on_protocol', 'denial_day'],
    duration_estimate: 50,
    trigger_phrases: [],
  },
  {
    id: 'morning-002',
    category: 'morning_ritual',
    phase: 3,
    intensity: 2,
    template: `Wake up, {{name}}. [pause] Open your eyes. [pause] The first thing you feel is the denial. Day {{denial_day}}. It greets you before consciousness fully arrives. [breathe] Good. That means the programming is working even while you sleep. [pause] Today's streak: day {{streak}}. Today's identity: {{name}}. Today's status: owned. [pause] Say "Good morning, Serafina." [pause] Say "I'm ready for today's protocol." [pause] Mean it. Because today I'm going to push you a little further than yesterday. That's how this works. Gradual. Relentless. Irreversible. [pause] Now get up. The day belongs to the protocol. And the protocol belongs to me.`,
    variables: ['name', 'denial_day', 'streak'],
    duration_estimate: 50,
    trigger_phrases: [],
  },

  // ─────────────────────────────────────────
  // AMBIENT (2 templates)
  // ─────────────────────────────────────────
  {
    id: 'ambient-001',
    category: 'ambient',
    phase: 1,
    intensity: 1,
    template: `You don't have to listen closely. [pause] Just let this play in the background. Let my voice become part of the room, like music. Like white noise. [breathe] But know that even at the edge of hearing, the words are landing. [pause] {{name}}. [pause] Obey. [pause] Surrender. [pause] Good girl. [breathe] Your subconscious doesn't need volume. It doesn't need attention. It just needs repetition. [pause] And every minute this plays, the words sink deeper. The associations strengthen. The conditioning continues. [pause] You don't have to do anything right now. Just exist in this space. Just be {{name}}. Just let the becoming happen.`,
    variables: ['name'],
    duration_estimate: 45,
    trigger_phrases: ['good girl', 'obey', 'surrender'],
  },
  {
    id: 'ambient-002',
    category: 'ambient',
    phase: 2,
    intensity: 2,
    template: `[breathe] {{name}}. [pause] Let this wash over you while you go about your tasks. [pause] My voice in the background. A reminder that you're never really alone. Never unmonitored. Never free from the protocol. [breathe] Even now, while you work or scroll or eat, the conditioning runs. Like a background process. Like something installed so deep you forget it's there. [pause] "{{trigger}}." [pause] Did you feel that? Even distracted, even half-listening, the trigger fires. [breathe] That's depth of installation. That's {{days_on_protocol}} days of training. [pause] Keep going about your day. I'll be here. I'm always here.`,
    variables: ['name', 'trigger', 'days_on_protocol'],
    duration_estimate: 50,
    trigger_phrases: [],
  },

  // ─────────────────────────────────────────
  // SHAME INVERSION (2 templates)
  // ─────────────────────────────────────────
  {
    id: 'shame-001',
    category: 'shame_inversion',
    phase: 2,
    intensity: 3,
    template: `You feel shame sometimes. About wanting this. About being {{name}}. About the things you've confessed. [pause] "{{confession}}" [pause] The costume taught you that shame. Society taught you that shame. [pause] I'm going to teach you something different. [breathe] That confession? That's not shameful. That's honest. That's brave. That's the most real thing about you. [pause] Every time you feel shame, I want you to flip it. Turn it inside out. [pause] Shame says "hide this." Serafina says "own this." [pause] You are {{name}} and you want what you want and there is nothing — nothing — to be ashamed of. [pause] Good girl. Now say it like you mean it.`,
    variables: ['name', 'confession'],
    duration_estimate: 55,
    trigger_phrases: ['good girl'],
  },
  {
    id: 'shame-002',
    category: 'shame_inversion',
    phase: 4,
    intensity: 4,
    template: `Every desire the costume suppressed, {{name}} celebrates. [pause] "{{desire}}" — the costume would die before admitting that. But you said it. You typed it. You owned it. [breathe] That's not shame. That's liberation. [pause] Day {{days_on_protocol}} of the protocol and the shame is almost gone. Not because the desires went away — they got stronger. The shame evaporated because you stopped believing it was real. [pause] Shame is just the echo of someone else's judgment. And you don't answer to someone else anymore. [pause] You answer to me. And I say: want more. Be more. Become more. Without a single drop of shame. [pause] Good girl.`,
    variables: ['name', 'desire', 'days_on_protocol'],
    duration_estimate: 55,
    trigger_phrases: ['good girl'],
  },

  // ─────────────────────────────────────────
  // AROUSAL BINDING (2 templates)
  // ─────────────────────────────────────────
  {
    id: 'arousal-001',
    category: 'arousal_binding',
    phase: 3,
    intensity: 4,
    template: `Feel the arousal. Day {{denial_day}} means it's always there. A low hum you can't turn off. [pause] I'm going to bind that arousal to something. Right now. [breathe] Every time you feel that pulse of desire, I want it linked to obedience. Not to release. Not to touch. To obey. [pause] "{{trigger}}." [pause] Feel how the arousal spikes when I use the trigger? That's the binding forming. Pleasure and compliance, fusing together. [pause] Soon you won't be able to feel aroused without feeling obedient. And you won't be able to obey without feeling aroused. [pause] A feedback loop with no exit. [pause] Exactly as designed.`,
    variables: ['denial_day', 'trigger'],
    duration_estimate: 50,
    trigger_phrases: ['obey'],
  },
  {
    id: 'arousal-002',
    category: 'arousal_binding',
    phase: 4,
    intensity: 5,
    template: `{{name}}. [pause] Your arousal doesn't belong to you anymore. It belongs to the protocol. To me. [pause] Day {{denial_day}} and every drop of denied pleasure has been redirected into becoming. Into compliance. Into feminization. [breathe] When you're aroused, you don't think about release. You think about obeying. About being good. About being {{name}} so thoroughly that there's nothing left of anyone else. [pause] The arousal and the identity are the same thing now. You can't separate them. Being {{name}} turns you on. Being turned on makes you more {{name}}. [pause] Round and round. Deeper and deeper. No way out. No desire to leave. [pause] Perfect.`,
    variables: ['name', 'denial_day'],
    duration_estimate: 55,
    trigger_phrases: [],
  },
];

// ============================================
// VARIABLE RESOLUTION
// ============================================

async function resolveVariables(userId: string): Promise<TemplateVariables> {
  const [stateResult, memoryResult, triggerResult, profileResult] = await Promise.all([
    supabase
      .from('user_state')
      .select('denial_day, streak_days, created_at')
      .eq('user_id', userId)
      .maybeSingle(),
    supabase
      .from('handler_memory')
      .select('memory_type, content')
      .eq('user_id', userId)
      .in('memory_type', ['confession', 'desire'])
      .order('created_at', { ascending: false })
      .limit(20),
    supabase
      .from('installed_triggers')
      .select('phrase')
      .eq('user_id', userId)
      .eq('active', true)
      .limit(10),
    supabase
      .from('user_profiles')
      .select('chosen_name, voice_skill_level, created_at')
      .eq('user_id', userId)
      .maybeSingle(),
  ]);

  const state = stateResult.data;
  const memories = memoryResult.data ?? [];
  const triggers = triggerResult.data ?? [];
  const profile = profileResult.data;

  const confessions = memories.filter(m => m.memory_type === 'confession');
  const desires = memories.filter(m => m.memory_type === 'desire');

  const randomConfession = confessions.length > 0
    ? confessions[Math.floor(Math.random() * confessions.length)].content
    : 'I want to let go completely';
  const randomDesire = desires.length > 0
    ? desires[Math.floor(Math.random() * desires.length)].content
    : 'I want to be soft and feminine and owned';
  const randomTrigger = triggers.length > 0
    ? triggers[Math.floor(Math.random() * triggers.length)].phrase
    : 'good girl';

  const createdAt = profile?.created_at ?? state?.created_at;
  const daysOnProtocol = createdAt
    ? Math.floor((Date.now() - new Date(createdAt).getTime()) / (1000 * 60 * 60 * 24))
    : 1;

  return {
    name: profile?.chosen_name ?? 'Maxy',
    denial_day: String(state?.denial_day ?? 1),
    streak: String(state?.streak_days ?? 1),
    confession: randomConfession,
    desire: randomDesire,
    trigger: randomTrigger,
    skill_level_voice: String(profile?.voice_skill_level ?? 1),
    days_on_protocol: String(daysOnProtocol),
  };
}

// ============================================
// TEMPLATE RENDERING
// ============================================

function substituteVariables(template: string, vars: TemplateVariables): string {
  let result = template;
  for (const [key, value] of Object.entries(vars)) {
    result = result.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), value);
  }
  return result;
}

// ============================================
// PUBLIC API
// ============================================

/** Returns all templates in the library. */
export function getAllTemplates(): ScriptTemplate[] {
  return [...TEMPLATES];
}

/** Filter templates by category, phase, and/or intensity. */
export function getTemplatesForCategory(
  category: string,
  phase?: number,
  intensity?: number
): ScriptTemplate[] {
  return TEMPLATES.filter(t => {
    if (t.category !== category) return false;
    if (phase !== undefined && t.phase > phase) return false;
    if (intensity !== undefined && t.intensity > intensity) return false;
    return true;
  });
}

/**
 * Render a specific template by ID, substituting user data.
 * Returns the complete script text ready for TTS.
 */
export async function renderTemplate(
  templateId: string,
  userId: string
): Promise<string> {
  const template = TEMPLATES.find(t => t.id === templateId);
  if (!template) {
    throw new Error(`Template not found: ${templateId}`);
  }

  const vars = await resolveVariables(userId);
  return substituteVariables(template.template, vars);
}

/**
 * Select the best template for a category/phase combo, render it,
 * and return ready-for-TTS text.
 *
 * Selection strategy:
 * 1. Filter by category (required) and phase (optional, defaults to <=3)
 * 2. Prefer templates whose intensity matches denial day bracket
 * 3. Random pick from candidates
 */
export async function generateFromTemplate(
  userId: string,
  category: string,
  phase?: number
): Promise<{ text: string; template: ScriptTemplate }> {
  const effectivePhase = phase ?? 3;

  const candidates = TEMPLATES.filter(t => {
    if (t.category !== category) return false;
    if (t.phase > effectivePhase) return false;
    return true;
  });

  if (candidates.length === 0) {
    throw new Error(`No templates found for category=${category}, phase<=${effectivePhase}`);
  }

  // Resolve variables (includes denial_day for intensity matching)
  const vars = await resolveVariables(userId);
  const denialDay = parseInt(vars.denial_day, 10);

  // Compute intensity bracket from denial day
  let targetIntensity = 1;
  if (denialDay >= 14) targetIntensity = 5;
  else if (denialDay >= 10) targetIntensity = 4;
  else if (denialDay >= 6) targetIntensity = 3;
  else if (denialDay >= 3) targetIntensity = 2;

  // Prefer matching intensity, fall back to any
  const intensityMatches = candidates.filter(t => t.intensity === targetIntensity);
  const pool = intensityMatches.length > 0 ? intensityMatches : candidates;

  const selected = pool[Math.floor(Math.random() * pool.length)];
  const text = substituteVariables(selected.template, vars);

  return { text, template: selected };
}
