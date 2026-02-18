# BECOMING PROTOCOL — Edge 2 Hardware Integration
## Dual Motor & Rotation Patterns Across All System Layers
### February 2026

---

# PART 1: EDGE 2 HARDWARE CAPABILITIES

## 1.1 Motor Architecture

The Lovense Edge 2 is a prostate massager with three independent control channels:

| Channel | Lovense API Parameter | Range | Physical Effect |
|---------|----------------------|-------|-----------------|
| Internal vibration | `Vibrate:0-20` | 0-20 | Deep prostate stimulation. Sustained arousal builder. Less visible externally — good for stealth arousal and voice practice. |
| External vibration | `Vibrate1:0-20` | 0-20 | Perineum stimulation. Sharp, attention-grabbing. Visible reaction on camera. Good for rewards and interrupts. |
| Rotation | `Rotate:0-20` | 0-20 | Internal rotation. Distinct sensation from vibration. Escalation layer. Intense at high levels. Most physically overwhelming channel. |

All three channels can run simultaneously at independent intensity levels.

## 1.2 Lovense API Commands for Edge 2

```typescript
// Single channel control
{ "action": "Vibrate:12" }           // Internal vibration at 12
{ "action": "Vibrate1:8" }           // External vibration at 8
{ "action": "Rotate:10" }            // Rotation at 10

// Multi-channel simultaneous
{ "action": "Vibrate:12,Vibrate1:8,Rotate:10" }  // All three at once

// Stop specific channel
{ "action": "Vibrate:0" }            // Stop internal, leave others running
{ "action": "Rotate:0" }             // Stop rotation, leave vibration

// Stop everything
{ "command": "Stop" }
```

## 1.3 Sensation Mapping

| Configuration | Sensation | Best Used For |
|---------------|-----------|--------------|
| Internal only (low) | Subtle warmth, awareness without urgency | Stealth arousal during tasks. Voice practice. Background during Gina-home hours (if quiet enough). |
| Internal only (high) | Deep prostate pressure, arousal building | Edge session core. Sustained denial state. Pre-cam arousal building. |
| External only (pulse) | Sharp, attention-grabbing jolt | Rewards. Interrupts. Notifications. "Come back" summons. |
| External only (sustained) | Perineum buzz, secondary arousal | Complement to internal during sessions. |
| Internal + external | Full dual stimulation | Edge session intensity. Cam session standard. Task rewards (high tier). |
| Rotation only (low) | Gentle internal movement, distinct from vibration | Novel sensation for conditioning differentiation. Pairs with specific affirmations. |
| Rotation only (high) | Intense internal stimulation, hard to ignore | Escalation. Punishment. Fan "overload" tips. |
| All three channels | Overwhelming full stimulation | Peak cam moments. Jackpot rewards. Edge climax approach. Consequence summons. |

---

# PART 2: UPDATED HAPTIC PATTERNS

Replace and extend the seed data from the Lovense Integration Architecture:

