/**
 * Weekend Activities Data
 *
 * All weekend activities for Gina integration, organized by category:
 * 1. Gina Feminizing You (highest priority)
 * 2. Shared Activities
 * 3. Intimacy Rituals
 * 4. Support Activities
 */

import type { WeekendActivity, IntegrationLevel } from '../types/weekend';

// =====================================================
// Category A: Gina Feminizing You
// Activities where Gina does something TO you
// =====================================================

export const GINA_FEMINIZING_ACTIVITIES: WeekendActivity[] = [
  // Level 1 - "Normal couple stuff"
  {
    id: 'gf-1',
    activityId: 'skincare_together',
    name: 'Skincare Routine Together',
    description: 'Gina does your skincare routine on you',
    category: 'gina_feminizing',
    integrationLevel: 1,
    ginaAction: 'Applies cleanser, serum, moisturizer to your face',
    yourRole: 'receptive',
    ginaFraming: "I love when you take care of my skin. Can you do my routine tonight?",
    feminizationBenefit: 'Receiving feminine care, ritual feminization',
    ginaBenefit: 'Relaxing partner bonding activity',
    durationMinutes: 15,
    bestTime: 'evening',
    isIntimate: false,
    intimacyLevel: 'sensual',
    photoOpportunity: false,
    contentPotential: false,
    feminizationDomains: ['skincare', 'body'],
    active: true
  },
  {
    id: 'gf-2',
    activityId: 'lotion_application',
    name: 'Full Body Lotion',
    description: 'Gina applies lotion to your body',
    category: 'gina_feminizing',
    integrationLevel: 1,
    ginaAction: 'Massages lotion into your legs, arms, back',
    yourRole: 'receptive',
    ginaFraming: "My skin has been so dry. Would you help me with lotion?",
    feminizationBenefit: 'Physical feminization through her touch',
    ginaBenefit: 'Intimate caring activity',
    durationMinutes: 20,
    bestTime: 'evening',
    isIntimate: false,
    intimacyLevel: 'sensual',
    photoOpportunity: false,
    contentPotential: false,
    feminizationDomains: ['skincare', 'body'],
    active: true
  },

  // Level 2 - "Taking care of each other"
  {
    id: 'gf-3',
    activityId: 'nail_painting',
    name: 'Nail Painting',
    description: 'Gina paints your nails',
    category: 'gina_feminizing',
    integrationLevel: 2,
    ginaAction: 'Paints toenails (start here) or fingernails',
    yourRole: 'receptive',
    ginaFraming: "I want to try this color on you—just toes, it'll be our secret",
    feminizationBenefit: 'Visible feminization by her hands',
    ginaBenefit: 'Creative expression, pampering',
    requiresPriorActivity: 'lotion_application',
    requiresSupplies: true,
    suppliesNeeded: ['nail polish'],
    durationMinutes: 30,
    bestTime: 'evening',
    isIntimate: false,
    intimacyLevel: 'non_intimate',
    photoOpportunity: true,
    contentPotential: true,
    feminizationDomains: ['style', 'body'],
    active: true
  },
  {
    id: 'gf-4',
    activityId: 'shaving_legs',
    name: 'Leg Shaving',
    description: 'Gina shaves your legs',
    category: 'gina_feminizing',
    integrationLevel: 2,
    ginaAction: 'Shaves your legs smooth',
    yourRole: 'receptive',
    ginaFraming: "Smooth legs feel so much better. Let me do this for you.",
    feminizationBenefit: 'Body feminization by her hands',
    ginaBenefit: 'Prefers smooth skin on partner',
    durationMinutes: 30,
    bestTime: 'evening',
    isIntimate: false,
    intimacyLevel: 'sensual',
    photoOpportunity: true,
    contentPotential: true,
    feminizationDomains: ['body'],
    active: true
  },
  {
    id: 'gf-5',
    activityId: 'brow_grooming',
    name: 'Eyebrow Shaping',
    description: 'Gina shapes/plucks your eyebrows',
    category: 'gina_feminizing',
    integrationLevel: 2,
    ginaAction: 'Cleans up and shapes your brows',
    yourRole: 'passive',
    ginaFraming: "Your brows would look so good cleaned up. Trust me?",
    feminizationBenefit: 'Facial feminization',
    ginaBenefit: 'Grooming satisfaction',
    durationMinutes: 20,
    bestTime: 'flexible',
    isIntimate: false,
    intimacyLevel: 'non_intimate',
    photoOpportunity: true,
    contentPotential: false,
    feminizationDomains: ['style'],
    active: true
  },

  // Level 3 - "Exploring together"
  {
    id: 'gf-6',
    activityId: 'outfit_selection',
    name: 'Outfit Selection',
    description: 'Gina picks your outfit for the day',
    category: 'gina_feminizing',
    integrationLevel: 3,
    ginaAction: 'Chooses what you wear, including feminine items',
    yourRole: 'receptive',
    ginaFraming: "I want to dress you today. You pick what I wear, I pick what you wear.",
    feminizationBenefit: 'Surrendering clothing control',
    ginaBenefit: 'Fun styling exercise',
    durationMinutes: 15,
    bestTime: 'morning',
    isIntimate: false,
    intimacyLevel: 'non_intimate',
    photoOpportunity: true,
    contentPotential: true,
    feminizationDomains: ['style'],
    active: true
  },
  {
    id: 'gf-7',
    activityId: 'light_makeup',
    name: 'Light Makeup Application',
    description: 'Gina applies subtle makeup to you',
    category: 'gina_feminizing',
    integrationLevel: 3,
    ginaAction: 'Applies tinted moisturizer, brow gel, subtle lip',
    yourRole: 'receptive',
    ginaFraming: "Let me try something—just subtle, I think you'd look great",
    feminizationBenefit: 'Makeup by her hands, seeing feminine you',
    ginaBenefit: 'Creative expression',
    requiresPriorActivity: 'brow_grooming',
    requiresSupplies: true,
    suppliesNeeded: ['tinted moisturizer', 'brow gel', 'lip balm/tint'],
    durationMinutes: 20,
    bestTime: 'flexible',
    isIntimate: false,
    intimacyLevel: 'non_intimate',
    photoOpportunity: true,
    contentPotential: true,
    feminizationDomains: ['style'],
    active: true
  },
  {
    id: 'gf-8',
    activityId: 'hair_styling',
    name: 'Hair Styling',
    description: 'Gina styles your hair in a feminine way',
    category: 'gina_feminizing',
    integrationLevel: 3,
    ginaAction: 'Styles, brushes, or experiments with your hair',
    yourRole: 'receptive',
    ginaFraming: "Your hair is getting long enough to play with. Let me try something.",
    feminizationBenefit: 'Feminine hairstyling',
    ginaBenefit: 'Playing with hair is fun',
    durationMinutes: 15,
    bestTime: 'morning',
    isIntimate: false,
    intimacyLevel: 'non_intimate',
    photoOpportunity: true,
    contentPotential: false,
    feminizationDomains: ['style'],
    active: true
  },

  // Level 4 - "Helping with your journey"
  {
    id: 'gf-9',
    activityId: 'full_makeup',
    name: 'Full Makeup Session',
    description: 'Gina does a complete makeup look on you',
    category: 'gina_feminizing',
    integrationLevel: 4,
    ginaAction: 'Full face: foundation, eyes, lips, the works',
    yourRole: 'receptive',
    ginaFraming: "I want to see what you look like fully done up. For us.",
    feminizationBenefit: 'Complete transformation by her',
    ginaBenefit: 'Full creative expression',
    requiresPriorActivity: 'light_makeup',
    requiresSupplies: true,
    suppliesNeeded: ['foundation', 'eyeshadow', 'mascara', 'lipstick'],
    durationMinutes: 45,
    bestTime: 'afternoon',
    isIntimate: false,
    intimacyLevel: 'non_intimate',
    photoOpportunity: true,
    contentPotential: true,
    feminizationDomains: ['style'],
    active: true
  },
  {
    id: 'gf-10',
    activityId: 'feminization_photoshoot',
    name: 'At-Home Photoshoot',
    description: 'Gina takes photos of you dressed/made up',
    category: 'gina_feminizing',
    integrationLevel: 4,
    ginaAction: 'Directs poses, takes photos, reviews together',
    yourRole: 'collaborative',
    ginaFraming: "You look amazing. Let me capture this.",
    feminizationBenefit: 'Documentation, her seeing you feminine',
    ginaBenefit: 'Creative photography',
    requiresPriorActivity: 'full_makeup',
    durationMinutes: 30,
    bestTime: 'afternoon',
    isIntimate: false,
    intimacyLevel: 'non_intimate',
    photoOpportunity: true,
    contentPotential: true,
    contentNotes: 'High-quality evidence photos',
    feminizationDomains: ['style', 'social'],
    active: true
  },
  {
    id: 'gf-11',
    activityId: 'cage_check',
    name: 'Cage Check / Keyholder Activity',
    description: 'Gina inspects cage, discusses denial',
    category: 'gina_feminizing',
    integrationLevel: 4,
    ginaAction: 'Checks cage fit, asks about denial state, decides on timing',
    yourRole: 'receptive',
    ginaFraming: "I want to see how you're doing. Show me.",
    feminizationBenefit: 'FLR dynamic, keyholder involvement',
    ginaBenefit: 'Control, connection',
    durationMinutes: 10,
    bestTime: 'morning',
    isIntimate: true,
    intimacyLevel: 'intimate',
    photoOpportunity: true,
    contentPotential: true,
    contentNotes: 'Keyholder content',
    feminizationDomains: ['body'],
    active: true
  },

  // Level 5 - "Active participation"
  {
    id: 'gf-12',
    activityId: 'voice_feedback',
    name: 'Voice Practice Feedback',
    description: 'Gina listens to your voice practice, gives feedback',
    category: 'gina_feminizing',
    integrationLevel: 5,
    ginaAction: 'Listens, coaches, tells you what sounds good',
    yourRole: 'collaborative',
    ginaFraming: "I want to help with your voice. Read this to me.",
    feminizationBenefit: 'External feedback on voice feminization',
    ginaBenefit: 'Helping partner grow',
    durationMinutes: 20,
    bestTime: 'flexible',
    isIntimate: false,
    intimacyLevel: 'non_intimate',
    photoOpportunity: false,
    contentPotential: false,
    feminizationDomains: ['voice'],
    active: true
  },
  {
    id: 'gf-13',
    activityId: 'mannerism_coaching',
    name: 'Feminine Mannerism Coaching',
    description: 'Gina observes and corrects your movements',
    category: 'gina_feminizing',
    integrationLevel: 5,
    ginaAction: 'Watches you move, sits, gesture—gives feminine feedback',
    yourRole: 'collaborative',
    ginaFraming: "I want to help you move more gracefully. Let me show you.",
    feminizationBenefit: 'Movement feminization coaching',
    ginaBenefit: 'Teaching, connection',
    durationMinutes: 20,
    bestTime: 'flexible',
    isIntimate: false,
    intimacyLevel: 'non_intimate',
    photoOpportunity: false,
    contentPotential: false,
    feminizationDomains: ['movement'],
    active: true
  }
];

