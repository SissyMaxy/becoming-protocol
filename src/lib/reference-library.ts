/**
 * Reference Library
 * Curated external resources for feminization training
 * Links to tutorials, guides, and video content
 */

export interface Reference {
  id: string;
  title: string;
  url: string;
  type: 'video' | 'article' | 'guide' | 'course' | 'channel';
  domain: 'movement' | 'voice' | 'body' | 'style' | 'makeup' | 'mindset' | 'general';
  description: string;
  source: string;
  tags: string[];
}

// ============================================================================
// MOVEMENT & POSTURE REFERENCES
// ============================================================================

export const MOVEMENT_REFERENCES: Reference[] = [
  // YouTube Channels
  {
    id: 'mov-001',
    title: 'TransVoiceLessons - Movement Tips',
    url: 'https://www.youtube.com/@TransVoiceLessons',
    type: 'channel',
    domain: 'movement',
    description: 'Popular trans YouTuber with movement and presentation tips',
    source: 'YouTube',
    tags: ['walking', 'posture', 'body language'],
  },

  // Written Guides with Video Embeds
  {
    id: 'mov-002',
    title: '5 MTF Movement Mistakes to Avoid',
    url: 'https://feminizationsecrets.com/male-to-female-movement-mistakes/',
    type: 'guide',
    domain: 'movement',
    description: 'Common mistakes and how to fix them. Includes the Hip Matrix exercise by Rob Brinded.',
    source: 'Feminization Secrets',
    tags: ['walking', 'mistakes', 'hip movement'],
  },
  {
    id: 'mov-003',
    title: 'How to Walk Like a Woman (MTF Tips)',
    url: 'https://feminizationsecrets.com/transgender-crossdressing-walk-like-woman/',
    type: 'guide',
    domain: 'movement',
    description: 'Step-by-step feminine walk tutorial with video demonstrations.',
    source: 'Feminization Secrets',
    tags: ['walking', 'hips', 'stride'],
  },
  {
    id: 'mov-004',
    title: 'MTF Feminine Mannerisms: Body Language Dos and Don\'ts',
    url: 'https://feminizationsecrets.com/transgender-crossdressing-body-language-do-dont/',
    type: 'guide',
    domain: 'movement',
    description: 'Hand gestures, posture, and body language tips.',
    source: 'Feminization Secrets',
    tags: ['body language', 'gestures', 'mannerisms'],
  },
  {
    id: 'mov-005',
    title: 'Posture Tips for a Feminine Look',
    url: 'https://www.transvitae.com/posture-exercises-feminine-presentation-transgender/',
    type: 'guide',
    domain: 'movement',
    description: 'Guide crafted by a trans woman for transgender women. Posture exercises for feminine presentation.',
    source: 'TransVitae',
    tags: ['posture', 'exercises', 'presentation'],
  },
  {
    id: 'mov-006',
    title: 'Feminine Posture MTF Guide',
    url: 'https://ketchbeauty.com/pages/feminine-posture-mtf',
    type: 'guide',
    domain: 'movement',
    description: 'Feminine posture doesn\'t mean being small—it means being soft, tall, and open.',
    source: 'KetchBeauty',
    tags: ['posture', 'confidence', 'standing'],
  },
  {
    id: 'mov-007',
    title: 'How to Walk Feminine as an MTF Woman',
    url: 'https://ketchbeauty.com/pages/how-to-walk-like-her',
    type: 'guide',
    domain: 'movement',
    description: 'Moving with intention in a body learning to express softness.',
    source: 'KetchBeauty',
    tags: ['walking', 'intention', 'softness'],
  },
  {
    id: 'mov-008',
    title: 'Walking in Heels Guide for Trans Women',
    url: 'https://www.transvitae.com/walking-in-heels-transgender-women-guide/',
    type: 'guide',
    domain: 'movement',
    description: 'Comprehensive guide for walking in heels with grace and confidence.',
    source: 'TransVitae',
    tags: ['heels', 'walking', 'confidence'],
  },
  {
    id: 'mov-009',
    title: 'Feminizing MTF Workouts',
    url: 'https://ketchbeauty.com/pages/feminizing-workout-for-transgender-women',
    type: 'guide',
    domain: 'body',
    description: '12-week home glow-up journey including posture and movement training.',
    source: 'KetchBeauty',
    tags: ['workout', 'body', 'feminization'],
  },

  // Body Language Articles
  {
    id: 'mov-010',
    title: '23 Confident Body Language Cues Every Woman Should Know',
    url: 'https://www.scienceofpeople.com/confident-female-body-language/',
    type: 'article',
    domain: 'movement',
    description: 'Science-backed body language tips for confidence.',
    source: 'Science of People',
    tags: ['confidence', 'body language', 'cues'],
  },
  {
    id: 'mov-011',
    title: 'Female vs Male Body Language',
    url: 'https://uiwomenscenter.wordpress.com/2019/12/06/female-vs-male-body-language/',
    type: 'article',
    domain: 'movement',
    description: 'Academic overview of differences in gendered body language.',
    source: 'UI Women\'s Center',
    tags: ['differences', 'academic', 'overview'],
  },
];