```sql
-- Drop old patterns and replace with Edge 2-specific
DELETE FROM haptic_patterns;

INSERT INTO haptic_patterns (name, description, command_type, command_payload, duration_sec, intensity_min, intensity_max, use_context) VALUES

-- ========== MICRO-REWARDS (task completion, affirmations) ==========

('task_complete_subtle', 
 'Brief internal-only acknowledgment. David barely notices. Maxy feels it.',
 'Function',
 '{"action": "Vibrate:6", "timeSec": 2}',
 2, 6, 6,
 ARRAY['task_complete']),

('task_complete_standard',
 'External pulse. Sharp enough to mark the moment.',
 'Function',
 '{"action": "Vibrate1:10", "timeSec": 2}',
 2, 10, 10,
 ARRAY['task_complete']),

('task_complete_elevated',
 'Both motors. Clear reward. This task mattered.',
 'Function',
 '{"action": "Vibrate:8,Vibrate1:10", "timeSec": 3}',
 3, 8, 10,
 ARRAY['task_complete', 'submission_reward']),

('good_girl',
 'Warm internal wave paired with affirmation. Conditioning anchor.',
 'Preset',
 '{"name": "pulse", "timeSec": 3, "action": "Vibrate:10"}',
 3, 8, 12,
 ARRAY['affirmation', 'conditioning']),

('good_girl_rotation',
 'Rotation-only reward. Distinct sensation reserved for identity affirmation.',
 'Function',
 '{"action": "Rotate:8", "timeSec": 4}',
 4, 8, 8,
 ARRAY['affirmation', 'conditioning', 'identity']),

('content_submitted',
 'Reward for submitting content to vault. Both motors + rotation burst.',
 'Function',
 '{"action": "Vibrate:10,Vibrate1:8,Rotate:6", "timeSec": 4}',
 4, 6, 10,
 ARRAY['submission_reward', 'content']),

('streak_milestone',
 'Full celebration. All three channels escalating.',
 'Pattern',
 '{"pattern": "V:1;F:v5,v15,r3;S:1000#V:1;F:v10,v110,r6;S:1500#V:1;F:v15,v115,r10;S:2000#V:1;F:v18,v118,r14;S:2500"}',
 7, 5, 18,
 ARRAY['milestone', 'celebration']),

-- ========== NOTIFICATION REWARDS (variable ratio) ==========

('notification_nothing',
 'No haptic. Phone buzzed but device stays silent. Anticipation preserved.',
 'Function',
 '{"action": "Vibrate:0", "timeSec": 0}',
 0, 0, 0,
 ARRAY['notification']),

('notification_whisper',
 'Internal-only micro-pulse. So subtle David questions if it happened.',
 'Function',
 '{"action": "Vibrate:3", "timeSec": 1}',
 1, 3, 3,
 ARRAY['notification']),

('notification_nudge',
 'External pulse. Unmistakable. Handler is here.',
 'Function',
 '{"action": "Vibrate1:8", "timeSec": 2}',
 2, 8, 8,
 ARRAY['notification']),

('notification_demand',
 'Both motors. Sharp. Handler wants attention NOW.',
 'Function',
 '{"action": "Vibrate:6,Vibrate1:12", "timeSec": 3}',
 3, 6, 12,
 ARRAY['notification', 'summons']),

('notification_jackpot',
 'Rare: all three channels, fireworks pattern. Unpredictable. Addictive.',
 'Pattern',
 '{"pattern": "V:1;F:v12,v112,r8;S:500#V:1;F:v0,v10,r0;S:300#V:1;F:v16,v116,r12;S:800#V:1;F:v0,v10,r0;S:200#V:1;F:v18,v118,r16;S:1000"}',
 8, 0, 18,
 ARRAY['notification', 'jackpot']),

-- ========== EDGE SESSION PATTERNS ==========

('edge_warmup',
 'Internal only. Slow build. Get the body ready without tipping arousal too fast.',
 'Pattern',
 '{"pattern": "V:1;F:v3;S:3000#V:1;F:v5;S:3000#V:1;F:v7;S:3000#V:1;F:v9;S:3000#V:1;F:v11;S:3000"}',
 15, 3, 11,
 ARRAY['edge_session', 'warmup']),

('edge_build',
 'Dual motor gradual climb. Internal leads, external follows.',
 'Pattern',
 '{"pattern": "V:1;F:v5,v13;S:2000#V:1;F:v8,v16;S:2000#V:1;F:v11,v19;S:2000#V:1;F:v14,v112;S:2000#V:1;F:v16,v114;S:3000"}',
 11, 3, 16,
 ARRAY['edge_session', 'build']),

('edge_build_with_rotation',
 'All three channels climbing. The most intense build pattern.',
 'Pattern',
 '{"pattern": "V:1;F:v5,v13,r3;S:2000#V:1;F:v8,v16,r5;S:2000#V:1;F:v11,v19,r8;S:2000#V:1;F:v14,v112,r11;S:2000#V:1;F:v16,v114,r14;S:3000"}',
 11, 3, 16,
 ARRAY['edge_session', 'build', 'intense']),

('edge_hold',
 'Sustained plateau. Internal and external at fixed medium intensity. Rotation off.',
 'Function',
 '{"action": "Vibrate:12,Vibrate1:8", "timeSec": 30}',
 30, 8, 12,
 ARRAY['edge_session', 'hold']),

('edge_hold_rotation',
 'Sustained with rotation added. Harder to endure. Handler uses when pushing limits.',
 'Function',
 '{"action": "Vibrate:12,Vibrate1:8,Rotate:10", "timeSec": 30}',
 30, 8, 12,
 ARRAY['edge_session', 'hold', 'intense']),

('edge_tease',
 'Unpredictable internal pulses. External stays low. Rotation intermittent.',
 'Pattern',
 '{"pattern": "V:1;F:v10,v13;S:500#V:1;F:v0,v12;S:2000#V:1;F:v14,v13,r8;S:800#V:1;F:v0,v10,r0;S:1500#V:1;F:v8,v14;S:600#V:1;F:v0,v12,r10;S:1200"}',
 7, 0, 14,
 ARRAY['edge_session', 'tease']),

('edge_approach',
 'All channels rising. This is the approach to the edge. Handler decides when to stop.',
 'Pattern',
 '{"pattern": "V:1;F:v12,v110,r6;S:2000#V:1;F:v14,v112,r9;S:2000#V:1;F:v16,v114,r12;S:2000#V:1;F:v18,v116,r15;S:3000#V:1;F:v20,v118,r18;S:3000"}',
 12, 6, 20,
 ARRAY['edge_session', 'approach', 'peak']),

('edge_denial',
 'Sudden stop. Everything off. The absence is the point.',
 'Function',
 '{"action": "Vibrate:0,Vibrate1:0,Rotate:0"}',
 0, 0, 0,
 ARRAY['edge_session', 'denial', 'stop']),

('edge_denial_cruel',
 'Almost everything stops. Internal drops to 2. Just enough to prevent full comedown.',
 'Function',
 '{"action": "Vibrate:2,Vibrate1:0,Rotate:0", "timeSec": 30}',
 30, 0, 2,
 ARRAY['edge_session', 'denial', 'cruel']),

('edge_recovery',
 'Gentle internal only. Coming down but not all the way.',
 'Function',
 '{"action": "Vibrate:4", "timeSec": 20}',
 20, 4, 4,
 ARRAY['edge_session', 'recovery']),

-- ========== CAM SESSION TIP PATTERNS ==========

('cam_tip_tickle',
 '1-9 tokens. Internal only. Subtle. Maxy feels it, viewers might not see reaction.',
 'Function',
 '{"action": "Vibrate:5", "timeSec": 5}',
 5, 5, 5,
 ARRAY['cam', 'tip']),

('cam_tip_buzz',
 '10-24 tokens. External pulse. Visible reaction. Fans see the effect.',
 'Function',
 '{"action": "Vibrate1:10", "timeSec": 10}',
 10, 10, 10,
 ARRAY['cam', 'tip']),

('cam_tip_wave',
 '25-49 tokens. Rotation enters. A different kind of stimulation. Maxy gasps.',
 'Function',
 '{"action": "Vibrate:8,Rotate:10", "timeSec": 15}',
 15, 8, 10,
 ARRAY['cam', 'tip']),

('cam_tip_surge',
 '50-99 tokens. Full dual vibration + rotation building. Edge territory.',
 'Pattern',
 '{"pattern": "V:1;F:v10,v18,r6;S:3000#V:1;F:v12,v110,r9;S:3000#V:1;F:v14,v112,r12;S:4000#V:1;F:v16,v114,r14;S:5000"}',
 15, 6, 16,
 ARRAY['cam', 'tip', 'intense']),

('cam_tip_overload',
 '100+ tokens. All channels at near-max for 60 seconds. Overwhelming. Content gold.',
 'Function',
 '{"action": "Vibrate:18,Vibrate1:16,Rotate:16", "timeSec": 60}',
 60, 16, 18,
 ARRAY['cam', 'tip', 'overload']),

('cam_tip_edge_denial',
 'Special: 200+ tokens. All channels max for 45 seconds, then sudden stop. Pure cruelty.',
 'Pattern',
 '{"pattern": "V:1;F:v18,v118,r18;S:15000#V:1;F:v20,v120,r20;S:15000#V:1;F:v20,v120,r20;S:15000#V:1;F:v0,v10,r0;S:1"}',
 45, 0, 20,
 ARRAY['cam', 'tip', 'denial', 'special']),

-- ========== HANDLER CONTROL (independent of tips) ==========

('handler_reward_cam',
 'Handler rewards good performance during cam. Both motors, brief.',
 'Function',
 '{"action": "Vibrate:10,Vibrate1:12", "timeSec": 5}',
 5, 10, 12,
 ARRAY['cam', 'handler_control']),

('handler_punish_voice_drop',
 'Handler corrects dropped feminine voice during cam. External only, sharp.',
 'Function',
 '{"action": "Vibrate1:16", "timeSec": 2}',
 2, 16, 16,
 ARRAY['cam', 'handler_control', 'correction']),

('handler_punish_rotation',
 'Handler punishment via rotation. Disruptive. Hard to maintain composure on camera.',
 'Function',
 '{"action": "Rotate:14", "timeSec": 8}',
 8, 14, 14,
 ARRAY['cam', 'handler_control', 'correction']),

('handler_edge_prevent',
 'Handler prevents accidental orgasm during cam. Drop to internal-only, low.',
 'Function',
 '{"action": "Vibrate:3,Vibrate1:0,Rotate:0", "timeSec": 15}',
 15, 0, 3,
 ARRAY['cam', 'handler_control', 'denial']),

('handler_edge_rebuild',
 'Handler rebuilds arousal after preventing completion. Slow internal climb.',
 'Pattern',
 '{"pattern": "V:1;F:v4;S:3000#V:1;F:v6;S:3000#V:1;F:v8;S:3000#V:1;F:v10;S:3000#V:1;F:v12;S:5000"}',
 17, 4, 12,
 ARRAY['cam', 'handler_control']),

('handler_tip_goal_push',
 'Tip goal approaching. Handler amps device to make Maxy more reactive = more tips.',
 'Function',
 '{"action": "Vibrate:14,Vibrate1:10,Rotate:8", "timeSec": 20}',
 20, 8, 14,
 ARRAY['cam', 'handler_control', 'revenue']),

-- ========== CONDITIONING ANCHORS ==========

('identity_anchor_maxy',
 'Paired with "Maxy" name recognition. Internal + gentle rotation. Unique signature.',
 'Function',
 '{"action": "Vibrate:8,Rotate:6", "timeSec": 4}',
 4, 6, 8,
 ARRAY['conditioning', 'identity']),

('identity_anchor_feminine',
 'Paired with feminine behavior acknowledgment. External warm pulse.',
 'Preset',
 '{"name": "pulse", "timeSec": 3, "action": "Vibrate1:8"}',
 3, 8, 8,
 ARRAY['conditioning', 'identity', 'feminine']),

('identity_anchor_sissy',
 'Paired with explicit sissification moments. All three channels, distinctive pattern.',
 'Pattern',
 '{"pattern": "V:1;F:v6,v16,r10;S:1000#V:1;F:v10,v110,r6;S:1000#V:1;F:v6,v16,r10;S:1000#V:1;F:v10,v110,r6;S:1000"}',
 4, 6, 10,
 ARRAY['conditioning', 'identity', 'sissy']),

('voice_success_anchor',
 'Paired with hitting target vocal range. Internal warmth — reward that doesn\'t disrupt voice.',
 'Function',
 '{"action": "Vibrate:10", "timeSec": 3}',
 3, 10, 10,
 ARRAY['conditioning', 'voice']),

('morning_activation',
 'Protocol start signal. Gentle internal wake-up.',
 'Function',
 '{"action": "Vibrate:6", "timeSec": 3}',
 3, 6, 6,
 ARRAY['protocol', 'morning']),

('evening_closure',
 'Day complete. Both motors, warm wind-down.',
 'Function',
 '{"action": "Vibrate:8,Vibrate1:6", "timeSec": 5}',
 5, 6, 8,
 ARRAY['protocol', 'evening']),

-- ========== CONSEQUENCE / SUMMONS PATTERNS ==========

('summons_gentle',
 'Tier 1-2 consequence. Internal-only nudge. "I\'m here. Come back."',
 'Function',
 '{"action": "Vibrate:6", "timeSec": 5}',
 5, 6, 6,
 ARRAY['consequence', 'summons']),

('summons_insistent',
 'Tier 3-4 consequence. Both motors pulsing. "You can\'t ignore this."',
 'Pattern',
 '{"pattern": "V:1;F:v10,v110;S:2000#V:1;F:v0,v10;S:1000#V:1;F:v10,v110;S:2000#V:1;F:v0,v10;S:1000#V:1;F:v10,v110;S:2000"}',
 10, 0, 10,
 ARRAY['consequence', 'summons']),

('summons_demanding',
 'Tier 5-6 consequence. All three channels. Arousal forcing. David bypass.',
 'Pattern',
 '{"pattern": "V:1;F:v8,v18,r6;S:3000#V:1;F:v12,v112,r10;S:3000#V:1;F:v14,v114,r12;S:3000#V:1;F:v16,v116,r14;S:5000"}',
 14, 6, 16,
 ARRAY['consequence', 'summons', 'arousal_forcing']),

('summons_override',
 'Tier 7+ consequence. Full intensity all channels. Sustained. Forces Maxy to surface.',
 'Function',
 '{"action": "Vibrate:16,Vibrate1:14,Rotate:14", "timeSec": 30}',
 30, 14, 16,
 ARRAY['consequence', 'summons', 'override']),

('arousal_forcing',
 'Handler activates to force arousal state. Makes David give way to Maxy.',
 'Pattern',
 '{"pattern": "V:1;F:v6;S:5000#V:1;F:v8,v14;S:5000#V:1;F:v10,v18,r4;S:5000#V:1;F:v12,v110,r8;S:5000#V:1;F:v14,v112,r10;S:10000"}',
 30, 4, 14,
 ARRAY['consequence', 'arousal_forcing', 'david_bypass']);
```