// =====================================================
// Category B: Shared Feminization Activities
// Activities you do TOGETHER
// =====================================================

export const SHARED_ACTIVITIES: WeekendActivity[] = [
  // Level 1 - Normal couple activities with hidden feminization benefit
  {
    id: 'sh-1',
    activityId: 'yoga_together',
    name: 'Partner Yoga',
    description: 'Yoga practice together',
    category: 'shared',
    integrationLevel: 1,
    ginaFraming: "Let's do yoga together this weekend. I found a good video.",
    feminizationBenefit: 'Feminine movement, flexibility, hip opening',
    ginaBenefit: 'Quality time, exercise, relaxation',
    durationMinutes: 45,
    bestTime: 'morning',
    isIntimate: false,
    intimacyLevel: 'non_intimate',
    photoOpportunity: true,
    contentPotential: true,
    feminizationDomains: ['movement', 'body'],
    active: true
  },
  {
    id: 'sh-2',
    activityId: 'skincare_routine_sync',
    name: 'Skincare Routine Together',
    description: 'Do your skincare routines side by side',
    category: 'shared',
    integrationLevel: 1,
    ginaFraming: "Let's do our skincare together tonight. Show me your routine.",
    feminizationBenefit: 'Ritual feminization, product knowledge',
    ginaBenefit: 'Partner bonding, self-care time',
    durationMinutes: 20,
    bestTime: 'evening',
    isIntimate: false,
    intimacyLevel: 'non_intimate',
    photoOpportunity: false,
    contentPotential: false,
    feminizationDomains: ['skincare'],
    active: true
  },
  {
    id: 'sh-3',
    activityId: 'face_masks',
    name: 'Face Mask Session',
    description: 'Apply face masks together, relax',
    category: 'shared',
    integrationLevel: 1,
    ginaFraming: "Spa night? I got us masks.",
    feminizationBenefit: 'Feminine self-care ritual',
    ginaBenefit: 'Spa-like relaxation, silly photos',
    requiresSupplies: true,
    suppliesNeeded: ['face masks'],
    durationMinutes: 30,
    bestTime: 'evening',
    isIntimate: false,
    intimacyLevel: 'non_intimate',
    photoOpportunity: true,
    contentPotential: false,
    feminizationDomains: ['skincare'],
    active: true
  },
  {
    id: 'sh-4',
    activityId: 'workout_together',
    name: 'Partner Workout',
    description: 'Exercise together at home or gym',
    category: 'shared',
    integrationLevel: 1,
    ginaFraming: "Let's work out together. I found a good lower body routine.",
    feminizationBenefit: 'Glute building, feminine body shaping',
    ginaBenefit: 'Accountability partner, quality time',
    durationMinutes: 45,
    bestTime: 'morning',
    isIntimate: false,
    intimacyLevel: 'non_intimate',
    photoOpportunity: true,
    contentPotential: true,
    feminizationDomains: ['body', 'movement'],
    active: true
  },
  {
    id: 'sh-5',
    activityId: 'cooking_together',
    name: 'Cooking Feminizing Meal',
    description: 'Prepare a phytoestrogen-rich meal together',
    category: 'shared',
    integrationLevel: 1,
    ginaFraming: "Let's cook dinner together. I want to try this recipe.",
    feminizationBenefit: 'Phytoestrogen intake, domestic femininity',
    ginaBenefit: 'Quality time, healthy meal, less work than cooking alone',
    durationMinutes: 60,
    bestTime: 'afternoon',
    isIntimate: false,
    intimacyLevel: 'non_intimate',
    photoOpportunity: false,
    contentPotential: false,
    feminizationDomains: ['body'],
    active: true
  },

  // Level 2 - More explicitly self-care focused
  {
    id: 'sh-6',
    activityId: 'mani_pedi_together',
    name: 'Mani-Pedi Session',
    description: "Do each other's nails",
    category: 'shared',
    integrationLevel: 2,
    ginaFraming: "Let's do each other's nails. I'll do yours if you do mine.",
    feminizationBenefit: 'Feminine grooming, receiving care',
    ginaBenefit: 'Gets pampered too, bonding',
    requiresSupplies: true,
    suppliesNeeded: ['nail polish', 'nail tools'],
    durationMinutes: 45,
    bestTime: 'evening',
    isIntimate: false,
    intimacyLevel: 'non_intimate',
    photoOpportunity: true,
    contentPotential: true,
    feminizationDomains: ['style', 'body'],
    active: true
  },
  {
    id: 'sh-7',
    activityId: 'online_shopping',
    name: 'Online Shopping Together',
    description: 'Browse clothes, products online together',
    category: 'shared',
    integrationLevel: 2,
    ginaFraming: "Let's browse [store]. Help me pick some things—and I want to pick some for you.",
    feminizationBenefit: 'Feminine wardrobe building, her input on style',
    ginaBenefit: 'Shopping is fun, gets to style you',
    durationMinutes: 45,
    bestTime: 'afternoon',
    isIntimate: false,
    intimacyLevel: 'non_intimate',
    photoOpportunity: false,
    contentPotential: false,
    feminizationDomains: ['style'],
    active: true
  },
  {
    id: 'sh-8',
    activityId: 'stretching_massage',
    name: 'Stretching + Massage',
    description: 'Help each other stretch, exchange massages',
    category: 'shared',
    integrationLevel: 2,
    ginaFraming: "I'm sore from the week. Let's stretch and massage each other.",
    feminizationBenefit: 'Body awareness, feminine receiving',
    ginaBenefit: 'Gets massage too, physical connection',
    durationMinutes: 30,
    bestTime: 'evening',
    isIntimate: false,
    intimacyLevel: 'sensual',
    photoOpportunity: false,
    contentPotential: false,
    feminizationDomains: ['body', 'movement'],
    active: true
  },

  // Level 3 - Explicitly exploring together
  {
    id: 'sh-9',
    activityId: 'transition_content',
    name: 'Watch Transition Content',
    description: 'Watch trans YouTubers, documentaries together',
    category: 'shared',
    integrationLevel: 3,
    ginaFraming: "I want to show you some videos that have helped me. Watch with me?",
    feminizationBenefit: 'Modeling, education, sharing your world',
    ginaBenefit: 'Understanding your journey, education',
    durationMinutes: 60,
    bestTime: 'evening',
    isIntimate: false,
    intimacyLevel: 'non_intimate',
    photoOpportunity: false,
    contentPotential: false,
    feminizationDomains: ['mindset', 'social'],
    active: true
  },
  {
    id: 'sh-10',
    activityId: 'wardrobe_reorganize',
    name: 'Wardrobe Reorganization',
    description: 'Go through closet together, add feminine items',
    category: 'shared',
    integrationLevel: 3,
    ginaFraming: "Help me go through my closet? I want to update my look.",
    feminizationBenefit: 'Physical transition of wardrobe, her approval',
    ginaBenefit: 'Organizational satisfaction, input on style',
    durationMinutes: 60,
    bestTime: 'afternoon',
    isIntimate: false,
    intimacyLevel: 'non_intimate',
    photoOpportunity: true,
    contentPotential: false,
    feminizationDomains: ['style'],
    active: true
  },
  {
    id: 'sh-11',
    activityId: 'in_person_shopping',
    name: 'Shopping Trip',
    description: 'Shop for feminine items together in person',
    category: 'shared',
    integrationLevel: 3,
    ginaFraming: "Come shopping with me? I want your opinion on some things.",
    feminizationBenefit: 'Public femininity, her endorsement',
    ginaBenefit: 'Shopping trip, couple outing',
    durationMinutes: 120,
    bestTime: 'afternoon',
    isIntimate: false,
    intimacyLevel: 'non_intimate',
    photoOpportunity: true,
    contentPotential: false,
    feminizationDomains: ['style', 'social'],
    active: true
  },

  // Level 4 - Helping with journey
  {
    id: 'sh-12',
    activityId: 'laser_appointment',
    name: 'Laser Hair Removal (Together)',
    description: 'She accompanies you to laser appointment',
    category: 'shared',
    integrationLevel: 4,
    ginaFraming: "Would you come with me to my laser appointment? I'd like you there.",
    feminizationBenefit: 'Permanent feminization, her investment',
    ginaBenefit: 'Supporting partner, understanding the process',
    durationMinutes: 90,
    bestTime: 'flexible',
    isIntimate: false,
    intimacyLevel: 'non_intimate',
    photoOpportunity: false,
    contentPotential: false,
    feminizationDomains: ['body'],
    active: true
  },
  {
    id: 'sh-13',
    activityId: 'progress_photos_together',
    name: 'Progress Photo Session',
    description: 'Review progress photos together',
    category: 'shared',
    integrationLevel: 4,
    ginaFraming: "I want to show you how far I've come. Look at these with me.",
    feminizationBenefit: 'External validation, shared witness',
    ginaBenefit: 'Seeing your progress, feeling included',
    durationMinutes: 20,
    bestTime: 'flexible',
    isIntimate: false,
    intimacyLevel: 'non_intimate',
    photoOpportunity: false,
    contentPotential: false,
    feminizationDomains: ['mindset'],
    active: true
  }
];

