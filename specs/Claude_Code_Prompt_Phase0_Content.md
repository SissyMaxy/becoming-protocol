# CLAUDE CODE IMPLEMENTATION PROMPT
## Phase 0: First Content — The Decision Eliminator
### Becoming Protocol — February 2026

---

## REALITY CHECK: WHERE MAXY IS RIGHT NOW

This prompt is scoped to the ACTUAL current state, not a fantasy future state.

**What exists:**
- App: becoming-protocol.vercel.app (React/Vite/TS/Tailwind/Supabase)
  - Dashboard, task system, streaks, domains — basic infrastructure works
  - Handler AI layer exists but manipulation features were never implemented
  - Claude API integration exists
- Accounts: OF @sissymaxy, Fansly/Twitter/Reddit @softmaxy
- All accounts are essentially empty. Zero or near-zero content posted.
- Revenue: $0
- Followers: effectively zero

**What Maxy has to work with:**
- Body: 6'0.5", 205 lbs, bald, mostly shaved
- Wardrobe: Men's thongs, women's panties (meUndies), tucking panties,
  women's leggings, Cobra chastity cage, lip tint. That's basically it.
- Toys: Lovense Gush, Gush 2, Solace Pro, plugs (small to very large),
  dildo. Chastity cage worn routinely.
- Equipment: Ring light, tripod, mirror, home office
- Face: HIDDEN until HRT. No face in any content.
- Privacy window: M-F daytime, especially Gina's in-office weeks (2wk rotation)

**The problem this prompt solves:**
Maxy has ADHD. The gap between "I should create content" and actually doing it
is an executive function canyon. Every decision point is a place where the
process stalls: What should I wear? What angle? What pose? What platform?
What caption? When do I post?

The Handler eliminates ALL of those decisions. Maxy opens the app, sees
exactly what to do with pictures showing exactly how to do it, does it,
uploads, and the Handler handles everything else.

---

## THE CORE CONCEPT

A **Shoot Card** appears in Maxy's daily task list. It contains:

1. **What to wear** — specific items from her actual wardrobe
2. **How to set up** — ring light position, camera angle, backdrop
3. **Reference images** — visual examples of every pose/angle requested
4. **Shot list** — exactly what photos/videos to capture, step by step
5. **Upload button** — drop the files, Handler takes over

Maxy's entire creative decision load: zero. She follows the pictures.

After upload, the Handler:
- Selects the best shots
- Applies watermark (@softmaxy)
- Writes platform-specific captions
- Tells Maxy exactly where to paste and post (Phase 0 = manual posting)

---

## PART 1: Reference Image System

This is the key differentiator. Maxy doesn't read "take a photo from a
low angle emphasizing your legs." She SEES a reference image showing
exactly that angle, with annotations.

### 1.1 Reference Image Library Schema

```sql
-- Migration: 076_reference_images.sql

-- Curated library of pose/angle/setup reference images
CREATE TABLE reference_images (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Classification
  category TEXT NOT NULL CHECK (category IN (
    'pose',           -- body position reference
    'angle',          -- camera angle reference
    'lighting',       -- lighting setup reference
    'setup',          -- equipment arrangement reference
    'framing',        -- composition/crop reference
    'outfit_style',   -- styling reference (not Maxy's own photos)
    'mood'            -- vibe/aesthetic reference
  )),

  -- Descriptors
  name TEXT NOT NULL,                -- "Low angle legs shot"
  description TEXT,                  -- "Camera on floor, pointing up. Emphasizes legs and curves."
  tags JSONB DEFAULT '[]',           -- ["legs", "low_angle", "seated", "no_face"]

  -- The image
  image_url TEXT NOT NULL,           -- Supabase storage URL
  thumbnail_url TEXT,                -- Smaller version for cards

  -- Annotation overlay (optional SVG or coordinates)
  annotations JSONB DEFAULT '[]',
  -- Array of { type: "arrow"|"circle"|"text", x, y, label }
  -- e.g. { type: "arrow", x: 50, y: 80, label: "Camera here" }
  -- e.g. { type: "circle", x: 30, y: 40, label: "Ring light" }
  -- e.g. { type: "text", x: 50, y: 10, label: "Shoot from this height" }

  -- Constraints
  requires_face: BOOLEAN DEFAULT false,  -- false = safe for Maxy now
  body_type_relevant BOOLEAN DEFAULT false,
  min_wardrobe TEXT,                     -- minimum items needed

  -- Usage tracking
  times_used INTEGER DEFAULT 0,
  avg_result_quality NUMERIC,        -- Handler rates results using this ref

  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_ref_images_category ON reference_images(category, requires_face);
CREATE INDEX idx_ref_images_tags ON reference_images USING GIN(tags);
```

