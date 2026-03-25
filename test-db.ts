import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const supabase = createClient(url, key);

async function test() {
  const { data, error } = await supabase.from('posts').upsert(
    {
      page_id: 'a0000000-0000-0000-0000-000000000001',
      article_url: 'https://test.com/1',
      article_title: 'Test',
      source: 'TestSource',
      pub_date: new Date().toISOString(),
      image_url: null,
      generated_image_url: null,
      description: 'Desc',
      summary: 'Sum',
      emoji_title: '🚨 Emoji',
      facebook_text: 'FB text',
      platform_drafts: {},
      fetch_time: new Date().toISOString(),
    },
    { onConflict: 'article_url' }
  );
  console.log('Error:', error);
  console.log('Result:', data);
}
test();