// =====================================================
// Category C: Intimacy Rituals
// Existing patterns + feminized evolutions
// =====================================================

export const INTIMACY_ACTIVITIES: WeekendActivity[] = [
  // Existing rituals with feminized potential
  {
    id: 'in-1',
    activityId: 'weekend_shower',
    name: 'Weekend Shower Together',
    description: 'Showering together on weekends',
    category: 'intimacy',
    integrationLevel: 2,
    ginaFraming: "Shower with me? I want to take care of you.",
    feminizationBenefit: 'She washes you, shaves you, applies products. You receive rather than lead.',
    ginaBenefit: 'Intimate connection',
    durationMinutes: 20,
    bestTime: 'evening',
    isIntimate: true,
    intimacyLevel: 'sensual',
    photoOpportunity: true,
    contentPotential: true,
    contentNotes: 'Couples shower content is popular',
    feminizationDomains: ['body'],
    active: true
  },
  {
    id: 'in-2',
    activityId: 'weekend_service',
    name: 'Weekend Oral Service',
    description: 'Oral service focused on her pleasure',
    category: 'intimacy',
    integrationLevel: 3,
    ginaFraming: "I want you to focus on me first tonight.",
    feminizationBenefit: 'You in cage until she decides to unlock. She controls timing. Emphasis on serving her pleasure first.',
    ginaBenefit: 'Receives focused attention',
    durationMinutes: 30,
    bestTime: 'evening',
    isIntimate: true,
    intimacyLevel: 'sexual',
    photoOpportunity: true,
    contentPotential: true,
    contentNotes: 'Caged service content is high-engagement',
    feminizationDomains: ['body', 'mindset'],
    active: true
  },

  // New feminized intimacy options
  {
    id: 'in-3',
    activityId: 'cockwarming',
    name: 'Cockwarming',
    description: 'Extended penetration without movement during TV time',
    category: 'intimacy',
    integrationLevel: 2,
    ginaFraming: "Let's try something—just stay inside me while we watch TV. No moving.",
    feminizationBenefit: 'You inside her (or toy inside you) during normal couch time. Intimacy without goal.',
    ginaBenefit: 'Connection, intimacy',
    durationMinutes: 60,
    bestTime: 'evening',
    isIntimate: true,
    intimacyLevel: 'intimate',
    photoOpportunity: true,
    contentPotential: true,
    contentNotes: 'Cockwarming is a popular niche',
    feminizationDomains: ['body'],
    active: true
  },
  {
    id: 'in-4',
    activityId: 'denial_tease',
    name: 'Denial Tease Session',
    description: 'She teases you while you remain caged/denied',
    category: 'intimacy',
    integrationLevel: 3,
    ginaFraming: "I want to tease you. You don't get to come—but I do.",
    feminizationBenefit: 'She enjoys power, you enjoy surrender. Builds to her orgasm, not yours.',
    ginaBenefit: 'Power, control, her pleasure',
    durationMinutes: 30,
    bestTime: 'evening',
    isIntimate: true,
    intimacyLevel: 'sexual',
    photoOpportunity: true,
    contentPotential: true,
    contentNotes: 'Denial/tease content is high engagement',
    feminizationDomains: ['body', 'mindset'],
    active: true
  },
  {
    id: 'in-5',
    activityId: 'service_session',
    name: 'Full Service Session',
    description: "You serve her pleasure completely—oral, massage, whatever she wants",
    category: 'intimacy',
    integrationLevel: 3,
    ginaFraming: "Tonight is about me. I want you to focus entirely on my pleasure.",
    feminizationBenefit: 'Flipping script: she receives, you give. Builds FLR dynamic.',
    ginaBenefit: 'All focus on her pleasure',
    durationMinutes: 45,
    bestTime: 'evening',
    isIntimate: true,
    intimacyLevel: 'sexual',
    photoOpportunity: true,
    contentPotential: true,
    contentNotes: 'FLR service content',
    feminizationDomains: ['mindset', 'body'],
    active: true
  },
  {
    id: 'in-6',
    activityId: 'dressed_intimacy',
    name: 'Dressed Intimacy',
    description: "Intimacy while you're feminized (makeup, lingerie)",
    category: 'intimacy',
    integrationLevel: 4,
    ginaFraming: "Stay dressed up for me. I want you like this.",
    feminizationBenefit: 'She sees you as feminine during intimacy. Reinforces identity.',
    ginaBenefit: 'Novelty, attraction',
    requiresPriorActivity: 'full_makeup',
    durationMinutes: 30,
    bestTime: 'evening',
    isIntimate: true,
    intimacyLevel: 'sexual',
    photoOpportunity: true,
    contentPotential: true,
    contentNotes: 'Feminized couples content',
    feminizationDomains: ['style', 'mindset', 'body'],
    active: true
  },
  {
    id: 'in-7',
    activityId: 'pegging',
    name: 'Role Reversal / Pegging',
    description: 'She penetrates you',
    category: 'intimacy',
    integrationLevel: 5,
    ginaFraming: "I want to try something. I want to be inside you.",
    feminizationBenefit: 'Complete role reversal. You receive, she gives. Deeply feminizing.',
    ginaBenefit: 'Power, new experience',
    requiresSupplies: true,
    suppliesNeeded: ['strap-on', 'lube'],
    durationMinutes: 30,
    bestTime: 'evening',
    isIntimate: true,
    intimacyLevel: 'sexual',
    photoOpportunity: true,
    contentPotential: true,
    contentNotes: 'Pegging content has dedicated audience',
    feminizationDomains: ['body', 'mindset'],
    active: true
  }
];