### 1.2 Seeding the Reference Library

The reference images come from three sources. The Handler manages all of this.
Maxy never has to find reference images.

**Source 1: AI-generated reference illustrations**
Simple illustrations showing camera position, body position, and angle.
NOT photos of other people. Diagrams with stick figures or mannequins
showing exactly where to put the camera and how to position the body.
These are created once and reused across many shoot prescriptions.

```typescript
// Seed set of ~30 reference illustrations covering Phase 0 content types
// These are the MINIMUM needed to start creating content

const PHASE_0_REFERENCES = {
  // === CAMERA ANGLES (no-face safe) ===
  angles: [
    {
      name: "Floor-up legs shot",
      category: "angle",
      description: "Phone on floor pointing up at ~30°. Captures legs, thighs, and torso. Face naturally out of frame.",
      tags: ["no_face", "legs", "low_angle", "seated", "standing"],
      requires_face: false,
      annotations: [
        { type: "arrow", x: 50, y: 95, label: "Phone here, angled up 30°" },
        { type: "text", x: 50, y: 10, label: "Face naturally out of frame" },
        { type: "circle", x: 50, y: 50, label: "Legs fill the frame" }
      ]
    },
    {
      name: "Over-shoulder mirror shot",
      category: "angle",
      description: "Phone held over shoulder, shooting into mirror. Shows back/butt in reflection. Turn head away from mirror for no-face.",
      tags: ["no_face", "mirror", "butt", "back", "over_shoulder"],
      requires_face: false,
      annotations: [
        { type: "arrow", x: 20, y: 30, label: "Phone over shoulder" },
        { type: "text", x: 70, y: 50, label: "Mirror shows back view" },
        { type: "circle", x: 50, y: 80, label: "Head turned away" }
      ]
    },
    {
      name: "Tripod waist-down front",
      category: "angle",
      description: "Tripod at ~3ft height. Frame from chest down. Standing or seated. Classic no-face content framing.",
      tags: ["no_face", "front", "tripod", "waist_down", "standing", "seated"],
      requires_face: false,
      annotations: [
        { type: "arrow", x: 10, y: 40, label: "Tripod at 3ft / waist height" },
        { type: "text", x: 50, y: 5, label: "Frame starts at chest" },
        { type: "text", x: 50, y: 95, label: "Full legs visible" }
      ]
    },
    {
      name: "Tripod waist-down back",
      category: "angle",
      description: "Same tripod setup but from behind. Showcases butt in leggings/panties. No face risk.",
      tags: ["no_face", "back", "tripod", "butt", "waist_down"],
      requires_face: false
    },
    {
      name: "Top-down bed shot",
      category: "angle",
      description: "Phone directly above, shooting down at body on bed. Crop at neck. Shows full body layout.",
      tags: ["no_face", "top_down", "bed", "lying", "full_body"],
      requires_face: false,
      annotations: [
        { type: "arrow", x: 50, y: 5, label: "Phone directly above" },
        { type: "text", x: 50, y: 15, label: "Crop at collarbone" }
      ]
    },
    {
      name: "Side profile silhouette",
      category: "angle",
      description: "Ring light directly behind body. Camera in front. Body becomes a silhouette with rim lighting. Very artistic, completely anonymous.",
      tags: ["no_face", "silhouette", "artistic", "ring_light", "anonymous"],
      requires_face: false,
      annotations: [
        { type: "circle", x: 50, y: 50, label: "Ring light BEHIND body" },
        { type: "arrow", x: 10, y: 50, label: "Camera in front" },
        { type: "text", x: 50, y: 90, label: "Result: glowing silhouette outline" }
      ]
    },
    {
      name: "Close-up detail shots",
      category: "angle",
      description: "Macro-style closeups: waistband, cage through fabric, skin texture, hands on thighs, fabric stretch. These fill out photo sets.",
      tags: ["no_face", "close_up", "detail", "texture", "anonymous"],
      requires_face: false
    },
    {
      name: "Mirror selfie neck-down",
      category: "angle",
      description: "Classic mirror selfie but framed from neck down. Phone held at chest height. Shows outfit/body in mirror.",
      tags: ["no_face", "mirror", "selfie", "front", "outfit"],
      requires_face: false
    },
  ],

  // === POSES (what to do with your body) ===
  poses: [
    {
      name: "Standing hip pop",
      category: "pose",
      description: "Weight on one leg, opposite hip pushed out. One hand on hip or touching thigh. Classic feminine standing pose.",
      tags: ["standing", "feminine", "hip", "beginner"],
      requires_face: false,
      annotations: [
        { type: "arrow", x: 55, y: 50, label: "Weight on this leg" },
        { type: "arrow", x: 45, y: 45, label: "This hip pushes OUT" },
        { type: "circle", x: 40, y: 40, label: "Hand rests here" }
      ]
    },
    {
      name: "Seated legs crossed",
      category: "pose",
      description: "Seated on bed edge or chair. Legs crossed. Lean slightly forward or back. Hands on knees or beside body.",
      tags: ["seated", "legs", "feminine", "beginner", "bed", "chair"],
      requires_face: false
    },
    {
      name: "Lying on side",
      category: "pose",
      description: "On bed, lying on side facing camera. Top leg bent forward. Emphasizes hip curve. Head cropped out or resting on arm (crop at chin).",
      tags: ["lying", "side", "bed", "curves", "hip", "beginner"],
      requires_face: false
    },
    {
      name: "On knees from behind",
      category: "pose",
      description: "Kneeling on bed, back to camera. Arch the lower back. Hands on bed in front. Shows butt and back.",
      tags: ["kneeling", "back", "butt", "bed", "arch", "no_face"],
      requires_face: false
    },
    {
      name: "Bent over standing",
      category: "pose",
      description: "Standing, bent forward at waist. Camera behind and slightly below. Hands on surface (desk, bed edge). Butt prominent.",
      tags: ["standing", "bent", "butt", "back", "no_face"],
      requires_face: false
    },
    {
      name: "Cage reveal",
      category: "pose",
      description: "Waistband pull-down or panty-to-the-side showing cage. Close framing. Can be standing or lying down. Very popular in sissy content.",
      tags: ["cage", "reveal", "close_up", "chastity", "sissy", "no_face"],
      requires_face: false
    },
    {
      name: "Leggings stretch",
      category: "pose",
      description: "Stretching pose in leggings. Forward bend touching toes, or deep lunge. Shows how leggings fit on butt/legs. Fitness-adjacent.",
      tags: ["leggings", "stretch", "fitness", "butt", "legs", "no_face"],
      requires_face: false
    },
    {
      name: "Toy display",
      category: "pose",
      description: "Arranged toys beside body (on bed). Body partially visible. Shows collection + body together. Anonymous.",
      tags: ["toys", "display", "bed", "collection", "no_face"],
      requires_face: false
    },
  ],

  // === LIGHTING SETUPS ===
  lighting: [
    {
      name: "Ring light standard",
      category: "lighting",
      description: "Ring light directly in front, at face height. Even, flattering light. Tripod below ring light for camera. This is your default setup.",
      tags: ["ring_light", "front", "standard", "default"],
      annotations: [
        { type: "circle", x: 50, y: 20, label: "Ring light at face height" },
        { type: "arrow", x: 50, y: 40, label: "Camera/phone in center of ring" },
        { type: "text", x: 50, y: 70, label: "Stand 3-4 feet away" }
      ]
    },
    {
      name: "Ring light backlit (silhouette)",
      category: "lighting",
      description: "Ring light BEHIND you. Room otherwise dark. Camera in front. Creates dramatic silhouette with rim lighting. Best for anonymous, artistic content.",
      tags: ["ring_light", "backlit", "silhouette", "artistic", "anonymous"],
      annotations: [
        { type: "circle", x: 50, y: 80, label: "Ring light BEHIND body" },
        { type: "arrow", x: 50, y: 20, label: "Camera in front, in dark" },
        { type: "text", x: 50, y: 50, label: "Body becomes glowing outline" }
      ]
    },
    {
      name: "Window light (daytime)",
      category: "lighting",
      description: "Stand beside a window. Natural light from the side. Soft, editorial quality. Best during Gina's office days with curtains partially drawn.",
      tags: ["window", "natural", "daytime", "soft", "editorial"],
      annotations: [
        { type: "arrow", x: 10, y: 50, label: "Window here" },
        { type: "text", x: 50, y: 50, label: "Stand beside, not in front of" },
        { type: "text", x: 80, y: 50, label: "Camera opposite window" }
      ]
    },
  ],

  // === SETUP DIAGRAMS ===
  setups: [
    {
      name: "Standard desk setup",
      category: "setup",
      description: "Ring light on desk. Phone on tripod in front of ring light. Stand 4 feet away. This is your everyday setup for quick shoots.",
      tags: ["desk", "standard", "quick", "default"],
      annotations: [
        { type: "text", x: 50, y: 10, label: "DESK" },
        { type: "circle", x: 50, y: 25, label: "Ring light" },
        { type: "arrow", x: 50, y: 35, label: "Phone on tripod" },
        { type: "text", x: 50, y: 70, label: "Stand here (4 ft away)" }
      ]
    },
    {
      name: "Bed setup (top-down)",
      category: "setup",
      description: "Tripod next to bed, extended high, angled down. Ring light from the side. Lie on bed. Best for lying poses.",
      tags: ["bed", "top_down", "tripod", "lying"],
      annotations: [
        { type: "text", x: 50, y: 50, label: "BED" },
        { type: "arrow", x: 15, y: 20, label: "Tripod here, extended high" },
        { type: "circle", x: 80, y: 30, label: "Ring light from side" }
      ]
    },
    {
      name: "Floor mirror setup",
      category: "setup",
      description: "Full-length mirror on floor leaning against wall. Ring light beside mirror. Phone handheld for mirror selfies, or on tripod aimed at mirror.",
      tags: ["mirror", "floor", "standing", "full_body"],
      annotations: [
        { type: "text", x: 50, y: 80, label: "Mirror against wall" },
        { type: "circle", x: 20, y: 60, label: "Ring light beside mirror" },
        { type: "text", x: 50, y: 30, label: "Stand here, shoot into mirror" }
      ]
    },
  ],
};
```

