import { DesignSystem, DesignSystemTokens } from '../types/designSystem';
import { themePresets } from './themePresets';

/**
 * StyleDNA：新建工程的轻量三问 (A2 / T-AE-20)。
 *
 * 不做多步问卷向导——新建工程是低频高阻力环节，问题超过 3~4 个会显著劝退；
 * 更重要的是**用户在尚未看到任何画面时，无法准确回答"你偏好什么留白节奏"**。
 * 三问的价值是把冷启动默认值从"随机"提升到"大致对路"，真正的风格收敛交给
 * 首屏样张页上的并排候选（§6.3 / StylePicker）。
 *
 * 关键设计：**可量化的落 Token，不可量化的落 Decision**——沿用 PRD §3.7 的分工，
 * 复用既有的 Decision 结构与 Prompt 注入链路，不引入任何新的持久化结构。
 */

export type Personality = 'minimal' | 'tech' | 'warm' | 'cyber';
export type Shape = 'sharp' | 'standard' | 'round';
export type Domain = 'none' | 'saas' | 'commerce' | 'finance' | 'tool';

export interface StyleDnaAnswers {
  personality: Personality;
  shape: Shape;
  domain: Domain;
}

export const DEFAULT_STYLE_DNA: StyleDnaAnswers = {
  personality: 'tech',
  shape: 'standard',
  domain: 'none'
};

export const PERSONALITY_OPTIONS: Array<{ value: Personality; label: string; hint: string; presetId: string }> = [
  { value: 'minimal', label: '极简克制', hint: '大留白、黑白对比、近乎无阴影', presetId: 'minimalist-slate' },
  { value: 'tech', label: '科技精致', hint: '靛蓝紫、主色微光、高信息密度', presetId: 'tech-blue' },
  { value: 'warm', label: '温暖活泼', hint: '珊瑚红、暖中性色、大圆角', presetId: 'vibrant-violet' },
  { value: 'cyber', label: '深色沉浸', hint: '电光青蓝、冷色辉光、毛玻璃', presetId: 'emerald-nature' }
];

export const SHAPE_OPTIONS: Array<{ value: Shape; label: string; hint: string }> = [
  { value: 'sharp', label: '锐利紧凑', hint: '小圆角 + 紧凑间距' },
  { value: 'standard', label: '标准', hint: '沿用风格自带的尺度' },
  { value: 'round', label: '大圆角宽松', hint: '大圆角 + 宽松间距' }
];

export const DOMAIN_OPTIONS: Array<{ value: Domain; label: string }> = [
  { value: 'none', label: '暂不指定' },
  { value: 'saas', label: 'SaaS 后台' },
  { value: 'commerce', label: '电商消费' },
  { value: 'finance', label: '金融数据' },
  { value: 'tool', label: '工具效率' }
];

/** 行业语境**不改动任何 Token**，只产出自然语言约定 */
const DOMAIN_DECISIONS: Record<Domain, string[]> = {
  none: [],
  saas: [
    '信息密度优先：列表与表格优先于大卡片，避免过度留白',
    '关键操作使用主色实心按钮，次级操作一律用 ghost 描边按钮',
    '状态一律用 badge-soft 表达，不用纯文字描述状态'
  ],
  commerce: [
    '商品图为视觉主体，卡片圆角不小于 lg，图片占位比例保持一致',
    '价格使用大字号加粗并与主色区分，促销信息用 badge-soft 标注',
    '主行动按钮（购买 / 加购）必须是全宽或显著大于其他按钮'
  ],
  finance: [
    '数字一律右对齐并使用等宽字体，保证纵向对位',
    '涨跌用语义色（success / danger）而非箭头图标单独表达',
    '关键指标卡必须包含标题、数值、同比变化三层信息'
  ],
  tool: [
    '优先使用紧凑间距，单屏承载尽可能多的可操作项',
    '所有图标按钮必须有文字标签或紧邻说明，不做纯图标界面',
    '危险操作使用 danger 语义色并与常规操作保持视觉距离'
  ]
};

const SHAPE_RADIUS: Record<Exclude<Shape, 'standard'>, DesignSystemTokens['radius']> = {
  sharp: { none: '0px', sm: '2px', md: '4px', lg: '6px', xl: '8px', full: '9999px' },
  round: { none: '0px', sm: '8px', md: '14px', lg: '20px', xl: '28px', full: '9999px' }
};

const SHAPE_DENSITY: Record<Shape, DesignSystemTokens['personality']['density'] | null> = {
  sharp: 'compact',
  standard: null,
  round: 'relaxed'
};

export interface StyleDnaResult {
  designSystem: DesignSystem;
  /** 自动生成的全局工程约定，用户随后可在设计约定面板中修改或停用 */
  decisions: string[];
}

export function resolveStyleDna(answers: StyleDnaAnswers): StyleDnaResult {
  const opt = PERSONALITY_OPTIONS.find((o) => o.value === answers.personality) ?? PERSONALITY_OPTIONS[1];
  const preset = themePresets.find((p) => p.id === opt.presetId) ?? themePresets[1];
  const base = preset.theme;

  const radius = answers.shape === 'standard' ? base.tokens.radius : SHAPE_RADIUS[answers.shape];
  const density = SHAPE_DENSITY[answers.shape] ?? base.tokens.personality.density;

  const designSystem: DesignSystem = {
    ...base,
    tokens: {
      ...base.tokens,
      radius,
      personality: { ...base.tokens.personality, density }
    }
  };

  const decisions: string[] = [...DOMAIN_DECISIONS[answers.domain]];
  if (answers.shape === 'round') decisions.push('圆角风格偏大：按钮与输入框使用 r-lg 及以上，卡片不小于 r-xl');
  if (answers.shape === 'sharp') decisions.push('圆角风格锐利：一律使用 r-sm / r-md，不使用大圆角');
  if (answers.personality === 'minimal') decisions.push('层次依靠留白与细边框表达，避免使用重阴影');
  if (answers.personality === 'cyber') decisions.push('深色界面优先，表面叠加毛玻璃与冷色辉光');

  return { designSystem, decisions };
}
