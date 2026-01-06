import { Domain, DomainInfo, PhaseDefinition, Intensity, TimeBlock } from '../types';

export const DOMAINS: DomainInfo[] = [
  {
    domain: 'voice',
    label: 'Voice',
    icon: 'Mic',
    color: '#f472b6',
    description: 'Vocal feminization training'
  },
  {
    domain: 'movement',
    label: 'Movement',
    icon: 'Activity',
    color: '#a78bfa',
    description: 'Feminine movement and posture'
  },
  {
    domain: 'skincare',
    label: 'Skincare',
    icon: 'Sparkles',
    color: '#67e8f9',
    description: 'Skincare and beauty routines'
  },
  {
    domain: 'style',
    label: 'Style',
    icon: 'Shirt',
    color: '#fbbf24',
    description: 'Fashion and presentation'
  },
  {
    domain: 'social',
    label: 'Social',
    icon: 'Users',
    color: '#34d399',
    description: 'Social skills and expression'
  },
  {
    domain: 'mindset',
    label: 'Mindset',
    icon: 'Brain',
    color: '#f97316',
    description: 'Mental alignment and confidence'
  },
  {
    domain: 'body',
    label: 'Body',
    icon: 'Heart',
    color: '#ec4899',
    description: 'Physical training and body awareness'
  }
];

export const PHASES: PhaseDefinition[] = [
  {
    phase: 1,
    name: 'Foundation',
    description: 'Establishing core habits and awareness',
    durationDays: 21,
    focus: ['skincare', 'mindset', 'movement']
  },
  {
    phase: 2,
    name: 'Expression',
    description: 'Developing voice and personal style',
    durationDays: 28,
    focus: ['voice', 'style', 'social']
  },
  {
    phase: 3,
    name: 'Integration',
    description: 'Bringing it all together naturally',
    durationDays: 28,
    focus: ['voice', 'movement', 'social', 'style']
  },
  {
    phase: 4,
    name: 'Embodiment',
    description: 'Living authentically',
    durationDays: 0, // ongoing
    focus: ['voice', 'movement', 'skincare', 'style', 'social', 'mindset', 'body']
  }
];

export const INTENSITY_CONFIG: Record<Intensity, { label: string; multiplier: number; color: string }> = {
  spacious: {
    label: 'Spacious',
    multiplier: 1.5,
    color: '#22c55e'
  },
  normal: {
    label: 'Normal',
    multiplier: 1.0,
    color: '#f472b6'
  },
  crazy: {
    label: 'Crazy',
    multiplier: 0.6,
    color: '#ef4444'
  }
};

export const TIME_BLOCK_CONFIG: Record<TimeBlock, { label: string; icon: string; timeRange: string }> = {
  morning: {
    label: 'Morning',
    icon: 'Sunrise',
    timeRange: '6am - 12pm'
  },
  day: {
    label: 'Day',
    icon: 'Sun',
    timeRange: '12pm - 6pm'
  },
  evening: {
    label: 'Evening',
    icon: 'Moon',
    timeRange: '6pm - 10pm'
  }
};

// Task templates that will be used to generate daily protocols
export interface TaskTemplate {
  id: string;
  title: string;
  description?: string;
  domain: Domain;
  timeBlock: TimeBlock;
  duration?: number;
  baseIntensity: Intensity;
  phase?: number; // minimum phase to include
  // Rich immersive content
  instructions?: {
    overview: string;
    preparation?: string;
    steps: string[];
    goal: string;
    tips?: string[];
    commonMistakes?: string[];
  };
  sensory?: {
    think?: string;
    feel?: string;
    see?: string;
    smell?: string;
    taste?: string;
    listen?: string;
  };
  ambiance?: {
    lighting?: string;
    music?: string;
    environment?: string;
  };
  imageUrl?: string;
  affirmation?: string;
  // Enhanced contextual content
  whyItMatters?: string;
  whatToNotice?: {
    successIndicators?: string[];
    sensoryCues?: string[];
    progressMarkers?: string[];
  };
  commonExperiences?: string[];
}

