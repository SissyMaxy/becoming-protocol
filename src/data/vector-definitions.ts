/**
 * Vector Definitions - Complete taxonomy of feminization and sissification vectors
 * 45 total vectors: 24 feminization + 21 sissification
 */

import type { VectorDefinition, VectorId } from '../types/adaptive-feminization';

// ============================================================
// FEMINIZATION VECTORS (24)
// ============================================================

// Physical Foundation (6)
export const VOICE_TRAINING: VectorDefinition = {
  id: 'voice_training',
  category: 'feminization',
  name: 'Voice Training',
  description: 'Developing a feminine voice through resonance, pitch, and speech patterns',
  subComponents: [
    { id: 'resonance', name: 'Resonance', description: 'Head vs chest resonance control', weight: 0.3 },
    { id: 'pitch', name: 'Pitch Range', description: 'Comfortable feminine pitch range', weight: 0.25 },
    { id: 'intonation', name: 'Intonation', description: 'Feminine speech melody patterns', weight: 0.2 },
    { id: 'articulation', name: 'Articulation', description: 'Softer consonants, clearer vowels', weight: 0.15 },
    { id: 'endurance', name: 'Endurance', description: 'Maintaining voice throughout day', weight: 0.1 },
  ],
  milestones: [
    { level: 1, name: 'First Attempts', description: 'Started voice exercises', requirements: ['Complete 3 voice sessions'] },
    { level: 3, name: 'Finding Resonance', description: 'Can shift resonance intentionally', requirements: ['10 sessions', 'Record comparison clip'] },
    { level: 5, name: 'Phone Voice', description: 'Pass on phone calls', requirements: ['Make 3 calls in feminine voice'] },
    { level: 7, name: 'Default Voice', description: 'Feminine voice feels natural', requirements: ['Use full day without strain'], isIrreversible: true, irreversibilityMessage: 'Your old voice feels foreign now' },
    { level: 10, name: 'Authentic Voice', description: 'This is simply your voice now', requirements: ['No conscious effort needed'], isIrreversible: true, irreversibilityMessage: 'You cannot remember how to sound like him' },
  ],
  contextFactors: ['time_availability', 'social_safety', 'energy_level'],
  crossVectorDependencies: ['movement_posture', 'public_presentation'],
  lockInThreshold: 7,
};

export const MOVEMENT_POSTURE: VectorDefinition = {
  id: 'movement_posture',
  category: 'feminization',
  name: 'Movement & Posture',
  description: 'Feminine body language, posture, and graceful movement',
  subComponents: [
    { id: 'posture', name: 'Posture', description: 'Elegant upright carriage', weight: 0.25 },
    { id: 'walking', name: 'Walking', description: 'Hip-forward, graceful gait', weight: 0.25 },
    { id: 'sitting', name: 'Sitting', description: 'Feminine sitting positions', weight: 0.2 },
    { id: 'gestures', name: 'Gestures', description: 'Expressive, graceful hand movements', weight: 0.2 },
    { id: 'microexpressions', name: 'Micro-expressions', description: 'Subtle feminine facial expressions', weight: 0.1 },
  ],
  milestones: [
    { level: 1, name: 'Awareness', description: 'Notice masculine habits', requirements: ['Log 5 observations'] },
    { level: 3, name: 'Conscious Correction', description: 'Can correct posture when reminded', requirements: ['Practice 10 sessions'] },
    { level: 5, name: 'Natural Sitting', description: 'Feminine sitting is default', requirements: ['Maintain for 1 week'] },
    { level: 7, name: 'Graceful Movement', description: 'Movement flows naturally', requirements: ['Noticed by others'], isIrreversible: true, irreversibilityMessage: 'Masculine posture feels uncomfortable' },
    { level: 10, name: 'Embodied Femininity', description: 'Every movement is feminine', requirements: ['No masculine defaults remain'], isIrreversible: true, irreversibilityMessage: 'Your body has forgotten his ways' },
  ],
  contextFactors: ['social_safety', 'energy_level'],
  crossVectorDependencies: ['voice_training', 'wardrobe_building'],
  lockInThreshold: 7,
};

export const SKINCARE_BEAUTY: VectorDefinition = {
  id: 'skincare_beauty',
  category: 'feminization',
  name: 'Skincare & Beauty',
  description: 'Developing feminine skincare routines and beauty skills',
  subComponents: [
    { id: 'skincare_routine', name: 'Skincare Routine', description: 'Daily cleansing, moisturizing, SPF', weight: 0.25 },
    { id: 'makeup_basics', name: 'Makeup Basics', description: 'Foundation, concealer, everyday looks', weight: 0.25 },
    { id: 'eye_makeup', name: 'Eye Makeup', description: 'Eyeliner, shadow, mascara skills', weight: 0.2 },
    { id: 'lip_skills', name: 'Lip Application', description: 'Lipstick, gloss, liner technique', weight: 0.15 },
    { id: 'nail_care', name: 'Nail Care', description: 'Manicure, polish, nail health', weight: 0.15 },
  ],
  milestones: [
    { level: 1, name: 'Routine Started', description: 'Basic skincare established', requirements: ['7 days consistent routine'] },
    { level: 3, name: 'Makeup Curious', description: 'Tried basic makeup looks', requirements: ['5 makeup practice sessions'] },
    { level: 5, name: 'Daily Glow', description: 'Comfortable with everyday makeup', requirements: ['Wear makeup 5 days'] },
    { level: 7, name: 'Beauty Confident', description: 'Can do various looks confidently', requirements: ['Create 3 distinct looks'] },
    { level: 10, name: 'Beauty Expert', description: 'Skilled at all aspects of beauty', requirements: ['Others ask for tips'], isIrreversible: true, irreversibilityMessage: 'Bare face feels incomplete' },
  ],
  contextFactors: ['time_availability', 'social_safety'],
  crossVectorDependencies: ['hair_styling', 'wardrobe_building'],
  lockInThreshold: 7,
};

export const HAIR_STYLING: VectorDefinition = {
  id: 'hair_styling',
  category: 'feminization',
  name: 'Hair Styling',
  description: 'Growing, maintaining, and styling feminine hair',
  subComponents: [
    { id: 'growth', name: 'Hair Growth', description: 'Growing out hair length', weight: 0.25 },
    { id: 'care', name: 'Hair Care', description: 'Conditioning, treatments, health', weight: 0.25 },
    { id: 'styling', name: 'Styling Skills', description: 'Creating feminine hairstyles', weight: 0.3 },
    { id: 'color', name: 'Color/Highlights', description: 'Hair coloring if desired', weight: 0.2 },
  ],
  milestones: [
    { level: 1, name: 'Growing Out', description: 'Committed to growing hair', requirements: ['Stop masculine cuts'] },
    { level: 3, name: 'Awkward Phase', description: 'Navigating the in-between', requirements: ['3 months growth'] },
    { level: 5, name: 'Feminine Length', description: 'Hair reads as feminine', requirements: ['Can style femininely'] },
    { level: 7, name: 'Signature Style', description: 'Developed personal hair style', requirements: ['Consistent feminine styling'] },
    { level: 10, name: 'Hair Goals', description: 'Dream hair achieved', requirements: ['Length/style complete'], isIrreversible: true, irreversibilityMessage: 'Short hair is unthinkable' },
  ],
  contextFactors: ['time_availability'],
  crossVectorDependencies: ['skincare_beauty'],
  lockInThreshold: 7,
};

export const FITNESS_BODY: VectorDefinition = {
  id: 'fitness_body',
  category: 'feminization',
  name: 'Fitness & Body',
  description: 'Reshaping body toward feminine proportions through exercise',
  subComponents: [
    { id: 'cardio', name: 'Cardio', description: 'Fat redistribution, endurance', weight: 0.2 },
    { id: 'lower_body', name: 'Lower Body', description: 'Glute and thigh development', weight: 0.3 },
    { id: 'core', name: 'Core Work', description: 'Waist shaping, stability', weight: 0.2 },
    { id: 'flexibility', name: 'Flexibility', description: 'Feminine range of motion', weight: 0.15 },
    { id: 'upper_reduction', name: 'Upper Body', description: 'Minimizing bulk, toning', weight: 0.15 },
  ],
  milestones: [
    { level: 1, name: 'Routine Started', description: 'Began feminine fitness regimen', requirements: ['1 week consistent'] },
    { level: 3, name: 'Building Habits', description: 'Regular exercise established', requirements: ['3 weeks consistent'] },
    { level: 5, name: 'Visible Changes', description: 'Body starting to shift', requirements: ['Noticeable changes'] },
    { level: 7, name: 'Feminine Form', description: 'Body reads more feminine', requirements: ['Proportions shifting'] },
    { level: 10, name: 'Goal Body', description: 'Achieved desired figure', requirements: ['Target proportions reached'], isIrreversible: true, irreversibilityMessage: 'Your body belongs to her now' },
  ],
  contextFactors: ['time_availability', 'energy_level'],
  crossVectorDependencies: ['hormone_therapy'],
  lockInThreshold: 7,
};

