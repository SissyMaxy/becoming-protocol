/**
 * ContentPromptCard — today's Mommy-authored shoot/post/fan-response plan.
 */

import type { MommyContentPrompt } from '../../lib/life-as-woman/types'

interface Props {
  prompt: MommyContentPrompt
}

export function ContentPromptCard({ prompt }: Props) {
  return (
    <div style={{
      background: '#1a1408',
      border: '1px solid #4a3a14',
      borderRadius: 12,
      padding: 16,
      marginBottom: 12,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
        <div style={{ color: '#e8c890', fontSize: 14, fontWeight: 600 }}>
          Today · {prompt.for_date}
        </div>
        <div style={{ color: '#8a7040', fontSize: 12 }}>
          audience: <em>{prompt.audience_focus}</em>
        </div>
      </div>

      {prompt.shoot_direction && (
        <Section label="Shoot" text={prompt.shoot_direction} />
      )}
      {prompt.post_idea && (
        <Section label="Post" text={prompt.post_idea} />
      )}
      {prompt.fan_response_strategy && (
        <Section label="Fans" text={prompt.fan_response_strategy} />
      )}
    </div>
  )
}

function Section({ label, text }: { label: string; text: string }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ color: '#c0a060', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', marginBottom: 4 }}>
        {label}
      </div>
      <div style={{
        color: '#f0d8a8',
        fontSize: 14,
        lineHeight: 1.5,
        background: '#0a0804',
        padding: '8px 10px',
        borderRadius: 6,
        whiteSpace: 'pre-wrap',
      }}>
        {text}
      </div>
    </div>
  )
}