**Source 2: Maxy's own best results**
As Maxy creates content, the Handler rates results. High-scoring photos
from previous shoots become reference images for future shoots. Over time,
the library shifts from generic diagrams to "here's YOUR best version of
this shot — replicate it."

**Source 3: Mood/aesthetic boards**
Handler curates aesthetic reference boards for shoot moods — not specific
poses but overall vibe targets. "Dark and moody" vs "bright and playful"
vs "raw and candid." These help Maxy understand the emotional target
without needing to make creative decisions.

### 1.3 Generating Reference Illustrations

The reference illustrations are simple annotated diagrams. They can be
generated using SVG in the app itself — no external image dependency.

```typescript
// src/components/shoots/ReferenceIllustration.tsx

// Renders an SVG illustration of a pose/angle/setup
// Uses simple shapes: body outline (mannequin), camera icon,
// light source icon, surface (bed/chair/floor), arrows, and labels.

// The annotations from the reference_images table overlay on the SVG.
// This means we can generate all reference images programmatically —
// no need to source external photos.

interface ReferenceIllustrationProps {
  reference: ReferenceImage;
  size: 'thumbnail' | 'full';  // thumbnail for card, full for detail view
}

// Mannequin body: simple gender-neutral figure outline
// Camera: phone icon with angle indicator
// Ring light: circle with rays
// Surface: rectangle (bed/desk/floor)
// Arrows: directional indicators with labels
// All positioned using x,y coordinates from annotations

// Example render for "Floor-up legs shot":
// - Floor surface at bottom
// - Phone icon on floor, angled up 30° (arrow showing angle)
// - Mannequin standing above
// - Dotted line showing what's in frame (legs + torso)
// - "Face out of frame" label at top with X
// - "Camera here" label at phone
```