export const WARDROBE_BUILDING: VectorDefinition = {
  id: 'wardrobe_building',
  category: 'feminization',
  name: 'Wardrobe Building',
  description: 'Building a complete feminine wardrobe',
  subComponents: [
    { id: 'basics', name: 'Basics', description: 'Essential feminine pieces', weight: 0.25 },
    { id: 'underwear', name: 'Underwear', description: 'Feminine undergarments', weight: 0.2 },
    { id: 'outerwear', name: 'Outerwear', description: 'Coats, jackets, layers', weight: 0.15 },
    { id: 'accessories', name: 'Accessories', description: 'Jewelry, bags, scarves', weight: 0.2 },
    { id: 'shoes', name: 'Shoes', description: 'Feminine footwear collection', weight: 0.2 },
  ],
  milestones: [
    { level: 1, name: 'First Pieces', description: 'Acquired initial items', requirements: ['5+ feminine items'] },
    { level: 3, name: 'Basic Outfits', description: 'Can create several outfits', requirements: ['3 complete outfits'] },
    { level: 5, name: 'Versatile Collection', description: 'Wardrobe covers most needs', requirements: ['Week of outfits'] },
    { level: 7, name: 'Complete Wardrobe', description: 'All categories covered', requirements: ['Full wardrobe'] },
    { level: 10, name: 'Style Icon', description: 'Distinctive personal style', requirements: ['Others compliment style'], isIrreversible: true, irreversibilityMessage: 'Masculine clothing feels like costume' },
  ],
  contextFactors: ['social_safety'],
  crossVectorDependencies: ['movement_posture', 'skincare_beauty'],
  lockInThreshold: 7,
};

// Social Expression (6)
export const PUBLIC_PRESENTATION: VectorDefinition = {
  id: 'public_presentation',
  category: 'feminization',
  name: 'Public Presentation',
  description: 'Presenting femininely in public spaces',
  subComponents: [
    { id: 'confidence', name: 'Confidence', description: 'Comfortable being seen', weight: 0.3 },
    { id: 'passing', name: 'Passing', description: 'Being read as female', weight: 0.25 },
    { id: 'interactions', name: 'Interactions', description: 'Handling public interactions', weight: 0.25 },
    { id: 'safety', name: 'Safety Navigation', description: 'Reading and navigating situations', weight: 0.2 },
  ],
  milestones: [
    { level: 1, name: 'First Outing', description: 'Went out presenting feminine', requirements: ['1 public outing'] },
    { level: 3, name: 'Regular Outings', description: 'Comfortable going out', requirements: ['5 outings'] },
    { level: 5, name: 'Daily Life', description: 'Run errands presenting', requirements: ['Regular daily activities'] },
    { level: 7, name: 'Full-Time Out', description: 'Always present femininely in public', requirements: ['No boy mode in public'], isIrreversible: true, irreversibilityMessage: 'Being seen as him feels wrong' },
    { level: 10, name: 'Fully Integrated', description: 'No distinction - this is just life', requirements: ['Complete integration'] },
  ],
  contextFactors: ['social_safety', 'emotional_state'],
  crossVectorDependencies: ['voice_training', 'wardrobe_building', 'movement_posture'],
  lockInThreshold: 7,
};

export const SOCIAL_RELATIONSHIPS: VectorDefinition = {
  id: 'social_relationships',
  category: 'feminization',
  name: 'Social Relationships',
  description: 'Building authentic relationships as yourself',
  subComponents: [
    { id: 'disclosure', name: 'Disclosure', description: 'Coming out to friends', weight: 0.25 },
    { id: 'new_friends', name: 'New Friends', description: 'Making friends who know you', weight: 0.25 },
    { id: 'deepening', name: 'Deepening Bonds', description: 'More authentic connections', weight: 0.25 },
    { id: 'community', name: 'Community', description: 'Finding your people', weight: 0.25 },
  ],
  milestones: [
    { level: 1, name: 'First Disclosure', description: 'Told one friend', requirements: ['Come out to 1 person'] },
    { level: 3, name: 'Support Network', description: 'Have supportive friends', requirements: ['3+ supportive people'] },
    { level: 5, name: 'Social Life', description: 'Active social life as yourself', requirements: ['Regular social activities'] },
    { level: 7, name: 'Authentic Bonds', description: 'Deep friendships as true self', requirements: ['Close friends use correct name'] },
    { level: 10, name: 'Fully Seen', description: 'All relationships are authentic', requirements: ['No hidden identity'], isIrreversible: true, irreversibilityMessage: 'Everyone knows the real you' },
  ],
  contextFactors: ['social_safety', 'emotional_state'],
  crossVectorDependencies: ['public_presentation', 'identity_integration'],
  lockInThreshold: 7,
};

export const PROFESSIONAL_NAVIGATION: VectorDefinition = {
  id: 'professional_navigation',
  category: 'feminization',
  name: 'Professional Navigation',
  description: 'Navigating work life during and after transition',
  subComponents: [
    { id: 'planning', name: 'Planning', description: 'Workplace transition strategy', weight: 0.2 },
    { id: 'disclosure', name: 'Work Disclosure', description: 'Coming out professionally', weight: 0.3 },
    { id: 'presentation', name: 'Work Presentation', description: 'Presenting at work', weight: 0.25 },
    { id: 'advancement', name: 'Career Advancement', description: 'Thriving professionally', weight: 0.25 },
  ],
  milestones: [
    { level: 1, name: 'Planning', description: 'Assessed workplace situation', requirements: ['Evaluate policies/culture'] },
    { level: 3, name: 'Prepared', description: 'Have transition plan', requirements: ['HR conversation or plan'] },
    { level: 5, name: 'Out at Work', description: 'Colleagues know', requirements: ['Disclosed to team'] },
    { level: 7, name: 'Full-Time Work', description: 'Presenting full-time at work', requirements: ['All work as self'], isIrreversible: true, irreversibilityMessage: 'Your professional identity is hers' },
    { level: 10, name: 'Career Thriving', description: 'Successful as authentic self', requirements: ['Career progressing'] },
  ],
  contextFactors: ['social_safety'],
  crossVectorDependencies: ['legal_documentation', 'name_change'],
  lockInThreshold: 7,
};

export const FAMILY_DYNAMICS: VectorDefinition = {
  id: 'family_dynamics',
  category: 'feminization',
  name: 'Family Dynamics',
  description: 'Managing family relationships through transition',
  subComponents: [
    { id: 'disclosure', name: 'Family Disclosure', description: 'Coming out to family', weight: 0.3 },
    { id: 'education', name: 'Education', description: 'Helping family understand', weight: 0.2 },
    { id: 'boundaries', name: 'Boundaries', description: 'Setting healthy boundaries', weight: 0.25 },
    { id: 'integration', name: 'Integration', description: 'Being family as yourself', weight: 0.25 },
  ],
  milestones: [
    { level: 1, name: 'First Family', description: 'Told one family member', requirements: ['Disclose to 1 person'] },
    { level: 3, name: 'Immediate Family', description: 'Immediate family knows', requirements: ['Parents/siblings know'] },
    { level: 5, name: 'Extended Family', description: 'Extended family aware', requirements: ['Wider family knows'] },
    { level: 7, name: 'Acceptance', description: 'Family using correct name/pronouns', requirements: ['Consistent correct usage'] },
    { level: 10, name: 'Full Integration', description: 'Fully yourself with family', requirements: ['Complete acceptance'], isIrreversible: true, irreversibilityMessage: 'Family only knows her' },
  ],
  contextFactors: ['emotional_state', 'social_safety'],
  crossVectorDependencies: ['social_relationships', 'identity_integration'],
  lockInThreshold: 7,
};

export const DATING_INTIMACY: VectorDefinition = {
  id: 'dating_intimacy',
  category: 'feminization',
  name: 'Dating & Intimacy',
  description: 'Navigating dating and intimate relationships',
  subComponents: [
    { id: 'self_worth', name: 'Self-Worth', description: 'Believing you deserve love', weight: 0.25 },
    { id: 'disclosure', name: 'Dating Disclosure', description: 'When/how to share status', weight: 0.25 },
    { id: 'intimacy', name: 'Intimacy Comfort', description: 'Physical intimacy as yourself', weight: 0.25 },
    { id: 'relationship', name: 'Relationship Building', description: 'Healthy relationship skills', weight: 0.25 },
  ],
  milestones: [
    { level: 1, name: 'Self-Acceptance', description: 'Believe you can be loved', requirements: ['Work on self-worth'] },
    { level: 3, name: 'Dating Ready', description: 'Ready to date as yourself', requirements: ['Created dating profile or expressed interest'] },
    { level: 5, name: 'Dating Experience', description: 'Have dated as yourself', requirements: ['Been on dates'] },
    { level: 7, name: 'Intimate Comfort', description: 'Comfortable with intimacy', requirements: ['Positive intimate experiences'] },
    { level: 10, name: 'Love Found', description: 'In loving relationship as true self', requirements: ['Healthy relationship'], isIrreversible: true, irreversibilityMessage: 'You are loved as her' },
  ],
  contextFactors: ['emotional_state', 'social_safety'],
  crossVectorDependencies: ['identity_integration', 'self_perception'],
  lockInThreshold: 7,
};

