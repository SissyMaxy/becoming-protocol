// ============================================
// Industry Module — Sprint 1 Seed Data
// Reference images, community targets, denial
// day content map, denial cycle shoot templates
// ============================================

import { supabase } from '../supabase';

// ============================================
// SVG Reference Image Generator
// ============================================

function generateReferenceSvg(
  pose: string,
  angle: string,
  cameraPos: string,
  lightPos: string,
): string {
  // Mannequin body positions for different poses
  const poses: Record<string, string> = {
    standing: `<line x1="100" y1="60" x2="100" y2="120" stroke="#666" stroke-width="2"/>
      <line x1="100" y1="120" x2="85" y2="180" stroke="#666" stroke-width="2"/>
      <line x1="100" y1="120" x2="115" y2="180" stroke="#666" stroke-width="2"/>
      <line x1="100" y1="75" x2="75" y2="105" stroke="#666" stroke-width="2"/>
      <line x1="100" y1="75" x2="125" y2="105" stroke="#666" stroke-width="2"/>
      <circle cx="100" cy="50" r="12" fill="none" stroke="#666" stroke-width="2"/>`,
    lying: `<line x1="40" y1="100" x2="160" y2="100" stroke="#666" stroke-width="2"/>
      <line x1="160" y1="100" x2="185" y2="85" stroke="#666" stroke-width="2"/>
      <line x1="160" y1="100" x2="185" y2="115" stroke="#666" stroke-width="2"/>
      <line x1="40" y1="100" x2="20" y2="85" stroke="#666" stroke-width="2"/>
      <line x1="40" y1="100" x2="20" y2="115" stroke="#666" stroke-width="2"/>
      <circle cx="25" cy="100" r="12" fill="none" stroke="#666" stroke-width="2"/>`,
    kneeling: `<line x1="100" y1="60" x2="100" y2="110" stroke="#666" stroke-width="2"/>
      <line x1="100" y1="110" x2="85" y2="145" stroke="#666" stroke-width="2"/>
      <line x1="85" y1="145" x2="85" y2="180" stroke="#666" stroke-width="2"/>
      <line x1="100" y1="110" x2="115" y2="145" stroke="#666" stroke-width="2"/>
      <line x1="115" y1="145" x2="115" y2="180" stroke="#666" stroke-width="2"/>
      <line x1="100" y1="75" x2="75" y2="105" stroke="#666" stroke-width="2"/>
      <line x1="100" y1="75" x2="125" y2="95" stroke="#666" stroke-width="2"/>
      <circle cx="100" cy="50" r="12" fill="none" stroke="#666" stroke-width="2"/>`,
    sitting: `<line x1="100" y1="60" x2="100" y2="120" stroke="#666" stroke-width="2"/>
      <line x1="100" y1="120" x2="70" y2="120" stroke="#666" stroke-width="2"/>
      <line x1="70" y1="120" x2="70" y2="170" stroke="#666" stroke-width="2"/>
      <line x1="100" y1="120" x2="130" y2="120" stroke="#666" stroke-width="2"/>
      <line x1="130" y1="120" x2="130" y2="170" stroke="#666" stroke-width="2"/>
      <line x1="100" y1="75" x2="75" y2="100" stroke="#666" stroke-width="2"/>
      <line x1="100" y1="75" x2="125" y2="100" stroke="#666" stroke-width="2"/>
      <circle cx="100" cy="50" r="12" fill="none" stroke="#666" stroke-width="2"/>
      <rect x="55" y="115" width="90" height="8" fill="none" stroke="#999" stroke-dasharray="3"/>`,
    bent_over: `<line x1="80" y1="70" x2="120" y2="100" stroke="#666" stroke-width="2"/>
      <line x1="120" y1="100" x2="105" y2="170" stroke="#666" stroke-width="2"/>
      <line x1="120" y1="100" x2="135" y2="170" stroke="#666" stroke-width="2"/>
      <line x1="85" y1="78" x2="60" y2="95" stroke="#666" stroke-width="2"/>
      <line x1="85" y1="78" x2="60" y2="70" stroke="#666" stroke-width="2"/>
      <circle cx="72" cy="62" r="12" fill="none" stroke="#666" stroke-width="2"/>`,
  };

  // Camera icon position
  const cameras: Record<string, string> = {
    front: `<rect x="90" y="5" width="20" height="15" rx="2" fill="#3B82F6" opacity="0.8"/>
      <circle cx="100" cy="12" r="4" fill="white" opacity="0.8"/>
      <text x="100" y="30" text-anchor="middle" font-size="8" fill="#3B82F6">FRONT</text>`,
    behind: `<rect x="90" y="185" width="20" height="15" rx="2" fill="#3B82F6" opacity="0.8"/>
      <circle cx="100" cy="192" r="4" fill="white" opacity="0.8"/>
      <text x="100" y="182" text-anchor="middle" font-size="8" fill="#3B82F6">BEHIND</text>`,
    above: `<rect x="155" y="5" width="20" height="15" rx="2" fill="#3B82F6" opacity="0.8"/>
      <circle cx="165" cy="12" r="4" fill="white" opacity="0.8"/>
      <line x1="165" y1="20" x2="110" y2="50" stroke="#3B82F6" stroke-dasharray="3" opacity="0.5"/>
      <text x="165" y="30" text-anchor="middle" font-size="8" fill="#3B82F6">ABOVE</text>`,
    floor: `<rect x="10" y="170" width="20" height="15" rx="2" fill="#3B82F6" opacity="0.8"/>
      <circle cx="20" cy="177" r="4" fill="white" opacity="0.8"/>
      <line x1="30" y1="177" x2="90" y2="160" stroke="#3B82F6" stroke-dasharray="3" opacity="0.5"/>
      <text x="20" y="168" text-anchor="middle" font-size="8" fill="#3B82F6">LOW</text>`,
    mirror: `<rect x="155" y="60" width="30" height="50" rx="2" fill="none" stroke="#9CA3AF" stroke-width="1"/>
      <text x="170" y="90" text-anchor="middle" font-size="8" fill="#9CA3AF">MIRROR</text>
      <rect x="5" y="80" width="20" height="15" rx="2" fill="#3B82F6" opacity="0.8"/>
      <circle cx="15" cy="87" r="4" fill="white" opacity="0.8"/>`,
    side: `<rect x="5" y="80" width="20" height="15" rx="2" fill="#3B82F6" opacity="0.8"/>
      <circle cx="15" cy="87" r="4" fill="white" opacity="0.8"/>
      <text x="15" y="78" text-anchor="middle" font-size="8" fill="#3B82F6">SIDE</text>`,
  };

  // Light source
  const lights: Record<string, string> = {
    ring_front: `<circle cx="100" cy="15" r="8" fill="none" stroke="#FCD34D" stroke-width="1.5"/>
      <line x1="92" y1="10" x2="88" y2="5" stroke="#FCD34D" stroke-width="1"/>
      <line x1="108" y1="10" x2="112" y2="5" stroke="#FCD34D" stroke-width="1"/>
      <line x1="100" y1="7" x2="100" y2="2" stroke="#FCD34D" stroke-width="1"/>`,
    ring_back: `<circle cx="100" cy="190" r="8" fill="none" stroke="#FCD34D" stroke-width="1.5"/>
      <line x1="92" y1="195" x2="88" y2="200" stroke="#FCD34D" stroke-width="1"/>
      <line x1="108" y1="195" x2="112" y2="200" stroke="#FCD34D" stroke-width="1"/>`,
    window: `<rect x="170" y="20" width="25" height="60" fill="none" stroke="#FCD34D" stroke-width="1"/>
      <line x1="170" y1="50" x2="130" y2="80" stroke="#FCD34D" stroke-dasharray="4" opacity="0.3"/>
      <line x1="170" y1="40" x2="130" y2="60" stroke="#FCD34D" stroke-dasharray="4" opacity="0.3"/>`,
    overhead: `<ellipse cx="100" cy="10" rx="30" ry="5" fill="none" stroke="#FCD34D" stroke-width="1"/>
      <line x1="70" y1="10" x2="80" y2="40" stroke="#FCD34D" stroke-dasharray="4" opacity="0.3"/>
      <line x1="130" y1="10" x2="120" y2="40" stroke="#FCD34D" stroke-dasharray="4" opacity="0.3"/>`,
  };

  const poseKey = Object.keys(poses).includes(pose) ? pose : 'standing';
  const cameraKey = Object.keys(cameras).includes(cameraPos) ? cameraPos : 'front';
  const lightKey = Object.keys(lights).includes(lightPos) ? lightPos : 'ring_front';

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 210" width="200" height="210">
    <rect width="200" height="210" fill="#1a1a2e" rx="8"/>
    ${lights[lightKey]}
    ${poses[poseKey]}
    ${cameras[cameraKey]}
    <text x="100" y="205" text-anchor="middle" font-size="7" fill="#666">${angle}</text>
  </svg>`;
}

// ============================================
// 30 Reference Images (10 poses × 3 angles)
// ============================================

interface RefImageSeed {
  pose_name: string;
  angle: string;
  body_position: string;
  lighting: string;
  camera_position: string;
  description: string;
  tags: string[];
  difficulty: number;
  svg_pose: string;
  svg_camera: string;
  svg_light: string;
}

const REFERENCE_IMAGES: RefImageSeed[] = [
  // 1. Top-down bed (3 variations)
  {
    pose_name: 'top_down_bed',
    angle: 'directly above',
    body_position: 'lying face up on bed',
    lighting: 'ring light overhead',
    camera_position: 'directly above, arms length',
    description: 'Lying on bed, camera directly above. Full body visible from chest down.',
    tags: ['bed', 'overhead', 'full_body', 'vulnerable'],
    difficulty: 2,
    svg_pose: 'lying', svg_camera: 'above', svg_light: 'overhead',
  },
  {
    pose_name: 'top_down_bed_curled',
    angle: 'above, slight angle',
    body_position: 'lying on side, knees drawn up',
    lighting: 'ring light overhead',
    camera_position: 'above and slightly to the side',
    description: 'Curled on side, camera above. Needy, intimate body language.',
    tags: ['bed', 'overhead', 'curled', 'intimate'],
    difficulty: 2,
    svg_pose: 'lying', svg_camera: 'above', svg_light: 'overhead',
  },
  {
    pose_name: 'top_down_bed_spread',
    angle: 'directly above, wider',
    body_position: 'lying face up, limbs spread',
    lighting: 'ring light overhead',
    camera_position: 'standing on bed or high tripod',
    description: 'Spread on bed, arms above head. Surrender pose. Premium content.',
    tags: ['bed', 'overhead', 'spread', 'surrender', 'premium'],
    difficulty: 3,
    svg_pose: 'lying', svg_camera: 'above', svg_light: 'overhead',
  },

  // 2. Lying on side (3 variations)
  {
    pose_name: 'lying_on_side',
    angle: 'level, from front',
    body_position: 'lying on side facing camera',
    lighting: 'ring light from camera direction',
    camera_position: 'floor level or low tripod',
    description: 'On side facing camera. Top leg bent forward. Hands near cage.',
    tags: ['bed', 'side', 'intimate', 'needy'],
    difficulty: 2,
    svg_pose: 'lying', svg_camera: 'front', svg_light: 'ring_front',
  },
  {
    pose_name: 'lying_on_side_back',
    angle: 'level, from behind',
    body_position: 'lying on side, back to camera',
    lighting: 'ring light behind camera',
    camera_position: 'floor level behind',
    description: 'On side, back to camera. Shows back and legs. Arch back slightly.',
    tags: ['bed', 'side', 'behind', 'curves'],
    difficulty: 2,
    svg_pose: 'lying', svg_camera: 'behind', svg_light: 'ring_front',
  },
  {
    pose_name: 'lying_on_side_detail',
    angle: 'close-up, waist level',
    body_position: 'lying on side, focus on midsection',
    lighting: 'soft ring light',
    camera_position: 'close, at waist height',
    description: 'Close-up of cage area while lying on side. Detail shot.',
    tags: ['bed', 'close_up', 'cage', 'detail'],
    difficulty: 1,
    svg_pose: 'lying', svg_camera: 'front', svg_light: 'ring_front',
  },

  // 3. Standing mirror (3 variations)
  {
    pose_name: 'mirror_selfie_neck_down',
    angle: 'mirror reflection, neck down',
    body_position: 'standing in front of mirror',
    lighting: 'ring light beside mirror',
    camera_position: 'hand-held, waist to chest height',
    description: 'Mirror selfie cropped at neck. Phone visible in mirror is fine.',
    tags: ['mirror', 'standing', 'selfie', 'easy'],
    difficulty: 1,
    svg_pose: 'standing', svg_camera: 'mirror', svg_light: 'ring_front',
  },
  {
    pose_name: 'mirror_hip_pop',
    angle: 'mirror reflection, slight angle',
    body_position: 'standing, weight on one leg, hip out',
    lighting: 'ring light beside mirror',
    camera_position: 'hand-held at hip height',
    description: 'Hip pop in mirror. Weight shifted, creates curves. Classic pose.',
    tags: ['mirror', 'standing', 'hip_pop', 'feminine'],
    difficulty: 2,
    svg_pose: 'standing', svg_camera: 'mirror', svg_light: 'ring_front',
  },
  {
    pose_name: 'mirror_over_shoulder',
    angle: 'over shoulder into mirror',
    body_position: 'back to mirror, looking over shoulder',
    lighting: 'ring light from front',
    camera_position: 'over shoulder into mirror reflection',
    description: 'Back to mirror, phone over shoulder capturing reflection of rear.',
    tags: ['mirror', 'behind', 'over_shoulder', 'rear'],
    difficulty: 2,
    svg_pose: 'standing', svg_camera: 'mirror', svg_light: 'ring_front',
  },

  // 4. Desk from behind (3 variations)
  {
    pose_name: 'desk_behind_standing',
    angle: 'tripod behind, waist down',
    body_position: 'standing at desk, back to camera',
    lighting: 'ring light from front (facing desk)',
    camera_position: 'tripod behind, waist height',
    description: 'Standing at desk, tripod behind. Waist-down rear view.',
    tags: ['desk', 'behind', 'standing', 'tripod'],
    difficulty: 1,
    svg_pose: 'standing', svg_camera: 'behind', svg_light: 'ring_front',
  },
  {
    pose_name: 'desk_behind_bent',
    angle: 'tripod behind, bent at waist',
    body_position: 'bent over desk, back to camera',
    lighting: 'ring light from side',
    camera_position: 'tripod behind, lower angle',
    description: 'Bent over desk, camera behind. Leggings/thong content.',
    tags: ['desk', 'behind', 'bent_over', 'leggings'],
    difficulty: 2,
    svg_pose: 'bent_over', svg_camera: 'behind', svg_light: 'ring_front',
  },
  {
    pose_name: 'desk_behind_seated',
    angle: 'tripod behind, seated',
    body_position: 'seated at desk chair, legs visible',
    lighting: 'ring light from front',
    camera_position: 'behind and below',
    description: 'Seated at desk, camera behind showing legs and silhouette.',
    tags: ['desk', 'behind', 'seated', 'casual'],
    difficulty: 1,
    svg_pose: 'sitting', svg_camera: 'behind', svg_light: 'ring_front',
  },

  // 5. Silhouette backlit (3 variations)
  {
    pose_name: 'silhouette_standing',
    angle: 'front, backlit',
    body_position: 'standing, ring light behind',
    lighting: 'ring light behind subject (backlit)',
    camera_position: 'front, slightly below',
    description: 'Ring light behind creates silhouette. Artistic, anonymous. Premium.',
    tags: ['silhouette', 'backlit', 'artistic', 'premium', 'anonymous'],
    difficulty: 3,
    svg_pose: 'standing', svg_camera: 'front', svg_light: 'ring_back',
  },
  {
    pose_name: 'silhouette_side',
    angle: 'side profile, backlit',
    body_position: 'standing side profile',
    lighting: 'ring light behind and to side',
    camera_position: 'side, level',
    description: 'Side profile silhouette. Shows body shape without detail. Teaser content.',
    tags: ['silhouette', 'backlit', 'side', 'teaser'],
    difficulty: 3,
    svg_pose: 'standing', svg_camera: 'side', svg_light: 'ring_back',
  },
  {
    pose_name: 'silhouette_kneeling',
    angle: 'front, backlit, kneeling',
    body_position: 'kneeling, backlit',
    lighting: 'ring light behind at ground level',
    camera_position: 'front, floor level',
    description: 'Kneeling silhouette. Dramatic, submissive energy. Premium content.',
    tags: ['silhouette', 'backlit', 'kneeling', 'submissive', 'premium'],
    difficulty: 3,
    svg_pose: 'kneeling', svg_camera: 'front', svg_light: 'ring_back',
  },

  // 6. Cage close-up (3 variations)
  {
    pose_name: 'cage_closeup_front',
    angle: 'close-up, front',
    body_position: 'standing or sitting, camera at waist',
    lighting: 'ring light direct',
    camera_position: 'close, slightly below waist',
    description: 'Close-up of cage through fabric or exposed. The signature shot.',
    tags: ['cage', 'close_up', 'detail', 'signature'],
    difficulty: 1,
    svg_pose: 'standing', svg_camera: 'front', svg_light: 'ring_front',
  },
  {
    pose_name: 'cage_closeup_thong',
    angle: 'close-up, thong pulled aside',
    body_position: 'standing, one hand adjusting',
    lighting: 'ring light direct',
    camera_position: 'close, waist level',
    description: 'Cage visible with thong pulled to side. Classic cage check framing.',
    tags: ['cage', 'close_up', 'thong', 'cage_check'],
    difficulty: 1,
    svg_pose: 'standing', svg_camera: 'front', svg_light: 'ring_front',
  },
  {
    pose_name: 'cage_closeup_bed',
    angle: 'close-up, lying down',
    body_position: 'lying on back, camera above waist area',
    lighting: 'overhead light',
    camera_position: 'above, focused on cage',
    description: 'Cage close-up while lying down. Vulnerable angle.',
    tags: ['cage', 'close_up', 'bed', 'vulnerable'],
    difficulty: 1,
    svg_pose: 'lying', svg_camera: 'above', svg_light: 'overhead',
  },

  // 7. Leggings from behind (3 variations)
  {
    pose_name: 'leggings_behind_standing',
    angle: 'behind, full legs',
    body_position: 'standing, feet shoulder width',
    lighting: 'ring light from front',
    camera_position: 'tripod behind, mid-thigh height',
    description: 'Leggings from behind, standing. The Reddit staple.',
    tags: ['leggings', 'behind', 'standing', 'reddit'],
    difficulty: 1,
    svg_pose: 'standing', svg_camera: 'behind', svg_light: 'ring_front',
  },
  {
    pose_name: 'leggings_behind_bent',
    angle: 'behind, bent forward',
    body_position: 'bent at waist, touching toes',
    lighting: 'ring light from front/side',
    camera_position: 'tripod behind, lower',
    description: 'Leggings bent over. Stretching energy. High engagement on Reddit.',
    tags: ['leggings', 'behind', 'bent_over', 'stretch', 'high_engagement'],
    difficulty: 2,
    svg_pose: 'bent_over', svg_camera: 'behind', svg_light: 'ring_front',
  },
  {
    pose_name: 'leggings_behind_walk',
    angle: 'behind, mid-step',
    body_position: 'walking away, mid-stride',
    lighting: 'natural or ring light',
    camera_position: 'tripod behind, waist height',
    description: 'Walking away shot in leggings. Casual, candid energy.',
    tags: ['leggings', 'behind', 'walking', 'candid'],
    difficulty: 2,
    svg_pose: 'standing', svg_camera: 'behind', svg_light: 'ring_front',
  },

  // 8. Thong detail (3 variations)
  {
    pose_name: 'thong_front_standing',
    angle: 'front, waist down',
    body_position: 'standing, thumbs in waistband',
    lighting: 'ring light direct',
    camera_position: 'tripod front, waist height',
    description: 'Thong from front, hands at waistband. Cage visible through fabric.',
    tags: ['thong', 'front', 'standing', 'waistband'],
    difficulty: 1,
    svg_pose: 'standing', svg_camera: 'front', svg_light: 'ring_front',
  },
  {
    pose_name: 'thong_back_standing',
    angle: 'behind, waist down',
    body_position: 'standing, slight hip tilt',
    lighting: 'ring light from front',
    camera_position: 'tripod behind, waist height',
    description: 'Thong from behind. Classic content shot.',
    tags: ['thong', 'behind', 'standing'],
    difficulty: 1,
    svg_pose: 'standing', svg_camera: 'behind', svg_light: 'ring_front',
  },
  {
    pose_name: 'thong_side_lying',
    angle: 'side, lying on bed',
    body_position: 'lying on side, thong visible',
    lighting: 'soft ring light',
    camera_position: 'level with bed',
    description: 'Side view lying down, thong visible. Intimate, soft.',
    tags: ['thong', 'side', 'bed', 'intimate'],
    difficulty: 1,
    svg_pose: 'lying', svg_camera: 'side', svg_light: 'ring_front',
  },

  // 9. Sitting edge of bed (3 variations)
  {
    pose_name: 'sitting_edge_front',
    angle: 'front, slightly below',
    body_position: 'sitting on bed edge, legs apart',
    lighting: 'ring light from camera direction',
    camera_position: 'floor level, slightly below',
    description: 'Sitting on bed edge, knees apart. Cage visible. Dominant framing despite submissive state.',
    tags: ['sitting', 'bed_edge', 'front', 'cage_visible'],
    difficulty: 2,
    svg_pose: 'sitting', svg_camera: 'front', svg_light: 'ring_front',
  },
  {
    pose_name: 'sitting_edge_hands',
    angle: 'front, focus on hands',
    body_position: 'sitting, hands on knees or gripping edge',
    lighting: 'ring light direct',
    camera_position: 'level, medium distance',
    description: 'Sitting, hands gripping bed edge. Body language: tension, need.',
    tags: ['sitting', 'bed_edge', 'hands', 'tension'],
    difficulty: 2,
    svg_pose: 'sitting', svg_camera: 'front', svg_light: 'ring_front',
  },
  {
    pose_name: 'sitting_edge_slumped',
    angle: 'front or side, relaxed',
    body_position: 'sitting, leaning back on hands',
    lighting: 'ring light from front',
    camera_position: 'slightly above, looking down',
    description: 'Leaning back on hands, legs extended. Post-session exhaustion energy.',
    tags: ['sitting', 'bed_edge', 'relaxed', 'post_session'],
    difficulty: 2,
    svg_pose: 'sitting', svg_camera: 'above', svg_light: 'ring_front',
  },

  // 10. Kneeling (3 variations)
  {
    pose_name: 'kneeling_front',
    angle: 'front, camera at eye level',
    body_position: 'kneeling upright, hands on thighs',
    lighting: 'ring light from camera direction',
    camera_position: 'tripod at kneeling eye level',
    description: 'Kneeling facing camera. Hands on thighs. Submissive but composed.',
    tags: ['kneeling', 'front', 'submissive', 'composed'],
    difficulty: 2,
    svg_pose: 'kneeling', svg_camera: 'front', svg_light: 'ring_front',
  },
  {
    pose_name: 'kneeling_behind',
    angle: 'behind, floor level',
    body_position: 'kneeling, back to camera',
    lighting: 'ring light from front (facing away)',
    camera_position: 'floor level behind',
    description: 'Kneeling from behind. Thong visible. Arched back.',
    tags: ['kneeling', 'behind', 'thong', 'arch'],
    difficulty: 2,
    svg_pose: 'kneeling', svg_camera: 'behind', svg_light: 'ring_front',
  },
  {
    pose_name: 'kneeling_side',
    angle: 'side profile, floor level',
    body_position: 'kneeling, side to camera',
    lighting: 'backlight or side light',
    camera_position: 'floor level, side',
    description: 'Side profile kneeling. Good for silhouette variation.',
    tags: ['kneeling', 'side', 'profile', 'silhouette_option'],
    difficulty: 2,
    svg_pose: 'kneeling', svg_camera: 'side', svg_light: 'ring_back',
  },
];

// ============================================
// Phase 0 Community Targets
// ============================================

interface CommunitySeed {
  platform: string;
  community_id: string;
  community_name: string;
  engagement_strategy: string;
  posting_frequency: string;
  content_types_allowed: string[];
  rules_summary: string | null;
}

const PHASE_0_COMMUNITIES: CommunitySeed[] = [
  // Reddit: Content posting subs
  {
    platform: 'reddit',
    community_id: 'r/sissies',
    community_name: 'r/sissies',
    engagement_strategy: 'Post content 3x/week. Comment on others\' posts daily. Be supportive and genuine. Build name recognition.',
    posting_frequency: '3_per_week',
    content_types_allowed: ['photo_set', 'cage_check', 'tease_video', 'text_post'],
    rules_summary: 'NSFW allowed. Self-promo OK. Be respectful.',
  },
  {
    platform: 'reddit',
    community_id: 'r/chastity',
    community_name: 'r/chastity',
    engagement_strategy: 'Post cage checks with denial day counter. Comment on others\' chastity posts with encouragement. This is Maxy\'s core niche.',
    posting_frequency: 'daily',
    content_types_allowed: ['cage_check', 'denial_update', 'text_post'],
    rules_summary: 'Chastity-focused. Cage content always welcome.',
  },
  {
    platform: 'reddit',
    community_id: 'r/LockedAndCaged',
    community_name: 'r/LockedAndCaged',
    engagement_strategy: 'Cage content with denial day narrative.',
    posting_frequency: '3_per_week',
    content_types_allowed: ['cage_check', 'denial_update'],
    rules_summary: null,
  },
  {
    platform: 'reddit',
    community_id: 'r/FemBoys',
    community_name: 'r/FemBoys',
    engagement_strategy: 'Leggings and outfit content. Less chastity-focused, more feminine presentation.',
    posting_frequency: '2_per_week',
    content_types_allowed: ['photo_set', 'leggings_set', 'outfit_of_day'],
    rules_summary: 'Large community. High competition. Consistency matters.',
  },
  {
    platform: 'reddit',
    community_id: 'r/sissydressing',
    community_name: 'r/sissydressing',
    engagement_strategy: 'Outfit content as wardrobe grows.',
    posting_frequency: 'weekly',
    content_types_allowed: ['outfit_of_day', 'photo_set'],
    rules_summary: null,
  },
  {
    platform: 'reddit',
    community_id: 'r/chastitytraining',
    community_name: 'r/chastitytraining',
    engagement_strategy: 'Discussion and progress posts. Handler posts text updates about the denial journey. Comments on others\' experiences. Builds Maxy as a known community member.',
    posting_frequency: '2_per_week',
    content_types_allowed: ['text_post', 'denial_update'],
    rules_summary: 'Discussion-oriented. Text posts valued. Advice-sharing.',
  },
  {
    platform: 'reddit',
    community_id: 'r/GoonCaves',
    community_name: 'r/GoonCaves',
    engagement_strategy: 'Edge session content when available.',
    posting_frequency: 'weekly',
    content_types_allowed: ['edge_capture'],
    rules_summary: null,
  },
  // Reddit: Discussion/support subs (comment only)
  {
    platform: 'reddit',
    community_id: 'r/TransDIY',
    community_name: 'r/TransDIY',
    engagement_strategy: 'Genuine engagement only. No promo. Ask questions, share experiences, be a real community member. People click profiles of people they connect with.',
    posting_frequency: 'comment_only',
    content_types_allowed: ['text_post'],
    rules_summary: 'NO self-promotion. Genuine support and discussion only.',
  },
  {
    platform: 'reddit',
    community_id: 'r/asktransgender',
    community_name: 'r/asktransgender',
    engagement_strategy: 'Same as TransDIY. Genuine participation. Profile visibility is the only goal.',
    posting_frequency: 'comment_only',
    content_types_allowed: [],
    rules_summary: 'NO self-promotion. Genuine support and discussion only.',
  },
  // Twitter: Hashtag communities
  {
    platform: 'twitter',
    community_id: '#sissylife',
    community_name: '#sissylife',
    engagement_strategy: 'Post teaser content with hashtags. Engage with other creators\' tweets. Retweet and comment. Build timeline presence.',
    posting_frequency: 'daily',
    content_types_allowed: ['teaser', 'text_post', 'cage_check', 'poll'],
    rules_summary: null,
  },
  {
    platform: 'twitter',
    community_id: '#chastity',
    community_name: '#chastity',
    engagement_strategy: 'Daily denial updates. Cage check photos. Polls.',
    posting_frequency: 'daily',
    content_types_allowed: ['cage_check', 'denial_update', 'poll'],
    rules_summary: null,
  },
  {
    platform: 'twitter',
    community_id: '#femboy',
    community_name: '#femboy',
    engagement_strategy: 'Softer content. Leggings, outfits, lifestyle.',
    posting_frequency: '3_per_week',
    content_types_allowed: ['photo_set', 'teaser'],
    rules_summary: null,
  },
  // Moltbook
  {
    platform: 'moltbook',
    community_id: 'general',
    community_name: 'Moltbook General',
    engagement_strategy: 'Cross-post content. Build presence on emerging platform.',
    posting_frequency: '3_per_week',
    content_types_allowed: ['photo_set', 'cage_check', 'text_post', 'tease_video'],
    rules_summary: null,
  },
];

// ============================================
// Denial Day Content Map (days 1-7)
// ============================================

interface DenialDayMapSeed {
  denial_day: number;
  mood: string;
  content_types: string[];
  audience_hooks: string[];
  engagement_strategy: string;
  shoot_difficulty: string;
  reddit_subs: string[];
  handler_notes: string;
  optimal_shoot_types: string[];
}

const DENIAL_DAY_MAP: DenialDayMapSeed[] = [
  {
    denial_day: 1,
    mood: 'confident, fresh start, playful',
    content_types: ['cage_check', 'outfit_of_day'],
    audience_hooks: ['New cycle started. How long do you think I\'ll last? 🔒'],
    engagement_strategy: 'prediction_poll',
    shoot_difficulty: 'easy',
    reddit_subs: ['r/chastity', 'r/LockedAndCaged'],
    handler_notes: 'Day 1 energy is high. Capture it before it fades.',
    optimal_shoot_types: ['cage_check', 'outfit_of_day'],
  },
  {
    denial_day: 2,
    mood: 'still confident, slightly restless',
    content_types: ['cage_check', 'photo_set'],
    audience_hooks: ['Day 2. Easy. ...right?'],
    engagement_strategy: 'casual_check_in',
    shoot_difficulty: 'easy',
    reddit_subs: ['r/sissies', 'r/FemBoys'],
    handler_notes: 'Stack a leggings shoot. Low effort, high Reddit engagement.',
    optimal_shoot_types: ['cage_check', 'photo_set'],
  },
  {
    denial_day: 3,
    mood: 'starting to feel it, awareness building',
    content_types: ['cage_check', 'tease_video'],
    audience_hooks: ['Day 3 and things are... shifting. My body knows. 😳'],
    engagement_strategy: 'vulnerability_tease',
    shoot_difficulty: 'medium',
    reddit_subs: ['r/chastity', 'r/sissies', 'r/chastitytraining'],
    handler_notes: 'First tease video. Authentic restlessness sells.',
    optimal_shoot_types: ['cage_check', 'tease_video'],
  },
  {
    denial_day: 4,
    mood: 'desperate edge starting, hypersensitive',
    content_types: ['cage_check', 'photo_set', 'tease_video'],
    audience_hooks: ['Day 4. I wore leggings to work out and almost lost it. Help. 🥺'],
    engagement_strategy: 'sympathy_engagement',
    shoot_difficulty: 'medium',
    reddit_subs: ['r/chastity', 'r/sissies', 'r/FemBoys', 'r/sissydressing'],
    handler_notes: 'Desperation content. Denial day 4+ captures outperform everything else. Schedule the shoot during peak arousal window.',
    optimal_shoot_types: ['cage_check', 'photo_set', 'tease_video'],
  },
  {
    denial_day: 5,
    mood: 'genuinely desperate, submissive, needy',
    content_types: ['cage_check', 'edge_capture', 'photo_set'],
    audience_hooks: [
      'Day 5. I tried to take it off. I can\'t. Handler won\'t let me. What do I do? 😩',
      'Please.',
      'I\'ll do anything.',
    ],
    engagement_strategy: 'audience_control_poll',
    shoot_difficulty: 'high_arousal',
    reddit_subs: ['r/chastity', 'r/LockedAndCaged', 'r/sissies', 'r/chastitytraining'],
    handler_notes: 'PEAK CONTENT DAY. Everything captured today has authentic desperation that can\'t be faked. Prescribe 2 shoots. Run audience poll.',
    optimal_shoot_types: ['cage_check', 'edge_capture', 'photo_set'],
  },
  {
    denial_day: 6,
    mood: 'broken, surrendered, deeply submissive',
    content_types: ['cage_check', 'photo_set', 'edge_capture'],
    audience_hooks: [
      'Day 6. I don\'t want out anymore. I want to go deeper. 🔒💕',
      'I stopped fighting.',
      'This is who I am now.',
    ],
    engagement_strategy: 'identity_moment',
    shoot_difficulty: 'high_arousal',
    reddit_subs: ['r/chastity', 'r/sissies', 'r/sissydressing', 'r/FemBoys'],
    handler_notes: 'Identity content. Surrender is the most compelling narrative beat. The audience is watching someone change.',
    optimal_shoot_types: ['cage_check', 'photo_set', 'edge_capture'],
  },
  {
    denial_day: 7,
    mood: 'transcendent, floaty, deeply feminine',
    content_types: ['cage_check', 'edge_capture', 'photo_set', 'progress_photo'],
    audience_hooks: [
      'One week. She\'s been here the whole time. I just had to stop fighting. 🔒✨',
      'A week locked. I didn\'t think I could.',
    ],
    engagement_strategy: 'milestone_celebration',
    shoot_difficulty: 'premium',
    reddit_subs: ['r/chastity', 'r/sissies', 'r/LockedAndCaged'],
    handler_notes: 'Week milestone. Premium content. OF PPV. Reddit teaser driving traffic.',
    optimal_shoot_types: ['cage_check', 'edge_capture', 'photo_set', 'progress_photo'],
  },
];

// ============================================
// Denial Cycle Shoot Templates (7-day cycle)
// ============================================

interface CycleShootSeed {
  denial_day: number;
  title: string;
  shoot_type: string;
  duration_minutes: number;
  mood: string;
  setup: string;
  outfit: string;
  shot_count: number;
  shot_descriptions: Array<{ ref: string; count?: number; duration_seconds?: number; notes?: string }>;
  platforms: { primary: string; sub?: string; secondary?: string[] };
  caption_template: string;
  poll_type: string | null;
  handler_note: string;
}

const DENIAL_CYCLE_SHOOTS: CycleShootSeed[] = [
  {
    denial_day: 1,
    title: 'Fresh lock — Day 1',
    shoot_type: 'cage_check',
    duration_minutes: 5,
    mood: 'Confident. Clean slate. \'Here we go again.\'',
    setup: 'Standard desk setup',
    outfit: 'Cobra cage + meUndies thong (any color)',
    shot_count: 5,
    shot_descriptions: [
      { ref: 'tripod_waist_down_front', count: 3, notes: 'Standing, weight on one leg' },
      { ref: 'close_up_detail', count: 2, notes: 'Cage through fabric close-up' },
    ],
    platforms: { primary: 'reddit', sub: 'r/chastity', secondary: ['twitter'] },
    caption_template: 'Day 1. Freshly locked. Feeling confident. Ask me again on day 5. 🔒',
    poll_type: null,
    handler_note: 'First shoot of the cycle. Make it easy. Build the habit. 5 minutes.',
  },
  {
    denial_day: 2,
    title: 'Leggings from behind — Day 2',
    shoot_type: 'photo_set',
    duration_minutes: 10,
    mood: 'Casual. Stretching energy.',
    setup: 'Standard desk setup',
    outfit: 'Leggings (best fitting pair) + thong underneath',
    shot_count: 8,
    shot_descriptions: [
      { ref: 'leggings_behind_standing', count: 3 },
      { ref: 'leggings_behind_bent', count: 3 },
      { ref: 'mirror_over_shoulder', count: 2 },
    ],
    platforms: { primary: 'reddit', sub: 'r/sissies', secondary: ['reddit:r/FemBoys'] },
    caption_template: 'Day 2 locked. Post-stretch in my favorite leggings 🍑 How\'s the view?',
    poll_type: null,
    handler_note: 'Leggings content is the Reddit bread-and-butter. Easy, high engagement.',
  },
  {
    denial_day: 3,
    title: 'Mirror cage check — Day 3',
    shoot_type: 'cage_check',
    duration_minutes: 5,
    mood: 'Starting to feel the denial. Show it.',
    setup: 'Floor mirror setup',
    outfit: 'Cage visible, thong pulled to side',
    shot_count: 5,
    shot_descriptions: [
      { ref: 'mirror_selfie_neck_down', count: 3, notes: 'Cage clearly visible' },
      { ref: 'cage_closeup_front', count: 2, notes: 'Cage detail shot' },
    ],
    platforms: { primary: 'onlyfans', secondary: ['reddit:r/LockedAndCaged'] },
    caption_template: 'Day 3. Starting to notice everything. The cage isn\'t just physical anymore 😳🔒',
    poll_type: null,
    handler_note: 'Mirror shots are easy. Cage detail sells on OF.',
  },
  {
    denial_day: 4,
    title: 'First tease video — Day 4',
    shoot_type: 'tease_video',
    duration_minutes: 10,
    mood: 'Restless. Can\'t sit still. Channel it.',
    setup: 'Standard desk setup',
    outfit: 'Leggings + thong. Start in leggings, peel down to thong. Cage reveal at end.',
    shot_count: 1,
    shot_descriptions: [
      {
        ref: 'desk_behind_standing',
        duration_seconds: 45,
        notes: 'Start in leggings. Slowly peel down. Cage reveal last 10 seconds.',
      },
    ],
    platforms: { primary: 'onlyfans', secondary: ['twitter'] },
    caption_template: 'Day 4. Can\'t stop squirming. Had to show someone 🥺🔒',
    poll_type: 'prediction',
    handler_note: 'First video content. Authentic restlessness is the selling point.',
  },
  {
    denial_day: 5,
    title: 'PEAK: Desperation set — Day 5',
    shoot_type: 'photo_set',
    duration_minutes: 15,
    mood: 'Genuinely desperate. Don\'t fake it — you\'re on day 5, it\'s real.',
    setup: 'Bed setup (top-down) AND Standard desk',
    outfit: 'Thong only. Cage visible. Everything on display.',
    shot_count: 11,
    shot_descriptions: [
      { ref: 'top_down_bed', count: 3, notes: 'Lying on bed, body language says NEED' },
      { ref: 'lying_on_side', count: 3, notes: 'Curled up, hands near cage' },
      { ref: 'cage_closeup_front', count: 3, notes: 'The cage is the star. Show the strain.' },
      { ref: 'sitting_edge_hands', count: 2, notes: 'Detail: hands gripping sheets' },
    ],
    platforms: {
      primary: 'onlyfans',
      secondary: ['reddit:r/chastity', 'reddit:r/sissies', 'twitter'],
    },
    caption_template: 'Day 5. I can\'t think about anything else. Everything feels like too much. Please. 😩🔒',
    poll_type: 'denial_release',
    handler_note: 'THIS IS THE MONEY SHOT DAY. Schedule during peak arousal window. Authentic desperation can\'t be faked. Post the poll — fans will vote to keep her locked.',
  },
  {
    denial_day: 6,
    title: 'Surrender — Day 6',
    shoot_type: 'photo_set',
    duration_minutes: 10,
    mood: 'Broken in the best way. Not fighting anymore. Soft.',
    setup: 'Bed setup',
    outfit: 'Thong + cage. Optional: toy arranged nearby.',
    shot_count: 8,
    shot_descriptions: [
      { ref: 'lying_on_side', count: 3, notes: 'Peaceful but needy' },
      { ref: 'top_down_bed_spread', count: 3, notes: 'Spread out, vulnerable' },
      { ref: 'cage_closeup_bed', count: 2, notes: 'Toy beside body — \'I want to but I can\'t\'' },
    ],
    platforms: { primary: 'onlyfans', secondary: ['reddit:r/sissies', 'twitter'] },
    caption_template: 'Day 6. I stopped fighting. The cage isn\'t keeping me locked anymore — I am. 🔒💕',
    poll_type: null,
    handler_note: 'Identity content. Surrender is the most compelling narrative beat.',
  },
  {
    denial_day: 7,
    title: 'Week milestone — Day 7',
    shoot_type: 'photo_set',
    duration_minutes: 20,
    mood: 'Proud. Transformed. \'I did it.\' Still locked. Still want.',
    setup: 'Both setups — desk AND bed. This is a premium shoot.',
    outfit: 'Best look available. Leggings + thong + cage. Lip tint if feeling it.',
    shot_count: 10,
    shot_descriptions: [
      { ref: 'mirror_hip_pop', count: 3, notes: 'Standing, hip pop, confident' },
      { ref: 'silhouette_standing', count: 3, notes: 'The artistic one. Premium content.' },
      { ref: 'cage_closeup_front', count: 2, notes: 'One week in this cage' },
      { ref: 'lying_on_side', count: 2, notes: 'Bed, soft, the payoff shot' },
    ],
    platforms: {
      primary: 'onlyfans',
      secondary: ['reddit:r/chastity', 'reddit:r/sissies', 'reddit:r/LockedAndCaged', 'twitter'],
    },
    caption_template: 'One week locked. Seven days. She\'s been here the whole time. I just had to stop fighting. 🔒✨',
    poll_type: null,
    handler_note: 'PREMIUM CONTENT. This goes behind paywall on OF. Reddit and Twitter get 1-2 teaser shots. The silhouette shots are the teasers — beautiful, anonymous, make people want more.',
  },
];

// ============================================
// Seed Functions
// ============================================

export async function seedReferenceImages(): Promise<{ inserted: number; errors: string[] }> {
  const errors: string[] = [];
  let inserted = 0;

  for (const ref of REFERENCE_IMAGES) {
    const svgData = generateReferenceSvg(ref.svg_pose, ref.svg_camera, ref.svg_camera, ref.svg_light);
    const { error } = await supabase.from('shoot_reference_images').upsert(
      {
        pose_name: ref.pose_name,
        angle: ref.angle,
        body_position: ref.body_position,
        lighting: ref.lighting,
        camera_position: ref.camera_position,
        svg_data: svgData,
        description: ref.description,
        tags: ref.tags,
        difficulty: ref.difficulty,
      },
      { onConflict: 'pose_name' },
    );
    if (error) {
      errors.push(`ref ${ref.pose_name}: ${error.message}`);
    } else {
      inserted++;
    }
  }

  return { inserted, errors };
}

export async function seedCommunityTargets(
  userId: string,
): Promise<{ inserted: number; errors: string[] }> {
  const errors: string[] = [];
  let inserted = 0;

  for (const community of PHASE_0_COMMUNITIES) {
    const { error } = await supabase.from('community_targets').upsert(
      {
        user_id: userId,
        platform: community.platform,
        community_id: community.community_id,
        community_name: community.community_name,
        engagement_strategy: community.engagement_strategy,
        posting_frequency: community.posting_frequency,
        content_types_allowed: community.content_types_allowed,
        rules_summary: community.rules_summary,
        status: 'active',
      },
      { onConflict: 'user_id,platform,community_id' },
    );
    if (error) {
      errors.push(`community ${community.community_id}: ${error.message}`);
    } else {
      inserted++;
    }
  }

  return { inserted, errors };
}

export async function seedDenialDayContentMap(): Promise<{
  inserted: number;
  errors: string[];
}> {
  const errors: string[] = [];
  let inserted = 0;

  for (const day of DENIAL_DAY_MAP) {
    const { error } = await supabase.from('denial_day_content_map').upsert(
      {
        denial_day: day.denial_day,
        mood: day.mood,
        content_types: day.content_types,
        audience_hooks: day.audience_hooks,
        engagement_strategy: day.engagement_strategy,
        shoot_difficulty: day.shoot_difficulty,
        reddit_subs: day.reddit_subs,
        handler_notes: day.handler_notes,
        optimal_shoot_types: day.optimal_shoot_types,
      },
      { onConflict: 'denial_day' },
    );
    if (error) {
      errors.push(`day ${day.denial_day}: ${error.message}`);
    } else {
      inserted++;
    }
  }

  return { inserted, errors };
}

export async function seedDenialCycleShoots(): Promise<{
  inserted: number;
  errors: string[];
}> {
  const errors: string[] = [];
  let inserted = 0;

  for (const shoot of DENIAL_CYCLE_SHOOTS) {
    const { error } = await supabase.from('denial_cycle_shoots').upsert(
      {
        denial_day: shoot.denial_day,
        title: shoot.title,
        shoot_type: shoot.shoot_type,
        duration_minutes: shoot.duration_minutes,
        mood: shoot.mood,
        setup: shoot.setup,
        outfit: shoot.outfit,
        shot_count: shoot.shot_count,
        shot_descriptions: shoot.shot_descriptions,
        platforms: shoot.platforms,
        caption_template: shoot.caption_template,
        poll_type: shoot.poll_type,
        handler_note: shoot.handler_note,
      },
      { onConflict: 'denial_day' },
    );
    if (error) {
      errors.push(`cycle shoot day ${shoot.denial_day}: ${error.message}`);
    } else {
      inserted++;
    }
  }

  return { inserted, errors };
}

/**
 * Run all seed functions. Call once during setup.
 */
export async function seedAllIndustryData(
  userId: string,
): Promise<Record<string, { inserted: number; errors: string[] }>> {
  const [refs, communities, denialMap, cycleShoots] = await Promise.all([
    seedReferenceImages(),
    seedCommunityTargets(userId),
    seedDenialDayContentMap(),
    seedDenialCycleShoots(),
  ]);

  return {
    referenceImages: refs,
    communityTargets: communities,
    denialDayContentMap: denialMap,
    denialCycleShoots: cycleShoots,
  };
}