---

## PART 2: Database Schema

```sql
-- Migration: 076_phase0_shoots.sql

-- Reference images table (from Part 1 above)
-- [included above]

-- Shoot prescriptions — simplified for Phase 0
CREATE TABLE shoot_prescriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,

  -- When
  scheduled_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,

  -- What kind of shoot
  shoot_type TEXT NOT NULL CHECK (shoot_type IN (
    'photo_set',         -- 5-10 photos
    'short_video',       -- 15-60 second clip
    'cage_check',        -- quick cage photo (daily low-effort)
    'outfit_of_day',     -- whatever she's wearing right now
    'toy_showcase',      -- arranged toy display
    'tease_video',       -- 30-90 sec tease clip
    'progress_photo',    -- same angle, same spot, monthly
    'edge_capture'       -- during an edge session
  )),

  -- Handler prescribes EVERYTHING
  title TEXT NOT NULL,               -- "Evening leggings set"
  outfit_prescription TEXT NOT NULL,  -- specific items from ACTUAL wardrobe
  setup_name TEXT,                    -- references a setup diagram
  lighting_name TEXT,                 -- references a lighting setup
  mood_direction TEXT,                -- "relaxed and teasing" / "desperate"

  -- Shot list with reference images
  shot_list JSONB NOT NULL DEFAULT '[]',
  -- Array of {
  --   order: 1,
  --   description: "Standing hip pop, waist-down front",
  --   reference_image_id: "uuid",    -- links to reference_images table
  --   notes: "Weight on left leg, right hand on waistband",
  --   duration_seconds: null,         -- for video shots
  --   count: 3                        -- take 3 of this, Handler picks best
  -- }

  -- Context
  denial_day INTEGER,
  estimated_minutes INTEGER DEFAULT 15,  -- how long this should take

  -- Platform target (Phase 0 = just know where it's going)
  primary_platform TEXT DEFAULT 'onlyfans',
  caption_draft TEXT,                -- Handler pre-writes the caption
  hashtags TEXT,                     -- pre-written hashtags
  subreddit TEXT,                    -- if Reddit, which sub
  posting_instructions TEXT,         -- "Post to OF as PPV $4.99" or "Post to r/sissies"

  -- Media
  media_received BOOLEAN DEFAULT false,
  media_paths JSONB DEFAULT '[]',
  selected_media JSONB DEFAULT '[]', -- Handler picks the best after upload

  -- Status
  status TEXT DEFAULT 'prescribed' CHECK (status IN (
    'prescribed',    -- waiting for Maxy
    'in_progress',   -- Maxy is shooting
    'captured',      -- media uploaded
    'ready_to_post', -- Handler processed, caption ready
    'posted',        -- Maxy confirmed she posted it
    'skipped'        -- Maxy didn't do it (consequence tracking)
  )),

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS + indexes
ALTER TABLE reference_images ENABLE ROW LEVEL SECURITY;
ALTER TABLE shoot_prescriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY ref_images_all ON reference_images FOR SELECT USING (true);
CREATE POLICY shoot_rx_user ON shoot_prescriptions FOR ALL USING (auth.uid() = user_id);
CREATE INDEX idx_shoot_rx_status ON shoot_prescriptions(user_id, status, scheduled_at DESC);
```