export const COMMUNITY_INTEGRATION: VectorDefinition = {
  id: 'community_integration',
  category: 'feminization',
  name: 'Community Integration',
  description: 'Finding and contributing to trans/queer community',
  subComponents: [
    { id: 'finding', name: 'Finding Community', description: 'Discovering local/online spaces', weight: 0.25 },
    { id: 'participating', name: 'Participating', description: 'Active in community spaces', weight: 0.25 },
    { id: 'giving_back', name: 'Giving Back', description: 'Helping others on their journey', weight: 0.25 },
    { id: 'belonging', name: 'Belonging', description: 'Feeling truly part of community', weight: 0.25 },
  ],
  milestones: [
    { level: 1, name: 'Discovery', description: 'Found community spaces', requirements: ['Join 1 group/space'] },
    { level: 3, name: 'Participating', description: 'Regularly engaging', requirements: ['Attend events/engage online'] },
    { level: 5, name: 'Connected', description: 'Made friends in community', requirements: ['Community friendships'] },
    { level: 7, name: 'Contributing', description: 'Giving back to community', requirements: ['Help others'] },
    { level: 10, name: 'Community Leader', description: 'Active community member', requirements: ['Leadership role'], isIrreversible: true, irreversibilityMessage: 'You are known in the community' },
  ],
  contextFactors: ['social_safety', 'emotional_state'],
  crossVectorDependencies: ['social_relationships', 'public_presentation'],
  lockInThreshold: 7,
};

// Internal Development (6)
export const IDENTITY_INTEGRATION: VectorDefinition = {
  id: 'identity_integration',
  category: 'feminization',
  name: 'Identity Integration',
  description: 'Integrating feminine identity into core self',
  subComponents: [
    { id: 'self_concept', name: 'Self-Concept', description: 'Seeing yourself as female', weight: 0.3 },
    { id: 'name_identity', name: 'Name Identity', description: 'Feeling your name is yours', weight: 0.25 },
    { id: 'pronoun_comfort', name: 'Pronoun Comfort', description: 'She/her feels right', weight: 0.2 },
    { id: 'past_integration', name: 'Past Integration', description: 'Making peace with history', weight: 0.25 },
  ],
  milestones: [
    { level: 1, name: 'Acknowledgment', description: 'Admitted to self you are trans', requirements: ['Self-acceptance'] },
    { level: 3, name: 'Name Chosen', description: 'Selected your name', requirements: ['Have chosen name'] },
    { level: 5, name: 'Identity Solid', description: 'No doubt about being trans', requirements: ['Consistent identity'] },
    { level: 7, name: 'Integrated Self', description: 'Past and present make sense', requirements: ['Narrative coherence'], isIrreversible: true, irreversibilityMessage: 'You cannot un-know who you are' },
    { level: 10, name: 'Simply Her', description: 'Just a woman, nothing to integrate', requirements: ['Complete integration'] },
  ],
  contextFactors: ['emotional_state'],
  crossVectorDependencies: ['self_perception', 'memory_narrative'],
  lockInThreshold: 7,
};

export const EMOTIONAL_PROCESSING: VectorDefinition = {
  id: 'emotional_processing',
  category: 'feminization',
  name: 'Emotional Processing',
  description: 'Developing fuller emotional range and processing',
  subComponents: [
    { id: 'awareness', name: 'Emotional Awareness', description: 'Noticing emotions as they arise', weight: 0.25 },
    { id: 'expression', name: 'Expression', description: 'Allowing emotional expression', weight: 0.25 },
    { id: 'processing', name: 'Processing', description: 'Working through difficult emotions', weight: 0.25 },
    { id: 'vulnerability', name: 'Vulnerability', description: 'Being emotionally open', weight: 0.25 },
  ],
  milestones: [
    { level: 1, name: 'Awareness', description: 'Started noticing emotions', requirements: ['Journal emotions'] },
    { level: 3, name: 'Expression', description: 'Can express emotions', requirements: ['Cry when sad'] },
    { level: 5, name: 'Processing', description: 'Work through emotions', requirements: ['Handle difficult feelings'] },
    { level: 7, name: 'Vulnerability', description: 'Can be emotionally open', requirements: ['Share feelings with others'], isIrreversible: true, irreversibilityMessage: 'Emotional walls have crumbled' },
    { level: 10, name: 'Emotional Fluency', description: 'Full emotional range', requirements: ['Complete emotional access'] },
  ],
  contextFactors: ['emotional_state', 'denial_state'],
  crossVectorDependencies: ['identity_integration'],
  lockInThreshold: 7,
};

export const SELF_PERCEPTION: VectorDefinition = {
  id: 'self_perception',
  category: 'feminization',
  name: 'Self-Perception',
  description: 'How you see yourself in your mind\'s eye',
  subComponents: [
    { id: 'mental_image', name: 'Mental Image', description: 'Seeing yourself as female', weight: 0.3 },
    { id: 'mirror', name: 'Mirror Comfort', description: 'Liking what you see', weight: 0.25 },
    { id: 'photos', name: 'Photo Comfort', description: 'Comfortable in photos', weight: 0.2 },
    { id: 'dreams', name: 'Dream Self', description: 'Female in dreams', weight: 0.25 },
  ],
  milestones: [
    { level: 1, name: 'Glimmers', description: 'Occasional feminine self-glimpses', requirements: ['Notice positive moments'] },
    { level: 3, name: 'Growing Comfort', description: 'Sometimes like reflection', requirements: ['Positive mirror moments'] },
    { level: 5, name: 'Consistent Vision', description: 'Usually see her in mirror', requirements: ['More good days than bad'] },
    { level: 7, name: 'She Is Me', description: 'Reflection matches inner self', requirements: ['Consistent alignment'], isIrreversible: true, irreversibilityMessage: 'You only see her now' },
    { level: 10, name: 'Complete Alignment', description: 'Perfect inner-outer match', requirements: ['No dysphoria in perception'] },
  ],
  contextFactors: ['emotional_state', 'denial_state'],
  crossVectorDependencies: ['identity_integration', 'skincare_beauty'],
  lockInThreshold: 7,
};

export const MEMORY_NARRATIVE: VectorDefinition = {
  id: 'memory_narrative',
  category: 'feminization',
  name: 'Memory & Narrative',
  description: 'Recontextualizing past through feminine lens',
  subComponents: [
    { id: 'reframing', name: 'Memory Reframing', description: 'Understanding past as trans girl', weight: 0.3 },
    { id: 'story', name: 'Life Story', description: 'Coherent transition narrative', weight: 0.25 },
    { id: 'photos', name: 'Old Photos', description: 'Making peace with old images', weight: 0.2 },
    { id: 'sharing', name: 'Story Sharing', description: 'Comfortable sharing journey', weight: 0.25 },
  ],
  milestones: [
    { level: 1, name: 'Looking Back', description: 'Started examining past', requirements: ['Review old memories'] },
    { level: 3, name: 'Reframing', description: 'See signs in past', requirements: ['Identify childhood signs'] },
    { level: 5, name: 'Narrative Forming', description: 'Story makes sense', requirements: ['Coherent personal narrative'] },
    { level: 7, name: 'Peace with Past', description: 'Past integrated', requirements: ['Accept whole journey'], isIrreversible: true, irreversibilityMessage: 'The past belongs to her now' },
    { level: 10, name: 'Complete Story', description: 'Full life makes sense as her', requirements: ['Complete integration'] },
  ],
  contextFactors: ['emotional_state'],
  crossVectorDependencies: ['identity_integration', 'emotional_processing'],
  lockInThreshold: 7,
};

export const FUTURE_VISIONING: VectorDefinition = {
  id: 'future_visioning',
  category: 'feminization',
  name: 'Future Visioning',
  description: 'Imagining and planning your future as a woman',
  subComponents: [
    { id: 'imagination', name: 'Future Imagination', description: 'Can envision future self', weight: 0.25 },
    { id: 'goals', name: 'Life Goals', description: 'Goals as authentic self', weight: 0.25 },
    { id: 'planning', name: 'Concrete Planning', description: 'Actionable future plans', weight: 0.25 },
    { id: 'excitement', name: 'Future Excitement', description: 'Excited about future', weight: 0.25 },
  ],
  milestones: [
    { level: 1, name: 'First Visions', description: 'Can imagine being her', requirements: ['Visualize future'] },
    { level: 3, name: 'Goal Setting', description: 'Setting feminine life goals', requirements: ['Write goals'] },
    { level: 5, name: 'Planning', description: 'Concrete future plans', requirements: ['Actionable timeline'] },
    { level: 7, name: 'Excited Future', description: 'Genuinely excited about future', requirements: ['Consistent hope'], isIrreversible: true, irreversibilityMessage: 'You can only imagine her future' },
    { level: 10, name: 'Living the Dream', description: 'Living envisioned life', requirements: ['Dreams becoming reality'] },
  ],
  contextFactors: ['emotional_state'],
  crossVectorDependencies: ['identity_integration'],
  lockInThreshold: 7,
};