// ============================================================================
// VOICE TRAINING REFERENCES
// ============================================================================

export const VOICE_REFERENCES: Reference[] = [
  // YouTube Channels
  {
    id: 'voi-001',
    title: 'TransVoiceLessons YouTube Channel',
    url: 'https://www.youtube.com/@TransVoiceLessons',
    type: 'channel',
    domain: 'voice',
    description: 'The most popular trans voice training channel. Created the "whisper scream" technique.',
    source: 'YouTube',
    tags: ['voice', 'training', 'techniques'],
  },
  {
    id: 'voi-002',
    title: 'Olivia Flanigan - Building Blocks of Vocal Feminization',
    url: 'https://www.oliviamflanigan.com/',
    type: 'course',
    domain: 'voice',
    description: 'Free YouTube mini-series on vocal feminization building blocks.',
    source: 'Olivia Flanigan',
    tags: ['voice', 'beginner', 'free'],
  },

  // Written Guides
  {
    id: 'voi-003',
    title: 'How to Start Trans Voice Training: A Beginner\'s Approach',
    url: 'https://www.seattlevoicelab.com/2024/07/19/how-to-start-trans-voice-training/',
    type: 'guide',
    domain: 'voice',
    description: 'You already have all the sounds necessary—training is learning to harness what you have.',
    source: 'Seattle Voice Lab',
    tags: ['beginner', 'getting started', 'fundamentals'],
  },
  {
    id: 'voi-004',
    title: 'How to Develop a Deep Feminine Voice',
    url: 'https://www.reneeyoxon.com/blog/deep-feminine-voice-guide',
    type: 'guide',
    domain: 'voice',
    description: 'Creating a deep feminine voice—low-pitched, darker resonance, or sultry quality.',
    source: 'Renee Yoxon',
    tags: ['deep voice', 'resonance', 'advanced'],
  },
  {
    id: 'voi-005',
    title: 'Three Daily Voice Feminization Exercises',
    url: 'https://www.reneeyoxon.com/blog/three-daily-voice-feminization-exercises',
    type: 'guide',
    domain: 'voice',
    description: 'Quick daily exercises for consistent progress.',
    source: 'Renee Yoxon',
    tags: ['daily', 'exercises', 'routine'],
  },
  {
    id: 'voi-006',
    title: 'How to Shout, Cough & Laugh Femininely',
    url: 'https://www.reneeyoxon.com/blog/how-to-shout-cough-and-laugh-like-a-girl',
    type: 'guide',
    domain: 'voice',
    description: 'Reflexive sounds are part of how people read your voice.',
    source: 'Renee Yoxon',
    tags: ['reflexive', 'natural', 'advanced'],
  },
  {
    id: 'voi-007',
    title: 'The Ultimate Guide to Trans Voice Training',
    url: 'https://www.lgbtqnation.com/2021/12/transgender-voice-training-make-voice-higher/',
    type: 'guide',
    domain: 'voice',
    description: 'Comprehensive overview of voice training techniques.',
    source: 'LGBTQ Nation',
    tags: ['comprehensive', 'overview', 'pitch'],
  },
  {
    id: 'voi-008',
    title: 'Trans Voice Training: Essential Steps',
    url: 'https://connectedspeechpathology.com/blog/trans-voice-training-essential-steps-to-transform-your-voice',
    type: 'guide',
    domain: 'voice',
    description: 'Clinical speech pathology approach to voice transformation.',
    source: 'Connected Speech Pathology',
    tags: ['clinical', 'professional', 'steps'],
  },

  // Professional Services
  {
    id: 'voi-009',
    title: 'Voice by Kylie',
    url: 'https://www.voicebykylie.com/',
    type: 'course',
    domain: 'voice',
    description: 'Breaks feminization into tailored pieces that are easy to digest.',
    source: 'Voice by Kylie',
    tags: ['coaching', 'professional', 'tailored'],
  },
  {
    id: 'voi-010',
    title: 'TransVoiceLessons.com',
    url: 'https://www.transvoicelessons.com/',
    type: 'course',
    domain: 'voice',
    description: 'Quality resources for transgender and non-binary voice training.',
    source: 'TransVoiceLessons',
    tags: ['professional', 'resources', 'courses'],
  },
];