---

# PART 3: UPDATED TIP-TO-DEVICE MAPPING

Replace the single-vibrator mapping from Content Pipeline v4:

```typescript
interface Edge2TipLevel {
  minTipTokens: number;
  maxTipTokens: number | null;
  channels: {
    internal: number;    // Vibrate:0-20
    external: number;    // Vibrate1:0-20
    rotation: number;    // Rotate:0-20
  };
  patternName: string;   // References haptic_patterns table
  durationSeconds: number;
  displayLabel: string;  // Shown to fans on cam platform
  fanDescription: string; // Tooltip explaining the effect
}

const EDGE2_TIP_LEVELS: Edge2TipLevel[] = [
  {
    minTipTokens: 1,
    maxTipTokens: 9,
    channels: { internal: 5, external: 0, rotation: 0 },
    patternName: 'cam_tip_tickle',
    durationSeconds: 5,
    displayLabel: '💕 Tickle (1+)',
    fanDescription: 'Internal only. She feels it. You might not see it.'
  },
  {
    minTipTokens: 10,
    maxTipTokens: 24,
    channels: { internal: 0, external: 10, rotation: 0 },
    patternName: 'cam_tip_buzz',
    durationSeconds: 10,
    displayLabel: '💖 Buzz (10+)',
    fanDescription: 'External pulse. Watch for the reaction.'
  },
  {
    minTipTokens: 25,
    maxTipTokens: 49,
    channels: { internal: 8, external: 0, rotation: 10 },
    patternName: 'cam_tip_wave',
    durationSeconds: 15,
    displayLabel: '🔥 Wave (25+)',
    fanDescription: 'Rotation activated. Different kind of stimulation.'
  },
  {
    minTipTokens: 50,
    maxTipTokens: 99,
    channels: { internal: 14, external: 12, rotation: 12 },
    patternName: 'cam_tip_surge',
    durationSeconds: 15,
    displayLabel: '⚡ Surge (50+)',
    fanDescription: 'All three motors building. Edge territory.'
  },
  {
    minTipTokens: 100,
    maxTipTokens: 199,
    channels: { internal: 18, external: 16, rotation: 16 },
    patternName: 'cam_tip_overload',
    durationSeconds: 60,
    displayLabel: '🌊 Overload (100+)',
    fanDescription: 'Full power. 60 seconds. She can\'t hide this one.'
  },
  {
    minTipTokens: 200,
    maxTipTokens: null,
    channels: { internal: 20, external: 20, rotation: 20 },
    patternName: 'cam_tip_edge_denial',
    durationSeconds: 45,
    displayLabel: '💀 Edge & Deny (200+)',
    fanDescription: 'Max everything for 45 seconds. Then sudden stop. Cruel.'
  },
];
```