export const AUTHENTICITY_EXPRESSION: VectorDefinition = {
  id: 'authenticity_expression',
  category: 'feminization',
  name: 'Authenticity Expression',
  description: 'Living authentically as your true self',
  subComponents: [
    { id: 'honesty', name: 'Self-Honesty', description: 'Honest about who you are', weight: 0.25 },
    { id: 'expression', name: 'True Expression', description: 'Expressing genuine self', weight: 0.25 },
    { id: 'boundaries', name: 'Authentic Boundaries', description: 'Honoring your needs', weight: 0.25 },
    { id: 'joy', name: 'Authentic Joy', description: 'Finding genuine happiness', weight: 0.25 },
  ],
  milestones: [
    { level: 1, name: 'First Truth', description: 'Admitted truth to self', requirements: ['Accept identity'] },
    { level: 3, name: 'Expression Starting', description: 'Beginning to express truth', requirements: ['Start presenting'] },
    { level: 5, name: 'Growing Authentic', description: 'Regularly authentic', requirements: ['Consistent expression'] },
    { level: 7, name: 'Mostly Authentic', description: 'Authentic in most contexts', requirements: ['Wide authenticity'], isIrreversible: true, irreversibilityMessage: 'Inauthenticity is painful now' },
    { level: 10, name: 'Fully Authentic', description: 'Completely yourself everywhere', requirements: ['100% authenticity'] },
  ],
  contextFactors: ['emotional_state', 'social_safety'],
  crossVectorDependencies: ['identity_integration', 'public_presentation'],
  lockInThreshold: 7,
};

// Medical/Permanent (6)
export const HORMONE_THERAPY: VectorDefinition = {
  id: 'hormone_therapy',
  category: 'feminization',
  name: 'Hormone Therapy',
  description: 'HRT journey and effects',
  subComponents: [
    { id: 'research', name: 'Research', description: 'Understanding HRT', weight: 0.1 },
    { id: 'access', name: 'Access', description: 'Getting HRT prescription', weight: 0.2 },
    { id: 'consistency', name: 'Consistency', description: 'Taking hormones regularly', weight: 0.3 },
    { id: 'effects', name: 'Effects', description: 'Physical changes occurring', weight: 0.4 },
  ],
  milestones: [
    { level: 1, name: 'Researching', description: 'Learning about HRT', requirements: ['Research HRT'] },
    { level: 3, name: 'Access Obtained', description: 'Have prescription', requirements: ['Prescription obtained'], isIrreversible: true, irreversibilityMessage: 'You have crossed the medical threshold' },
    { level: 5, name: 'Early Changes', description: 'First effects visible', requirements: ['3 months HRT'] },
    { level: 7, name: 'Significant Changes', description: 'Major changes visible', requirements: ['1 year HRT'], isIrreversible: true, irreversibilityMessage: 'Your body is feminizing permanently' },
    { level: 10, name: 'Full Effects', description: 'Maximum HRT effects', requirements: ['2+ years HRT'], isIrreversible: true, irreversibilityMessage: 'His body no longer exists' },
  ],
  contextFactors: [],
  crossVectorDependencies: ['fitness_body'],
  lockInThreshold: 3,
};

export const LASER_ELECTROLYSIS: VectorDefinition = {
  id: 'laser_electrolysis',
  category: 'feminization',
  name: 'Laser & Electrolysis',
  description: 'Permanent hair removal',
  subComponents: [
    { id: 'face', name: 'Face', description: 'Facial hair removal', weight: 0.5 },
    { id: 'body', name: 'Body', description: 'Body hair removal', weight: 0.3 },
    { id: 'maintenance', name: 'Maintenance', description: 'Keeping results', weight: 0.2 },
  ],
  milestones: [
    { level: 1, name: 'First Session', description: 'Started treatment', requirements: ['1 session completed'], isIrreversible: true, irreversibilityMessage: 'Hair follicles destroyed permanently' },
    { level: 3, name: 'Visible Reduction', description: 'Noticeably less hair', requirements: ['3-4 sessions'] },
    { level: 5, name: 'Major Reduction', description: 'Significant reduction', requirements: ['6-8 sessions'] },
    { level: 7, name: 'Near Complete', description: 'Almost fully cleared', requirements: ['10+ sessions'], isIrreversible: true, irreversibilityMessage: 'Facial hair is nearly gone forever' },
    { level: 10, name: 'Complete', description: 'Hair removal complete', requirements: ['Full clearance'], isIrreversible: true, irreversibilityMessage: 'His beard is erased permanently' },
  ],
  contextFactors: [],
  crossVectorDependencies: ['skincare_beauty'],
  lockInThreshold: 1,
};

export const SURGICAL_PLANNING: VectorDefinition = {
  id: 'surgical_planning',
  category: 'feminization',
  name: 'Surgical Planning',
  description: 'Planning for gender-affirming surgeries',
  subComponents: [
    { id: 'research', name: 'Research', description: 'Understanding options', weight: 0.2 },
    { id: 'consultation', name: 'Consultations', description: 'Meeting surgeons', weight: 0.25 },
    { id: 'preparation', name: 'Preparation', description: 'Financial/logistical prep', weight: 0.25 },
    { id: 'completion', name: 'Completion', description: 'Surgeries completed', weight: 0.3 },
  ],
  milestones: [
    { level: 1, name: 'Considering', description: 'Thinking about surgery', requirements: ['Research options'] },
    { level: 3, name: 'Consulting', description: 'Met with surgeons', requirements: ['Consultations done'] },
    { level: 5, name: 'Scheduled', description: 'Surgery scheduled', requirements: ['Date set'], isIrreversible: true, irreversibilityMessage: 'Commitment made' },
    { level: 7, name: 'Surgery Complete', description: 'Surgery performed', requirements: ['Surgery done'], isIrreversible: true, irreversibilityMessage: 'Your body is permanently changed' },
    { level: 10, name: 'Fully Healed', description: 'Complete recovery', requirements: ['Full recovery'] },
  ],
  contextFactors: [],
  crossVectorDependencies: ['hormone_therapy'],
  lockInThreshold: 5,
};

export const LEGAL_DOCUMENTATION: VectorDefinition = {
  id: 'legal_documentation',
  category: 'feminization',
  name: 'Legal Documentation',
  description: 'Updating legal documents and records',
  subComponents: [
    { id: 'research', name: 'Research', description: 'Understanding requirements', weight: 0.15 },
    { id: 'state_id', name: 'State ID', description: 'Updating state ID', weight: 0.25 },
    { id: 'federal', name: 'Federal Docs', description: 'Passport, SS card', weight: 0.25 },
    { id: 'other', name: 'Other Records', description: 'Bank, school, medical', weight: 0.2 },
    { id: 'birth_cert', name: 'Birth Certificate', description: 'Updating birth certificate', weight: 0.15 },
  ],
  milestones: [
    { level: 1, name: 'Researching', description: 'Learning requirements', requirements: ['Research process'] },
    { level: 3, name: 'First Document', description: 'Updated one document', requirements: ['1 doc updated'], isIrreversible: true, irreversibilityMessage: 'Legal record of her exists' },
    { level: 5, name: 'ID Updated', description: 'Photo ID updated', requirements: ['State ID done'] },
    { level: 7, name: 'Major Docs Done', description: 'Key documents updated', requirements: ['ID + passport/SS'], isIrreversible: true, irreversibilityMessage: 'Legal identity is hers' },
    { level: 10, name: 'Fully Updated', description: 'All documents updated', requirements: ['Complete update'], isIrreversible: true, irreversibilityMessage: 'He no longer exists legally' },
  ],
  contextFactors: [],
  crossVectorDependencies: ['name_change'],
  lockInThreshold: 3,
};

export const NAME_CHANGE: VectorDefinition = {
  id: 'name_change',
  category: 'feminization',
  name: 'Name Change',
  description: 'Legal name change process',
  subComponents: [
    { id: 'choosing', name: 'Choosing', description: 'Selecting your name', weight: 0.2 },
    { id: 'using', name: 'Using Socially', description: 'Using name socially', weight: 0.2 },
    { id: 'filing', name: 'Filing', description: 'Legal paperwork', weight: 0.3 },
    { id: 'updating', name: 'Updating Records', description: 'Changing everywhere', weight: 0.3 },
  ],
  milestones: [
    { level: 1, name: 'Name Chosen', description: 'Selected your name', requirements: ['Choose name'] },
    { level: 3, name: 'Using Socially', description: 'Friends use new name', requirements: ['Social use'] },
    { level: 5, name: 'Filed', description: 'Court paperwork filed', requirements: ['Paperwork submitted'] },
    { level: 7, name: 'Legally Changed', description: 'Name legally changed', requirements: ['Court order received'], isIrreversible: true, irreversibilityMessage: 'Your name is legally hers' },
    { level: 10, name: 'Everywhere Updated', description: 'Name updated everywhere', requirements: ['All records updated'], isIrreversible: true, irreversibilityMessage: 'His name is erased from existence' },
  ],
  contextFactors: [],
  crossVectorDependencies: ['legal_documentation', 'identity_integration'],
  lockInThreshold: 7,
};