---

## PART 3: Pre-Seeded Shoot Prescriptions (First 30 Days)

The Handler needs content ideas that work with Maxy's ACTUAL current wardrobe
and equipment. No prescribing outfits she doesn't own.

```typescript
// src/lib/shoots/seed-prescriptions.ts

// What Maxy ACTUALLY owns right now:
const MAXY_WARDROBE = {
  underwear: [
    "meUndies women's thong (various colors)",
    "tucking panties",
    "men's thong",
  ],
  bottoms: [
    "women's leggings (multiple pairs, various colors)",
  ],
  cage: "Cobra chastity cage",
  tops: [], // basically nothing feminine yet
  accessories: [
    "lip tint",
  ],
};

const MAXY_EQUIPMENT = {
  lighting: "ring light",
  camera: "phone",
  support: "tripod",
  surfaces: ["bed", "desk/office chair", "floor"],
  mirror: "full length mirror",
};

// 30 days of shoots using ONLY what she has
// Mix of difficulty levels. Early days are easier.
// Pattern: 1 shoot per day, alternating low-effort and medium-effort.

const FIRST_30_DAYS: ShootSeed[] = [
  // === WEEK 1: Building the habit. Super easy. ===
  {
    day: 1,
    title: "First photo ever — cage check",
    shoot_type: "cage_check",
    outfit: "Cobra cage + meUndies thong (any color)",
    setup: "Standard desk setup",
    lighting: "Ring light standard",
    mood: "Simple. Don't overthink it. Just get the first one done.",
    shot_list: [
      { description: "Waist-down front, standing", ref: "tripod_waist_down_front", count: 3 },
      { description: "Close-up cage through fabric", ref: "close_up_detail", count: 2 },
    ],
    estimated_minutes: 5,
    platform: "onlyfans",
    caption_draft: "Day 1. Locked and starting this journey. 🔒",
    handler_note: "The first one is the hardest. After this, every shoot is easier. 5 minutes. That's it."
  },
  {
    day: 2,
    title: "Leggings from behind",
    shoot_type: "photo_set",
    outfit: "Women's leggings (best fitting pair) + thong underneath",
    setup: "Standard desk setup",
    lighting: "Ring light standard",
    mood: "Casual. Like you just finished stretching.",
    shot_list: [
      { description: "Standing, back to camera, waist-down", ref: "tripod_waist_down_back", count: 3 },
      { description: "Bent over standing, back to camera", ref: "bent_over_standing", count: 3 },
      { description: "Over-shoulder mirror shot", ref: "over_shoulder_mirror", count: 2 },
    ],
    estimated_minutes: 10,
    platform: "reddit",
    subreddit: "r/sissies",
    caption_draft: "New to this. How do they look? 🍑",
    handler_note: "Leggings content performs well on Reddit. Low vulnerability, high engagement."
  },
  {
    day: 3,
    title: "Quick cage selfie — mirror",
    shoot_type: "cage_check",
    outfit: "Cage visible, thong pulled to side or waistband pulled down",
    setup: "Floor mirror setup",
    lighting: "Ring light standard",
    mood: "Quick and casual. Mirror selfie energy.",
    shot_list: [
      { description: "Mirror selfie neck-down showing cage", ref: "mirror_selfie_neck_down", count: 3 },
    ],
    estimated_minutes: 3,
    platform: "onlyfans",
    caption_draft: "Morning check-in. Still locked. Day {denial_day}. 😳",
    handler_note: "Cage content is your lowest-effort, most consistent content type. Get comfortable doing this daily."
  },
  {
    day: 4,
    title: "Leggings stretch video",
    shoot_type: "short_video",
    outfit: "Leggings + thong",
    setup: "Standard desk setup",
    lighting: "Ring light standard",
    mood: "Fitness-adjacent. Stretching after a workout (or pretending to).",
    shot_list: [
      { description: "30-sec video: forward bend touching toes, slow", ref: "leggings_stretch", duration_seconds: 30 },
      { description: "30-sec video: deep lunge, alternating sides", ref: "leggings_stretch", duration_seconds: 30 },
    ],
    estimated_minutes: 10,
    platform: "reddit",
    subreddit: "r/FemBoys",
    caption_draft: "Post-workout stretch 🧘‍♀️",
    handler_note: "First video. It doesn't need to be perfect. Press record, do the stretch, stop."
  },
  {
    day: 5,
    title: "Bed set — lying on side",
    shoot_type: "photo_set",
    outfit: "Thong only. Or thong + cage visible.",
    setup: "Bed setup (top-down) OR handheld",
    lighting: "Window light (daytime) if available, otherwise ring light",
    mood: "Relaxed. Just woke up energy. Soft.",
    shot_list: [
      { description: "Lying on side, facing camera, waist-down", ref: "lying_on_side", count: 3 },
      { description: "Top-down bed shot, neck-down", ref: "top_down_bed", count: 3 },
      { description: "Detail: hand on thigh, close-up", ref: "close_up_detail", count: 2 },
    ],
    estimated_minutes: 10,
    platform: "onlyfans",
    caption_draft: "Lazy morning in bed. Wish someone was here to keep me company 💕",
  },
  {
    day: 6,
    title: "Silhouette shot — artistic",
    shoot_type: "photo_set",
    outfit: "Thong or naked. Silhouette hides everything.",
    setup: "Ring light behind body, room dark, camera in front",
    lighting: "Ring light backlit (silhouette)",
    mood: "Artistic. Mysterious. Anonymous.",
    shot_list: [
      { description: "Standing side profile silhouette", ref: "side_profile_silhouette", count: 5 },
      { description: "Standing front silhouette, hands on hips", ref: "side_profile_silhouette", count: 3 },
    ],
    estimated_minutes: 10,
    platform: "twitter",
    caption_draft: "✨",
    handler_note: "Silhouette content is premium-feeling and totally anonymous. Good for Twitter where you want intrigue, not explicit."
  },
  {
    day: 7,
    title: "Toy collection showcase",
    shoot_type: "toy_showcase",
    outfit: "Thong. Cage on. Toys arranged beside you on bed.",
    setup: "Bed setup (top-down)",
    lighting: "Ring light standard",
    mood: "Playful. Look at all these things.",
    shot_list: [
      { description: "Top-down: body + toys arranged on bed", ref: "top_down_bed", count: 3 },
      { description: "Close-up: toy lineup on sheets", ref: "close_up_detail", count: 3 },
      { description: "One toy in hand, body in background (blurred)", ref: "close_up_detail", count: 2 },
    ],
    estimated_minutes: 10,
    platform: "onlyfans",
    caption_draft: "My collection is growing faster than my ability to take them all 😅 Which one should I try tonight?",
    handler_note: "Interactive captions drive comments. Comments drive algorithm. Algorithm drives subscribers."
  },

  // === WEEK 2-4: Continue the pattern ===
  // The remaining 23 days cycle through variations of:
  // - Cage checks (daily, 3 min, lowest effort)
  // - Leggings content (standing poses, stretch videos)
  // - Bed sets (lying poses, top-down, side)
  // - Silhouette series (artistic, anonymous)
  // - Toy content (showcases, tease-adjacent)
  // - Tease videos (15-60 sec clips: panty pulls, cage reveals, slow strip)
  // - Progress photos (same angle/outfit/spot on day 14 and day 28)
  //
  // Each shoot prescription follows the same format:
  // specific outfit from ACTUAL wardrobe + setup name + reference images +
  // step-by-step shot list + pre-written caption + target platform
  //
  // Handler generates the remaining prescriptions using Claude API with
  // the reference library and wardrobe inventory as context.
];
```