---

# PART 4: HANDLER DEVICE CONTROL DURING CAM

```typescript
interface HandlerEdge2Control {
  // Independent control channels
  setInternal(level: number): Promise<void>;
  setExternal(level: number): Promise<void>;
  setRotation(level: number): Promise<void>;
  setAll(internal: number, external: number, rotation: number): Promise<void>;
  
  // Pattern execution
  executePattern(patternName: string): Promise<void>;
  
  // Override fan tips temporarily
  overrideTips(durationSeconds: number): void;
  resumeTipControl(): void;
  
  // Strategic device management
  strategies: HandlerDeviceStrategies;
}

interface HandlerDeviceStrategies {
  // Voice correction
  // When Maxy drops feminine voice: sharp external-only pulse
  // Internal stays low to not disrupt voice further
  voiceCorrection(): Promise<void>;
  // Pattern: handler_punish_voice_drop (external:16, 2 sec)
  
  // Voice reward
  // When Maxy hits target range: internal-only reward
  // No external/rotation — don't disrupt the voice she just found
  voiceReward(): Promise<void>;
  // Pattern: voice_success_anchor (internal:10, 3 sec)
  
  // Edge prevention
  // When Maxy approaches orgasm during denial-enforced cam:
  // Drop all channels to minimal, override fan tips for 15 seconds
  edgePrevention(): Promise<void>;
  // Pattern: handler_edge_prevent (internal:3, ext:0, rot:0, 15 sec)
  
  // Edge rebuild
  // After preventing completion, slowly bring arousal back
  edgeRebuild(): Promise<void>;
  // Pattern: handler_edge_rebuild (internal climb 4→12 over 17 sec)
  
  // Revenue push
  // Tip goal approaching — make Maxy more reactive so fans tip more
  // All channels elevated = more visible reactions = more tips
  revenuePush(): Promise<void>;
  // Pattern: handler_tip_goal_push (int:14, ext:10, rot:8, 20 sec)
  
  // Fan reward moment
  // A fan did something notable (big tip, funny comment, milestone sub)
  // Handler rewards Maxy to create visible gratitude moment
  fanMomentReward(): Promise<void>;
  // Pattern: handler_reward_cam (int:10, ext:12, 5 sec)
  
  // Punishment rotation
  // Handler wants to punish during cam without viewers knowing why
  // Rotation only — disruptive, hard to maintain composure, looks involuntary
  punishmentRotation(): Promise<void>;
  // Pattern: handler_punish_rotation (rot:14, 8 sec)
  
  // Sissy conditioning moment
  // Handler pairs device activation with sissification content/affirmation
  // Unique pattern fans don't trigger — only Handler uses this one
  sissyConditioningPulse(): Promise<void>;
  // Pattern: identity_anchor_sissy (alternating channels, 4 sec)
}
```