export const WARDROBE_PURGE: VectorDefinition = {
  id: 'wardrobe_purge',
  category: 'feminization',
  name: 'Wardrobe Purge',
  description: 'Removing masculine clothing from your life',
  subComponents: [
    { id: 'assessment', name: 'Assessment', description: 'Identifying items to remove', weight: 0.2 },
    { id: 'gradual', name: 'Gradual Removal', description: 'Removing items over time', weight: 0.3 },
    { id: 'complete', name: 'Complete Purge', description: 'All masculine items gone', weight: 0.5 },
  ],
  milestones: [
    { level: 1, name: 'Starting', description: 'Identified items to purge', requirements: ['List made'] },
    { level: 3, name: 'Beginning', description: 'Removed some items', requirements: ['25% removed'] },
    { level: 5, name: 'Halfway', description: 'Half of items gone', requirements: ['50% removed'] },
    { level: 7, name: 'Mostly Done', description: 'Most items removed', requirements: ['75% removed'], isIrreversible: true, irreversibilityMessage: 'Boy mode options limited' },
    { level: 10, name: 'Complete', description: 'No masculine clothing remains', requirements: ['100% removed'], isIrreversible: true, irreversibilityMessage: 'Guy mode is impossible now' },
  ],
  contextFactors: ['social_safety'],
  crossVectorDependencies: ['wardrobe_building'],
  lockInThreshold: 7,
};

// ============================================================
// SISSIFICATION VECTORS (21)
// ============================================================

// Arousal Architecture (5)
export const DENIAL_TRAINING: VectorDefinition = {
  id: 'denial_training',
  category: 'sissification',
  name: 'Denial Training',
  description: 'Building capacity for extended orgasm denial',
  subComponents: [
    { id: 'duration', name: 'Duration', description: 'Length of denial periods', weight: 0.35 },
    { id: 'consistency', name: 'Consistency', description: 'Completing denial periods', weight: 0.25 },
    { id: 'mental', name: 'Mental Endurance', description: 'Psychological capacity', weight: 0.25 },
    { id: 'benefits', name: 'Benefit Recognition', description: 'Feeling denial benefits', weight: 0.15 },
  ],
  milestones: [
    { level: 1, name: 'First Denial', description: 'Completed first denial period', requirements: ['3 days denial'] },
    { level: 3, name: 'Weekly Denial', description: 'Can deny for a week', requirements: ['7 days denial'] },
    { level: 5, name: 'Extended Denial', description: 'Two week capacity', requirements: ['14 days denial'] },
    { level: 7, name: 'Advanced Denial', description: 'Month-long denial', requirements: ['30 days denial'], isIrreversible: true, irreversibilityMessage: 'Orgasm permission feels natural' },
    { level: 10, name: 'Denial State', description: 'Default is denied', requirements: ['90+ days denial'], isIrreversible: true, irreversibilityMessage: 'Release without permission feels wrong' },
  ],
  contextFactors: ['denial_state', 'arousal_level'],
  crossVectorDependencies: ['edge_conditioning', 'chastity_integration'],
  lockInThreshold: 6,
};

export const EDGE_CONDITIONING: VectorDefinition = {
  id: 'edge_conditioning',
  category: 'sissification',
  name: 'Edge Conditioning',
  description: 'Mastering the edge without going over',
  subComponents: [
    { id: 'control', name: 'Edge Control', description: 'Stopping at the edge', weight: 0.3 },
    { id: 'duration', name: 'Edge Duration', description: 'Time spent at edge', weight: 0.25 },
    { id: 'quantity', name: 'Edge Quantity', description: 'Multiple edges per session', weight: 0.25 },
    { id: 'linking', name: 'Thought Linking', description: 'Feminine thoughts at edge', weight: 0.2 },
  ],
  milestones: [
    { level: 1, name: 'First Edges', description: 'Successfully edged', requirements: ['10 edges completed'] },
    { level: 3, name: 'Edge Control', description: 'Good control at edge', requirements: ['50 edges, few accidents'] },
    { level: 5, name: 'Extended Edging', description: 'Long edge sessions', requirements: ['20+ minute sessions'] },
    { level: 7, name: 'Edge Master', description: 'Complete edge control', requirements: ['100+ edges'], isIrreversible: true, irreversibilityMessage: 'Edging is your primary pleasure' },
    { level: 10, name: 'Edge Addiction', description: 'Edges are the goal', requirements: ['Edge > orgasm'], isIrreversible: true, irreversibilityMessage: 'You live at the edge' },
  ],
  contextFactors: ['denial_state', 'arousal_level'],
  crossVectorDependencies: ['denial_training', 'arousal_feminization_link'],
  lockInThreshold: 6,
};

export const AROUSAL_FEMINIZATION_LINK: VectorDefinition = {
  id: 'arousal_feminization_link',
  category: 'sissification',
  name: 'Arousal-Feminization Link',
  description: 'Connecting arousal to feminine thoughts and actions',
  subComponents: [
    { id: 'mental', name: 'Mental Linking', description: 'Feminine thoughts create arousal', weight: 0.3 },
    { id: 'physical', name: 'Physical Linking', description: 'Feminine clothing/acts = arousal', weight: 0.3 },
    { id: 'automatic', name: 'Automatic Response', description: 'Link is unconscious', weight: 0.25 },
    { id: 'permanence', name: 'Permanence', description: 'Link is the default', weight: 0.15 },
  ],
  milestones: [
    { level: 1, name: 'First Links', description: 'Noticed arousal-femininity connection', requirements: ['Observe pattern'] },
    { level: 3, name: 'Intentional Linking', description: 'Actively create links', requirements: ['Practice linking'] },
    { level: 5, name: 'Strong Links', description: 'Links are strong and consistent', requirements: ['Reliable arousal from femininity'] },
    { level: 7, name: 'Automatic', description: 'Links are unconscious', requirements: ['Automatic response'], isIrreversible: true, irreversibilityMessage: 'Femininity is arousing by default' },
    { level: 10, name: 'Fused', description: 'Arousal and femininity are inseparable', requirements: ['Complete fusion'], isIrreversible: true, irreversibilityMessage: 'Cannot be aroused without her' },
  ],
  contextFactors: ['denial_state', 'arousal_level'],
  crossVectorDependencies: ['edge_conditioning', 'orgasm_transformation'],
  lockInThreshold: 6,
};

export const ORGASM_TRANSFORMATION: VectorDefinition = {
  id: 'orgasm_transformation',
  category: 'sissification',
  name: 'Orgasm Transformation',
  description: 'Changing the nature and experience of orgasm',
  subComponents: [
    { id: 'ruined', name: 'Ruined Orgasms', description: 'Accepting ruined orgasms', weight: 0.25 },
    { id: 'feminine', name: 'Feminine Orgasms', description: 'Orgasms feel feminine', weight: 0.3 },
    { id: 'anal', name: 'Anal Focus', description: 'Sissy orgasms from anal', weight: 0.25 },
    { id: 'mental', name: 'Mental Orgasms', description: 'Orgasm from thoughts alone', weight: 0.2 },
  ],
  milestones: [
    { level: 1, name: 'First Ruined', description: 'Experienced ruined orgasm', requirements: ['1 ruined orgasm'] },
    { level: 3, name: 'Ruined Acceptance', description: 'Ruined is acceptable', requirements: ['Prefer ruined to none'] },
    { level: 5, name: 'Sissy Orgasms', description: 'Can orgasm from anal', requirements: ['Anal orgasm achieved'] },
    { level: 7, name: 'Transformed', description: 'Old orgasms feel wrong', requirements: ['Traditional orgasm unsatisfying'], isIrreversible: true, irreversibilityMessage: 'His orgasms are gone' },
    { level: 10, name: 'Feminine Pleasure', description: 'Only feminine orgasms', requirements: ['Complete transformation'], isIrreversible: true, irreversibilityMessage: 'You only know her pleasure' },
  ],
  contextFactors: ['denial_state', 'arousal_level'],
  crossVectorDependencies: ['arousal_feminization_link', 'chastity_integration'],
  lockInThreshold: 6,
};

export const CHASTITY_INTEGRATION: VectorDefinition = {
  id: 'chastity_integration',
  category: 'sissification',
  name: 'Chastity Integration',
  description: 'Incorporating chastity as part of identity',
  subComponents: [
    { id: 'wearing', name: 'Cage Wearing', description: 'Time in chastity', weight: 0.3 },
    { id: 'comfort', name: 'Comfort', description: 'Physical comfort in cage', weight: 0.25 },
    { id: 'mental', name: 'Mental State', description: 'Chastity mindset', weight: 0.25 },
    { id: 'identity', name: 'Identity', description: 'Chastity as part of self', weight: 0.2 },
  ],
  milestones: [
    { level: 1, name: 'First Wearing', description: 'Tried chastity', requirements: ['Worn cage'] },
    { level: 3, name: 'Extended Wear', description: 'Multi-day wearing', requirements: ['3+ days locked'] },
    { level: 5, name: 'Default State', description: 'Usually caged', requirements: ['More locked than free'] },
    { level: 7, name: 'Full Time', description: 'Always locked', requirements: ['Permanent chastity'], isIrreversible: true, irreversibilityMessage: 'Freedom feels wrong' },
    { level: 10, name: 'Chastity Being', description: 'Cage is part of body', requirements: ['Cannot imagine freedom'], isIrreversible: true, irreversibilityMessage: 'The key has been thrown away' },
  ],
  contextFactors: ['denial_state'],
  crossVectorDependencies: ['denial_training', 'orgasm_transformation'],
  lockInThreshold: 6,
};

