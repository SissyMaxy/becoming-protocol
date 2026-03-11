/**
 * Default log field definitions per domain.
 * Used when a log_entry task has no explicit capture_fields defined.
 */

import type { CaptureFieldDef } from '../types/task-bank';

export const DEFAULT_LOG_FIELDS: Record<string, CaptureFieldDef[]> = {
  voice: [
    { key: 'comfort', type: 'select', label: 'How natural did SHE sound?', options: ['Forced', 'Uncomfortable', 'Okay', 'Natural', 'Effortless'] },
    { key: 'notes', type: 'text', label: 'What did she notice?', optional: true },
  ],
  skincare: [
    { key: 'products', type: 'text', label: 'Products used', optional: true },
    { key: 'experience', type: 'select', label: 'How did HER ritual feel?', options: ['Chore', 'Routine', 'Self-care', 'Ritual', 'Pleasure'] },
  ],
  style: [
    { key: 'what_worn', type: 'text', label: 'What did she wear?' },
    { key: 'confidence', type: 'slider', label: 'How confident did she feel?', min: 1, max: 5 },
  ],
  movement: [
    { key: 'comfort', type: 'select', label: 'How natural was HER movement?', options: ['Very conscious', 'Somewhat conscious', 'Becoming natural', 'Automatic'] },
  ],
  inner_narrative: [
    { key: 'text', type: 'text', label: 'What did she say to herself?' },
  ],
  posture: [
    { key: 'awareness', type: 'select', label: 'HER body awareness', options: ['Forgot', 'Occasional', 'Frequent', 'Constant'] },
    { key: 'notes', type: 'text', label: 'What did she notice?', optional: true },
  ],
  social: [
    { key: 'interaction', type: 'text', label: 'Where did she show up?' },
    { key: 'confidence', type: 'slider', label: 'How confident was she?', min: 1, max: 5 },
  ],
  grooming: [
    { key: 'area', type: 'text', label: 'What did she take care of?' },
    { key: 'feeling', type: 'select', label: 'How did HER body feel after?', options: ['Chore', 'Routine', 'Self-care', 'Pleasure'] },
  ],
  exercise: [
    { key: 'activity', type: 'text', label: 'What did she do?' },
    { key: 'duration_min', type: 'number', label: 'Duration (minutes)', min: 1, max: 180 },
  ],
  nutrition: [
    { key: 'what', type: 'text', label: 'What did she choose?' },
    { key: 'notes', type: 'text', label: 'Notes', optional: true },
  ],
  _default: [
    { key: 'notes', type: 'text', label: 'Notes', optional: true },
  ],
};
