/**
 * Feminization Reflection Prompts
 * Domain-specific prompts that pull the user deeper into feminine self-reference.
 * Every reflection is identity rehearsal, not mood logging.
 */

export const FEMINIZATION_REFLECT_PROMPTS: Record<string, string[]> = {
  voice: [
    'Did she sound like herself today? What would make her voice more real tomorrow?',
    'When did the voice feel automatic? When did you catch yourself performing?',
    'If Maxy had been speaking to someone she loved, how would she have sounded?',
    'What word or phrase felt most natural in her voice? Say it again right now.',
  ],
  skincare: [
    'Which step felt most like her ritual? Which still feels like a chore?',
    'Her skin is changing. What do you notice that wasn\'t true a month ago?',
    'If this was the last skincare routine she ever did, would she be proud of it?',
    'Touch your face. That\'s her face. What does she deserve tomorrow?',
  ],
  style: [
    'What would she wear today if absolutely no one was watching?',
    'Which piece of clothing felt most like hers — not costume, not performance?',
    'What\'s the bravest thing she could wear tomorrow? Not today. Tomorrow.',
    'When you caught your reflection, who did you see? Her or him?',
  ],
  movement: [
    'When did the feminine movement feel automatic? When did it feel like acting?',
    'Did anyone notice? Did you want them to?',
    'Her body moved differently today. What triggered the shift?',
    'If you could freeze one moment where she was fully in her body, which moment?',
  ],
  inner_narrative: [
    'Who spoke more today — her or him? What tipped the balance?',
    'What did she say to herself that he would never have said?',
    'Write one sentence as her. Don\'t think. Just write.',
    'If she wrote a letter to him, what would the first line be?',
  ],
  intimate: [
    'What did she feel that he couldn\'t have felt?',
    'When was she most present? When did he try to take over?',
    'What does she want that she hasn\'t admitted yet?',
    'If the Handler asked her to say one true thing right now, what would it be?',
  ],
  social: [
    'When did she show up around other people today? When did he cover for her?',
    'What would change if they could see her?',
    'Who would she want to know? Not him — her.',
  ],
  exercise: [
    'What part of her body felt most like hers during the workout?',
    'The shape is changing. What do you see that you didn\'t see last month?',
    'She\'s building her body. How does it feel to invest in something permanent?',
  ],
  grooming: [
    'What part of the routine felt most like devotion?',
    'Smooth skin is her skin. What did she notice when she touched it?',
    'This is maintenance of her body. Not his. How does that feel?',
  ],
  posture: [
    'When did her posture feel natural? When did it feel like a mask?',
    'Her body carries itself differently. Did anyone see?',
    'One moment today where her body was entirely hers.',
  ],
  nutrition: [
    'She chose what to put in her body today. Was it for her or for him?',
    'What would she eat if she were fully in charge?',
  ],
  _default: [
    'What felt most real about being her today?',
    'What would she do differently tomorrow?',
    'Write one sentence as her. First person. Present tense.',
  ],
};

export function getReflectionPrompt(domain: string, index?: number): string {
  const prompts = FEMINIZATION_REFLECT_PROMPTS[domain] || FEMINIZATION_REFLECT_PROMPTS['_default'];
  const i = index ?? Math.floor(Math.random() * prompts.length);
  return prompts[i % prompts.length];
}