// =====================================================
// Category D: Support Activities
// Service, domestic, planning, affirmation
// =====================================================

export const SUPPORT_ACTIVITIES: WeekendActivity[] = [
  // Service activities
  {
    id: 'su-1',
    activityId: 'making_her_coffee',
    name: 'Morning Service',
    description: 'Bring her coffee in bed, prepare her morning',
    category: 'support',
    subcategory: 'service',
    integrationLevel: 1,
    ginaFraming: "(No framing needed - just do it)",
    feminizationBenefit: 'Service orientation, feminine role modeling',
    ginaBenefit: 'Pampered, cared for',
    durationMinutes: 15,
    bestTime: 'morning',
    isIntimate: false,
    intimacyLevel: 'non_intimate',
    photoOpportunity: false,
    contentPotential: false,
    feminizationDomains: ['mindset'],
    active: true
  },
  {
    id: 'su-2',
    activityId: 'drawing_her_bath',
    name: 'Draw Her Bath',
    description: 'Prepare a bath for her, light candles, set mood',
    category: 'support',
    subcategory: 'service',
    integrationLevel: 1,
    ginaFraming: "Go relax, I'll set up the bath for you.",
    feminizationBenefit: 'Caretaking, attention to her comfort',
    ginaBenefit: 'Luxurious self-care',
    durationMinutes: 10,
    bestTime: 'evening',
    isIntimate: false,
    intimacyLevel: 'non_intimate',
    photoOpportunity: false,
    contentPotential: false,
    feminizationDomains: ['mindset'],
    active: true
  },
  {
    id: 'su-3',
    activityId: 'foot_massage',
    name: 'Foot Massage',
    description: 'Extended foot/leg massage for her',
    category: 'support',
    subcategory: 'service',
    integrationLevel: 2,
    ginaFraming: "Let me rub your feet while we watch TV.",
    feminizationBenefit: 'Service position, attending to her',
    ginaBenefit: 'Relaxation, being cared for',
    durationMinutes: 20,
    bestTime: 'evening',
    isIntimate: false,
    intimacyLevel: 'sensual',
    photoOpportunity: false,
    contentPotential: false,
    feminizationDomains: ['mindset'],
    active: true
  },

  // Domestic
  {
    id: 'su-4',
    activityId: 'meal_prep',
    name: 'Weekend Meal Prep',
    description: 'Prepare meals for the week (phytoestrogen-rich)',
    category: 'support',
    subcategory: 'domestic',
    integrationLevel: 1,
    ginaFraming: "I'll handle meal prep this weekend.",
    feminizationBenefit: 'Domestic role, nutritional goals',
    ginaBenefit: 'Healthy meals ready, less weekday stress',
    durationMinutes: 120,
    bestTime: 'afternoon',
    isIntimate: false,
    intimacyLevel: 'non_intimate',
    photoOpportunity: false,
    contentPotential: false,
    feminizationDomains: ['body'],
    active: true
  },
  {
    id: 'su-5',
    activityId: 'home_spa',
    name: 'Home Spa Day',
    description: 'Full spa experience at home for both',
    category: 'support',
    subcategory: 'domestic',
    integrationLevel: 2,
    ginaFraming: "Let's have a spa day at home. I'll set everything up.",
    feminizationBenefit: 'Self-care ritual, feminine treatment',
    ginaBenefit: 'Relaxation, pampering',
    durationMinutes: 120,
    bestTime: 'afternoon',
    isIntimate: false,
    intimacyLevel: 'non_intimate',
    photoOpportunity: true,
    contentPotential: false,
    feminizationDomains: ['skincare', 'body'],
    active: true
  },

  // Planning
  {
    id: 'su-6',
    activityId: 'week_planning',
    name: 'Week Planning Together',
    description: 'Plan the upcoming week, including your goals',
    category: 'support',
    subcategory: 'planning',
    integrationLevel: 2,
    ginaFraming: "Let's plan out our week together.",
    feminizationBenefit: 'She witnesses your commitment, accountability',
    ginaBenefit: 'Organized week, feeling connected to your goals',
    durationMinutes: 30,
    bestTime: 'evening',
    isIntimate: false,
    intimacyLevel: 'non_intimate',
    photoOpportunity: false,
    contentPotential: false,
    feminizationDomains: ['mindset'],
    active: true
  },
  {
    id: 'su-7',
    activityId: 'goal_review',
    name: 'Progress Review',
    description: 'Review your feminization progress with her',
    category: 'support',
    subcategory: 'planning',
    integrationLevel: 3,
    ginaFraming: "I want to share where I am in my journey. Can we talk about it?",
    feminizationBenefit: 'External witness, celebration, accountability',
    ginaBenefit: 'Understanding your journey, feeling included',
    durationMinutes: 20,
    bestTime: 'flexible',
    isIntimate: false,
    intimacyLevel: 'non_intimate',
    photoOpportunity: false,
    contentPotential: false,
    feminizationDomains: ['mindset'],
    active: true
  },

  // Affirmation
  {
    id: 'su-8',
    activityId: 'affirmation_exchange',
    name: 'Affirmation Exchange',
    description: 'Exchange words of affirmation',
    category: 'support',
    subcategory: 'affirmation',
    integrationLevel: 3,
    ginaFraming: "I want to tell you what I love about you. And I want to hear what you love about me.",
    feminizationBenefit: 'Receiving validation, hearing her see you as feminine',
    ginaBenefit: 'Emotional connection, expressing love',
    durationMinutes: 10,
    bestTime: 'flexible',
    isIntimate: false,
    intimacyLevel: 'non_intimate',
    photoOpportunity: false,
    contentPotential: false,
    feminizationDomains: ['mindset'],
    active: true
  },
  {
    id: 'su-9',
    activityId: 'name_practice',
    name: 'Name Usage',
    description: 'She uses your chosen name in private',
    category: 'support',
    subcategory: 'affirmation',
    integrationLevel: 4,
    ginaFraming: "I want to start calling you [name] when we're alone. Is that okay?",
    feminizationBenefit: 'Identity reinforcement, external validation',
    ginaBenefit: 'Supporting your identity',
    durationMinutes: 0, // Ongoing
    bestTime: 'flexible',
    isIntimate: false,
    intimacyLevel: 'non_intimate',
    photoOpportunity: false,
    contentPotential: false,
    feminizationDomains: ['mindset', 'social'],
    active: true
  },
  {
    id: 'su-10',
    activityId: 'gratitude_ritual',
    name: 'Weekend Gratitude',
    description: 'Share what you appreciate about each other',
    category: 'support',
    subcategory: 'affirmation',
    integrationLevel: 1,
    ginaFraming: "Before bed, let's share three things we're grateful for about each other.",
    feminizationBenefit: 'Emotional openness, vulnerability practice',
    ginaBenefit: 'Feeling appreciated, connection',
    durationMinutes: 10,
    bestTime: 'evening',
    isIntimate: false,
    intimacyLevel: 'non_intimate',
    photoOpportunity: false,
    contentPotential: false,
    feminizationDomains: ['mindset'],
    active: true
  }
];