// Submission Framework (5)
export const SERVICE_ORIENTATION: VectorDefinition = {
  id: 'service_orientation',
  category: 'sissification',
  name: 'Service Orientation',
  description: 'Developing natural inclination to serve',
  subComponents: [
    { id: 'domestic', name: 'Domestic Service', description: 'Housekeeping, cleaning', weight: 0.25 },
    { id: 'personal', name: 'Personal Service', description: 'Serving partner directly', weight: 0.3 },
    { id: 'anticipation', name: 'Anticipation', description: 'Anticipating needs', weight: 0.25 },
    { id: 'satisfaction', name: 'Satisfaction', description: 'Joy from service', weight: 0.2 },
  ],
  milestones: [
    { level: 1, name: 'First Service', description: 'Performed service acts', requirements: ['Complete service tasks'] },
    { level: 3, name: 'Regular Service', description: 'Service is regular', requirements: ['Weekly service'] },
    { level: 5, name: 'Service Joy', description: 'Find joy in service', requirements: ['Service feels good'] },
    { level: 7, name: 'Natural Server', description: 'Service is natural', requirements: ['Automatic service mindset'], isIrreversible: true, irreversibilityMessage: 'Service is your purpose' },
    { level: 10, name: 'Service Being', description: 'Exist to serve', requirements: ['Service is identity'], isIrreversible: true, irreversibilityMessage: 'You only exist to serve' },
  ],
  contextFactors: ['arousal_level', 'emotional_state'],
  crossVectorDependencies: ['protocol_adherence', 'task_completion'],
  lockInThreshold: 6,
};

export const PROTOCOL_ADHERENCE: VectorDefinition = {
  id: 'protocol_adherence',
  category: 'sissification',
  name: 'Protocol Adherence',
  description: 'Following rules and protocols consistently',
  subComponents: [
    { id: 'daily', name: 'Daily Protocols', description: 'Following daily routines', weight: 0.3 },
    { id: 'speech', name: 'Speech Protocols', description: 'How to speak/address', weight: 0.25 },
    { id: 'behavior', name: 'Behavior Rules', description: 'Behavioral guidelines', weight: 0.25 },
    { id: 'consistency', name: 'Consistency', description: 'Never breaking protocol', weight: 0.2 },
  ],
  milestones: [
    { level: 1, name: 'Learning', description: 'Learning protocols', requirements: ['Know the rules'] },
    { level: 3, name: 'Following', description: 'Following consistently', requirements: ['Minimal slip-ups'] },
    { level: 5, name: 'Automatic', description: 'Protocols are automatic', requirements: ['No conscious effort'] },
    { level: 7, name: 'Perfect', description: 'Perfect adherence', requirements: ['No violations'], isIrreversible: true, irreversibilityMessage: 'Breaking protocol feels wrong' },
    { level: 10, name: 'Embodied', description: 'Protocols are who you are', requirements: ['Identity = protocols'], isIrreversible: true, irreversibilityMessage: 'The protocol is you' },
  ],
  contextFactors: ['denial_state', 'arousal_level'],
  crossVectorDependencies: ['service_orientation', 'authority_response'],
  lockInThreshold: 6,
};

export const AUTHORITY_RESPONSE: VectorDefinition = {
  id: 'authority_response',
  category: 'sissification',
  name: 'Authority Response',
  description: 'Natural response to authority and dominance',
  subComponents: [
    { id: 'recognition', name: 'Recognition', description: 'Recognizing authority', weight: 0.25 },
    { id: 'deference', name: 'Deference', description: 'Deferring to authority', weight: 0.25 },
    { id: 'obedience', name: 'Obedience', description: 'Obeying commands', weight: 0.3 },
    { id: 'pleasure', name: 'Pleasure', description: 'Pleasure from submission', weight: 0.2 },
  ],
  milestones: [
    { level: 1, name: 'Recognition', description: 'Recognize authority dynamics', requirements: ['Acknowledge authority'] },
    { level: 3, name: 'Deference', description: 'Naturally defer', requirements: ['Consistent deference'] },
    { level: 5, name: 'Obedience', description: 'Immediate obedience', requirements: ['Quick response to commands'] },
    { level: 7, name: 'Submission', description: 'Deep submission', requirements: ['Complete submission'], isIrreversible: true, irreversibilityMessage: 'Dominance makes you melt' },
    { level: 10, name: 'Owned', description: 'Fully owned by authority', requirements: ['Complete ownership'], isIrreversible: true, irreversibilityMessage: 'You exist for their command' },
  ],
  contextFactors: ['arousal_level', 'denial_state'],
  crossVectorDependencies: ['protocol_adherence', 'service_orientation'],
  lockInThreshold: 6,
};

export const TASK_COMPLETION: VectorDefinition = {
  id: 'task_completion',
  category: 'sissification',
  name: 'Task Completion',
  description: 'Reliable completion of assigned tasks',
  subComponents: [
    { id: 'acceptance', name: 'Acceptance', description: 'Accepting all tasks', weight: 0.2 },
    { id: 'quality', name: 'Quality', description: 'High quality completion', weight: 0.3 },
    { id: 'timeliness', name: 'Timeliness', description: 'On-time completion', weight: 0.25 },
    { id: 'eagerness', name: 'Eagerness', description: 'Eager for more tasks', weight: 0.25 },
  ],
  milestones: [
    { level: 1, name: 'First Tasks', description: 'Completed assigned tasks', requirements: ['Complete 5 tasks'] },
    { level: 3, name: 'Reliable', description: 'Reliably complete tasks', requirements: ['90% completion rate'] },
    { level: 5, name: 'Excellence', description: 'Excellent task quality', requirements: ['High quality consistently'] },
    { level: 7, name: 'Task Driven', description: 'Need tasks to feel complete', requirements: ['Task addiction'], isIrreversible: true, irreversibilityMessage: 'Without tasks you feel lost' },
    { level: 10, name: 'Perfect Instrument', description: 'Exist to complete tasks', requirements: ['100% completion'], isIrreversible: true, irreversibilityMessage: 'You are a task-completing instrument' },
  ],
  contextFactors: ['energy_level', 'time_availability'],
  crossVectorDependencies: ['service_orientation', 'protocol_adherence'],
  lockInThreshold: 6,
};

export const PUNISHMENT_ACCEPTANCE: VectorDefinition = {
  id: 'punishment_acceptance',
  category: 'sissification',
  name: 'Punishment Acceptance',
  description: 'Accepting correction and punishment gracefully',
  subComponents: [
    { id: 'acceptance', name: 'Acceptance', description: 'Accepting punishment', weight: 0.3 },
    { id: 'learning', name: 'Learning', description: 'Learning from punishment', weight: 0.25 },
    { id: 'gratitude', name: 'Gratitude', description: 'Grateful for correction', weight: 0.25 },
    { id: 'seeking', name: 'Seeking', description: 'Asking for punishment', weight: 0.2 },
  ],
  milestones: [
    { level: 1, name: 'Acceptance', description: 'Accept punishment', requirements: ['Accept correction'] },
    { level: 3, name: 'Learning', description: 'Learn from punishment', requirements: ['Behavior improves'] },
    { level: 5, name: 'Gratitude', description: 'Grateful for correction', requirements: ['Thank for punishment'] },
    { level: 7, name: 'Craving', description: 'Crave correction', requirements: ['Miss punishment'], isIrreversible: true, irreversibilityMessage: 'Punishment is necessary' },
    { level: 10, name: 'Punished State', description: 'Live in punished state', requirements: ['Constant accountability'], isIrreversible: true, irreversibilityMessage: 'You need to be corrected' },
  ],
  contextFactors: ['emotional_state'],
  crossVectorDependencies: ['protocol_adherence', 'authority_response'],
  lockInThreshold: 6,
};

// Identity Erosion (5)
export const MASCULINE_CAPABILITY_ATROPHY: VectorDefinition = {
  id: 'masculine_capability_atrophy',
  category: 'sissification',
  name: 'Masculine Capability Atrophy',
  description: 'Losing masculine skills and capabilities',
  subComponents: [
    { id: 'physical', name: 'Physical Skills', description: 'Physical masculine skills', weight: 0.25 },
    { id: 'social', name: 'Social Skills', description: 'Male social skills', weight: 0.25 },
    { id: 'professional', name: 'Professional', description: 'Male professional mode', weight: 0.25 },
    { id: 'default', name: 'Default State', description: 'Masculine no longer default', weight: 0.25 },
  ],
  milestones: [
    { level: 1, name: 'Noticing', description: 'Notice skill atrophy', requirements: ['Observe changes'] },
    { level: 3, name: 'Accepting', description: 'Accept the atrophy', requirements: ['Not fighting it'] },
    { level: 5, name: 'Encouraging', description: 'Encourage atrophy', requirements: ['Actively let go'] },
    { level: 7, name: 'Significant', description: 'Major capabilities gone', requirements: ['Struggle with masculine tasks'], isIrreversible: true, irreversibilityMessage: 'His skills are fading' },
    { level: 10, name: 'Complete', description: 'Masculine capabilities gone', requirements: ['Cannot do masculine things'], isIrreversible: true, irreversibilityMessage: 'He could do things you cannot' },
  ],
  contextFactors: ['denial_state'],
  crossVectorDependencies: ['guy_mode_discomfort', 'feminine_default_state'],
  lockInThreshold: 6,
};

