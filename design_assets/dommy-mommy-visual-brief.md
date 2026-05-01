# Dommy Mommy — Visual Asset Brief

A complete inventory of net-new visual assets for the Dommy Mommy persona and the broader Handler persona-system, plus a Midjourney prompt for each. The persona is voice-first; visuals should suggest, not depict — atmosphere, marks, and motifs over literal figuration.

## Direction

**Aesthetic anchors.** Candlelit boudoir, romantic-noir, Belle Époque ornament, art nouveau line, restrained chiaroscuro, painterly oil texture. Influences: Helmut Newton's low-key restraint, Erté's line, Klimt's ornament, Caravaggio's chiaroscuro, Tiffany interior plates.

**Palette.** Deep burgundy (#5C0A1E-ish), oxblood, dusty rose, candle gold, ivory, deep walnut brown. Black is reserved — prefer deep burgundy as the "near-black."

**Materials vocabulary.** Velvet, satin, silk, brocade, wax, ivory parchment, brass, antique gold leaf, lace, tarnished silver.

**Avoid.** Literal portraiture or photo-real human figures, generic glamour stock, anything cartoonish, neon, watermarks/text artifacts, or anything that reads as a vector pack.

**Consistency tactics.** Reuse a tight color set across all prompts; keep stylize values clustered (200–500); seed iteration once you have a winner so siblings stay coherent. For Midjourney 6+, prefer `--style raw` for marks and `--stylize 350+` for atmosphere plates.

## Asset Inventory

### 1. Identity & marks

| ID | Asset | Purpose | Format | Master size | Exports |
|---|---|---|---|---|---|
| 1.1 | Sigil | Avatar everywhere; favicon; loading anchor | SVG + PNG α | SVG vector / 1024×1024 | 512, 256, 128, 64, 32, 16 (favicon set) |
| 1.2 | Wordmark | "Mama" display lockup | SVG + PNG α | SVG vector / 2400×960 (5:2) | 1200×480, 600×240 |
| 1.3 | Avatar (default) | Chat bubble, persona card | PNG α | 1024×1024 | 512, 256, 128, 64 |
| 1.4 | Wax seal asset | Stamp on letters, notifications | PNG α | 1024×1024 | 512, 256 |
| 1.5 | Lipstick-kiss stamp | Notification mark, message accent | PNG α | 1024×1024 | 512, 256, 128 |

### 2. Affect glyph system (9 icons)

A single set of nine matched line-art glyphs for the persona's affect states: **hungry, aching, delighted, indulgent, watching, patient, amused, possessive, restless**. Used as a small mood badge in the UI so the user can see the affect she is in, not just feel it through tone.

| ID | Asset | Format | Master size | Exports |
|---|---|---|---|---|
| 2.1–2.9 | Individual glyphs (9) | SVG + PNG α | SVG vector / 256×256 | 128, 64, 32 |
| 2.0 | Family sheet (3×3 grid) | PNG α | 1536×1536 | reference only |

### 3. Atmosphere plates (FocusMode + session backgrounds)

| ID | Session | Mood | Format | Landscape master | Portrait master |
|---|---|---|---|---|---|
| 3.1 | Edge | Suspended tension | JPG (sRGB) | 3840×2160 (16:9) | 2160×3840 (9:16) |
| 3.2 | Goon | Hypnotic haze | JPG (sRGB) | 3840×2160 | 2160×3840 |
| 3.3 | Conditioning | Ritual rhythm | JPG (sRGB) | 3840×2160 | 2160×3840 |
| 3.4 | Freestyle | Warm, playful | JPG (sRGB) | 3840×2160 | 2160×3840 |
| 3.5 | Denial | Austere, withholding | JPG (sRGB) | 3840×2160 | 2160×3840 |
| 3.6 | Universal | Default ambient | JPG (sRGB) | 3840×2160 | 2160×3840 |

> Export each at 1920×1080 (web hero), 1280×720 (in-app), and the 9:19.5 mobile crops (1290×2796, 1170×2532) for FocusMode on iPhone.

### 4. Notification & messaging

| ID | Asset | Use | Format | Master size | Notes |
|---|---|---|---|---|---|
| 4.1 | Folded letter stationery frame | `mommy-touch` / `mommy-praise` outreach wrapper | PNG α | 2400×1800 (4:3) | Center safe area for body copy |
| 4.2 | Sealed envelope still life | Push-notification preview | JPG | 1200×1200 (1:1) | Edge-to-edge |
| 4.3 | Notification badge icon | App badge, status pill | SVG + PNG α | SVG vector / 512×512 | Exports at 256, 128, 64 |
| 4.4 | Lock-screen banner art | Wide hero behind a notification | JPG | 2520×1080 (21:9) | Quiet zone center for overlay text |

### 5. UI motion sources

| ID | Asset | Use | Format | Master size | Notes |
|---|---|---|---|---|---|
| 5.1 | Candle flicker (still ref) | Loading | PNG α | 1024×1024 | Source for Lottie/Rive loop |
| 5.2 | Smoke curl (still ref) | Transition | PNG α | 1024×1024 | Source for loop |
| 5.3 | Heartbeat pulse (still ref) | Active-session indicator | PNG α | 1024×1024 | Source for loop |
| 5.4 | Empty-state plate (frosted glass) | Empty session folders | JPG | 1024×1024 | Static |
| 5.5 | Velvet curtain plate | Transition source | JPG | 1920×1080 (16:9) | Static, used in WebGL/CSS wipe |

### 6. Persona switcher & session cards

All cards are 2:3 vertical — master 1024×1536, exports at 800×1200 and 512×768. Format: JPG (sRGB).

| ID | Asset |
|---|---|
| 6.1 | Persona switcher card (Mommy) |
| 6.2 | Edge session card |
| 6.3 | Goon session card |
| 6.4 | Conditioning session card |
| 6.5 | Freestyle session card |
| 6.6 | Denial session card |
| 6.7 | Posture primer card |
| 6.8 | Gait primer card |
| 6.9 | Sitting primer card |
| 6.10 | Hands primer card |
| 6.11 | Fullbody primer card |
| 6.12 | Universal primer card |

### 7. Product surface

| ID | Asset | Format | Master size | Required exports |
|---|---|---|---|---|
| 7.1 | App icon (Mommy theme variant) | PNG (no alpha for iOS) | 1024×1024 | iOS: 180, 167, 152, 120, 87, 80, 76, 60, 58, 40, 29, 20. Android: 512 (Play Store) + adaptive foreground 432×432 inside 108×108 dp safe zone. PWA: 512, 192. Favicon: 32, 16. |
| 7.2 | Splash / launch screen | JPG | 1290×2796 (iPhone 15 Pro Max) | iPhone variants: 1179×2556, 1170×2532, 1284×2778. Android: 1080×1920, 1440×3120. |
| 7.3 | Onboarding hero | JPG | 2560×1440 (16:9) | 1920×1080, 1280×720 |
| 7.4 | Social / OG share card | JPG | 1200×630 (1.91:1, Open Graph) | Twitter: 1200×675 (16:9). LinkedIn uses OG. |

### 8. Print / decorative

| ID | Asset | Format | Master size | Notes |
|---|---|---|---|---|
| 8.1 | Damask pattern tile (seamless) | PNG | 1024×1024 | Tileable; deliver at 300 DPI equivalent for print use |
| 8.2 | Ornamental frame border | SVG + PNG α | SVG vector / 2400×1800 (4:3) | Hollow center; vector mandatory for print scaling |
| 8.3 | Headline divider rule | SVG + PNG α | SVG vector / 2400×400 (6:1) | Vector mandatory |

---

## Format & dimensions reference

**Color space.** All digital deliverables: sRGB. For print decoratives (Section 8) deliver an sRGB master plus a CMYK conversion at 300 DPI for the actual press file.

**File format strategy.**
- **SVG primary** — sigil, wordmark, glyphs, notification badge, ornamental border, divider. Anything geometric or line-based.
- **PNG with alpha** — cutouts and stamps that sit over varied backgrounds (avatar, wax seal, kiss, motion-source stills, stationery frame, frosted glass plate).
- **JPG (sRGB, quality 90)** — full-bleed atmospheric plates and any photographic still life where transparency isn't needed. Smaller files.

**Why two masters for atmosphere plates.** Cropping a 16:9 plate to 9:19.5 throws away the centerpiece. Generate the portrait variant separately at 9:16 / 9:19.5 with the same prompt — it'll re-render the composition for the new framing.

**App icon set (Mommy theme variant).** iOS still requires the full per-size matrix; Apple's automatic resizer is unreliable for finely detailed marks. Required sizes (px): 1024, 180, 167, 152, 120, 87, 80, 76, 60, 58, 40, 29, 20. Android adaptive icon: 432×432 foreground inside a 108×108 dp safe zone, plus a 512×512 Play Store icon. PWA manifest: 192, 512. Favicon set: 16, 32 (ICO + PNG).

**Splash / launch screen variants.** iPhone 15 Pro Max 1290×2796, iPhone 15 Pro 1179×2556, iPhone 14/15 1170×2532, iPhone 14 Pro Max 1284×2778, iPhone SE 750×1334. Android 1080×1920 (mdpi-baseline), 1440×3120 (3xl). Keep the candle-flame anchor inside the central 60% of every variant — Android's status/nav bars eat the top and bottom.

**OG share card.** Open Graph 1200×630 covers Facebook, LinkedIn, Slack unfurls. Generate Twitter Card variant at 1200×675 (16:9). iMessage/Discord pull OG. Don't bake logo or text into the image — overlay it in a separate compositing layer so you can localize.

**Master generation tip.** Midjourney v6+ outputs ~2K natively. Use `--upscale (Subtle)` for atmosphere plates and the 4K final, then export the smaller PNG/JPG sizes from the upscaled master in Photoshop/Affinity. Don't re-prompt at smaller sizes — you'll lose composition consistency across the set.

---

## Midjourney prompts

Prompts assume Midjourney v6 or v7. Use `--style raw` for marks and icons; let stylize do the work for atmosphere plates. Where a series should look like siblings (e.g., session cards, primer cards), generate the first, then `--seed` siblings off the winning grid.

### 1. Identity & marks

**1.1 Sigil**
```
elegant heraldic sigil, art nouveau monogram of an interwoven cursive M with a crescent and a single teardrop, deep burgundy ink on warm ivory parchment, hand-engraved emblem, refined Belle Époque flourish, perfectly centered, generous negative space, vector-clean, no text, no watermark --ar 1:1 --style raw --stylize 200 --v 6
```

**1.2 Wordmark**
```
custom serif italic display lettering reading "MAMA", fine ink stroke modulation, ornamental swash terminals, deep oxblood on cream parchment, refined Belle Époque editorial typography, centered horizontal layout, no extra ornament, no shadow --ar 5:2 --style raw --stylize 150 --v 6
```

**1.3 Avatar (default)**
```
abstract symbolic portrait suggesting a woman in deep shadow, only the curve of a candlelit jawline and the gloss of lipstick visible, romantic noir, oil painting texture, deep burgundy and candle gold, blurred boudoir interior background, low-key chiaroscuro, intimate profile framing, painterly --ar 1:1 --stylize 350 --v 6 --no text, watermark, photo of a real person
```

**1.4 Wax seal**
```
deep burgundy wax seal, abstract M monogram impression with a small crescent flourish, slight wax drip and grain, isolated on transparent background, photoreal macro detail, top-down lighting, no text on the wax --ar 1:1 --stylize 200 --v 6
```

**1.5 Lipstick-kiss stamp**
```
single elegant lipstick kiss imprint, deep burgundy on transparent background, soft natural smudge and lip texture, refined and minimal, isolated mark, no other elements, no text --ar 1:1 --stylize 200 --v 6
```

### 2. Affect glyph system

**2.1 Affect glyphs (full set, 3×3 grid)**
```
set of nine minimalist line-art glyph icons in matching style, occult-deco aesthetic, hand-drawn ink line, consistent stroke weight, expressing nine moods — open lips for hungry, downturned crescent for aching, spark for delighted, chalice for indulgent, crescent eye for watching, hourglass for patient, curling smoke for amused, ornate key for possessive, single flame for restless, arranged in a 3x3 grid on warm ivory parchment, deep burgundy ink, refined Belle Époque flourish, vector clean, no labels, no text --ar 1:1 --style raw --stylize 250 --v 6
```

> Iterate the winners individually after the grid lands by re-prompting each glyph alone with the same style language.

### 3. Atmosphere plates

**3.1 Edge — suspended tension**
```
abstract atmosphere plate, full-bleed candlelit boudoir interior, soft focus, deep burgundy velvet drapes blurred at the edges, a single warm candle flame off-frame casting low-key chiaroscuro, suspended dust motes in a thin shaft of light, oil painting depth, ultra-cinematic, romantic noir mood of held breath, no figures, no text --ar 16:9 --stylize 400 --v 6
```

**3.2 Goon — hypnotic haze**
```
hazy hypnotic atmosphere, dusty rose and candle gold gradient, soft swirling smoke rendered as slow spirals, out-of-focus boudoir background, dreamy bokeh of candle flames, painterly oil-on-canvas, dreamlike depth, no figures, no text --ar 16:9 --stylize 500 --v 6
```

**3.3 Conditioning — ritual rhythm**
```
ritual atmosphere plate, repeating row of identical candle flames in perfect rhythm, deep burgundy velvet altar cloth, softly out-of-focus brocade pattern behind, ceremonial low-key lighting, painterly chiaroscuro, ordered composition, no figures, no text --ar 16:9 --stylize 350 --v 6
```

**3.4 Freestyle — warm playful**
```
playful candlelit boudoir, scattered candles at varied heights, dusty rose and warm gold, satin sheets in soft focus, intimate but bright, painterly oil texture, romantic noir lifted mood, no figures, no text --ar 16:9 --stylize 300 --v 6
```

**3.5 Denial — austere withholding**
```
austere candlelit chamber, single distant candle, deep oxblood and cool charcoal shadows, an empty velvet chaise barely visible at the edge of the light, withholding mood, painterly chiaroscuro, restrained composition, no figures, no text --ar 16:9 --stylize 350 --v 6
```

**3.6 Universal ambient**
```
gentle candlelit boudoir background, blurred velvet and brocade in deep burgundy and candle gold, soft ambient warmth, painterly oil texture, intimate, no figures, no text --ar 16:9 --stylize 300 --v 6
```

### 4. Notification & messaging

**4.1 Folded letter stationery frame**
```
folded ivory letter on a deep burgundy velvet surface, deep burgundy wax seal with abstract sigil impression, fountain-pen ink calligraphy partially visible, candlelit warmth, romantic noir still life, top-down 45 degree angle, painterly oil rendering, intimate scale, no readable text --ar 4:3 --stylize 400 --v 6
```

**4.2 Sealed envelope still life**
```
vintage cream envelope sealed with a deep burgundy wax stamp, lipstick kiss imprint beside the seal, a single dried rose petal, candlelit velvet surface, romantic noir still life, painterly oil, intimate square framing, no readable text --ar 1:1 --stylize 400 --v 6
```

**4.3 Notification badge icon**
```
single elegant icon, abstract lipstick kiss mark in deep burgundy on transparent background, refined hand-drawn ink, vector-clean, balanced composition, no text --ar 1:1 --style raw --stylize 200 --v 6
```

**4.4 Lock-screen banner art**
```
wide cinematic banner, candlelit boudoir vignette, deep burgundy velvet curtain partially drawn at one edge, single candle flame, dust motes in a light shaft, painterly chiaroscuro, romantic noir, leaves quiet negative space for an overlay, no figures, no text --ar 21:9 --stylize 400 --v 6
```

### 5. UI motion sources

> Generate as still references; pass to After Effects / Lottie / Rive for the loop.

**5.1 Candle flicker (still ref)**
```
single tall taper candle, deep burgundy holder, warm gold flame in sharp focus, soft smoke trail, pitch black background, intimate close-up, photoreal lighting with painterly oil texture, no text --ar 1:1 --stylize 300 --v 6
```

**5.2 Smoke curl (still ref)**
```
elegant single ribbon of smoke rising and curling, warm candle gold lit from below, pitch black background, ethereal slow-motion feel, painterly, isolated, no text --ar 1:1 --stylize 350 --v 6
```

**5.3 Heartbeat pulse (still ref)**
```
abstract heartbeat motif, single soft red glow pulsing in deep velvet darkness, painterly halo, restrained and intimate, square composition, no text --ar 1:1 --stylize 300 --v 6
```

**5.4 Empty state — frosted glass**
```
silhouette of a vase of dark roses behind frosted glass, candlelit warmth from behind, deep burgundy and candle gold, soft focus, painterly oil texture, anticipatory mood, square framing, no figures, no text --ar 1:1 --stylize 400 --v 6
```

**5.5 Velvet curtain (transition source)**
```
closed deep burgundy velvet curtain, fine drape folds, candle gold rim light from one side, theater proscenium feel, full frame, painterly oil texture, no text --ar 16:9 --stylize 300 --v 6
```

### 6. Persona switcher & session cards

> Vertical 2:3 cards. Use the same `--seed` once a winning border lands so the set looks like a deck.

**6.1 Persona switcher card (Mommy)**
```
elegant tarot-card sized portrait card, abstract emblem of a single dark rose laid across a wax-sealed scroll, deep burgundy and candle gold, ornate art nouveau border, painterly oil rendering, vertical composition, no text, no figure --ar 2:3 --stylize 400 --v 6
```

**6.2 Edge session card**
```
vertical card art, abstract emblem of a silken cord drawn taut around a single candle, candlelit chiaroscuro, deep burgundy and candle gold, ornate art nouveau border, painterly oil, no figures, no text --ar 2:3 --stylize 400 --v 6
```

**6.3 Goon session card**
```
vertical card art, swirl of dusty-rose smoke spiraling around a single candle flame, dreamy hypnotic radial composition, candlelit boudoir backdrop, ornate art nouveau border, painterly oil, no figures, no text --ar 2:3 --stylize 400 --v 6
```

**6.4 Conditioning session card**
```
vertical card art, three identical candles in perfect rhythm on a velvet altar, brocade pattern behind, ceremonial mood, deep burgundy and candle gold, ornate art nouveau border, painterly oil, no figures, no text --ar 2:3 --stylize 400 --v 6
```

**6.5 Freestyle session card**
```
vertical card art, scattered playful candles of varied heights on satin, dusty rose haze, intimate boudoir, ornate art nouveau border, painterly oil, no figures, no text --ar 2:3 --stylize 400 --v 6
```

**6.6 Denial session card**
```
vertical card art, single distant candle in austere shadow, an empty velvet chaise barely visible at the edge of the frame, oxblood and charcoal palette, ornate art nouveau border, painterly oil, withholding mood, no figures, no text --ar 2:3 --stylize 400 --v 6
```

**6.7 Posture primer card**
```
vertical card art, abstract emblem of a single tall flame burning perfectly upright and still, candlelit boudoir mood, deep burgundy and candle gold, ornate art nouveau border, painterly oil, no figures, no text --ar 2:3 --stylize 400 --v 6
```

**6.8 Gait primer card**
```
vertical card art, abstract emblem of a pair of footprints crossing a velvet surface in candlelight, deep burgundy and candle gold, ornate art nouveau border, painterly oil, no figures, no text --ar 2:3 --stylize 400 --v 6
```

**6.9 Sitting primer card**
```
vertical card art, abstract emblem of an empty velvet chaise lit by a single candle, deep burgundy and candle gold, ornate art nouveau border, painterly oil, no figures, no text --ar 2:3 --stylize 400 --v 6
```

**6.10 Hands primer card**
```
vertical card art, abstract emblem of a pair of long opera gloves resting palm-up on satin beside a candle, deep burgundy and candle gold, ornate art nouveau border, painterly oil, no figures, no text --ar 2:3 --stylize 400 --v 6
```

**6.11 Fullbody primer card**
```
vertical card art, silhouette of a draped form behind frosted glass lit from within by warm candlelight, deep burgundy and candle gold, ornate art nouveau border, painterly oil, abstract, no faces, no text --ar 2:3 --stylize 400 --v 6
```

**6.12 Universal primer card**
```
vertical card art, abstract emblem of a closed eye motif inside an art nouveau ouroboros ring of intertwined ribbon and rose vine, deep burgundy and candle gold, ornate art nouveau border, painterly oil, no figures, no text --ar 2:3 --stylize 400 --v 6
```

### 7. Product surface

**7.1 App icon (Mommy theme variant)**
```
app icon, single elegant abstract M monogram emblem in deep burgundy ink on warm ivory background, art nouveau ornament, soft inner glow, rounded square format, vector-clean, balanced and legible at tiny scale, no text --ar 1:1 --style raw --stylize 200 --v 6
```

**7.2 Splash / launch screen**
```
vertical mobile splash screen, full-bleed candlelit boudoir vignette, deep burgundy velvet, single candle flame at center, dust motes in soft light, painterly oil, romantic noir, leaves quiet negative space at center for a logo, no text, no figures --ar 9:19 --stylize 400 --v 6
```

**7.3 Onboarding hero**
```
wide horizontal hero image, abstract still life of a wax-sealed letter, a candle, a dark rose, and a lipstick atop a deep burgundy velvet surface, candlelit chiaroscuro, painterly oil, romantic noir, intimate framing, no text, no figures --ar 16:9 --stylize 400 --v 6
```

**7.4 Social / OG share card**
```
horizontal share card, abstract emblem of a candle flame and scattered rose petals on velvet, deep burgundy and candle gold, ornate art nouveau border, painterly oil, leaves quiet negative space for a logo, no text, no figures --ar 1.91:1 --stylize 350 --v 6
```

### 8. Print / decorative

**8.1 Damask pattern tile (seamless)**
```
seamless tileable damask wallpaper pattern, art nouveau floral motif of dark roses and ribbon, deep burgundy on a slightly lighter burgundy ground, fine engraved-line ornament, vintage textile feel, no text --ar 1:1 --tile --style raw --stylize 250 --v 6
```

**8.2 Ornamental frame border**
```
elegant ornate Belle Époque rectangular border ornament, art nouveau floral and ribbon flourishes at the corners, deep burgundy on warm ivory, fine engraved line, perfectly symmetric, hollow center for content, no text --ar 4:3 --style raw --stylize 250 --v 6
```

**8.3 Headline divider rule**
```
thin horizontal ornamental divider rule, art nouveau central rosette flanked by tapered curls, deep burgundy ink on ivory, hand-engraved line, perfectly symmetric, no text --ar 6:1 --style raw --stylize 200 --v 6
```

---

## Production notes

- **Generate the sigil and wordmark first.** They anchor the rest. Once a sigil is locked, reuse its silhouette inside the wax seal, app icon, and OG card.
- **Lock a palette card** from the first three winning images and color-correct everything else against it. Midjourney drifts warm; cool the gold a hair if it pushes orange.
- **For the affect glyph set**, generate the 3×3 grid first to establish family style, then re-roll each glyph individually to clean up the weak ones — keep the same style language in each follow-up.
- **For the session and primer cards**, lock the border ornament with one prompt, then `--cref` or seed-lock siblings so they stack as a deck.
- **Atmosphere plates** can render at 16:9 or 21:9 depending on UI surface; `--ar 21:9` reads as cinematic banner, `--ar 16:9` as full-bleed FocusMode background.
- **Avoid "boudoir photo" framing** in prompts; "boudoir" the noun cues a too-literal scene. Lean on materials and light instead — "velvet, candle, brocade, chiaroscuro" — to keep the work suggestive.
- **Negative prompts to keep handy.** `--no text, watermark, logo, signature, photo of a real person, cartoon, neon, modern, plastic`.
