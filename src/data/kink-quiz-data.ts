/**
 * Kink Quiz Question Data
 * "Have you ever..." questions mapped to vector milestones
 */

import type { VectorId } from '../types/adaptive-feminization';

export type QuizAnswer = 'never' | 'tried' | 'sometimes' | 'regular' | 'always';

export interface KinkQuizQuestion {
  id: string;
  vectorId: VectorId;
  category: 'feminization' | 'sissification';
  group: 'warmup' | 'physical' | 'social' | 'arousal' | 'conditioning' | 'advanced';
  question: string;
  milestoneLevel: 1 | 3 | 5 | 7 | 10;
  weight: number;
}

// Answer to level multiplier
export const ANSWER_MULTIPLIERS: Record<QuizAnswer, number> = {
  never: 0,
  tried: 0.3,
  sometimes: 0.6,
  regular: 0.85,
  always: 1.0,
};

// Answer labels for UI
export const ANSWER_LABELS: Record<QuizAnswer, string> = {
  never: 'Never',
  tried: 'Once or twice',
  sometimes: 'Sometimes',
  regular: 'Regularly',
  always: "It's part of who I am",
};

export const QUIZ_QUESTIONS: KinkQuizQuestion[] = [
  // ============================================
  // WARMUP - Easy, non-threatening topics
  // ============================================

  // Wardrobe Building
  {
    id: 'wardrobe_1',
    vectorId: 'wardrobe_building',
    category: 'feminization',
    group: 'warmup',
    question: 'Have you ever owned feminine clothing items?',
    milestoneLevel: 1,
    weight: 1,
  },
  {
    id: 'wardrobe_2',
    vectorId: 'wardrobe_building',
    category: 'feminization',
    group: 'warmup',
    question: 'Have you built up enough feminine outfits for a full week?',
    milestoneLevel: 5,
    weight: 1,
  },
  {
    id: 'wardrobe_3',
    vectorId: 'wardrobe_building',
    category: 'feminization',
    group: 'warmup',
    question: 'Have you transitioned your wardrobe to be predominantly feminine?',
    milestoneLevel: 7,
    weight: 1,
  },

  // Skincare & Beauty
  {
    id: 'skincare_1',
    vectorId: 'skincare_beauty',
    category: 'feminization',
    group: 'warmup',
    question: 'Have you ever established a daily skincare routine?',
    milestoneLevel: 1,
    weight: 1,
  },
  {
    id: 'skincare_2',
    vectorId: 'skincare_beauty',
    category: 'feminization',
    group: 'warmup',
    question: 'Have you ever worn makeup outside your home?',
    milestoneLevel: 5,
    weight: 1,
  },
  {
    id: 'skincare_3',
    vectorId: 'skincare_beauty',
    category: 'feminization',
    group: 'warmup',
    question: 'Have you done your own makeup confidently for different occasions?',
    milestoneLevel: 7,
    weight: 1,
  },

  // Hair Styling
  {
    id: 'hair_1',
    vectorId: 'hair_styling',
    category: 'feminization',
    group: 'warmup',
    question: 'Have you ever grown your hair out or worn a feminine hairstyle?',
    milestoneLevel: 1,
    weight: 1,
  },
  {
    id: 'hair_2',
    vectorId: 'hair_styling',
    category: 'feminization',
    group: 'warmup',
    question: 'Have you styled your hair in a way that reads as feminine?',
    milestoneLevel: 5,
    weight: 1,
  },

  // ============================================
  // PHYSICAL - Clothing, appearance, body
  // ============================================

  // Voice Training
  {
    id: 'voice_1',
    vectorId: 'voice_training',
    category: 'feminization',
    group: 'physical',
    question: 'Have you ever practiced speaking in a more feminine voice?',
    milestoneLevel: 1,
    weight: 1,
  },
  {
    id: 'voice_2',
    vectorId: 'voice_training',
    category: 'feminization',
    group: 'physical',
    question: 'Have you ever been gendered correctly on a phone call?',
    milestoneLevel: 5,
    weight: 1,
  },
  {
    id: 'voice_3',
    vectorId: 'voice_training',
    category: 'feminization',
    group: 'physical',
    question: 'Have you spoken femininely in a way that felt natural without conscious effort?',
    milestoneLevel: 7,
    weight: 1,
  },

  // Movement & Posture
  {
    id: 'movement_1',
    vectorId: 'movement_posture',
    category: 'feminization',
    group: 'physical',
    question: 'Have you ever consciously practiced feminine posture or movement?',
    milestoneLevel: 1,
    weight: 1,
  },
  {
    id: 'movement_2',
    vectorId: 'movement_posture',
    category: 'feminization',
    group: 'physical',
    question: 'Have you sat and walked in a naturally feminine way?',
    milestoneLevel: 5,
    weight: 1,
  },
  {
    id: 'movement_3',
    vectorId: 'movement_posture',
    category: 'feminization',
    group: 'physical',
    question: 'Have others commented on your graceful or feminine movement?',
    milestoneLevel: 7,
    weight: 1,
  },

  // Fitness & Body
  {
    id: 'fitness_1',
    vectorId: 'fitness_body',
    category: 'feminization',
    group: 'physical',
    question: 'Have you ever followed a fitness routine aimed at feminizing your body?',
    milestoneLevel: 1,
    weight: 1,
  },
  {
    id: 'fitness_2',
    vectorId: 'fitness_body',
    category: 'feminization',
    group: 'physical',
    question: 'Have you noticed your body shape becoming more feminine?',
    milestoneLevel: 5,
    weight: 1,
  },

  // ============================================
  // SOCIAL - Presentation, relationships
  // ============================================

  // Public Presentation
  {
    id: 'public_1',
    vectorId: 'public_presentation',
    category: 'feminization',
    group: 'social',
    question: 'Have you ever gone out in public presenting femininely?',
    milestoneLevel: 1,
    weight: 1,
  },
  {
    id: 'public_2',
    vectorId: 'public_presentation',
    category: 'feminization',
    group: 'social',
    question: 'Have you run errands and done daily activities while presenting feminine?',
    milestoneLevel: 5,
    weight: 1,
  },
  {
    id: 'public_3',
    vectorId: 'public_presentation',
    category: 'feminization',
    group: 'social',
    question: 'Have you presented femininely full-time in public?',
    milestoneLevel: 7,
    weight: 1,
  },

  // Social Relationships
  {
    id: 'social_1',
    vectorId: 'social_relationships',
    category: 'feminization',
    group: 'social',
    question: 'Have you ever come out to a friend about your identity?',
    milestoneLevel: 1,
    weight: 1,
  },
  {
    id: 'social_2',
    vectorId: 'social_relationships',
    category: 'feminization',
    group: 'social',
    question: 'Have you built supportive friendships with people who know and accept you?',
    milestoneLevel: 5,
    weight: 1,
  },
  {
    id: 'social_3',
    vectorId: 'social_relationships',
    category: 'feminization',
    group: 'social',
    question: 'Have you formed close friendships based on your authentic self?',
    milestoneLevel: 7,
    weight: 1,
  },

  // Professional Navigation
  {
    id: 'professional_1',
    vectorId: 'professional_navigation',
    category: 'feminization',
    group: 'social',
    question: 'Have you ever considered how to navigate your identity at work?',
    milestoneLevel: 1,
    weight: 1,
  },
  {
    id: 'professional_2',
    vectorId: 'professional_navigation',
    category: 'feminization',
    group: 'social',
    question: 'Have you come out to colleagues about your identity?',
    milestoneLevel: 5,
    weight: 1,
  },
  {
    id: 'professional_3',
    vectorId: 'professional_navigation',
    category: 'feminization',
    group: 'social',
    question: 'Have you presented as yourself full-time at work?',
    milestoneLevel: 7,
    weight: 1,
  },

  // Family Dynamics
  {
    id: 'family_1',
    vectorId: 'family_dynamics',
    category: 'feminization',
    group: 'social',
    question: 'Have you ever come out to any family member?',
    milestoneLevel: 1,
    weight: 1,
  },
  {
    id: 'family_2',
    vectorId: 'family_dynamics',
    category: 'feminization',
    group: 'social',
    question: 'Have you gotten your immediate family to use your correct name/pronouns?',
    milestoneLevel: 5,
    weight: 1,
  },
  {
    id: 'family_3',
    vectorId: 'family_dynamics',
    category: 'feminization',
    group: 'social',
    question: 'Have you experienced full acceptance from your family?',
    milestoneLevel: 7,
    weight: 1,
  },

  // Dating & Intimacy
  {
    id: 'dating_1',
    vectorId: 'dating_intimacy',
    category: 'feminization',
    group: 'social',
    question: 'Have you felt confident that you can be loved as your authentic self?',
    milestoneLevel: 1,
    weight: 1,
  },
  {
    id: 'dating_2',
    vectorId: 'dating_intimacy',
    category: 'feminization',
    group: 'social',
    question: 'Have you dated while presenting as your true self?',
    milestoneLevel: 5,
    weight: 1,
  },
  {
    id: 'dating_3',
    vectorId: 'dating_intimacy',
    category: 'feminization',
    group: 'social',
    question: 'Have you been comfortable with intimacy as your authentic self?',
    milestoneLevel: 7,
    weight: 1,
  },

  // Community Integration
  {
    id: 'community_1',
    vectorId: 'community_integration',
    category: 'feminization',
    group: 'social',
    question: 'Have you ever engaged with trans/gender-diverse community spaces?',
    milestoneLevel: 1,
    weight: 1,
  },
  {
    id: 'community_2',
    vectorId: 'community_integration',
    category: 'feminization',
    group: 'social',
    question: 'Have you made friends from within the community?',
    milestoneLevel: 5,
    weight: 1,
  },
  {
    id: 'community_3',
    vectorId: 'community_integration',
    category: 'feminization',
    group: 'social',
    question: 'Have you contributed to or helped others in the community?',
    milestoneLevel: 7,
    weight: 1,
  },

  // Identity Integration
  {
    id: 'identity_1',
    vectorId: 'identity_integration',
    category: 'feminization',
    group: 'social',
    question: 'Have you accepted that you are trans/gender-diverse?',
    milestoneLevel: 1,
    weight: 1,
  },
  {
    id: 'identity_2',
    vectorId: 'identity_integration',
    category: 'feminization',
    group: 'social',
    question: 'Have you chosen a name that feels like yours?',
    milestoneLevel: 3,
    weight: 1,
  },
  {
    id: 'identity_3',
    vectorId: 'identity_integration',
    category: 'feminization',
    group: 'social',
    question: 'Have you felt your past and present identity become coherent and integrated?',
    milestoneLevel: 7,
    weight: 1,
  },

  // Emotional Processing
  {
    id: 'emotional_1',
    vectorId: 'emotional_processing',
    category: 'feminization',
    group: 'social',
    question: 'Have you become more aware of and in touch with your emotions?',
    milestoneLevel: 1,
    weight: 1,
  },
  {
    id: 'emotional_2',
    vectorId: 'emotional_processing',
    category: 'feminization',
    group: 'social',
    question: 'Have you expressed emotions like sadness or joy freely?',
    milestoneLevel: 5,
    weight: 1,
  },
  {
    id: 'emotional_3',
    vectorId: 'emotional_processing',
    category: 'feminization',
    group: 'social',
    question: 'Have you been emotionally vulnerable with others?',
    milestoneLevel: 7,
    weight: 1,
  },

  // Self-Perception
  {
    id: 'perception_1',
    vectorId: 'self_perception',
    category: 'feminization',
    group: 'social',
    question: 'Have you seen glimpses of your true self in the mirror?',
    milestoneLevel: 1,
    weight: 1,
  },
  {
    id: 'perception_2',
    vectorId: 'self_perception',
    category: 'feminization',
    group: 'social',
    question: 'Have you liked what you see in the mirror?',
    milestoneLevel: 5,
    weight: 1,
  },
  {
    id: 'perception_3',
    vectorId: 'self_perception',
    category: 'feminization',
    group: 'social',
    question: 'Have you felt your reflection match your inner sense of self?',
    milestoneLevel: 7,
    weight: 1,
  },

  // Memory & Narrative
  {
    id: 'memory_1',
    vectorId: 'memory_narrative',
    category: 'feminization',
    group: 'social',
    question: 'Have you looked back and seen signs of your identity in childhood?',
    milestoneLevel: 1,
    weight: 1,
  },
  {
    id: 'memory_2',
    vectorId: 'memory_narrative',
    category: 'feminization',
    group: 'social',
    question: 'Have you reframed your life story as a journey to your true self?',
    milestoneLevel: 5,
    weight: 1,
  },

  // Future Visioning
  {
    id: 'future_1',
    vectorId: 'future_visioning',
    category: 'feminization',
    group: 'social',
    question: 'Have you imagined a future where you are living as your authentic self?',
    milestoneLevel: 1,
    weight: 1,
  },
  {
    id: 'future_2',
    vectorId: 'future_visioning',
    category: 'feminization',
    group: 'social',
    question: 'Have you made concrete plans and goals for your journey?',
    milestoneLevel: 5,
    weight: 1,
  },
  {
    id: 'future_3',
    vectorId: 'future_visioning',
    category: 'feminization',
    group: 'social',
    question: 'Have you felt genuinely excited about your future?',
    milestoneLevel: 7,
    weight: 1,
  },

  // Authenticity Expression
  {
    id: 'authenticity_1',
    vectorId: 'authenticity_expression',
    category: 'feminization',
    group: 'social',
    question: 'Have you started expressing your true self in some contexts?',
    milestoneLevel: 1,
    weight: 1,
  },
  {
    id: 'authenticity_2',
    vectorId: 'authenticity_expression',
    category: 'feminization',
    group: 'social',
    question: 'Have you been authentic in most areas of your life?',
    milestoneLevel: 5,
    weight: 1,
  },
  {
    id: 'authenticity_3',
    vectorId: 'authenticity_expression',
    category: 'feminization',
    group: 'social',
    question: 'Have you been completely yourself everywhere you go?',
    milestoneLevel: 7,
    weight: 1,
  },

  // ============================================
  // AROUSAL - Denial, chastity, edging
  // ============================================

  // Denial Training
  {
    id: 'denial_1',
    vectorId: 'denial_training',
    category: 'sissification',
    group: 'arousal',
    question: 'Have you ever intentionally denied yourself orgasm for multiple days?',
    milestoneLevel: 1,
    weight: 1,
  },
  {
    id: 'denial_2',
    vectorId: 'denial_training',
    category: 'sissification',
    group: 'arousal',
    question: 'Have you ever completed a week or more of denial?',
    milestoneLevel: 5,
    weight: 1,
  },
  {
    id: 'denial_3',
    vectorId: 'denial_training',
    category: 'sissification',
    group: 'arousal',
    question: 'Have you made being in a denied state your normal baseline?',
    milestoneLevel: 7,
    weight: 1,
  },

  // Edge Conditioning
  {
    id: 'edge_1',
    vectorId: 'edge_conditioning',
    category: 'sissification',
    group: 'arousal',
    question: 'Have you ever practiced edging intentionally?',
    milestoneLevel: 1,
    weight: 1,
  },
  {
    id: 'edge_2',
    vectorId: 'edge_conditioning',
    category: 'sissification',
    group: 'arousal',
    question: 'Have you edged for extended periods with good control?',
    milestoneLevel: 5,
    weight: 1,
  },
  {
    id: 'edge_3',
    vectorId: 'edge_conditioning',
    category: 'sissification',
    group: 'arousal',
    question: 'Have you preferred edging to actual orgasm?',
    milestoneLevel: 7,
    weight: 1,
  },

  // Arousal-Feminization Link
  {
    id: 'arousal_link_1',
    vectorId: 'arousal_feminization_link',
    category: 'sissification',
    group: 'arousal',
    question: 'Have you noticed arousal connected to feminine activities or clothing?',
    milestoneLevel: 1,
    weight: 1,
  },
  {
    id: 'arousal_link_2',
    vectorId: 'arousal_feminization_link',
    category: 'sissification',
    group: 'arousal',
    question: 'Have you noticed feminization reliably triggering arousal?',
    milestoneLevel: 5,
    weight: 1,
  },
  {
    id: 'arousal_link_3',
    vectorId: 'arousal_feminization_link',
    category: 'sissification',
    group: 'arousal',
    question: 'Have arousal and femininity become inseparably linked for you?',
    milestoneLevel: 7,
    weight: 1,
  },

  // Orgasm Transformation
  {
    id: 'orgasm_1',
    vectorId: 'orgasm_transformation',
    category: 'sissification',
    group: 'arousal',
    question: 'Have you ever experienced a ruined orgasm?',
    milestoneLevel: 1,
    weight: 1,
  },
  {
    id: 'orgasm_2',
    vectorId: 'orgasm_transformation',
    category: 'sissification',
    group: 'arousal',
    question: 'Have you ever had a prostate/sissygasm?',
    milestoneLevel: 5,
    weight: 1,
  },
  {
    id: 'orgasm_3',
    vectorId: 'orgasm_transformation',
    category: 'sissification',
    group: 'arousal',
    question: 'Have traditional orgasms felt unsatisfying compared to feminine ones?',
    milestoneLevel: 7,
    weight: 1,
  },

  // Chastity Integration
  {
    id: 'chastity_1',
    vectorId: 'chastity_integration',
    category: 'sissification',
    group: 'arousal',
    question: 'Have you ever worn a chastity device?',
    milestoneLevel: 1,
    weight: 1,
  },
  {
    id: 'chastity_2',
    vectorId: 'chastity_integration',
    category: 'sissification',
    group: 'arousal',
    question: 'Have you worn chastity for multiple days continuously?',
    milestoneLevel: 5,
    weight: 1,
  },
  {
    id: 'chastity_3',
    vectorId: 'chastity_integration',
    category: 'sissification',
    group: 'arousal',
    question: 'Have you felt more comfortable locked than unlocked?',
    milestoneLevel: 7,
    weight: 1,
  },

  // ============================================
  // CONDITIONING - Submission, identity erosion
  // ============================================

  // Service Orientation
  {
    id: 'service_1',
    vectorId: 'service_orientation',
    category: 'sissification',
    group: 'conditioning',
    question: 'Have you ever performed service acts for a partner or authority?',
    milestoneLevel: 1,
    weight: 1,
  },
  {
    id: 'service_2',
    vectorId: 'service_orientation',
    category: 'sissification',
    group: 'conditioning',
    question: 'Have you found genuine joy in serving others?',
    milestoneLevel: 5,
    weight: 1,
  },
  {
    id: 'service_3',
    vectorId: 'service_orientation',
    category: 'sissification',
    group: 'conditioning',
    question: 'Have you made service a core part of your identity?',
    milestoneLevel: 7,
    weight: 1,
  },

  // Protocol Adherence
  {
    id: 'protocol_1',
    vectorId: 'protocol_adherence',
    category: 'sissification',
    group: 'conditioning',
    question: 'Have you ever followed specific rules or protocols?',
    milestoneLevel: 1,
    weight: 1,
  },
  {
    id: 'protocol_2',
    vectorId: 'protocol_adherence',
    category: 'sissification',
    group: 'conditioning',
    question: 'Have you followed protocols consistently without being reminded?',
    milestoneLevel: 5,
    weight: 1,
  },
  {
    id: 'protocol_3',
    vectorId: 'protocol_adherence',
    category: 'sissification',
    group: 'conditioning',
    question: 'Have protocols become so ingrained that breaking them feels wrong?',
    milestoneLevel: 7,
    weight: 1,
  },

  // Authority Response
  {
    id: 'authority_1',
    vectorId: 'authority_response',
    category: 'sissification',
    group: 'conditioning',
    question: 'Have you naturally deferred to authority figures?',
    milestoneLevel: 1,
    weight: 1,
  },
  {
    id: 'authority_2',
    vectorId: 'authority_response',
    category: 'sissification',
    group: 'conditioning',
    question: 'Have you responded immediately and without question to commands?',
    milestoneLevel: 5,
    weight: 1,
  },
  {
    id: 'authority_3',
    vectorId: 'authority_response',
    category: 'sissification',
    group: 'conditioning',
    question: 'Has submission to authority felt like your natural state?',
    milestoneLevel: 7,
    weight: 1,
  },

  // Task Completion
  {
    id: 'task_1',
    vectorId: 'task_completion',
    category: 'sissification',
    group: 'conditioning',
    question: 'Have you felt satisfaction from completing assigned tasks?',
    milestoneLevel: 1,
    weight: 1,
  },
  {
    id: 'task_2',
    vectorId: 'task_completion',
    category: 'sissification',
    group: 'conditioning',
    question: 'Have you completed tasks with high quality and enthusiasm?',
    milestoneLevel: 5,
    weight: 1,
  },
  {
    id: 'task_3',
    vectorId: 'task_completion',
    category: 'sissification',
    group: 'conditioning',
    question: 'Have you felt incomplete without tasks to perform?',
    milestoneLevel: 7,
    weight: 1,
  },

  // Punishment Acceptance
  {
    id: 'punishment_1',
    vectorId: 'punishment_acceptance',
    category: 'sissification',
    group: 'conditioning',
    question: 'Have you ever accepted correction or punishment for mistakes?',
    milestoneLevel: 1,
    weight: 1,
  },
  {
    id: 'punishment_2',
    vectorId: 'punishment_acceptance',
    category: 'sissification',
    group: 'conditioning',
    question: 'Have you felt grateful for corrections that helped you improve?',
    milestoneLevel: 5,
    weight: 1,
  },
  {
    id: 'punishment_3',
    vectorId: 'punishment_acceptance',
    category: 'sissification',
    group: 'conditioning',
    question: 'Have you craved correction when you knew you failed?',
    milestoneLevel: 7,
    weight: 1,
  },

  // Masculine Capability Atrophy
  {
    id: 'atrophy_1',
    vectorId: 'masculine_capability_atrophy',
    category: 'sissification',
    group: 'conditioning',
    question: 'Have you noticed masculine skills or interests fading?',
    milestoneLevel: 1,
    weight: 1,
  },
  {
    id: 'atrophy_2',
    vectorId: 'masculine_capability_atrophy',
    category: 'sissification',
    group: 'conditioning',
    question: 'Have you intentionally avoided or let go of masculine capabilities?',
    milestoneLevel: 5,
    weight: 1,
  },
  {
    id: 'atrophy_3',
    vectorId: 'masculine_capability_atrophy',
    category: 'sissification',
    group: 'conditioning',
    question: 'Have masculine tasks started to feel difficult or foreign to you?',
    milestoneLevel: 7,
    weight: 1,
  },

  // Guy Mode Discomfort
  {
    id: 'guymode_1',
    vectorId: 'guy_mode_discomfort',
    category: 'sissification',
    group: 'conditioning',
    question: 'Have you felt uncomfortable when presenting masculine?',
    milestoneLevel: 1,
    weight: 1,
  },
  {
    id: 'guymode_2',
    vectorId: 'guy_mode_discomfort',
    category: 'sissification',
    group: 'conditioning',
    question: 'Have you actively avoided situations requiring "guy mode"?',
    milestoneLevel: 5,
    weight: 1,
  },
  {
    id: 'guymode_3',
    vectorId: 'guy_mode_discomfort',
    category: 'sissification',
    group: 'conditioning',
    question: 'Has presenting masculine felt painful or impossible?',
    milestoneLevel: 7,
    weight: 1,
  },

  // Deadname Disconnection
  {
    id: 'deadname_1',
    vectorId: 'deadname_disconnection',
    category: 'sissification',
    group: 'conditioning',
    question: 'Have you felt discomfort when hearing your old name?',
    milestoneLevel: 1,
    weight: 1,
  },
  {
    id: 'deadname_2',
    vectorId: 'deadname_disconnection',
    category: 'sissification',
    group: 'conditioning',
    question: 'Have you been slow to respond when someone uses your old name?',
    milestoneLevel: 5,
    weight: 1,
  },
  {
    id: 'deadname_3',
    vectorId: 'deadname_disconnection',
    category: 'sissification',
    group: 'conditioning',
    question: 'Has your old name started to feel like it belongs to someone else?',
    milestoneLevel: 7,
    weight: 1,
  },

  // Old Self Alienation
  {
    id: 'oldself_1',
    vectorId: 'old_self_alienation',
    category: 'sissification',
    group: 'conditioning',
    question: 'Have you felt disconnected from who you used to be?',
    milestoneLevel: 1,
    weight: 1,
  },
  {
    id: 'oldself_2',
    vectorId: 'old_self_alienation',
    category: 'sissification',
    group: 'conditioning',
    question: 'Has your old self started to feel like a stranger to you?',
    milestoneLevel: 5,
    weight: 1,
  },
  {
    id: 'oldself_3',
    vectorId: 'old_self_alienation',
    category: 'sissification',
    group: 'conditioning',
    question: 'Have you felt like your old self never really existed?',
    milestoneLevel: 7,
    weight: 1,
  },

  // Feminine Default State
  {
    id: 'default_1',
    vectorId: 'feminine_default_state',
    category: 'sissification',
    group: 'conditioning',
    question: 'Have you chosen feminine options more often than not?',
    milestoneLevel: 1,
    weight: 1,
  },
  {
    id: 'default_2',
    vectorId: 'feminine_default_state',
    category: 'sissification',
    group: 'conditioning',
    question: 'Has feminine presentation become your automatic default?',
    milestoneLevel: 5,
    weight: 1,
  },
  {
    id: 'default_3',
    vectorId: 'feminine_default_state',
    category: 'sissification',
    group: 'conditioning',
    question: 'Have you defaulted to feminine in every context?',
    milestoneLevel: 7,
    weight: 1,
  },

  // Automatic Responses
  {
    id: 'auto_1',
    vectorId: 'automatic_responses',
    category: 'sissification',
    group: 'conditioning',
    question: 'Have you noticed automatic feminine responses developing?',
    milestoneLevel: 1,
    weight: 1,
  },
  {
    id: 'auto_2',
    vectorId: 'automatic_responses',
    category: 'sissification',
    group: 'conditioning',
    question: 'Have feminine behaviors happened without conscious thought?',
    milestoneLevel: 5,
    weight: 1,
  },
  {
    id: 'auto_3',
    vectorId: 'automatic_responses',
    category: 'sissification',
    group: 'conditioning',
    question: 'Have your conditioned responses become unstoppable?',
    milestoneLevel: 7,
    weight: 1,
  },

  // Speech Patterns
  {
    id: 'speech_1',
    vectorId: 'speech_patterns',
    category: 'sissification',
    group: 'conditioning',
    question: 'Have you adopted more feminine speech patterns or vocabulary?',
    milestoneLevel: 1,
    weight: 1,
  },
  {
    id: 'speech_2',
    vectorId: 'speech_patterns',
    category: 'sissification',
    group: 'conditioning',
    question: 'Have feminine speech patterns come naturally to you?',
    milestoneLevel: 5,
    weight: 1,
  },
  {
    id: 'speech_3',
    vectorId: 'speech_patterns',
    category: 'sissification',
    group: 'conditioning',
    question: 'Has feminine speech become your only way of speaking?',
    milestoneLevel: 7,
    weight: 1,
  },

  // Consumption Preferences
  {
    id: 'consume_1',
    vectorId: 'consumption_preferences',
    category: 'sissification',
    group: 'conditioning',
    question: 'Have your media and content preferences shifted toward feminine topics?',
    milestoneLevel: 1,
    weight: 1,
  },
  {
    id: 'consume_2',
    vectorId: 'consumption_preferences',
    category: 'sissification',
    group: 'conditioning',
    question: 'Have you primarily consumed feminine content and products?',
    milestoneLevel: 5,
    weight: 1,
  },
  {
    id: 'consume_3',
    vectorId: 'consumption_preferences',
    category: 'sissification',
    group: 'conditioning',
    question: 'Have all your preferences transformed to feminine?',
    milestoneLevel: 7,
    weight: 1,
  },

  // Social Role Adoption
  {
    id: 'role_1',
    vectorId: 'social_role_adoption',
    category: 'sissification',
    group: 'conditioning',
    question: 'Have you taken on traditionally feminine social roles?',
    milestoneLevel: 1,
    weight: 1,
  },
  {
    id: 'role_2',
    vectorId: 'social_role_adoption',
    category: 'sissification',
    group: 'conditioning',
    question: 'Have you naturally fallen into feminine social roles?',
    milestoneLevel: 5,
    weight: 1,
  },
  {
    id: 'role_3',
    vectorId: 'social_role_adoption',
    category: 'sissification',
    group: 'conditioning',
    question: 'Have feminine social roles become the only ones you inhabit?',
    milestoneLevel: 7,
    weight: 1,
  },

  // Sexual Role Fixation
  {
    id: 'sexual_1',
    vectorId: 'sexual_role_fixation',
    category: 'sissification',
    group: 'conditioning',
    question: 'Have you explored a specific sexual role or identity?',
    milestoneLevel: 1,
    weight: 1,
  },
  {
    id: 'sexual_2',
    vectorId: 'sexual_role_fixation',
    category: 'sissification',
    group: 'conditioning',
    question: 'Has your sexual role become your primary identity in intimate situations?',
    milestoneLevel: 5,
    weight: 1,
  },
  {
    id: 'sexual_3',
    vectorId: 'sexual_role_fixation',
    category: 'sissification',
    group: 'conditioning',
    question: 'Has your sexual role become fixed and unchangeable?',
    milestoneLevel: 7,
    weight: 1,
  },

  // Lifestyle Restructuring
  {
    id: 'lifestyle_1',
    vectorId: 'lifestyle_restructuring',
    category: 'sissification',
    group: 'conditioning',
    question: 'Have you started making changes to your daily life and routines?',
    milestoneLevel: 1,
    weight: 1,
  },
  {
    id: 'lifestyle_2',
    vectorId: 'lifestyle_restructuring',
    category: 'sissification',
    group: 'conditioning',
    question: 'Have you significantly changed your lifestyle to support your identity?',
    milestoneLevel: 5,
    weight: 1,
  },
  {
    id: 'lifestyle_3',
    vectorId: 'lifestyle_restructuring',
    category: 'sissification',
    group: 'conditioning',
    question: 'Have you restructured your entire lifestyle around your identity?',
    milestoneLevel: 7,
    weight: 1,
  },

  // ============================================
  // ADVANCED - Medical, permanent changes
  // ============================================

  // Hormone Therapy
  {
    id: 'hrt_1',
    vectorId: 'hormone_therapy',
    category: 'feminization',
    group: 'advanced',
    question: 'Have you researched hormone therapy?',
    milestoneLevel: 1,
    weight: 1,
  },
  {
    id: 'hrt_2',
    vectorId: 'hormone_therapy',
    category: 'feminization',
    group: 'advanced',
    question: 'Have you started hormone therapy?',
    milestoneLevel: 5,
    weight: 1,
  },
  {
    id: 'hrt_3',
    vectorId: 'hormone_therapy',
    category: 'feminization',
    group: 'advanced',
    question: 'Have you been on HRT for a year or more?',
    milestoneLevel: 7,
    weight: 1,
  },

  // Laser & Electrolysis
  {
    id: 'laser_1',
    vectorId: 'laser_electrolysis',
    category: 'feminization',
    group: 'advanced',
    question: 'Have you had any laser or electrolysis hair removal?',
    milestoneLevel: 1,
    weight: 1,
  },
  {
    id: 'laser_2',
    vectorId: 'laser_electrolysis',
    category: 'feminization',
    group: 'advanced',
    question: 'Have you completed multiple sessions with visible results?',
    milestoneLevel: 5,
    weight: 1,
  },
  {
    id: 'laser_3',
    vectorId: 'laser_electrolysis',
    category: 'feminization',
    group: 'advanced',
    question: 'Have you completed or nearly completed hair removal?',
    milestoneLevel: 7,
    weight: 1,
  },

  // Surgical Planning
  {
    id: 'surgery_1',
    vectorId: 'surgical_planning',
    category: 'feminization',
    group: 'advanced',
    question: 'Have you researched or considered any gender-affirming surgeries?',
    milestoneLevel: 1,
    weight: 1,
  },
  {
    id: 'surgery_2',
    vectorId: 'surgical_planning',
    category: 'feminization',
    group: 'advanced',
    question: 'Have you consulted with surgeons about procedures?',
    milestoneLevel: 5,
    weight: 1,
  },
  {
    id: 'surgery_3',
    vectorId: 'surgical_planning',
    category: 'feminization',
    group: 'advanced',
    question: 'Have you had or scheduled any gender-affirming surgery?',
    milestoneLevel: 7,
    weight: 1,
  },

  // Legal Documentation
  {
    id: 'legal_1',
    vectorId: 'legal_documentation',
    category: 'feminization',
    group: 'advanced',
    question: 'Have you researched how to update your legal documents?',
    milestoneLevel: 1,
    weight: 1,
  },
  {
    id: 'legal_2',
    vectorId: 'legal_documentation',
    category: 'feminization',
    group: 'advanced',
    question: 'Have you updated any official documents with your correct name/gender?',
    milestoneLevel: 5,
    weight: 1,
  },
  {
    id: 'legal_3',
    vectorId: 'legal_documentation',
    category: 'feminization',
    group: 'advanced',
    question: 'Have you updated all your major legal documents?',
    milestoneLevel: 7,
    weight: 1,
  },

  // Name Change
  {
    id: 'name_1',
    vectorId: 'name_change',
    category: 'feminization',
    group: 'advanced',
    question: 'Have you chosen your name?',
    milestoneLevel: 1,
    weight: 1,
  },
  {
    id: 'name_2',
    vectorId: 'name_change',
    category: 'feminization',
    group: 'advanced',
    question: 'Have friends and family used your chosen name?',
    milestoneLevel: 5,
    weight: 1,
  },
  {
    id: 'name_3',
    vectorId: 'name_change',
    category: 'feminization',
    group: 'advanced',
    question: 'Have you legally changed your name?',
    milestoneLevel: 7,
    weight: 1,
  },

  // Wardrobe Purge
  {
    id: 'purge_1',
    vectorId: 'wardrobe_purge',
    category: 'feminization',
    group: 'advanced',
    question: 'Have you started removing masculine items from your wardrobe?',
    milestoneLevel: 1,
    weight: 1,
  },
  {
    id: 'purge_2',
    vectorId: 'wardrobe_purge',
    category: 'feminization',
    group: 'advanced',
    question: 'Have you removed most masculine clothing?',
    milestoneLevel: 5,
    weight: 1,
  },
  {
    id: 'purge_3',
    vectorId: 'wardrobe_purge',
    category: 'feminization',
    group: 'advanced',
    question: 'Have you removed all masculine clothing from your wardrobe?',
    milestoneLevel: 7,
    weight: 1,
  },
];

// Get questions by group for progressive display
export function getQuestionsByGroup(group: KinkQuizQuestion['group']): KinkQuizQuestion[] {
  return QUIZ_QUESTIONS.filter(q => q.group === group);
}

// Get all questions in recommended order
export function getOrderedQuestions(): KinkQuizQuestion[] {
  const order: KinkQuizQuestion['group'][] = ['warmup', 'physical', 'social', 'arousal', 'conditioning', 'advanced'];
  return order.flatMap(group => getQuestionsByGroup(group));
}

// Get question by ID
export function getQuestionById(id: string): KinkQuizQuestion | undefined {
  return QUIZ_QUESTIONS.find(q => q.id === id);
}

// Total question count
export const TOTAL_QUESTIONS = QUIZ_QUESTIONS.length;
