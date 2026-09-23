/**
 * What shape a post takes, as prompt fragments.
 *
 * Fragments and not code paths: the pipeline's generation step is one prompt, and a format
 * is a paragraph inserted into it. That is also why `outputPrompt` can be hashed — the same
 * settings produce the same string, so a re-preview of three drafted items is free.
 *
 * Pure and import-free: the setup screen shows these labels in the browser.
 */

export type FormatId = 'tin-ngan' | 'giai-thich' | 'danh-sach' | 'hoi-dap' | 'cau-chuyen';

export interface Format {
  id: FormatId;
  label: string;
  hint: string;
  fragment: string;
}

export const FORMATS: Format[] = [
  {
    id: 'tin-ngan',
    label: 'Tin ngắn',
    hint: 'Ai, ở đâu, khi nào, ảnh hưởng ra sao — đọc hết trong 30 giây.',
    fragment:
      'Viết như một bản tin ngắn: câu đầu nói thẳng chuyện gì vừa xảy ra, ' +
      'các câu sau trả lời ai · ở đâu · khi nào · ảnh hưởng tới người Việt ra sao. ' +
      'Không mở bài vòng vo, không câu hỏi tu từ ở đầu.',
  },
  {
    id: 'giai-thich',
    label: 'Giải thích',
    hint: 'Một quy định mới, kèm nó nghĩa là gì với người đang chờ hồ sơ.',
    fragment:
      'Giải thích một quy định hoặc thay đổi: nói quy định đó là gì, ' +
      'nó khác trước ở chỗ nào, và với người đang làm hồ sơ thì phải làm gì khác đi. ' +
      'Dùng ví dụ cụ thể thay cho định nghĩa.',
  },
  {
    id: 'danh-sach',
    label: 'Danh sách',
    hint: 'Ba đến năm ý, mỗi ý một dòng — dễ lướt.',
    fragment:
      'Trình bày thành 3–5 ý, mỗi ý một dòng bắt đầu bằng 🔹, mỗi ý một thông tin riêng ' +
      'chứ không diễn giải lại ý trước. Trước danh sách có một câu dẫn nói vì sao đáng đọc.',
  },
  {
    id: 'hoi-dap',
    label: 'Hỏi-đáp',
    hint: 'Câu hỏi người đọc thật sự hỏi, rồi trả lời gọn.',
    fragment:
      'Viết theo dạng hỏi–đáp: mỗi đoạn là một câu hỏi người đọc thật sự đặt ra, ' +
      'rồi câu trả lời ngắn và dứt khoát. Không hỏi những câu chỉ để lấy cớ trả lời.',
  },
  {
    id: 'cau-chuyen',
    label: 'Câu chuyện',
    hint: 'Một trường hợp cụ thể, kể theo trình tự thời gian.',
    fragment:
      'Kể một trường hợp cụ thể theo trình tự thời gian: chuyện bắt đầu thế nào, ' +
      'diễn biến, kết cục, và điều người đọc rút ra. Giữ giọng tường thuật, ' +
      'không thêm chi tiết mà nguồn không có.',
  },
];

export function formatById(id: string): Format {
  return FORMATS.find((f) => f.id === id) ?? FORMATS[0];
}

/**
 * Lengths that agree with CONTENT_SOP.md rather than fighting it.
 *
 * The SOP the pipeline already follows says body_text targets ~500 words, floor 450, cap
 * 600. A Studio band of "~220 từ" would reach the same generation step as a second, louder
 * instruction and shorten every post on the next 06:00 run — which is exactly what happened
 * the first time this shipped. `sop` is the default and emits no length line at all: Studio
 * says nothing about length unless the owner deliberately overrides the SOP.
 */
export const LENGTH_BANDS = {
  sop: { label: 'Theo SOP', hint: '~500 từ — mặc định', words: 0 },
  short: { label: 'Ngắn', hint: '~300 từ', words: 300 },
  medium: { label: 'Vừa', hint: '~500 từ', words: 500 },
  long: { label: 'Dài', hint: '~700 từ', words: 700 },
} as const;
export type LengthBand = keyof typeof LENGTH_BANDS;

export const TITLE_STYLES = {
  'emoji-caps': 'CHỮ HOA có emoji cờ — kiểu đang dùng',
  plain: 'Câu thường, không viết hoa toàn bộ',
  question: 'Đặt thành một câu hỏi',
} as const;
export type TitleStyle = keyof typeof TITLE_STYLES;

export interface OutputConfig {
  format: FormatId;
  length: LengthBand;
  tone: string;
  titleStyle: TitleStyle;
  cta: string;
}

export const DEFAULT_OUTPUT: OutputConfig = {
  format: 'tin-ngan',
  length: 'sop',
  tone: 'Bình tĩnh, rõ ràng, không giật gân.',
  titleStyle: 'emoji-caps',
  cta: '',
};

/**
 * The two rules that are shown but never offered as a switch.
 *
 * Citation, because a post that does not say where it came from cannot be checked. And the
 * Meta Community Standards three-part test, because this repo's compliance gate sits in this
 * same path — a setting that could turn it off would be a way round it.
 */
const ALWAYS =
  'Luôn dẫn nguồn ở cuối bài theo mẫu "Theo <tên nguồn>".\n' +
  'Bài phải đọc như tường thuật hoặc lên án, không bao giờ như một lời mời hay hướng dẫn làm theo; ' +
  'tuyệt đối không có thông tin liên hệ, giá cả hay đường dây. ' +
  'Phê phán chính sách, không hạ thấp con người.';

/** The prompt fragment this market's generation step runs with. Stable for equal settings. */
export function outputPrompt(cfg: OutputConfig): string {
  const f = formatById(cfg.format);
  const words = LENGTH_BANDS[cfg.length]?.words ?? 0;
  const lines = [
    f.fragment,
    // Silence, not a number, when the owner has not overridden the SOP.
    words ? `Độ dài khoảng ${words} từ.` : null,
    `Tiêu đề: ${TITLE_STYLES[cfg.titleStyle] ?? TITLE_STYLES['emoji-caps']}.`,
  ].filter(Boolean) as string[];
  if (cfg.tone.trim()) lines.push(`Giọng: ${cfg.tone.trim()}`);
  if (cfg.cta.trim()) lines.push(`Kết bài bằng: ${cfg.cta.trim()}`);
  lines.push(ALWAYS);
  return lines.join('\n');
}