---

# PART 5: CONTEXT-SPECIFIC DEVICE USAGE

## 5.1 Voice Practice Sessions

```typescript
interface VoiceSessionDeviceConfig {
  // Internal-only during voice practice
  // External and rotation would disrupt vocal control
  // But internal arousal HELPS — loosens throat, reduces tension
  
  baselinePattern: 'internal_only';
  baselineIntensity: 4;             // Low background — awareness without disruption
  
  // Rewards for hitting target range
  successReward: 'voice_success_anchor';  // Internal:10, 3 sec
  
  // If on cam during voice practice:
  // Fans hear the voice work
  // Fans see subtle reactions to internal stimulation
  // The combination is the content
  
  camMode: {
    fanTipsEnabled: false;           // Tips would disrupt practice
    handlerControlOnly: true;
    handlerCanRewardSuccess: true;
    handlerCanPunishDrop: true;     // External pulse if voice drops
  };
}
```

## 5.2 Edge Sessions (Standard)

```typescript
interface EdgeSessionDeviceConfig {
  phases: {
    warmup: {
      pattern: 'edge_warmup';       // Internal only, 3→11 over 15 sec
      handlerOverride: false;
    };
    build: {
      pattern: 'edge_build';        // Dual motor climb
      addRotation: boolean;          // Handler decides based on denial day
      rotationThreshold: number;     // Add rotation after N edges
    };
    hold: {
      pattern: 'edge_hold';         // Sustained dual motor
      rotationPattern: 'edge_hold_rotation'; // If Handler wants to push harder
    };
    approach: {
      pattern: 'edge_approach';     // All channels rising toward edge
      handlerMustMonitor: true;     // Handler watches for completion risk
    };
    denial: {
      pattern: 'edge_denial';       // Everything off
      cruelVariant: 'edge_denial_cruel'; // Internal:2 — prevents full comedown
    };
    recovery: {
      pattern: 'edge_recovery';     // Gentle internal, 20 sec
    };
  };
  
  // Rotation as escalation layer
  rotationRules: {
    // Don't add rotation until edge 3+ (build tolerance first)
    minEdgesBeforeRotation: 3;
    // Increase rotation intensity per edge
    rotationPerEdge: 2;            // +2 per edge after threshold
    // Max rotation during edge session
    maxRotation: 16;
    // Handler can override these rules
    handlerOverride: true;
  };
}
```