---

## PART 4: React Components

### 4.1 The Shoot Card (Main Interface)

```typescript
// src/components/shoots/ShootCard.tsx

// This is THE thing Maxy sees in her daily task list.
// It must be so clear and complete that zero creative decisions are needed.

// ┌──────────────────────────────────────────────────┐
// │  📸 Evening leggings set                    15min │
// │                                                   │
// │  Outfit: Leggings (black) + meUndies thong        │
// │  Setup: Standard desk setup                       │
// │  Mood: Relaxed, just finished stretching           │
// │                                                   │
// │  ┌─────────────────────────────────────────────┐  │
// │  │  SHOT LIST                                  │  │
// │  │                                             │  │
// │  │  1. Standing back view    [ref img] × 3     │  │
// │  │  2. Bent over standing    [ref img] × 3     │  │
// │  │  3. Mirror over-shoulder  [ref img] × 2     │  │
// │  │                                             │  │
// │  └─────────────────────────────────────────────┘  │
// │                                                   │
// │  [ Start Shoot ]                                  │
// └──────────────────────────────────────────────────┘

// EXPANDED VIEW (after tapping a shot list item):
// Shows the full reference illustration with annotations
// alongside the shot description and tips.

// ┌──────────────────────────────────────────────────┐
// │  Shot 1 of 3: Standing back view                  │
// │  Take 3 photos, Handler picks the best            │
// │                                                   │
// │  ┌────────────────────┐  Stand with weight on     │
// │  │                    │  one leg. Push the         │
// │  │  [REFERENCE IMAGE  │  opposite hip out.         │
// │  │   WITH ANNOTATIONS │                           │
// │  │   SHOWING EXACT    │  Camera: behind you,       │
// │  │   POSE + CAMERA    │  waist height on tripod.   │
// │  │   POSITION]        │                           │
// │  │                    │  Tip: Arch your lower      │
// │  │                    │  back slightly. It makes    │
// │  │                    │  a huge difference.         │
// │  └────────────────────┘                           │
// │                                                   │
// │  [ ✓ Got it — Next Shot ]                         │
// └──────────────────────────────────────────────────┘

interface ShootCardProps {
  prescription: ShootPrescription;
  references: ReferenceImage[];     // preloaded references for this shoot
  onStartShoot: () => void;
  onUploadMedia: (files: File[]) => void;
  onMarkPosted: () => void;
}

// States:
// 'prescribed' → Shows overview + "Start Shoot" button
// 'in_progress' → Shows shot-by-shot with reference images, one at a time
// 'captured' → Shows upload interface
// 'ready_to_post' → Shows caption + platform + "Copy & Post" button
// 'posted' → Shows "✓ Posted" confirmation
```

