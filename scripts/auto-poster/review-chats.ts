/**
 * Review stored DM conversations for analysis.
 */
import { supabase } from './config';

async function reviewConversation(name: string) {
  const { data, error } = await supabase
    .from('paid_conversations')
    .select('id, message_direction, incoming_message, handler_response, created_at')
    .eq('platform', 'twitter')
    .eq('subscriber_id', name)
    .order('created_at', { ascending: true });

  if (error) {
    console.error(`Error fetching ${name}:`, error.message);
    return;
  }

  console.log(`\n${'='.repeat(60)}`);
  console.log(`=== ${name} (${data?.length || 0} messages) ===`);
  console.log('='.repeat(60));

  if (!data || data.length === 0) {
    console.log('No messages stored.');
    return;
  }

  for (const msg of data) {
    const time = new Date(msg.created_at).toLocaleString();
    if (msg.message_direction === 'inbound') {
      console.log(`[${time}] ${name}: ${msg.incoming_message || '(empty)'}`);
    } else if (msg.message_direction === 'outbound' && msg.handler_response) {
      console.log(`[${time}] MAXY: ${msg.handler_response}`);
    }
  }
}

(async () => {
  await reviewConversation('Goddess Katie 👑');
  await reviewConversation('suna');
  process.exit(0);
})();