// =====================================================
// Combined export
// =====================================================

export const ALL_WEEKEND_ACTIVITIES: WeekendActivity[] = [
  ...GINA_FEMINIZING_ACTIVITIES,
  ...SHARED_ACTIVITIES,
  ...INTIMACY_ACTIVITIES,
  ...SUPPORT_ACTIVITIES
];

/**
 * Get activities by category
 */
export function getActivitiesByCategory(category: string): WeekendActivity[] {
  return ALL_WEEKEND_ACTIVITIES.filter(a => a.category === category && a.active);
}

/**
 * Get activities up to a certain integration level
 */
export function getActivitiesByMaxLevel(maxLevel: IntegrationLevel): WeekendActivity[] {
  return ALL_WEEKEND_ACTIVITIES.filter(a => a.integrationLevel <= maxLevel && a.active);
}

/**
 * Get an activity by its activityId
 */
export function getActivityById(activityId: string): WeekendActivity | undefined {
  return ALL_WEEKEND_ACTIVITIES.find(a => a.activityId === activityId);
}

/**
 * Get activities suitable for a specific time block
 */
export function getActivitiesForTimeBlock(
  timeBlock: 'morning' | 'afternoon' | 'evening',
  maxLevel: IntegrationLevel
): WeekendActivity[] {
  return ALL_WEEKEND_ACTIVITIES.filter(a =>
    a.active &&
    a.integrationLevel <= maxLevel &&
    (a.bestTime === timeBlock || a.bestTime === 'flexible')
  );
}

/**
 * Get milestone ID for an activity (if applicable)
 */
export function getMilestoneForActivity(activityId: string): string | null {
  const milestoneMap: Record<string, string> = {
    'nail_painting': 'firstNailPainting',
    'light_makeup': 'firstMakeup',
    'full_makeup': 'firstFullMakeup',
    'feminization_photoshoot': 'firstPhotoshoot',
    'cage_check': 'firstCageCheck',
    'dressed_intimacy': 'firstDressedIntimacy',
    'pegging': 'firstRoleReversal',
    'name_practice': 'firstNameUsage'
  };

  return milestoneMap[activityId] || null;
}