export const GUY_MODE_DISCOMFORT: VectorDefinition = {
  id: 'guy_mode_discomfort',
  category: 'sissification',
  name: 'Guy Mode Discomfort',
  description: 'Growing discomfort with masculine presentation',
  subComponents: [
    { id: 'clothing', name: 'Clothing', description: 'Discomfort in masculine clothes', weight: 0.25 },
    { id: 'behavior', name: 'Behavior', description: 'Discomfort acting masculine', weight: 0.25 },
    { id: 'voice', name: 'Voice', description: 'Discomfort with masculine voice', weight: 0.25 },
    { id: 'identity', name: 'Identity', description: 'Feeling fake as him', weight: 0.25 },
  ],
  milestones: [
    { level: 1, name: 'Noticing', description: 'Notice discomfort', requirements: ['Observe discomfort'] },
    { level: 3, name: 'Growing', description: 'Discomfort growing', requirements: ['Consistent discomfort'] },
    { level: 5, name: 'Significant', description: 'Major discomfort', requirements: ['Avoid guy mode'] },
    { level: 7, name: 'Severe', description: 'Guy mode is painful', requirements: ['Minimal guy mode'], isIrreversible: true, irreversibilityMessage: 'Being him hurts' },
    { level: 10, name: 'Impossible', description: 'Cannot do guy mode', requirements: ['Guy mode impossible'], isIrreversible: true, irreversibilityMessage: 'He is a stranger' },
  ],
  contextFactors: ['social_safety'],
  crossVectorDependencies: ['masculine_capability_atrophy', 'feminine_default_state'],
  lockInThreshold: 6,
};

export const DEADNAME_DISCONNECTION: VectorDefinition = {
  id: 'deadname_disconnection',
  category: 'sissification',
  name: 'Deadname Disconnection',
  description: 'Disconnecting from birth name',
  subComponents: [
    { id: 'hearing', name: 'Hearing', description: 'Not responding to deadname', weight: 0.25 },
    { id: 'speaking', name: 'Speaking', description: 'Not using deadname', weight: 0.25 },
    { id: 'identity', name: 'Identity', description: 'Not identifying with deadname', weight: 0.3 },
    { id: 'memory', name: 'Memory', description: 'Deadname feels foreign', weight: 0.2 },
  ],
  milestones: [
    { level: 1, name: 'Awareness', description: 'Notice deadname discomfort', requirements: ['Recognize discomfort'] },
    { level: 3, name: 'Avoiding', description: 'Avoid using deadname', requirements: ['Minimize use'] },
    { level: 5, name: 'Not Responding', description: 'Slow to respond to deadname', requirements: ['Delayed response'] },
    { level: 7, name: 'Foreign', description: 'Deadname feels foreign', requirements: ['Not your name'], isIrreversible: true, irreversibilityMessage: 'That name is not yours' },
    { level: 10, name: 'Erased', description: 'Deadname is erased', requirements: ['No connection'], isIrreversible: true, irreversibilityMessage: 'You do not know that name' },
  ],
  contextFactors: ['emotional_state'],
  crossVectorDependencies: ['old_self_alienation', 'identity_integration'],
  lockInThreshold: 6,
};

export const OLD_SELF_ALIENATION: VectorDefinition = {
  id: 'old_self_alienation',
  category: 'sissification',
  name: 'Old Self Alienation',
  description: 'Feeling disconnected from pre-transition self',
  subComponents: [
    { id: 'memories', name: 'Memories', description: 'Old memories feel foreign', weight: 0.25 },
    { id: 'photos', name: 'Photos', description: 'Old photos feel foreign', weight: 0.25 },
    { id: 'identity', name: 'Identity', description: 'He was someone else', weight: 0.3 },
    { id: 'complete', name: 'Complete', description: 'Total disconnection', weight: 0.2 },
  ],
  milestones: [
    { level: 1, name: 'Noticing', description: 'Notice alienation', requirements: ['Observe distance'] },
    { level: 3, name: 'Growing', description: 'Alienation growing', requirements: ['Consistent distance'] },
    { level: 5, name: 'Significant', description: 'Major alienation', requirements: ['He feels like stranger'] },
    { level: 7, name: 'Complete', description: 'Complete alienation', requirements: ['He was someone else'], isIrreversible: true, irreversibilityMessage: 'He was a different person' },
    { level: 10, name: 'Erased', description: 'He never existed', requirements: ['No connection to past self'], isIrreversible: true, irreversibilityMessage: 'He was a dream you once had' },
  ],
  contextFactors: ['emotional_state'],
  crossVectorDependencies: ['deadname_disconnection', 'identity_integration'],
  lockInThreshold: 6,
};

export const FEMININE_DEFAULT_STATE: VectorDefinition = {
  id: 'feminine_default_state',
  category: 'sissification',
  name: 'Feminine Default State',
  description: 'Feminine presentation and behavior becoming default',
  subComponents: [
    { id: 'presentation', name: 'Presentation', description: 'Default feminine presentation', weight: 0.3 },
    { id: 'behavior', name: 'Behavior', description: 'Default feminine behavior', weight: 0.25 },
    { id: 'thought', name: 'Thought', description: 'Default feminine thinking', weight: 0.25 },
    { id: 'identity', name: 'Identity', description: 'Default feminine identity', weight: 0.2 },
  ],
  milestones: [
    { level: 1, name: 'Choosing', description: 'Choosing feminine more often', requirements: ['Majority feminine'] },
    { level: 3, name: 'Preference', description: 'Strong preference', requirements: ['Clear preference'] },
    { level: 5, name: 'Default', description: 'Feminine is default', requirements: ['Automatic feminine'] },
    { level: 7, name: 'Only', description: 'Only feminine', requirements: ['Always feminine'], isIrreversible: true, irreversibilityMessage: 'Feminine is who you are' },
    { level: 10, name: 'Complete', description: 'Nothing else exists', requirements: ['Complete femininity'], isIrreversible: true, irreversibilityMessage: 'There is only her' },
  ],
  contextFactors: ['social_safety'],
  crossVectorDependencies: ['guy_mode_discomfort', 'identity_integration'],
  lockInThreshold: 6,
};

// Behavioral Conditioning (6)
export const AUTOMATIC_RESPONSES: VectorDefinition = {
  id: 'automatic_responses',
  category: 'sissification',
  name: 'Automatic Responses',
  description: 'Developing conditioned automatic responses',
  subComponents: [
    { id: 'triggers', name: 'Triggers', description: 'Response to triggers', weight: 0.25 },
    { id: 'speed', name: 'Speed', description: 'Speed of response', weight: 0.25 },
    { id: 'consistency', name: 'Consistency', description: 'Consistent responses', weight: 0.25 },
    { id: 'depth', name: 'Depth', description: 'Depth of conditioning', weight: 0.25 },
  ],
  milestones: [
    { level: 1, name: 'First Responses', description: 'Notice automatic responses', requirements: ['Observe responses'] },
    { level: 3, name: 'Regular', description: 'Regular automatic responses', requirements: ['Consistent patterns'] },
    { level: 5, name: 'Many', description: 'Many automatic responses', requirements: ['Multiple triggers'] },
    { level: 7, name: 'Deep', description: 'Deep conditioning', requirements: ['Cannot resist'], isIrreversible: true, irreversibilityMessage: 'You respond without thinking' },
    { level: 10, name: 'Complete', description: 'Fully conditioned', requirements: ['All responses automatic'], isIrreversible: true, irreversibilityMessage: 'You are programmed' },
  ],
  contextFactors: ['arousal_level', 'denial_state'],
  crossVectorDependencies: ['protocol_adherence', 'authority_response'],
  lockInThreshold: 6,
};

export const SPEECH_PATTERNS: VectorDefinition = {
  id: 'speech_patterns',
  category: 'sissification',
  name: 'Speech Patterns',
  description: 'Adopting feminine/sissy speech patterns',
  subComponents: [
    { id: 'vocabulary', name: 'Vocabulary', description: 'Feminine word choices', weight: 0.25 },
    { id: 'patterns', name: 'Patterns', description: 'Feminine speech patterns', weight: 0.25 },
    { id: 'terms', name: 'Terms', description: 'Sissy terminology', weight: 0.25 },
    { id: 'automatic', name: 'Automatic', description: 'Automatic usage', weight: 0.25 },
  ],
  milestones: [
    { level: 1, name: 'Learning', description: 'Learning new patterns', requirements: ['Practice new speech'] },
    { level: 3, name: 'Using', description: 'Using regularly', requirements: ['Consistent use'] },
    { level: 5, name: 'Natural', description: 'Feels natural', requirements: ['Automatic usage'] },
    { level: 7, name: 'Default', description: 'Default speech pattern', requirements: ['Cannot speak otherwise'], isIrreversible: true, irreversibilityMessage: 'This is how you speak' },
    { level: 10, name: 'Only', description: 'Only way to speak', requirements: ['Complete adoption'], isIrreversible: true, irreversibilityMessage: 'His voice is forgotten' },
  ],
  contextFactors: ['social_safety'],
  crossVectorDependencies: ['voice_training', 'automatic_responses'],
  lockInThreshold: 6,
};