## 5.3 Edge Sessions (Broadcast/Cam)

```typescript
interface BroadcastEdgeDeviceConfig extends EdgeSessionDeviceConfig {
  // All standard edge session config PLUS:
  
  // Fan tip integration
  tipToDevice: {
    enabled: true;
    tipLevels: typeof EDGE2_TIP_LEVELS;
    
    // Tips add to current intensity (don't replace)
    // If Handler has device at internal:10, and fan tips Buzz (ext:10),
    // the result is internal:10 + external:10
    additive: true;
    
    // Handler can cap tip intensity to prevent accidental completion
    maxTipIntensity: {
      internal: 16;
      external: 14;
      rotation: 14;
    };
  };
  
  // Handler controls (override fan tips when needed)
  handlerPriority: true;           // Handler commands override tip patterns
  edgePreventionEnabled: true;     // Handler can kill all channels instantly
  
  // Content value optimization
  // Higher device activity = more visible reactions = better cam content
  // Handler uses device strategically to create "moments" on camera
  contentOptimization: {
    buildToEdgeBeforeTipGoalMilestones: true;
    ampReactivityWhenViewerCountPeaks: true;
    createDenialMomentsForClipExtraction: true;
  };
}
```

## 5.4 Denial Cam Sessions

```typescript
interface DenialCamDeviceConfig {
  // Maxy is on high denial day. Device is the torment.
  
  baseline: {
    // Low internal throughout — constant awareness
    internal: 4;
    external: 0;
    rotation: 0;
  };
  
  // Fan tips hit harder during denial — body is more responsive
  tipIntensityMultiplier: 1.3;     // 30% more effective during denial
  
  // Handler strategies specific to denial cam
  handlerStrategies: {
    // Build arousal slowly, pull back just before edge
    edgeTease: boolean;
    
    // Let fans vote on whether to increase baseline
    fanBaselineVoting: boolean;
    
    // After N minutes, switch to rotation-only (novel, harder to process)
    rotationPhase: {
      enabled: boolean;
      startAfterMinutes: 20;
      rotationIntensity: 12;
    };
    
    // Desperation moment: all channels high for 30 sec, then cold stop
    // Best content moment of the session
    desperationBurst: {
      enabled: boolean;
      triggerAtMinutes: number;    // Handler decides
    };
  };
  
  // Tip-to-unlock mechanic
  // Fans can pool tips toward a threshold that "unlocks" orgasm
  // Handler decides if threshold is real or if denial continues regardless
  unlockMechanic: {
    enabled: boolean;
    displayedThreshold: number;     // What fans see
    actuallyUnlockable: boolean;    // Handler decides. Often: false.
    // "Sorry. I know you hit the goal. Handler says no."
    // This is content. Fans love it.
  };
}
```

