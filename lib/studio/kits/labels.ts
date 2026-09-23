/**
 * Every control's name, in Vietnamese.
 *
 * The kit editor shipped with `card.engine` as a label, because the form was generated from
 * the schema and the schema's keys are English identifiers. A schema key is a name for the
 * code, not for the person setting up a channel — so the editor reads names from here, and
 * tests/unit/labels.test.ts fails on any schema field that has no entry.
 *
 * Import-free on purpose: the editor is a client component.
 */

export interface Label {
  label: string;
  /** One line under the control. Only where the name alone leaves a real question. */
  hint?: string;
}

export const TAB_LABELS: Record<string, Label> = {
  identity: { label: 'Thương hiệu', hint: 'Tên, handle và logo hiện trên mọi video của kênh.' },
  post: { label: 'Nội dung', hint: 'Video nói gì, kể theo cách nào, dài bao nhiêu.' },
  card: { label: 'Ảnh chụp bài viết', hint: 'Tấm thẻ xuất hiện trong video và dưới bài đăng.' },
  voice: { label: 'Giọng đọc', hint: 'Ai đọc lời dẫn.' },
  captions: { label: 'Phụ đề', hint: 'Chữ chạy theo lời đọc.' },
  frame: { label: 'Khung hình', hint: 'Bố cục, nền và các cảnh của video.' },
  stickers: { label: 'Nhãn dán', hint: 'Nhân vật dán lên khung hình.' },
  signature: { label: 'Chữ ký kênh', hint: 'Dấu của kênh trên khung hình.' },
  music: { label: 'Nhạc nền', hint: 'Nhạc chạy dưới lời đọc.' },
};

/** Keyed `<tab>.<field>`. `preset` is handled by the editor itself and never listed. */
export const FIELD_LABELS: Record<string, Label> = {
  'identity.channelName': { label: 'Tên kênh' },
  'identity.handle': { label: 'Handle', hint: 'Ví dụ @desoul.posting — hiện ở chữ ký.' },
  'identity.avatar': { label: 'Ảnh đại diện' },
  'identity.logo': { label: 'Logo' },

  'post.format': { label: 'Dạng bài', hint: 'Khung bài mà lời dẫn bám theo.' },
  'post.length': { label: 'Độ dài bài' },
  'post.emoji': { label: 'Mật độ emoji' },
  'post.hashtags': { label: 'Số hashtag', hint: 'Bao nhiêu thẻ; còn thẻ nào thì ở ô dưới.' },
  'post.tags': { label: 'Hashtag cố định', hint: 'Các thẻ kênh luôn dùng, cách nhau bởi dấu cách.' },
  'post.topics': { label: 'Chủ đề của kênh', hint: 'Tối đa ba chủ đề, đưa thẳng vào câu lệnh viết bài.' },
  'post.language': {
    label: 'Ngôn ngữ video',
    hint: 'Bài tiếng Anh hoặc tiếng khác sẽ được dịch trước khi viết.',
  },
  'post.narration': {
    label: 'Cách kể',
    hint: 'Đọc nguyên văn: bài trong kho đã hoàn chỉnh, giữ nguyên. AI tự viết: viết lại dù đã có.',
  },
  'post.commentMode': { label: 'Chọn bình luận', hint: 'AI tự chọn theo lượt thích, hay bạn tự tick.' },

  'card.engine': {
    label: 'Kiểu thẻ',
    hint: 'Cổ điển: ảnh bài báo phủ chữ. Studio: nền phẳng theo giao diện bên dưới.',
  },
  'card.ratio': { label: 'Tỉ lệ khung' },
  'card.highlight': { label: 'Phần chữ tô màu', hint: 'Sau dấu hai chấm, hay mệnh đề đầu.' },
  'card.background': { label: 'Ảnh nền', hint: 'Lấy ảnh của bài báo, hay để nền phẳng.' },
  'card.theme': { label: 'Giao diện thẻ' },
  'card.font': { label: 'Font chữ trong thẻ' },
  'card.radius': { label: 'Bo góc thẻ (px)' },
  'card.titleSize': { label: 'Cỡ chữ trong thẻ (px)' },
  'card.highlightColor': { label: 'Màu chữ nhấn' },
  'card.width': { label: 'Độ rộng khối chữ (%)' },
  'card.y': { label: 'Vị trí dọc (%)', hint: '100 là sát đáy thẻ.' },
  'card.comments': {
    label: 'Cách hiện bình luận',
    hint: 'Chụp nhóm: tiêu đề và các bình luận đã chọn trên cùng một thẻ.',
  },

  'voice.provider': { label: 'Nhà cung cấp' },
  'voice.voiceId': { label: 'Giọng' },

  'captions.size': { label: 'Cỡ chữ (px)' },
  'captions.pos': { label: 'Vị trí dọc', hint: '0 là đỉnh khung, 0.95 là sát đáy.' },
  'captions.wordsPerCue': { label: 'Số từ mỗi dòng' },
  'captions.maxLines': { label: 'Số dòng tối đa' },
  'captions.case': { label: 'Viết hoa' },
  'captions.font': { label: 'Font phụ đề' },
  'captions.color': { label: 'Màu chữ' },
  'captions.highlightMode': { label: 'Hiệu ứng chữ', hint: 'Theo từ, nền khối, hoặc tắt.' },
  'captions.highlightColor': { label: 'Màu nhấn' },
  'captions.highlightBg': { label: 'Màu nền khối' },
  'captions.outlineWidth': { label: 'Viền chữ (px)' },
  'captions.shadow': { label: 'Đổ bóng' },
  'captions.band': { label: 'Nền sau phụ đề' },
  'captions.bandOpacity': { label: 'Độ mờ nền (%)' },

  'frame.layout': { label: 'Bố cục khung hình', hint: 'Thẻ ghim trên, hay các thẻ trượt nối tiếp.' },
  'frame.intro': { label: 'Cảnh mở đầu' },
  'frame.durationBand': { label: 'Dài tối đa', hint: 'Video vượt khoảng này thì cổng chặn lại.' },
  'frame.background': { label: 'Ảnh/video nền', hint: 'Cũng là ảnh bìa: nó là cảnh đầu tiên.' },

  'stickers.set': { label: 'Bộ sticker' },
  'stickers.where': { label: 'Hiện ở đâu', hint: 'Ảnh bìa (tĩnh) hoặc mở đầu (động).' },

  'signature.handle': { label: 'Chữ ký trôi (DVD)' },
  'signature.watermark': { label: 'Watermark chìm lặp kín' },

  'music.tier': { label: 'Mức nhạc nền' },
  'music.track': { label: 'Bản nhạc của bạn' },
};

