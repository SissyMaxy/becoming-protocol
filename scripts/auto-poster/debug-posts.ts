import 'dotenv/config';
import { supabase } from './config';

async function main() {
  const now = new Date();
  console.log(`Current UTC time: ${now.toISOString()}`);
  console.log(`Current local: ${now.toLocaleString()}\n`);

  const { data, error } = await supabase
    .from('ai_generated_content')
    .select('id, platform, content_type, status, scheduled_at, content')
    .order('scheduled_at', { ascending: true });

  if (error) {
    console.error('Error:', error.message);
    return;
  }

  if (!data || data.length === 0) {
    console.log('NO ROWS in ai_generated_content table.');
    return;
  }

  console.log(`Total rows: ${data.length}\n`);
  for (const row of data) {
    const scheduledAt = new Date(row.scheduled_at);
    const isDue = scheduledAt <= now;
    console.log(`[${row.status}] ${row.platform} (${row.content_type})`);
    console.log(`  scheduled_at: ${row.scheduled_at}`);
    console.log(`  due now: ${isDue ? 'YES' : 'NO (future)'}`);
    console.log(`  content: "${(row.content || '').substring(0, 60)}..."\n`);
  }
}

main();