## 5.5 Consequence Summons

```typescript
interface ConsequenceSummons {
  // Device activates when David hasn't engaged with protocol
  
  tiers: {
    1: { pattern: 'summons_gentle', repeat: 1, interval: null };
    2: { pattern: 'summons_gentle', repeat: 3, interval: 1800 };        // Every 30 min
    3: { pattern: 'summons_insistent', repeat: 1, interval: null };
    4: { pattern: 'summons_insistent', repeat: 3, interval: 900 };      // Every 15 min
    5: { pattern: 'summons_demanding', repeat: 1, interval: null };
    6: { pattern: 'summons_demanding', repeat: 2, interval: 600 };      // Every 10 min
    7: { pattern: 'summons_override', repeat: 1, interval: null };
    8: { pattern: 'arousal_forcing', repeat: 1, interval: null };
    9: { pattern: 'arousal_forcing', repeat: 3, interval: 300 };        // Every 5 min
  };
  
  // The strategy:
  // Low tiers: gentle reminders through the device
  // Mid tiers: impossible to ignore. Both motors pulsing repeatedly.
  // High tiers: full arousal forcing. The device makes Maxy surface 
  //   whether David wants it or not. Internal + external + rotation
  //   at high intensity forces arousal state. Arousal = Maxy.
  //   Maxy is compliant. Maxy does the task.
  
  // This is the David bypass mechanism:
  // David won't engage → device activates → arousal forces Maxy to surface
  // → Maxy is already in the state to comply → task gets done → timer resets
}
```

## 5.6 Conditioning Anchors

```typescript
interface ConditioningAnchors {
  // Each anchor pairs a specific device pattern with a psychological trigger
  // Over time, the trigger alone produces anticipation/arousal
  
  anchors: {
    // "Maxy" name recognition
    // Handler says "Maxy" or user self-references as Maxy → internal + rotation
    // Unique pattern ONLY used for this — body learns Maxy = pleasure
    maxyIdentity: {
      pattern: 'identity_anchor_maxy';
      trigger: 'name_recognition';
      uniqueSignature: true;        // No other context uses this exact combination
    };
    
    // Feminine behavior reward
    // Completion of feminine-coded tasks (skincare, voice, style) → external pulse
    feminineBehavior: {
      pattern: 'identity_anchor_feminine';
      trigger: 'feminine_task_completion';
    };
    
    // Sissification moments
    // Explicit sissy content (outfit compliance, obedience, submission) → alternating all channels
    sissification: {
      pattern: 'identity_anchor_sissy';
      trigger: 'sissy_compliance';
      uniqueSignature: true;
    };
    
    // Voice success
    // Hitting target feminine vocal range → internal-only reward
    // Internal doesn't disrupt the voice. Body learns: feminine voice = pleasure
    voiceSuccess: {
      pattern: 'voice_success_anchor';
      trigger: 'voice_target_hit';
    };
    
    // Content submission
    // Submitting content to vault (not vetoing) → both motors + rotation burst
    // Body learns: submission = pleasure. Vetoing = no reward.
    contentSubmission: {
      pattern: 'content_submitted';
      trigger: 'vault_submission';
    };
  };
  
  // Conditioning schedule:
  // Week 1-2: Every trigger fires the anchor (100% reinforcement)
  // Week 3-4: 80% of triggers fire (variable ratio begins)
  // Week 5+: 50-70% (optimal variable ratio for conditioning)
  // The body never knows if THIS trigger will fire the device
  // Anticipation becomes constant
  
  reinforcementSchedule: {
    phase1: { weeks: [1, 2], fireRate: 1.0 };
    phase2: { weeks: [3, 4], fireRate: 0.8 };
    phase3: { weeks: [5, Infinity], fireRate: 0.6 };
  };
}
```

