const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error("Missing Supabase credentials. Ensure NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are set.");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

const SPORTS_KEYWORDS = [
  'bóng đá', 'football', 'soccer', 'ngoại hạng', 'v-league', 'vleague', 'đội tuyển',
  'huấn luyện viên', 'cầu thủ', 'chuyển nhượng', 'bàn thắng', 'trận đấu', 'giải đấu',
  'fifa', 'uefa', 'champions league', 'cúp c1', 'world cup', 'euro', 'copa',
  'm.u', 'man utd', 'real madrid', 'barcelona', 'arsenal', 'chelsea', 'liverpool',
  'thắng', 'hòa', 'thua', 'vô địch', 'đá chính', 'dự bị'
];

async function seed() {
  console.log("🚀 Starting DB Seed for Total Football...");

  // 1. Delete all existing data to cleanly wipe out "Chuyen Uc Chut Chut"
  console.log("🧹 Wiping existing RSS feeds and Content Pages...");
  await supabase.from('rss_feeds').delete().neq('id', 'clear-all');
  await supabase.from('content_pages').delete().neq('id', 'clear-all');
  
  // 2. Insert Total Football Page
  console.log("📝 Creating Total Football content page...");
  const { data: pageResult, error: pageError } = await supabase
    .from('content_pages')
    .insert([{
      name: 'Total Football',
      system_prompt: 'You are an elite Vietnamese sports journalist. Your job is to analyze news articles about football (soccer). Produce accurate, high-energy updates summarizing matches, player transfers, and manager statements natively in Vietnamese.',
      user_prompt: 'Create a highly engaging Facebook post covering this football news. It should capture attention. MUST include: relevant match details, time, scoreline, and highlights if present.',
      platform_prompts: {
        facebook: 'Ensure you use sports emojis, clear formatting, and write beautifully in engaging Vietnamese.'
      },
      keyword_config: {
        tier1: SPORTS_KEYWORDS,
        tier2: [],
        useCrimeFilter: false,
        minScore: 3
      }
    }])
    .select('id')
    .single();

  if (pageError || !pageResult) {
    console.error("❌ Failed to create Total Football page:", pageError);
    process.exit(1);
  }

  const newPageId = pageResult.id;
  console.log(`✅ Total Football page successfully created! ID: ${newPageId}`);

  // 3. Insert Feeds
  console.log("🔗 Inserting default Vietnamese sports RSS feeds...");
  
  const feedsToInsert = [
    { page_id: newPageId, name: 'VNExpress', url: 'https://vnexpress.net/rss/the-thao.rss', feed_type: 'rss', enabled: true },
    { page_id: newPageId, name: 'The Thao 247', url: 'https://thethao247.vn/trang-chu.rss', feed_type: 'rss', enabled: true },
    { page_id: newPageId, name: 'Vietnamnet', url: 'https://vietnamnet.vn/rss/the-thao.rss', feed_type: 'rss', enabled: true },
    { page_id: newPageId, name: 'Znews', url: 'https://znews.vn/the-thao.rss', feed_type: 'rss', enabled: true },
    { page_id: newPageId, name: 'Thanh Nien', url: 'https://thanhnien.vn/rss/the-thao.rss', feed_type: 'rss', enabled: true },
    { page_id: newPageId, name: 'The Thao Van Hoa', url: 'https://thethaovanhoa.vn/the-thao.rss', feed_type: 'rss', enabled: true }
  ];

  const { data: feedResults, error: feedError } = await supabase
    .from('rss_feeds')
    .insert(feedsToInsert)
    .select('id, name');

  if (feedError) {
    console.error("❌ Failed to insert feeds:", feedError);
    process.exit(1);
  }

  console.log(`✅ Successfully inserted ${feedResults.length} RSS feeds.`);
  console.log("🎉 Seed finished successfully!");
}

seed().catch(err => {
  console.error("Fatal error:", err);
  process.exit(1);
});