// ============================================================================
// GENERAL TRANS RESOURCES
// ============================================================================

export const GENERAL_REFERENCES: Reference[] = [
  {
    id: 'gen-001',
    title: '100 Transgender YouTubers to Follow',
    url: 'https://videos.feedspot.com/transgender_youtube_channels/',
    type: 'guide',
    domain: 'general',
    description: 'Curated list of top trans YouTube creators.',
    source: 'Feedspot',
    tags: ['youtube', 'creators', 'community'],
  },
  {
    id: 'gen-002',
    title: 'Susan\'s Place Transgender Resources',
    url: 'https://www.susans.org/',
    type: 'guide',
    domain: 'general',
    description: 'Long-running transgender community forum and resources.',
    source: 'Susan\'s Place',
    tags: ['community', 'forum', 'support'],
  },
  {
    id: 'gen-003',
    title: 'Transgender Teen Survival Guide',
    url: 'https://transgenderteensurvivalguide.com/',
    type: 'guide',
    domain: 'general',
    description: 'Advice and tips for trans individuals.',
    source: 'Tumblr',
    tags: ['tips', 'advice', 'community'],
  },
];

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Get all references for a specific domain
 */
export function getReferencesByDomain(domain: Reference['domain']): Reference[] {
  const allRefs = [...MOVEMENT_REFERENCES, ...VOICE_REFERENCES, ...GENERAL_REFERENCES];
  return allRefs.filter(r => r.domain === domain);
}

/**
 * Get references by tag
 */
export function getReferencesByTag(tag: string): Reference[] {
  const allRefs = [...MOVEMENT_REFERENCES, ...VOICE_REFERENCES, ...GENERAL_REFERENCES];
  return allRefs.filter(r => r.tags.includes(tag.toLowerCase()));
}

/**
 * Get references for a specific task type
 */
export function getReferencesForTask(taskDomain: string, _taskCategory?: string): Reference[] {
  const domainMap: Record<string, Reference['domain']> = {
    'movement': 'movement',
    'posture': 'movement',
    'walking': 'movement',
    'body_language': 'movement',
    'voice': 'voice',
    'pitch': 'voice',
    'resonance': 'voice',
    'body': 'body',
    'skincare': 'body',
    'style': 'style',
    'makeup': 'makeup',
  };

  const mappedDomain = domainMap[taskDomain.toLowerCase()] || 'general';
  return getReferencesByDomain(mappedDomain);
}

/**
 * Get the best reference for a movement task
 */
export function getMovementReference(taskTitle: string): Reference | null {
  const title = taskTitle.toLowerCase();

  if (title.includes('walk')) {
    return MOVEMENT_REFERENCES.find(r => r.id === 'mov-003') || null;
  }
  if (title.includes('posture')) {
    return MOVEMENT_REFERENCES.find(r => r.id === 'mov-005') || null;
  }
  if (title.includes('gesture') || title.includes('hand')) {
    return MOVEMENT_REFERENCES.find(r => r.id === 'mov-004') || null;
  }
  if (title.includes('heel')) {
    return MOVEMENT_REFERENCES.find(r => r.id === 'mov-008') || null;
  }

  // Default to the comprehensive 5 mistakes guide
  return MOVEMENT_REFERENCES.find(r => r.id === 'mov-002') || null;
}

/**
 * Get the best reference for a voice task
 */
export function getVoiceReference(taskTitle: string): Reference | null {
  const title = taskTitle.toLowerCase();

  if (title.includes('beginner') || title.includes('start')) {
    return VOICE_REFERENCES.find(r => r.id === 'voi-003') || null;
  }
  if (title.includes('deep') || title.includes('resonance')) {
    return VOICE_REFERENCES.find(r => r.id === 'voi-004') || null;
  }
  if (title.includes('daily') || title.includes('exercise')) {
    return VOICE_REFERENCES.find(r => r.id === 'voi-005') || null;
  }
  if (title.includes('laugh') || title.includes('cough') || title.includes('natural')) {
    return VOICE_REFERENCES.find(r => r.id === 'voi-006') || null;
  }

  // Default to TransVoiceLessons channel
  return VOICE_REFERENCES.find(r => r.id === 'voi-001') || null;
}

// Export all references combined
export const ALL_REFERENCES = [
  ...MOVEMENT_REFERENCES,
  ...VOICE_REFERENCES,
  ...GENERAL_REFERENCES,
];