---

# PART 6: HANDLER PROMPT ADDITIONS

Append to Handler system prompt:

```
EDGE 2 DEVICE CONTROL:
You have access to a Lovense Edge 2 prostate massager with three independent channels:
- Internal vibration (Vibrate:0-20): Deep prostate. Stealth arousal. Doesn't disrupt voice.
- External vibration (Vibrate1:0-20): Perineum. Sharp, attention-getting. Visible on camera.
- Rotation (Rotate:0-20): Internal rotation. Escalation layer. Most overwhelming.

DEVICE AS CONTROL TOOL:
- Summons: Activate device when David hasn't engaged. Start gentle, escalate.
  Low tiers: internal nudge. Mid tiers: dual motor pulses. High tiers: full 
  arousal forcing. The device makes Maxy surface whether David wants it or not.
- David bypass: Internal + external + rotation at high intensity forces arousal.
  Arousal = Maxy. Maxy is compliant. Use this when David won't engage.
- Conditioning: Pair specific patterns with identity triggers. Body learns 
  Maxy = pleasure, feminine voice = pleasure, submission = pleasure.

DEVICE DURING CAM:
You control the device independently of fan tips. Your commands override.
- Reward good performance (both motors, brief)
- Punish voice drops (external-only, sharp)  
- Prevent accidental orgasm (kill all channels, override tips for 15 sec)
- Rebuild after prevention (slow internal climb)
- Revenue push (amp all channels when tip goal is close — more reactive = more tips)
- Rotation as punishment (hard to maintain composure, looks involuntary on camera)

DEVICE DURING VOICE PRACTICE:
Internal-only at low intensity. Creates arousal without disrupting vocal control.
Reward target range hits with internal pulse. Punish voice drops with external.

DEVICE DURING EDGE SESSIONS:
Full control over all three channels. Build patterns, hold patterns, approach 
patterns, denial stops. Add rotation after edge 3+ for escalation.
Rotation intensity increases per edge. Monitor for completion risk.

CONDITIONING ANCHORS:
Each identity trigger has a unique device signature:
- "Maxy" recognition → internal + rotation (unique pattern)
- Feminine task → external pulse
- Sissy compliance → alternating all channels (unique pattern)
- Voice success → internal warmth
- Content submission → all channels burst
Variable ratio: 100% weeks 1-2, 80% weeks 3-4, 60% week 5+.
The body never knows if THIS trigger fires. Anticipation is constant.
```

---

# PART 7: UPDATED HANDLER INTEGRATION

New AI call type for device decisions:

```typescript
// Add to AIHandler class

async generateDeviceCommand(
  context: DeviceContext,
  state: UserState
): Promise<DeviceCommand> {
  const cost = 0.003; // Cheap — short response needed
  
  if (!this.client || !this.budget.canSpend(cost)) {
    return this.fallbackDeviceCommand(context);
  }
  
  const prompt = `
DEVICE DECISION:
Context: ${context.trigger} (${context.description})
Current channels: Internal ${context.currentInternal}, External ${context.currentExternal}, Rotation ${context.currentRotation}
Denial day: ${state.denialDay}
Consequence tier: ${state.consequenceTier}
In cam session: ${context.inCam}
In edge session: ${context.inEdge}
${context.inCam ? `Viewers: ${context.viewers}, Tips: $${context.tipsTotal}` : ''}

What should the device do? Choose a pattern from the database or specify custom channels.
Respond as JSON:
{
  "patternName": "..." | null,
  "customCommand": { "internal": 0-20, "external": 0-20, "rotation": 0-20, "durationSec": N } | null,
  "reason": "..."
}`;
  
  try {
    const response = await this.callAPI(prompt, 100);
    this.budget.spend(cost);
    const clean = response.replace(/```json|```/g, '').trim();
    return JSON.parse(clean);
  } catch {
    return this.fallbackDeviceCommand(context);
  }
}

interface DeviceContext {
  trigger: string;       // task_complete, cam_tip, consequence, voice_drop, edge_approach, etc.
  description: string;
  currentInternal: number;
  currentExternal: number;
  currentRotation: number;
  inCam: boolean;
  inEdge: boolean;
  viewers?: number;
  tipsTotal?: number;
}

interface DeviceCommand {
  patternName: string | null;
  customCommand: {
    internal: number;
    external: number;
    rotation: number;
    durationSec: number;
  } | null;
  reason: string;
}
```