export const TASK_TEMPLATES: TaskTemplate[] = [
  // Morning - Skincare
  {
    id: 'skincare-morning-cleanse',
    title: 'Morning skincare routine',
    description: 'Cleanse, tone, moisturize, SPF',
    domain: 'skincare',
    timeBlock: 'morning',
    duration: 10,
    baseIntensity: 'crazy',
    instructions: {
      overview: 'Your morning skincare ritual is more than hygiene - it\'s a daily act of self-love and feminine care. Each step is an opportunity to connect with your body and set intentions for the day.',
      preparation: 'Gather your products: cleanser, toner, moisturizer, and SPF. Tie back your hair if needed.',
      steps: [
        'Splash your face with lukewarm water to wake up your skin',
        'Apply a small amount of cleanser and massage in gentle circular motions for 60 seconds',
        'Rinse thoroughly and pat (don\'t rub) your face dry with a soft towel',
        'Apply toner with your fingertips or a cotton pad, pressing gently into your skin',
        'Take a moment to look at yourself in the mirror - really see yourself',
        'Apply moisturizer in upward strokes, treating your skin with tenderness',
        'Finish with SPF, even on cloudy days - protecting your skin is an act of self-care'
      ],
      goal: 'Transform a daily routine into a ritual of self-care and feminine connection',
      tips: [
        'Use this time to set an intention for your day',
        'Gentle pressure - your face is delicate',
        'Don\'t forget your neck - it deserves love too'
      ],
      commonMistakes: [
        'Rushing through - this is YOUR time',
        'Using water that\'s too hot (damages skin barrier)',
        'Skipping SPF - sun damage is real and cumulative'
      ]
    },
    sensory: {
      think: 'I am caring for myself. This skin is mine and it deserves my attention.',
      feel: 'The cool water waking your skin, the smooth glide of products, your fingertips connecting with your face',
      see: 'Watch yourself in the mirror with soft eyes - not judging, just being present',
      smell: 'Notice the subtle scents of your products - let them signal "self-care time" to your brain'
    },
    ambiance: {
      lighting: 'Bright bathroom light or natural morning light',
      music: 'Soft morning playlist or peaceful silence',
      environment: 'Clean bathroom counter, products arranged neatly'
    },
    affirmation: 'I care for my body with love. My skin glows with the attention I give it.',
    whyItMatters: 'Skincare is one of the first ways many trans women reclaim their femininity. Women are socialized from girlhood to nurture their skin - this practice gives you what you should have had all along, while building habits that serve your transition. The ritual aspect matters as much as the products: this is daily proof that you deserve care.',
    whatToNotice: {
      successIndicators: [
        'Your skin feels hydrated, not tight or dry after cleansing',
        'Products absorb smoothly without pilling',
        'You feel a sense of calm completion, not rushed'
      ],
      sensoryCues: [
        'The cool refreshing sensation of water on your face',
        'The smooth glide of cleanser creating a light foam',
        'The dewy, plump feeling of moisturized skin',
        'Warmth in your cheeks from gentle massage motions'
      ],
      progressMarkers: [
        'After 1 week: Routine feels automatic, not like a chore',
        'After 1 month: Skin texture noticeably smoother',
        'After 3 months: People may comment on your skin'
      ]
    },
    commonExperiences: [
      'I used to rush through washing my face in 30 seconds. Now it\'s my favorite 5 minutes of the day.',
      'The first time I looked in the mirror and saw HER doing skincare, I cried happy tears.',
      'It felt silly at first, but now masculine face-washing feels incomplete and rushed.',
      'My skin has never looked better. HRT helps, but the routine made the real difference.'
    ]
  },
  {
    id: 'skincare-morning-facial-massage',
    title: 'Facial massage',
    description: '5 minutes of lymphatic drainage massage',
    domain: 'skincare',
    timeBlock: 'morning',
    duration: 5,
    baseIntensity: 'normal',
    instructions: {
      overview: 'Lymphatic drainage massage reduces puffiness, sculpts your facial contours, and brings a healthy glow. This ancient practice connects you to your face with loving intention.',
      preparation: 'Apply a facial oil or serum for slip. Have clean hands. Can be done after moisturizer.',
      steps: [
        'Start at your neck - use gentle downward strokes to open the lymphatic pathways',
        'Move to your jawline - use knuckles to sweep from chin toward ears with light pressure',
        'Cheekbones - use fingertips to sweep from nose outward toward temples',
        'Under eyes - VERY gentle tapping with ring fingers from inner to outer corners',
        'Forehead - sweep from center outward, then from brows up to hairline',
        'Finish with gentle pressure at temples, then sweep down sides of neck',
        'Take a breath and notice the tingling, alive feeling in your face'
      ],
      goal: 'Reduce morning puffiness and connect with your face through nurturing touch',
      tips: [
        'Pressure should be light - lymph is just under the skin',
        'Always move toward lymph nodes (ears, neck)',
        'Your ring finger has the lightest natural pressure - use it around eyes'
      ],
      commonMistakes: [
        'Pressing too hard - this isn\'t deep tissue massage',
        'Forgetting the neck - that\'s where lymph drains to',
        'Rushing - slow strokes are more effective'
      ]
    },
    sensory: {
      think: 'I am sculpting my face with love. Every touch is an act of care.',
      feel: 'The glide of oil, gentle pressure moving fluid, warmth building in your skin',
      see: 'Watch your face in the mirror - notice the glow emerging'
    },
    ambiance: {
      lighting: 'Soft morning light',
      music: 'Gentle spa music or silence',
      environment: 'Bathroom mirror, comfortable standing position'
    },
    affirmation: 'My face is beautiful. I honor it with my touch.'
  },

  // Morning - Movement
  {
    id: 'movement-morning-stretch',
    title: 'Feminine movement stretches',
    description: 'Hip circles, spine waves, graceful arm movements',
    domain: 'movement',
    timeBlock: 'morning',
    duration: 10,
    baseIntensity: 'crazy',
    instructions: {
      overview: 'Awaken your body with flowing, feminine movements. This practice connects you to your body\'s natural grace and sets the tone for how you\'ll move throughout the day.',
      preparation: 'Wear comfortable clothing that allows full range of motion. Clear a space where you can extend your arms fully.',
      steps: [
        'Stand with feet hip-width apart, close your eyes, take 3 deep breaths',
        'Begin slow hip circles - imagine drawing circles with your hips, first clockwise, then counter',
        'Move to spine waves - starting from your pelvis, let a wave travel up through each vertebra to your head',
        'Extend your arms and make flowing figure-8 patterns, keeping wrists soft and fingers graceful',
        'Practice shoulder rolls - slow, deliberate, feeling the release of tension',
        'Finish with full body reaches - stretch up high, then flow down like water',
        'Stand still for a moment and notice how your body feels - lighter, more connected'
      ],
      goal: 'Wake up your body\'s feminine energy and establish graceful movement patterns for the day',
      tips: [
        'Move slower than you think you need to - grace lives in slowness',
        'Keep your jaw relaxed and lips slightly parted',
        'Imagine you\'re moving through honey - resistance creates elegance'
      ],
      commonMistakes: [
        'Moving too quickly - this isn\'t exercise, it\'s embodiment',
        'Tensing your shoulders - let them stay soft and down',
        'Forgetting to breathe - breath is the foundation of feminine movement'
      ]
    },
    sensory: {
      think: 'My body knows how to move beautifully. I am reconnecting with that knowledge.',
      feel: 'The fluid motion of your joints, warmth spreading through your muscles, the pleasure of movement',
      see: 'If near a mirror, watch your movements - notice their natural grace',
      listen: 'The soft sound of your breath, the subtle movements of your body'
    },
    ambiance: {
      lighting: 'Soft morning light, natural if possible',
      music: 'Flowing instrumental music or feminine movement playlist',
      environment: 'Open space, perhaps by a window'
    },
    affirmation: 'My body moves with natural feminine grace. Every movement is beautiful.'
  },
  {
    id: 'movement-morning-posture',
    title: 'Posture alignment practice',
    description: 'Practice standing and sitting with elegant posture',
    domain: 'movement',
    timeBlock: 'morning',
    duration: 5,
    baseIntensity: 'normal',
    instructions: {
      overview: 'Elegant posture is the foundation of feminine presence. This practice trains your body to hold itself with grace, confidence, and poise throughout the day.',
      preparation: 'Stand in front of a full-length mirror if possible. Wear form-fitting clothes so you can see your alignment.',
      steps: [
        'Stand with feet hip-width apart, weight evenly distributed',
        'Imagine a string pulling the crown of your head toward the ceiling - feel your spine lengthen',
        'Roll shoulders back and down - away from your ears, shoulder blades gently together',
        'Engage your core lightly - not sucking in, just activating',
        'Tuck your chin slightly - create length in the back of your neck',
        'Now practice sitting: lower yourself with control, cross ankles elegantly, maintain the lifted spine',
        'Stand again and walk a few steps - carry this posture with you'
      ],
      goal: 'Establish muscle memory for elegant posture that becomes your natural way of being',
      tips: [
        'Think "tall and soft" not "stiff and rigid"',
        'Check in with your posture hourly throughout the day',
        'Elegant posture makes clothes look better and projects confidence'
      ],
      commonMistakes: [
        'Over-arching the lower back - this isn\'t about sticking your chest out',
        'Holding tension in shoulders while trying to hold them back',
        'Forgetting to breathe - posture should feel natural, not forced'
      ]
    },
    sensory: {
      think: 'I carry myself with the grace of someone who knows her worth.',
      feel: 'Length through your spine, openness in your chest, groundedness in your feet',
      see: 'Watch your silhouette transform - notice how different you look with aligned posture'
    },
    ambiance: {
      lighting: 'Good lighting to see yourself clearly',
      environment: 'Full-length mirror if available'
    },
    affirmation: 'I stand tall in my femininity. My posture reflects my inner grace.',
    whyItMatters: 'Posture is one of the most powerful non-verbal gender cues. Masculine socialization teaches taking up space with spread legs and squared shoulders. Feminine posture is lifted, aligned, and takes up space vertically rather than horizontally. Retraining your posture rewrites muscle memory built over decades - it takes repetition, but the payoff is being read correctly before you even speak.',
    whatToNotice: {
      successIndicators: [
        'You feel taller and more lifted',
        'Your shoulders are back without tension',
        'Breathing feels easy and natural'
      ],
      sensoryCues: [
        'A subtle stretch in your spine as it lengthens',
        'Your core gently engaged, not gripped',
        'Weight balanced between both feet',
        'The back of your neck feeling long'
      ],
      progressMarkers: [
        'After 1 week: You catch yourself slumping and self-correct',
        'After 1 month: Good posture feels more natural than slumping',
        'After 3 months: Your body defaults to feminine posture'
      ]
    },
    commonExperiences: [
      'My back hurt at first because those muscles weren\'t used to working. It passed after a week.',
      'I didn\'t realize how much I slouched until I saw photos of myself with good posture. Like a different person.',
      'People started treating me differently before I even started HRT. Posture matters that much.',
      'I set hourly reminders on my phone. Annoying, but it worked.'
    ]
  },
  {
    id: 'movement-morning-walk',
    title: 'Feminine walking practice',
    description: 'Practice graceful walking with hip movement',
    domain: 'movement',
    timeBlock: 'morning',
    duration: 10,
    baseIntensity: 'spacious',
    instructions: {
      overview: 'Your walk is your signature. Feminine walking comes from the hips and flows through the whole body. This practice helps you develop a natural, graceful gait.',
      preparation: 'Clear a path where you can walk at least 10 steps. Heels optional but helpful for learning. Mirror or video recording recommended.',
      steps: [
        'Start with good posture - remember your alignment practice',
        'Begin walking slowly - place one foot directly in front of the other (imagine a line)',
        'Let your hips sway naturally as a result of this foot placement - don\'t force it',
        'Keep your arms relaxed, with soft hand movements - no swinging like marching',
        'Look straight ahead with chin parallel to the ground - confident, not looking down',
        'Practice turns - pivot on the balls of your feet with a slight hip pop',
        'Increase speed gradually while maintaining grace - elegance at every pace'
      ],
      goal: 'Develop a feminine walk that feels natural and becomes your default movement',
      tips: [
        'The hip movement comes FROM placing feet on a line, not from forcing your hips',
        'Smaller steps are more feminine than long strides',
        'Practice in heels to exaggerate the mechanics, then apply to flat shoes'
      ],
      commonMistakes: [
        'Exaggerating hip movement - it should be subtle and natural',
        'Looking at your feet - keep your gaze forward',
        'Walking too fast when learning - slow down to build muscle memory'
      ]
    },
    sensory: {
      think: 'I walk like I belong everywhere I go. My movement is beautiful.',
      feel: 'The rolling motion from heel to toe, the subtle sway of your hips, the flow of movement',
      see: 'Watch yourself in the mirror or record - see your walk transform',
      listen: 'The soft sound of your footsteps - not heavy stomping'
    },
    ambiance: {
      lighting: 'Good visibility',
      music: 'Music with a feminine walking tempo - slow R&B or runway music',
      environment: 'Clear walkway, ideally with a mirror at the end'
    },
    affirmation: 'Every step I take expresses my feminine grace. I walk with purpose and beauty.'
  },

  // Morning - Voice
  {
    id: 'voice-morning-warmup',
    title: 'Voice warmup exercises',
    description: 'Humming, sirens, resonance exercises',
    domain: 'voice',
    timeBlock: 'morning',
    duration: 10,
    baseIntensity: 'crazy',
    instructions: {
      overview: 'Wake up your voice gently before using it for the day. These warmups prepare your vocal cords and help you find your resonance. Never start your day speaking in your target voice without warming up first.',
      preparation: 'Have water nearby. Find a private space where you can make sounds freely. Relax your jaw and shoulders.',
      steps: [
        'Start with gentle humming on a comfortable pitch - feel the vibration in your lips and face',
        'Slowly slide the hum up and down your range like a siren - don\'t push into strain',
        'Practice lip trills (like a motorboat sound) sliding up into your head voice',
        'Do "ng" sounds (like the end of "sing") to find your nasal resonance',
        'Transition to open vowels: "ee" "eh" "ah" "oh" "oo" - keeping placement forward',
        'Practice your target pitch by humming there, then adding "mmm-hmm" as if agreeing',
        'Finish with a few natural sentences in your target voice - feel how warmed up you are'
      ],
      goal: 'Prepare your voice for the day and establish your feminine resonance from the start',
      tips: [
        'Never push or strain - warmups should feel good',
        'Yawning is actually helpful - it relaxes the throat',
        'If your voice cracks, that\'s normal - just continue gently'
      ],
      commonMistakes: [
        'Starting with speech instead of warming up first',
        'Going too high too fast - build up gradually',
        'Tightening the throat - keep it relaxed and open'
      ]
    },
    sensory: {
      think: 'My voice is waking up. I am preparing to sound like myself today.',
      feel: 'Vibration in your face and chest, the warmth of blood flowing to your vocal cords',
      listen: 'Notice how your voice changes as it warms - it becomes smoother, more flexible'
    },
    ambiance: {
      lighting: 'Any comfortable lighting',
      music: 'Silence - you need to hear yourself clearly',
      environment: 'Private space, water nearby'
    },
    affirmation: 'My voice is my instrument. I tune it with care each day.'
  },
  {
    id: 'voice-morning-pitch',
    title: 'Pitch training',
    description: 'Practice speaking in your target pitch range',
    domain: 'voice',
    timeBlock: 'morning',
    duration: 10,
    baseIntensity: 'normal',
    instructions: {
      overview: 'Pitch is one element of a feminine voice, but it\'s not about going as high as possible. This practice helps you find a comfortable, sustainable pitch that reads as feminine.',
      preparation: 'Use a pitch analyzer app if you have one. Have some reading material ready. Voice should be warmed up.',
      steps: [
        'Find your baseline pitch by humming comfortably - note this as your starting point',
        'Raise your pitch slightly while maintaining the same relaxed feeling - about 20-40Hz higher',
        'Speak a simple phrase: "Hello, how are you today?" - check if it feels strained',
        'If strained, lower slightly until comfortable. Sustainable beats high.',
        'Practice reading a paragraph in your target pitch - focus on consistency',
        'Record yourself and listen back - does it sound natural? Adjust as needed.',
        'End by speaking naturally for 2 minutes, maintaining your target pitch'
      ],
      goal: 'Find and practice a pitch that is both feminine-reading and sustainable for daily use',
      tips: [
        'Feminine pitch range is typically 165-255Hz, but resonance matters more',
        'A slightly lower pitch with good resonance sounds more feminine than a high strained pitch',
        'Your pitch will naturally vary in conversation - that\'s good and feminine'
      ],
      commonMistakes: [
        'Going too high and straining - this damages your voice over time',
        'Focusing only on pitch while ignoring resonance and intonation',
        'Being monotone - pitch variation is key to sounding natural'
      ]
    },
    sensory: {
      think: 'I am finding my true voice. It exists and I am discovering it.',
      feel: 'The vibration higher in your head/face rather than chest, the relaxation in your throat',
      listen: 'The brightness and lightness in your voice as pitch rises naturally'
    },
    ambiance: {
      lighting: 'Good lighting if using video',
      music: 'Silence for focus',
      environment: 'Quiet room, pitch app or piano for reference'
    },
    affirmation: 'My voice finds its natural feminine pitch. I speak with ease.'
  },

  // Morning - Mindset
  {
    id: 'mindset-morning-affirmations',
    title: 'Affirmations & Visualization',
    description: 'Speak affirmations, visualize your authentic self',
    domain: 'mindset',
    timeBlock: 'morning',
    duration: 5,
    baseIntensity: 'crazy',
    instructions: {
      overview: 'A powerful morning practice to align your mind with your feminine identity. You will speak affirmations aloud while visualizing yourself as the woman you are becoming.',
      preparation: 'Find a private space with a mirror. Take 3 deep breaths to center yourself.',
      steps: [
        'Stand in front of the mirror with good posture - shoulders back, chin slightly lifted',
        'Make eye contact with yourself and hold it throughout',
        'Speak each affirmation slowly and clearly: "I am feminine. I am graceful. I am becoming who I truly am."',
        'After each affirmation, pause and let it sink in. Feel it in your body.',
        'Visualize yourself moving through today as your most feminine self - see the way you walk, gesture, speak',
        'Close with: "Today I embody my authentic feminine self"'
      ],
      goal: 'Feel a shift in your energy - from uncertain to confident, from hiding to embodying',
      tips: [
        'Speak from your chest, not your throat - affirmations should resonate',
        'If you feel resistance, that\'s normal - push through gently',
        'Try smiling softly while speaking - it changes everything'
      ],
      commonMistakes: [
        'Rushing through without feeling the words',
        'Looking away from the mirror when it gets uncomfortable',
        'Speaking too quietly - own your voice'
      ]
    },
    sensory: {
      think: 'I am not pretending. I am revealing who I have always been inside.',
      feel: 'Notice your posture shifting, your face softening, warmth in your chest',
      see: 'Look into your own eyes. See the woman looking back at you.',
      listen: 'Hear the conviction in your voice growing stronger with each affirmation'
    },
    ambiance: {
      lighting: 'Soft natural morning light or warm lamp',
      environment: 'Private space with a mirror you can stand in front of'
    },
    affirmation: 'I am feminine, I am powerful, I am becoming who I truly am'
  },
  {
    id: 'mindset-morning-journal',
    title: 'Morning intention setting',
    description: 'Write your intentions for embodying femininity today',
    domain: 'mindset',
    timeBlock: 'morning',
    duration: 10,
    baseIntensity: 'normal',
    instructions: {
      overview: 'Setting intentions creates a roadmap for your day. This practice focuses your mind on specific ways you\'ll embody your femininity, turning abstract goals into concrete actions.',
      preparation: 'Get your journal or a notes app. Find a quiet spot with your morning coffee or tea.',
      steps: [
        'Take 3 deep breaths and arrive in the present moment',
        'Write the date and "Today I intend to..."',
        'Write one intention for how you\'ll MOVE today (posture, walking, gestures)',
        'Write one intention for how you\'ll SPEAK today (voice, words, tone)',
        'Write one intention for how you\'ll PRESENT today (clothing, grooming, energy)',
        'Write one intention for how you\'ll FEEL today (confidence, presence, self-love)',
        'Read your intentions aloud - speaking them makes them more real'
      ],
      goal: 'Create a clear vision for today\'s feminine embodiment that guides your choices',
      tips: [
        'Be specific: "I will sit with crossed ankles in meetings" beats "I\'ll be more feminine"',
        'Choose intentions that are slightly challenging but achievable',
        'Return to your intentions at midday - check in with yourself'
      ],
      commonMistakes: [
        'Writing too many intentions - 3-4 focused ones are better than 10 vague ones',
        'Making intentions about outcomes instead of actions (you control actions)',
        'Not reading them aloud - hearing them matters'
      ]
    },
    sensory: {
      think: 'Today is an opportunity. I choose how I show up in the world.',
      feel: 'The pen in your hand, the warmth of your drink, the quiet anticipation of the day',
      see: 'Your words appearing on the page - your commitments made visible'
    },
    ambiance: {
      lighting: 'Soft morning light',
      music: 'Gentle instrumental or silence',
      environment: 'Cozy spot with journal and warm drink'
    },
    affirmation: 'I set my intentions with clarity. Today I choose to be fully myself.'
  },

  // Day - Voice
  {
    id: 'voice-day-practice',
    title: 'Voice practice session',
    description: 'Read aloud, practice intonation patterns',
    domain: 'voice',
    timeBlock: 'day',
    duration: 15,
    baseIntensity: 'normal',
    instructions: {
      overview: 'Extended practice builds muscle memory and confidence. This session focuses on reading aloud to train your voice in connected speech, not just isolated sounds.',
      preparation: 'Choose reading material - a book, article, or poem you enjoy. Have water nearby. Find a private space.',
      steps: [
        'Do a quick 2-minute warmup - humming and gentle sirens',
        'Read the first paragraph in your natural voice to baseline',
        'Read it again in your target voice - notice the differences',
        'Focus on intonation: feminine speech tends to have more pitch variation',
        'Practice upspeak at the end of statements (not questions) - this is a feminine speech pattern',
        'Read for 5 minutes continuously, focusing on maintaining your target voice',
        'Take a break, drink water, then read again - notice if it\'s easier'
      ],
      goal: 'Build stamina and naturalness in your feminine voice through extended practice',
      tips: [
        'Choose material you find genuinely interesting - enthusiasm helps',
        'Record yourself so you can track progress over time',
        'If you lose your voice placement, pause and hum to find it again'
      ],
      commonMistakes: [
        'Reading in a monotone - let your voice dance with the content',
        'Tensing up as you continue - take breaks if needed',
        'Only practicing in private - eventually, practice with low-stakes real conversations'
      ]
    },
    sensory: {
      think: 'Every sentence is practice. I am building the voice I will use for the rest of my life.',
      feel: 'The words forming in your mouth, the vibration of your voice, the rhythm of speech',
      listen: 'The melody of your speech - notice how intonation brings words to life'
    },
    ambiance: {
      lighting: 'Comfortable reading light',
      music: 'Silence for focus',
      environment: 'Private, comfortable space with reading material'
    },
    affirmation: 'My voice grows stronger and more natural with every word I speak.'
  },
  {
    id: 'voice-day-recording',
    title: 'Record & analyze voice',
    description: 'Record yourself speaking, analyze and adjust',
    domain: 'voice',
    timeBlock: 'day',
    duration: 10,
    baseIntensity: 'spacious',
    instructions: {
      overview: 'Recording is essential for voice training because we hear ourselves differently than others do. This practice builds self-awareness and helps you make targeted improvements.',
      preparation: 'Use your phone\'s voice memo app or a dedicated recording app. Have a script or topics to discuss.',
      steps: [
        'Record 30 seconds of casual speech - talk about your day or describe something',
        'Listen back with headphones for accuracy',
        'Notice: pitch, resonance, intonation patterns, any tension',
        'Identify ONE thing to adjust - don\'t try to fix everything at once',
        'Record again with that adjustment in mind',
        'Compare the two recordings - did the adjustment help?',
        'Make notes on what\'s working and what needs more practice'
      ],
      goal: 'Develop accurate self-perception of your voice and make targeted improvements',
      tips: [
        'The first time you hear yourself is hard - everyone hates their recorded voice at first',
        'Focus on one element at a time: pitch, then resonance, then intonation',
        'Keep old recordings to hear your progress over time'
      ],
      commonMistakes: [
        'Being too harsh on yourself - look for progress, not perfection',
        'Trying to fix multiple things at once - one adjustment at a time',
        'Not recording regularly - weekly recordings show progress you can\'t hear day-to-day'
      ]
    },
    sensory: {
      think: 'I am my own coach. I observe without judgment and improve with intention.',
      feel: 'The vulnerability of hearing yourself, the satisfaction of noticing improvement',
      listen: 'Really HEAR your voice as others hear it - with curiosity, not criticism'
    },
    ambiance: {
      lighting: 'Any comfortable lighting',
      music: 'Silence - need quiet for clean recording',
      environment: 'Quiet room with minimal echo'
    },
    affirmation: 'I listen to myself with compassion. My voice is evolving beautifully.'
  },

  // Day - Style
  {
    id: 'style-day-outfit',
    title: 'Mindful outfit check',
    description: 'Assess your outfit for alignment with feminine expression',
    domain: 'style',
    timeBlock: 'day',
    duration: 5,
    baseIntensity: 'crazy',
    instructions: {
      overview: 'A midday check-in with your presentation. How you dress affects how you carry yourself and how the world receives you. This practice builds awareness of your style choices.',
      preparation: 'Find a full-length mirror or use your phone camera.',
      steps: [
        'Look at yourself from head to toe - take it all in without judgment first',
        'Ask: Does this outfit express who I am today?',
        'Check the fit - are clothes skimming your body or hiding it?',
        'Notice colors - are they flattering your complexion?',
        'Check accessories - do they add to or distract from your look?',
        'Make one small adjustment if needed - tuck something, add or remove an accessory',
        'Take a photo for your style journal - track what works'
      ],
      goal: 'Build awareness of how your clothing choices affect your self-perception and feminine expression',
      tips: [
        'Clothes that fit well always look more polished than expensive clothes that don\'t',
        'When in doubt, simpler is usually better',
        'Your style should make you feel confident, not costumed'
      ],
      commonMistakes: [
        'Being critical instead of curious - this isn\'t about judgment',
        'Ignoring how the outfit FEELS - comfort matters',
        'Comparing yourself to others - your style is yours alone'
      ]
    },
    sensory: {
      think: 'My clothes are an expression of who I am. I choose them with intention.',
      feel: 'The fabric against your skin, how your body feels in these clothes',
      see: 'Your reflection - notice how the colors, shapes, and silhouettes work together'
    },
    ambiance: {
      lighting: 'Good, natural light if possible - see true colors',
      environment: 'Full-length mirror'
    },
    affirmation: 'I dress to express my true self. My style reflects my inner beauty.'
  },
  {
    id: 'style-day-practice',
    title: 'Style exploration',
    description: 'Try a new makeup look or outfit combination',
    domain: 'style',
    timeBlock: 'day',
    duration: 20,
    baseIntensity: 'spacious',
    instructions: {
      overview: 'Exploration is how you discover what works for you. This low-stakes practice time lets you experiment without the pressure of needing to go anywhere.',
      preparation: 'Gather items you want to try - clothes you don\'t normally wear together, new makeup, accessories. Have makeup remover handy.',
      steps: [
        'Choose a "theme" to explore - a color, a style vibe, a look you\'ve seen and liked',
        'Pull out items that might fit that theme - don\'t overthink it',
        'Try on the first combination - look at it without deciding yet',
        'Take a photo, then try variation #2',
        'If doing makeup, try one new technique - winged liner, a bold lip, new eyeshadow blend',
        'Compare your photos - what worked? What surprised you?',
        'Note your discoveries - these inform future choices'
      ],
      goal: 'Expand your style vocabulary through playful experimentation',
      tips: [
        'There\'s no such thing as "failing" at style - every experiment teaches you something',
        'Save inspiration photos from Pinterest or Instagram to try',
        'Sometimes the combinations you\'d never expect are the ones that work'
      ],
      commonMistakes: [
        'Only trying things you\'re "sure" will work - push your boundaries',
        'Not taking photos - you can\'t remember all your experiments',
        'Giving up too quickly on something new - sometimes new takes time to feel right'
      ]
    },
    sensory: {
      think: 'This is play, not performance. I am free to experiment.',
      feel: 'The textures of different fabrics, the weight of accessories, the smoothness of makeup',
      see: 'Your image transforming with each new combination'
    },
    ambiance: {
      lighting: 'Bright, well-lit space',
      music: 'Upbeat playlist that puts you in an experimental mood',
      environment: 'Space to lay out options, good mirror, camera ready'
    },
    affirmation: 'I explore my style with curiosity and joy. There are no mistakes, only discoveries.'
  },

  // Day - Social
  {
    id: 'social-day-mannerisms',
    title: 'Feminine mannerisms practice',
    description: 'Practice gestures, expressions, and reactions',
    domain: 'social',
    timeBlock: 'day',
    duration: 10,
    baseIntensity: 'normal',
    instructions: {
      overview: 'Mannerisms are the subtle language of femininity - the way you gesture, react, and express. This practice builds your repertoire of natural feminine expressions.',
      preparation: 'Stand or sit in front of a mirror. Have a camera ready to record if you want to review.',
      steps: [
        'Practice your smile - not just the mouth, let it reach your eyes',
        'Try different reactions: surprise, interest, amusement - notice your whole face',
        'Practice hand gestures while speaking - keep wrists soft, movements flowing',
        'Try the "listening pose" - head slightly tilted, engaged expression',
        'Practice how you laugh - let it be lighter, more melodic',
        'Work on hair touches - tucking behind ear, gentle adjustments (don\'t overdo this)',
        'Practice reacting to imaginary conversations - your expressions should tell a story'
      ],
      goal: 'Develop natural, feminine expressions that feel authentic and effortless',
      tips: [
        'Watch women you admire - not to copy, but to expand your awareness',
        'Subtlety is key - overdone mannerisms look performative',
        'These become natural through practice - at first they may feel strange'
      ],
      commonMistakes: [
        'Over-exaggerating - think subtle shifts, not dramatic gestures',
        'Forgetting to breathe and relax - tension makes everything look forced',
        'Only practicing in the mirror - use these in real life too'
      ]
    },
    sensory: {
      think: 'I am learning the language of my body. These expressions are becoming mine.',
      feel: 'The muscles of your face softening, your hands moving with intention',
      see: 'Watch your face transform - notice which expressions feel most "you"'
    },
    ambiance: {
      lighting: 'Good visibility',
      music: 'Light background music or conversation sounds to react to',
      environment: 'Mirror or front-facing camera'
    },
    affirmation: 'My expressions are genuine reflections of my feminine spirit.'
  },
  {
    id: 'social-day-interaction',
    title: 'Intentional social interaction',
    description: 'Practice feminine communication in a real interaction',
    domain: 'social',
    timeBlock: 'day',
    duration: 15,
    baseIntensity: 'spacious',
    instructions: {
      overview: 'Real interactions are where practice becomes real. This task asks you to consciously apply your feminine communication skills in an actual conversation.',
      preparation: 'Choose a low-stakes interaction - a barista, a colleague, a friend. Set your intention before the interaction.',
      steps: [
        'Before the interaction, take a breath and set your intention',
        'Enter with open, confident body language - shoulders back, soft smile',
        'Speak in your practiced voice - even if just for a few exchanges',
        'Use the mannerisms you\'ve practiced - listening poses, gentle gestures',
        'Notice how the other person responds - does anything feel different?',
        'After the interaction, reflect: What went well? What felt natural?',
        'Celebrate any success, no matter how small - you showed up authentically'
      ],
      goal: 'Bridge the gap between practice and real-world feminine expression',
      tips: [
        'Start with service workers - brief interactions with low stakes',
        'It\'s okay if your voice slips - every attempt is progress',
        'People are usually much less aware of you than you think'
      ],
      commonMistakes: [
        'Waiting for the "perfect" moment - any interaction can be practice',
        'Being so focused on technique that you forget to be present',
        'Beating yourself up if it didn\'t go perfectly - learning takes time'
      ]
    },
    sensory: {
      think: 'I am practicing being myself in the world. Each interaction is a gift.',
      feel: 'The nervousness transforming into excitement, the relief of authentic expression',
      listen: 'Your voice in real conversation - notice its quality and resonance'
    },
    ambiance: {
      environment: 'Any social setting - coffee shop, store, workplace'
    },
    affirmation: 'I express my authentic feminine self in every interaction. The world welcomes me.'
  },

  // Day - Movement
  {
    id: 'movement-day-awareness',
    title: 'Movement check-in',
    description: 'Notice and adjust posture, gestures throughout the day',
    domain: 'movement',
    timeBlock: 'day',
    duration: 5,
    baseIntensity: 'crazy',
    instructions: {
      overview: 'A midday pause to reconnect with your body. Old habits creep back during busy times - this check-in helps you reset and maintain feminine movement patterns.',
      preparation: 'Can be done anywhere - at your desk, waiting in line, in a bathroom break.',
      steps: [
        'Pause whatever you\'re doing and take 3 conscious breaths',
        'Scan your posture - are your shoulders up? Spine collapsed? Jaw tense?',
        'Reset: shoulders down and back, spine lengthened, jaw relaxed',
        'Notice how you\'re sitting or standing - make it more elegant',
        'Check your hands - are they tense? Soften them',
        'Do one small graceful movement - a head tilt, a gentle stretch',
        'Set an intention to carry this awareness forward'
      ],
      goal: 'Maintain body awareness throughout the day and prevent old movement patterns from taking over',
      tips: [
        'Set a reminder on your phone to check in 3 times daily',
        'Use transitions (entering a room, sitting down) as check-in triggers',
        'Even 30 seconds of awareness makes a difference'
      ],
      commonMistakes: [
        'Forgetting to do it - set reminders until it becomes habit',
        'Being harsh with yourself when you notice old patterns - just adjust, no judgment',
        'Making the adjustment too dramatic - subtle shifts are sustainable'
      ]
    },
    sensory: {
      think: 'I am present in my body. I choose how I hold myself.',
      feel: 'The release of tension as you adjust, the lightness of good posture'
    },
    ambiance: {
      environment: 'Anywhere - this is a portable practice'
    },
    affirmation: 'I am aware of my body. I carry myself with conscious grace.'
  },
  {
    id: 'movement-day-exercise',
    title: 'Feminine fitness',
    description: 'Yoga, pilates, or dance focused on feminine movement',
    domain: 'movement',
    timeBlock: 'day',
    duration: 30,
    baseIntensity: 'spacious',
    instructions: {
      overview: 'Movement practices like yoga, pilates, and dance naturally develop feminine body qualities - flexibility, grace, core strength, and body awareness.',
      preparation: 'Wear comfortable workout clothes. Have a yoga mat if doing floor work. Choose a video or routine to follow.',
      steps: [
        'Begin with 2 minutes of breathing - arrive in your body',
        'Start with gentle mobility - circles, stretches, flowing movements',
        'Move into your chosen practice - yoga flow, pilates sequence, or dance',
        'Focus on quality over intensity - smooth, controlled movements',
        'Notice the connection between breath and movement',
        'Include movements that open the hips and chest - these are feminizing',
        'End with 2 minutes of stillness - feel your body after movement'
      ],
      goal: 'Develop flexibility, grace, and body awareness through mindful movement',
      tips: [
        'YouTube has great feminine movement, yoga, and dance tutorials',
        'Focus on how you MOVE, not how intense the workout is',
        'Dance in particular is excellent for embodying feminine energy'
      ],
      commonMistakes: [
        'Making it about "working out" instead of moving beautifully',
        'Holding your breath during difficult movements',
        'Skipping the cool-down - integration time matters'
      ]
    },
    sensory: {
      think: 'I am building a body that moves with grace. Every movement is practice.',
      feel: 'The stretch in your muscles, the warmth building, the satisfaction of fluid movement',
      see: 'If using a mirror, watch your movements become more graceful',
      listen: 'Your breath synchronizing with movement'
    },
    ambiance: {
      lighting: 'Natural light or soft studio lighting',
      music: 'Flowing music that matches the pace of your practice',
      environment: 'Clear floor space, yoga mat, minimal distractions'
    },
    affirmation: 'My body is becoming stronger, more flexible, and more graceful every day.'
  },

  // Day - Body
  {
    id: 'body-day-care',
    title: 'Body care routine',
    description: 'Hair removal, body lotion, physical self-care',
    domain: 'body',
    timeBlock: 'day',
    duration: 15,
    baseIntensity: 'normal',
    instructions: {
      overview: 'Caring for your body is an act of self-love and feminine practice. This routine keeps your skin smooth and soft while building a connection with your physical form.',
      preparation: 'Gather your body care products - razor/epilator, shaving cream, body lotion, any other products you use.',
      steps: [
        'Start with a warm shower or bath to soften skin and hair',
        'If removing body hair, work systematically - legs, underarms, any other areas you prefer',
        'Use gentle pressure and go slowly - rushing leads to irritation',
        'Rinse thoroughly and pat skin dry',
        'Apply body lotion while skin is still slightly damp - it absorbs better',
        'Pay extra attention to elbows, knees, hands, and feet',
        'Take a moment to appreciate your body - touch it with the care it deserves'
      ],
      goal: 'Maintain smooth, soft skin while building a nurturing relationship with your body',
      tips: [
        'Exfoliate 1-2 times per week to prevent ingrown hairs',
        'Replace razors regularly - dull blades cause irritation',
        'Nighttime lotion application = softer skin in the morning'
      ],
      commonMistakes: [
        'Rushing and getting razor burn or nicks',
        'Skipping lotion - hydration is essential',
        'Being rough with your body - treat it gently'
      ]
    },
    sensory: {
      think: 'My body is worthy of care. I tend to it with love.',
      feel: 'The smoothness of fresh-shaved skin, the richness of lotion, the softness afterward',
      smell: 'The clean scent of products, the freshness of clean skin'
    },
    ambiance: {
      lighting: 'Good bathroom lighting',
      music: 'Relaxing playlist',
      environment: 'Warm bathroom, products within reach'
    },
    affirmation: 'I care for my body with tenderness. My skin is soft and beautiful.'
  },

  // Evening - Skincare
  {
    id: 'skincare-evening-routine',
    title: 'Evening skincare routine',
    description: 'Double cleanse, treatments, night cream',
    domain: 'skincare',
    timeBlock: 'evening',
    duration: 15,
    baseIntensity: 'crazy',
    instructions: {
      overview: 'Your evening skincare is a wind-down ritual - a signal to your body and mind that the day is ending. This extended routine cleanses away the day and prepares your skin for overnight renewal.',
      preparation: 'Remove any makeup first. Gather: oil cleanser, water-based cleanser, any treatments/serums, night cream. Have a soft towel ready.',
      steps: [
        'Start with an oil-based cleanser - massage into dry skin to dissolve makeup, sunscreen, and daily grime',
        'Rinse with warm water, then apply your water-based cleanser for a deeper clean',
        'Pat your face dry gently - remember, patting not rubbing',
        'While skin is slightly damp, apply any serums or treatments',
        'Take a moment to look at your reflection with kindness - you made it through another day',
        'Apply night cream in gentle upward strokes, including your neck',
        'Finish with eye cream if you use one - gentle tapping motions around the orbital bone'
      ],
      goal: 'Release the day, nurture your skin, and transition into restful evening energy',
      tips: [
        'This is NOT the time to pick at your skin or scrutinize "flaws"',
        'Warm products between your palms before applying',
        'Use this time to mentally review your day with compassion'
      ],
      commonMistakes: [
        'Skipping the double cleanse - one cleanser isn\'t enough in the evening',
        'Being harsh with tired skin - gentleness always',
        'Doing this while distracted - be present with yourself'
      ]
    },
    sensory: {
      think: 'I am washing away the day. Tomorrow is fresh. Right now, I rest.',
      feel: 'The warmth of water, the silky glide of oil cleanser, the richness of night cream',
      see: 'Soft bathroom lighting, your reflection becoming cleaner and softer',
      smell: 'The soothing scents of your evening products - perhaps lavender or chamomile'
    },
    ambiance: {
      lighting: 'Dim, warm bathroom lighting - avoid harsh overhead lights',
      music: 'Calming evening playlist or gentle nature sounds',
      environment: 'Warm bathroom, perhaps with a candle lit'
    },
    affirmation: 'I release this day with gratitude. My skin renews as I rest.'
  },
  {
    id: 'skincare-evening-mask',
    title: 'Weekly treatment',
    description: 'Face mask or special treatment',
    domain: 'skincare',
    timeBlock: 'evening',
    duration: 20,
    baseIntensity: 'normal',
    instructions: {
      overview: 'Weekly treatments are your skin\'s "spa day" - deeper care that can\'t happen daily. This is pure self-indulgence disguised as skincare.',
      preparation: 'Choose your treatment - sheet mask, clay mask, hydrating mask, or specialty treatment. Have a headband to keep hair back.',
      steps: [
        'Cleanse your face first - treatments work better on clean skin',
        'Apply your mask according to its instructions',
        'Set a timer so you don\'t over-mask (especially with clay masks)',
        'While waiting, do something relaxing - no screens if possible',
        'This is a great time for gentle neck and hand massage',
        'Remove mask as directed - some rinse, some absorb',
        'Follow with your regular evening routine - the skin is primed to receive'
      ],
      goal: 'Provide deep skin nourishment while practicing the art of self-indulgent care',
      tips: [
        'Different masks for different needs - hydrating, clarifying, brightening',
        'Sheet masks are great for beginners and multi-tasking',
        'Store sheet masks in the fridge for extra soothing effect'
      ],
      commonMistakes: [
        'Leaving clay masks on too long - they can dry out skin',
        'Using treatments too frequently - once or twice a week is enough',
        'Skipping this step because it feels "extra" - you deserve extra'
      ]
    },
    sensory: {
      think: 'I deserve this care. My skin drinks in this treatment.',
      feel: 'The cool or warm sensation of the mask, the tightening or softening as it works',
      smell: 'The scents of your treatment - botanical, fresh, soothing'
    },
    ambiance: {
      lighting: 'Dim, calming lighting',
      music: 'Spa music or peaceful sounds',
      environment: 'Comfortable reclined position, warm room'
    },
    affirmation: 'I give myself the gift of deep care. My skin glows with attention.'
  },

  // Evening - Voice
  {
    id: 'voice-evening-review',
    title: 'Voice reflection',
    description: 'Review today\'s voice use, note improvements',
    domain: 'voice',
    timeBlock: 'evening',
    duration: 5,
    baseIntensity: 'normal',
    instructions: {
      overview: 'A mindful reflection on how you used your voice today. This practice helps you track progress, celebrate wins, and identify areas for continued growth.',
      preparation: 'Find a quiet space where you can speak aloud comfortably. Have a journal or notes app ready.',
      steps: [
        'Close your eyes and mentally replay your day - recall moments when you spoke',
        'Notice: When did your voice feel most natural and feminine?',
        'Notice: Were there moments when you slipped back to old patterns?',
        'Speak a few sentences now in your target voice - notice how it feels after a full day',
        'Write down one thing that went well and one area to focus on tomorrow',
        'End by speaking your name aloud in your authentic voice - claim it'
      ],
      goal: 'Build awareness of your voice patterns and celebrate daily progress, no matter how small',
      tips: [
        'Be compassionate with yourself - every day is practice',
        'Recording yourself during the day helps with evening reflection',
        'Notice emotional states that affect your voice - stress often causes regression'
      ],
      commonMistakes: [
        'Being too critical instead of observational',
        'Focusing only on what went wrong',
        'Skipping this practice when you feel the day "didn\'t go well"'
      ]
    },
    sensory: {
      think: 'My voice is a journey, not a destination. Every day I learn more about my authentic sound.',
      feel: 'Notice any tension in your throat or jaw - let it soften as you reflect',
      listen: 'Recall the sound of your voice at different moments today - the highs and lows'
    },
    ambiance: {
      lighting: 'Soft evening light - dimmed lamps or candles',
      music: 'Silence or very soft ambient sounds',
      environment: 'Comfortable seated position, perhaps with a warm drink'
    },
    affirmation: 'Every word I speak is practice. Every day my voice becomes more me.'
  },

  // Evening - Mindset
  {
    id: 'mindset-evening-gratitude',
    title: 'Gratitude practice',
    description: 'Note 3 things about your feminine journey you\'re grateful for',
    domain: 'mindset',
    timeBlock: 'evening',
    duration: 5,
    baseIntensity: 'crazy',
    instructions: {
      overview: 'Gratitude rewires your brain for positivity and helps you recognize progress on your journey. This practice shifts focus from what\'s lacking to what\'s blooming.',
      preparation: 'Have a journal or notes app ready. Find a comfortable, quiet spot.',
      steps: [
        'Close your eyes and take 3 slow breaths to arrive in the present moment',
        'Think about your day through the lens of your feminine journey',
        'Identify the first thing you\'re grateful for - it can be tiny (a moment when you felt pretty, a compliment, a small step forward)',
        'Write it down, then pause to really FEEL the gratitude in your body',
        'Repeat for a second thing - perhaps something about your body or self-care',
        'Repeat for a third thing - perhaps something about your courage or progress',
        'Read all three aloud and say "Thank you" after each one'
      ],
      goal: 'End your day in a state of appreciation and recognition of your growth',
      tips: [
        'Small things count - "I remembered to moisturize" is valid',
        'Repeat gratitudes are okay - some blessings deserve daily recognition',
        'If it was a hard day, you can be grateful for simply surviving it'
      ],
      commonMistakes: [
        'Making it a mental checklist instead of feeling it',
        'Only counting "big" wins - small moments matter most',
        'Skipping when you\'re in a bad mood - that\'s when you need it most'
      ]
    },
    sensory: {
      think: 'Even on hard days, there is something to be grateful for. I choose to see it.',
      feel: 'The warmth of gratitude in your chest, a softening of any tension from the day',
      see: 'Your words written down - physical evidence of good things'
    },
    ambiance: {
      lighting: 'Soft, warm evening light',
      music: 'Gentle ambient music or silence',
      environment: 'Cozy spot - bed, comfortable chair, or cushions on the floor'
    },
    affirmation: 'I am grateful for every step of my journey. Each day brings gifts.'
  },
  {
    id: 'mindset-evening-meditation',
    title: 'Feminine embodiment meditation',
    description: 'Guided meditation for feminine alignment',
    domain: 'mindset',
    timeBlock: 'evening',
    duration: 15,
    baseIntensity: 'normal',
    instructions: {
      overview: 'Meditation helps integrate your day\'s practice into your deeper self. This embodiment meditation connects your conscious practice to your unconscious patterns.',
      preparation: 'Find a comfortable position - seated or lying down. Use headphones if using guided audio. Dim the lights.',
      steps: [
        'Close your eyes and take 5 deep breaths, releasing tension with each exhale',
        'Scan your body from head to toe, noticing any areas holding tension',
        'Visualize a warm, glowing light at your heart center - your feminine essence',
        'With each breath, let this light expand through your body',
        'See yourself as you want to be - moving, speaking, existing as your authentic feminine self',
        'Hold this vision clearly - what do you look like? Sound like? Feel like?',
        'Slowly bring awareness back to your physical body, keeping the warmth with you'
      ],
      goal: 'Deeply internalize your feminine identity through visualization and embodied meditation',
      tips: [
        'Guided meditations (YouTube, apps) are great if visualization is difficult',
        'Don\'t judge thoughts that arise - acknowledge and return to visualization',
        'Regular practice makes visualization stronger and more automatic'
      ],
      commonMistakes: [
        'Falling asleep - sit up if this is a problem',
        'Trying too hard to "see" - feeling and knowing count too',
        'Skipping meditation because you\'re not "good at it" - there\'s no wrong way'
      ]
    },
    sensory: {
      think: 'I am connecting with my deepest feminine truth. She has always been here.',
      feel: 'Warmth spreading through your body, muscles softening, peace settling in',
      see: 'Your ideal self in vivid detail - not just appearance, but essence'
    },
    ambiance: {
      lighting: 'Very dim or candlelight',
      music: 'Soft meditation music or feminine embodiment guided meditation',
      environment: 'Quiet, comfortable, warm space'
    },
    affirmation: 'In stillness, I connect with my true feminine nature. She guides me always.'
  },

  // Evening - Style
  {
    id: 'style-evening-plan',
    title: 'Tomorrow\'s outfit planning',
    description: 'Plan and prepare tomorrow\'s look',
    domain: 'style',
    timeBlock: 'evening',
    duration: 10,
    baseIntensity: 'normal',
    instructions: {
      overview: 'Planning your outfit the night before removes morning stress and ensures you show up intentionally. This practice turns getting dressed from a chore into an act of self-expression.',
      preparation: 'Check tomorrow\'s calendar and weather. Open your closet or wardrobe.',
      steps: [
        'Consider tomorrow\'s context - where will you be? Who will you see?',
        'Think about how you want to FEEL tomorrow - confident? Soft? Professional?',
        'Choose pieces that support that feeling - not just what\'s clean',
        'Pull the complete outfit including undergarments, accessories, shoes',
        'Try it on if you\'re unsure - better to know now than tomorrow morning',
        'Lay everything out or hang it together so it\'s ready',
        'Take a moment to appreciate your future self\'s look'
      ],
      goal: 'Start tomorrow already decided, so you can focus on being, not choosing',
      tips: [
        'Keep a "uniform" formula for stressful days - reliable combos that always work',
        'Consider if tomorrow calls for practicing something new (a scarf, heels, etc.)',
        'Check that everything is clean and ready to wear'
      ],
      commonMistakes: [
        'Only considering practicality, not how you want to feel',
        'Forgetting accessories - they complete a look',
        'Not actually laying it out - you\'ll change your mind in the morning'
      ]
    },
    sensory: {
      think: 'I am preparing to present myself intentionally. Tomorrow, I will feel put-together.',
      feel: 'The fabrics between your fingers as you choose, the satisfaction of a complete look',
      see: 'Your outfit laid out - visualize yourself wearing it tomorrow'
    },
    ambiance: {
      lighting: 'Good lighting to see true colors',
      music: 'Light background music',
      environment: 'Organized closet space'
    },
    affirmation: 'I prepare with intention. Tomorrow I will dress with purpose and confidence.'
  },

  // Evening - Movement
  {
    id: 'movement-evening-stretch',
    title: 'Evening gentle stretching',
    description: 'Relaxing stretches with feminine grace',
    domain: 'movement',
    timeBlock: 'evening',
    duration: 10,
    baseIntensity: 'crazy',
    instructions: {
      overview: 'Evening stretching releases the day\'s tension and prepares your body for rest. These gentle, flowing movements are also a final practice of feminine movement before sleep.',
      preparation: 'Wear comfortable sleepwear or stretchy clothes. Have a yoga mat or soft carpet. Dim the lights.',
      steps: [
        'Start standing - take 3 deep breaths and let your shoulders drop',
        'Gentle neck rolls - slow circles, releasing tension',
        'Shoulder rolls and arm stretches - reach up, then flow down like water',
        'Standing forward fold - let your head hang heavy, sway gently',
        'Move to the floor - cat-cow stretches, moving with your breath',
        'Hip openers - figure-4 stretch, gentle pigeon pose, happy baby',
        'End in a comfortable resting position - feel your body settling'
      ],
      goal: 'Release physical tension and end the day in your body with grace and peace',
      tips: [
        'This is NOT a workout - go gently, no pushing',
        'Breathe deeply - exhales release tension',
        'Focus on areas that hold your stress (shoulders, hips, jaw)'
      ],
      commonMistakes: [
        'Stretching too intensely before bed - keep it gentle',
        'Rushing through - slowness is the point',
        'Skipping because you\'re tired - this actually helps sleep'
      ]
    },
    sensory: {
      think: 'I release this day from my body. I prepare for rest.',
      feel: 'Muscles lengthening, tension melting, the pleasure of gentle stretching',
      listen: 'Your breath deepening, perhaps soft music or silence'
    },
    ambiance: {
      lighting: 'Very dim - candles or lowest light setting',
      music: 'Soft, slow music or sleep sounds',
      environment: 'Warm, quiet space near where you\'ll sleep'
    },
    affirmation: 'I release the day with grace. My body is ready for peaceful rest.'
  }
];

export const getDomainInfo = (domain: Domain): DomainInfo => {
  return DOMAINS.find(d => d.domain === domain) || DOMAINS[0];
};

export const getPhaseInfo = (phase: number): PhaseDefinition => {
  return PHASES.find(p => p.phase === phase) || PHASES[0];
};
