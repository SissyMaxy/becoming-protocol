/**
 * Generate today's content calendar immediately.
 * Run: npx tsx generate-now.ts
 */

import 'dotenv/config';

const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const USER_ID = process.env.USER_ID || '';

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env');
  process.exit(1);
}

if (!USER_ID) {
  console.error('Missing USER_ID in .env — run this SQL to get it:');
  console.error('  SELECT id FROM auth.users LIMIT 1;');
  console.error('Then add USER_ID=<uuid> to your .env file');
  process.exit(1);
}

async function main() {
  console.log('Generating content calendar for today...');
  console.log(`  Supabase: ${SUPABASE_URL}`);
  console.log(`  User: ${USER_ID}`);

  const response = await fetch(`${SUPABASE_URL}/functions/v1/handler-revenue`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${SERVICE_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      action: 'daily_batch',
      user_id: USER_ID,
    }),
  });

  const result = await response.json();
  console.log('\nResult:', JSON.stringify(result, null, 2));

  if (!response.ok) {
    console.error(`\nFailed: HTTP ${response.status}`);
    process.exit(1);
  }

  console.log('\nContent calendar generated. Run "npm run post" to post immediately.');
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
