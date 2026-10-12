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

/**
 * The tabs the schema-driven field form renders, in the order the reference shows them.
 *
 * `layers` is deliberately not one: it is a canvas, not a list of fields, and a form that
 * tried to render an array of boxes as numeric inputs would be the worst of both.
 */
export const TAB_ORDER = [
  'identity',
  'post',
  'voice',
  'frame',
  'card',
  'captions',
  'signature',
  'stickers',
  'music',
];

/** Schema definitions edited by a screen of their own. Still named, still listed. */
export const CUSTOM_TABS = ['layers'];

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
  layers: { label: 'Chỉnh lớp', hint: 'Lớp của riêng bạn, đặt lên trên khung hình.' },
};

/** Keyed `<tab>.<field>`. `preset` is handled by the editor itself and never listed. */
export const FIELD_LABELS: Record<string, Label> = {
  'frame.story': { label: 'Kể bằng một ảnh', hint: 'Ảnh sắc nét lúc mở đầu, rồi thu nhỏ, rồi làm nền mờ cho chữ.' },
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
  'card.highlight': { label: 'Phần chữ tô màu', hint: 'Để AI chọn phần đáng chú ý, hay cắt theo dấu câu.' },
  'card.background': { label: 'Ảnh nền', hint: 'Lấy ảnh của bài báo, hay để nền phẳng.' },
  'card.theme': { label: 'Giao diện thẻ' },
  'card.font': { label: 'Font chữ trong thẻ' },
  'card.radius': { label: 'Bo góc thẻ (px)' },
  'card.titleSize': { label: 'Cỡ chữ trong thẻ (px)' },
  'card.highlightColor': { label: 'Màu chữ nhấn' },
  'card.width': { label: 'Độ rộng khối chữ (%)', hint: 'Kéo được trực tiếp ở bước Video.' },
  'card.y': { label: 'Vị trí dọc của tiêu đề (%)', hint: 'Bỏ trống là bám đáy thẻ. Kéo được trực tiếp ở bước Video.' },
  'card.logoX': { label: 'Logo — ngang (%)', hint: 'Chỉ bộ dựng ảnh gốc. Bỏ trống là giữ nguyên chỗ cũ.' },
  'card.logoY': { label: 'Logo — dọc (%)', hint: 'Chỉ bộ dựng ảnh gốc. Bỏ trống là giữ nguyên chỗ cũ.' },
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
  'stickers.fly': { label: 'Kiểu bay vào', hint: 'Chỉ áp dụng khi hiện ở mở đầu.' },
  'stickers.pick': {
    label: 'Cách chọn',
    hint: 'AI chọn: một lượt gọi đọc lời dẫn rồi chọn trong các tệp bạn đã tải lên (~$0.001).',
  },

  'signature.handle': {
    label: 'Chữ ký trôi (DVD)',
    hint: 'Handle ở tab Thương hiệu trôi quanh khung hình và bật lại ở mép.',
  },
  'signature.watermark': {
    label: 'Watermark chìm lặp kín',
    hint: 'Lưới chữ rất mờ phủ kín khung hình — chống chia sẻ lại, không che nội dung.',
  },

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
  'card-top': 'Một khung hình (thẻ ghim trên)',
  continuous: 'Một khung nối tiếp (thẻ trượt lên)',
  multi: 'Nhiều khung hình (mỗi cảnh một thẻ)',
  cheo: 'Bay chéo vào',
  nay: 'Thả nhẹ, nảy một cái',
  fixed: 'Dùng đúng tệp đã chọn',
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

/**
 * Some values mean different things on different fields. `ai` on `post.narration` is "AI
 * writes the script"; `ai` on `card.highlight` is "AI picks the words to colour". One flat
 * table cannot say both, so a field may override its own values.
 */
const FIELD_VALUE_LABELS: Record<string, Record<string, string>> = {
  'card.highlight': { ai: 'AI chọn' },
  // A volume, so the steps read as loudness rather than as genres. `none` and `soft` keep
  // the shared labels; only the two new steps are named here.
  'music.tier': { none: 'Tắt', soft: 'Nhỏ', default: 'Mặc định', loud: 'To' },
};

export function valueLabel(v: string, field?: string): string {
  return (field && FIELD_VALUE_LABELS[field]?.[v]) ?? VALUE_LABELS[v] ?? v;
}