### 4.2 Reference Image Viewer

```typescript
// src/components/shoots/ReferenceViewer.tsx

// Full-screen reference image viewer.
// Shows the reference illustration at large size with all annotations.
// Swipe between reference images for the current shot.
// Pinch to zoom on specific annotations.

// If Maxy has previous shots that scored well with this reference,
// show her own best version alongside the reference:
// LEFT: Reference illustration
// RIGHT: "Your best version of this shot (Jan 15)"

interface ReferenceViewerProps {
  reference: ReferenceImage;
  previousBest?: string;  // URL to Maxy's best photo using this reference
  annotations: Annotation[];
}
```

### 4.3 Media Upload + Handler Processing

```typescript
// src/components/shoots/MediaUpload.tsx

// After shooting, Maxy uploads her photos/videos.
// Simple drag-drop or camera roll picker.
// Auto-strips EXIF metadata on upload (privacy).

// After upload, Handler "processes" (in Phase 0 this is simple):
// 1. Display all uploaded images as thumbnails
// 2. Handler marks which ones to use (or in Phase 0: Maxy picks top 3-5)
// 3. Watermark overlay: small "@softmaxy" in corner
// 4. Caption is already written (from prescription)
// 5. Show the "Ready to Post" card

// ┌──────────────────────────────────────────────────┐
// │  ✅ Shoot complete! 8 photos captured             │
// │                                                   │
// │  Handler selected: 4 best shots                   │
// │  [thumb] [thumb] [thumb] [thumb]                  │
// │                                                   │
// │  ┌─────────────────────────────────────────────┐  │
// │  │  POST TO: OnlyFans                          │  │
// │  │                                             │  │
// │  │  Caption:                                   │  │
// │  │  "New leggings, same locked girl 🔒🍑       │  │
// │  │   How's the view from back there?"          │  │
// │  │                                             │  │
// │  │  [ Copy Caption ]  [ Download Photos ]      │  │
// │  │                                             │  │
// │  │  After you post, tap:                       │  │
// │  │  [ ✓ I Posted It ]                          │  │
// │  └─────────────────────────────────────────────┘  │
// │                                                   │
// │  ┌─────────────────────────────────────────────┐  │
// │  │  ALSO POST TO: r/sissies                    │  │
// │  │  Title: "New here, how do these look? 🍑"   │  │
// │  │  [ Copy Title ]  [ Download Photos ]        │  │
// │  │  [ ✓ I Posted It ]                          │  │
// │  └─────────────────────────────────────────────┘  │
// └──────────────────────────────────────────────────┘

interface MediaUploadProps {
  prescriptionId: string;
  onUploadComplete: () => void;
}
```

