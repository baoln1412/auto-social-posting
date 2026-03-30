import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
async function test() {
  const q = sb.from('posts').select('id, article_url').eq('id', '53607d5b-23d5-46bb-a652-cd02759e676c');
  const res = await q.single();
  console.log('Exact Match:');
  console.log('Data:', res.data);
  console.log('Error:', res.error);

  const q2 = sb.from('posts').select('id, article_url').filter('id::text', 'like', '53607d5b%');
  const res2 = await q2.single();
  console.log('\nPrefix Match:');
  console.log('Data:', res2.data);
  console.log('Error:', res2.error);
}
test().catch(console.error);