/** Human names for enum values, where the stored value is not itself readable. */
export const VALUE_LABELS: Record<string, string> = {
  // card
  classic: 'Cổ điển',
  studio: 'Studio',
  'after-colon': 'Sau dấu hai chấm',
  'first-clause': 'Mệnh đề đầu',
  none: 'Không',
  article: 'Ảnh bài báo',
  sang: 'Sáng',
  toi: 'Tối',
  pastel: 'Pastel',
  bao: 'Báo giấy',
  group: 'Chụp nhóm (gộp 1 ảnh)',
  // post
  'hook-first': 'Mở bằng câu móc',
  listicle: 'Danh sách',
  qa: 'Hỏi-đáp',
  'quote-card': 'Thẻ trích dẫn',
  thread: 'Chuỗi bài',
  short: 'Ngắn',
  medium: 'Vừa',
  long: 'Dài',
  light: 'Thưa',
  heavy: 'Dày',
  vi: 'Tiếng Việt',
  en: 'Tiếng Anh',
  verbatim: 'Đọc nguyên văn',
  ai: 'AI tự viết',
  auto: 'AI tự chọn',
  manual: 'Tự chọn',
  // captions
  word: 'Theo từng từ',
  block: 'Nền khối',
  upper: 'CHỮ HOA',
  // frame
  'card-top': 'Thẻ ghim trên',
  continuous: 'Trượt nối tiếp',
  // music
  soft: 'Nhẹ',
  groove: 'Có nhịp',
  // voice
  'edge-tts': 'Edge TTS (miễn phí)',
};

export function labelFor(tab: string, field: string): Label {
  // Falling back to the key would put `highlightBg` on screen and hide the omission; a
  // visible "⚠" is a bug report the owner can send back.
  return FIELD_LABELS[`${tab}.${field}`] ?? { label: `⚠ ${field}` };
}

export function valueLabel(v: string): string {
  return VALUE_LABELS[v] ?? v;
}