---

## PART 5: Handler AI Integration

### 5.1 Daily Prescription Enhancement

The Handler's daily prescription now includes shoot assignments.
Add to the existing Handler context:

```typescript
function buildShootContext(userId: string): string {
  // Load from DB:
  // - Recent shoot completions (last 7 days)
  // - Shoots prescribed but not completed (skipped/in_progress)
  // - Current denial day
  // - Wardrobe inventory
  // - Content posted per platform this week
  // - Which reference images have been used recently

  return `
  CONTENT CREATION STATE:
  Shoots completed this week: ${completedThisWeek}
  Shoots skipped this week: ${skippedThisWeek}
  Last shoot: ${lastShoot?.title} (${daysAgo} days ago)
  Denial day: ${denialDay}
  Content posted this week: OF: ${ofPosts}, Reddit: ${redditPosts}, Twitter: ${twitterPosts}

  WARDROBE (prescribe ONLY from this list):
  ${JSON.stringify(MAXY_WARDROBE, null, 2)}

  EQUIPMENT: Ring light, phone, tripod, mirror
  FACE RULE: NO face in ANY content. All shots must be no-face safe.

  AVAILABLE REFERENCE IMAGES (use IDs in shot lists):
  ${referenceIds.map(r => `${r.id}: ${r.name} (${r.category})`).join('\n')}

  TODAY'S SHOOT PRESCRIPTION:
  Prescribe exactly ONE shoot for today. Keep it under 15 minutes.
  Include: specific outfit items (from wardrobe list), setup name,
  lighting name, shot list with reference image IDs, pre-written
  caption for the target platform, and mood direction.

  If Maxy skipped yesterday's shoot, prescribe something EASIER today,
  not harder. The goal is building the habit, not perfection.

  If denial day >= 5, prescribe content that benefits from authentic
  arousal (cage content, tease content, toy content).
  `.trim();
}
```

### 5.2 Post-Upload Caption Generation

If the pre-seeded caption doesn't fit or Handler wants to customize based
on the actual uploaded photos:

```typescript
async function generateCaption(
  platform: string,
  shootType: string,
  mood: string,
  denialDay: number
): Promise<{ caption: string; hashtags: string[] }> {
  // Claude Haiku call (cheap, fast)
  // System prompt includes Maxy's voice config per platform
  // Generates caption + relevant hashtags
  // Returns ready-to-paste text
}
```

---

## PART 6: Implementation Order

**Sprint 1 — Reference Library (Day 1):**
1. Run migration: reference_images + shoot_prescriptions tables
2. Build ReferenceIllustration SVG component (programmatic, no external images)
3. Seed the ~30 reference illustrations from PHASE_0_REFERENCES
4. Build ReferenceViewer component

**Sprint 2 — Shoot Card (Days 2-3):**
5. Build ShootCard component with all states
6. Build shot-by-shot view with inline reference images
7. Integrate ShootCard into Today View task list
8. Build the "Start Shoot" → "Next Shot" → "Upload" flow

**Sprint 3 — Upload + Post (Days 3-4):**
9. Build MediaUpload component with EXIF stripping
10. Build watermark overlay (simple @softmaxy text)
11. Build "Ready to Post" card with copy-to-clipboard
12. Build platform-specific posting instructions
13. Build "I Posted It" confirmation + revenue/engagement logging

**Sprint 4 — Handler Integration (Day 5):**
14. Build buildShootContext function
15. Add shoot prescription to daily Handler prescription
16. Seed first 7 days of prescriptions (from FIRST_30_DAYS)
17. Build generateCaption for dynamic captions
18. Wire shoot completion into streak/points system

**Sprint 5 — Polish (Day 6):**
19. Add Maxy's best previous shots as reference comparisons
20. Add skip tracking + consequence integration
21. Add "Surprise me" button (Handler picks random from unused references)
22. Test full flow: prescription → reference → shoot → upload → post

**After Sprint 5:**
Maxy opens the app. Sees "📸 Evening leggings set — 10min."
Taps it. Sees exactly what to wear. Sees reference images for every shot.
Does the shoot. Uploads. Copies the caption. Posts. Done.
The entire creative decision load: zero.
That's the only thing that matters at Phase 0.