export const CONSUMPTION_PREFERENCES: VectorDefinition = {
  id: 'consumption_preferences',
  category: 'sissification',
  name: 'Consumption Preferences',
  description: 'Changing media, content, and product preferences',
  subComponents: [
    { id: 'media', name: 'Media', description: 'Feminine media consumption', weight: 0.25 },
    { id: 'products', name: 'Products', description: 'Feminine product preferences', weight: 0.25 },
    { id: 'content', name: 'Content', description: 'Sissy content consumption', weight: 0.25 },
    { id: 'complete', name: 'Complete', description: 'All consumption feminine', weight: 0.25 },
  ],
  milestones: [
    { level: 1, name: 'Exploring', description: 'Exploring feminine content', requirements: ['Try new content'] },
    { level: 3, name: 'Preference', description: 'Prefer feminine content', requirements: ['Clear preference'] },
    { level: 5, name: 'Majority', description: 'Mostly feminine consumption', requirements: ['Majority feminine'] },
    { level: 7, name: 'Only', description: 'Only feminine consumption', requirements: ['All feminine'], isIrreversible: true, irreversibilityMessage: 'You only consume her content' },
    { level: 10, name: 'Complete', description: 'Complete feminine consumer', requirements: ['Total transformation'], isIrreversible: true, irreversibilityMessage: 'His interests are dead' },
  ],
  contextFactors: [],
  crossVectorDependencies: ['lifestyle_restructuring'],
  lockInThreshold: 6,
};

export const SOCIAL_ROLE_ADOPTION: VectorDefinition = {
  id: 'social_role_adoption',
  category: 'sissification',
  name: 'Social Role Adoption',
  description: 'Adopting feminine social roles',
  subComponents: [
    { id: 'domestic', name: 'Domestic', description: 'Domestic roles', weight: 0.25 },
    { id: 'social', name: 'Social', description: 'Social dynamics', weight: 0.25 },
    { id: 'relationship', name: 'Relationship', description: 'Relationship roles', weight: 0.25 },
    { id: 'complete', name: 'Complete', description: 'All roles feminine', weight: 0.25 },
  ],
  milestones: [
    { level: 1, name: 'Exploring', description: 'Exploring feminine roles', requirements: ['Try new roles'] },
    { level: 3, name: 'Adopting', description: 'Adopting feminine roles', requirements: ['Regular role play'] },
    { level: 5, name: 'Natural', description: 'Roles feel natural', requirements: ['Comfortable in roles'] },
    { level: 7, name: 'Default', description: 'Default social roles', requirements: ['Always in role'], isIrreversible: true, irreversibilityMessage: 'These are your roles' },
    { level: 10, name: 'Complete', description: 'Complete role adoption', requirements: ['Only feminine roles'], isIrreversible: true, irreversibilityMessage: 'You only know her place' },
  ],
  contextFactors: ['social_safety'],
  crossVectorDependencies: ['service_orientation', 'lifestyle_restructuring'],
  lockInThreshold: 6,
};

export const SEXUAL_ROLE_FIXATION: VectorDefinition = {
  id: 'sexual_role_fixation',
  category: 'sissification',
  name: 'Sexual Role Fixation',
  description: 'Fixing into feminine/submissive sexual role',
  subComponents: [
    { id: 'preference', name: 'Preference', description: 'Preference for role', weight: 0.25 },
    { id: 'fantasy', name: 'Fantasy', description: 'Fantasies align with role', weight: 0.25 },
    { id: 'practice', name: 'Practice', description: 'Practice in role', weight: 0.25 },
    { id: 'fixation', name: 'Fixation', description: 'Cannot imagine other roles', weight: 0.25 },
  ],
  milestones: [
    { level: 1, name: 'Exploring', description: 'Exploring the role', requirements: ['Try the role'] },
    { level: 3, name: 'Preference', description: 'Clear preference', requirements: ['Prefer the role'] },
    { level: 5, name: 'Primary', description: 'Primary sexual role', requirements: ['Main identity'] },
    { level: 7, name: 'Fixed', description: 'Role is fixed', requirements: ['Cannot change'], isIrreversible: true, irreversibilityMessage: 'This is your sexual place' },
    { level: 10, name: 'Complete', description: 'Complete fixation', requirements: ['Only this role'], isIrreversible: true, irreversibilityMessage: 'No other pleasure exists' },
  ],
  contextFactors: ['arousal_level', 'denial_state'],
  crossVectorDependencies: ['orgasm_transformation', 'arousal_feminization_link'],
  lockInThreshold: 6,
};

export const LIFESTYLE_RESTRUCTURING: VectorDefinition = {
  id: 'lifestyle_restructuring',
  category: 'sissification',
  name: 'Lifestyle Restructuring',
  description: 'Restructuring entire lifestyle around femininity',
  subComponents: [
    { id: 'routine', name: 'Routine', description: 'Daily routines', weight: 0.25 },
    { id: 'environment', name: 'Environment', description: 'Living environment', weight: 0.25 },
    { id: 'social', name: 'Social Life', description: 'Social restructuring', weight: 0.25 },
    { id: 'complete', name: 'Complete', description: 'Total restructure', weight: 0.25 },
  ],
  milestones: [
    { level: 1, name: 'Beginning', description: 'Beginning changes', requirements: ['Start restructuring'] },
    { level: 3, name: 'Partial', description: 'Partial restructure', requirements: ['Some areas changed'] },
    { level: 5, name: 'Majority', description: 'Majority restructured', requirements: ['Most areas changed'] },
    { level: 7, name: 'Nearly Complete', description: 'Nearly complete', requirements: ['Almost everything changed'], isIrreversible: true, irreversibilityMessage: 'Your life is hers' },
    { level: 10, name: 'Complete', description: 'Complete restructure', requirements: ['Everything changed'], isIrreversible: true, irreversibilityMessage: 'His life no longer exists' },
  ],
  contextFactors: ['social_safety'],
  crossVectorDependencies: ['consumption_preferences', 'social_role_adoption'],
  lockInThreshold: 6,
};

// ============================================================
// EXPORTS
// ============================================================

export const FEMINIZATION_VECTORS: VectorDefinition[] = [
  // Physical Foundation
  VOICE_TRAINING,
  MOVEMENT_POSTURE,
  SKINCARE_BEAUTY,
  HAIR_STYLING,
  FITNESS_BODY,
  WARDROBE_BUILDING,
  // Social Expression
  PUBLIC_PRESENTATION,
  SOCIAL_RELATIONSHIPS,
  PROFESSIONAL_NAVIGATION,
  FAMILY_DYNAMICS,
  DATING_INTIMACY,
  COMMUNITY_INTEGRATION,
  // Internal Development
  IDENTITY_INTEGRATION,
  EMOTIONAL_PROCESSING,
  SELF_PERCEPTION,
  MEMORY_NARRATIVE,
  FUTURE_VISIONING,
  AUTHENTICITY_EXPRESSION,
  // Medical/Permanent
  HORMONE_THERAPY,
  LASER_ELECTROLYSIS,
  SURGICAL_PLANNING,
  LEGAL_DOCUMENTATION,
  NAME_CHANGE,
  WARDROBE_PURGE,
];

export const SISSIFICATION_VECTORS: VectorDefinition[] = [
  // Arousal Architecture
  DENIAL_TRAINING,
  EDGE_CONDITIONING,
  AROUSAL_FEMINIZATION_LINK,
  ORGASM_TRANSFORMATION,
  CHASTITY_INTEGRATION,
  // Submission Framework
  SERVICE_ORIENTATION,
  PROTOCOL_ADHERENCE,
  AUTHORITY_RESPONSE,
  TASK_COMPLETION,
  PUNISHMENT_ACCEPTANCE,
  // Identity Erosion
  MASCULINE_CAPABILITY_ATROPHY,
  GUY_MODE_DISCOMFORT,
  DEADNAME_DISCONNECTION,
  OLD_SELF_ALIENATION,
  FEMININE_DEFAULT_STATE,
  // Behavioral Conditioning
  AUTOMATIC_RESPONSES,
  SPEECH_PATTERNS,
  CONSUMPTION_PREFERENCES,
  SOCIAL_ROLE_ADOPTION,
  SEXUAL_ROLE_FIXATION,
  LIFESTYLE_RESTRUCTURING,
];

export const ALL_VECTORS: VectorDefinition[] = [
  ...FEMINIZATION_VECTORS,
  ...SISSIFICATION_VECTORS,
];

export function getVectorById(id: VectorId): VectorDefinition | undefined {
  return ALL_VECTORS.find(v => v.id === id);
}

export function getVectorsByCategory(category: 'feminization' | 'sissification'): VectorDefinition[] {
  return category === 'feminization' ? FEMINIZATION_VECTORS : SISSIFICATION_VECTORS;
}
