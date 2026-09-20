import type { GenerationIntent } from './promptBuilder';

/**
 * 用户意图分类 (A1 / T-AE-11)。
 *
 * 此前 ChatDrawer 用 `textToSend.includes('改')` 判定新建/修改，
 * `buildIntentAnalysisPrompt` 定义的四种意图从未被调用（ISSUE-007）。
 * 直接后果：用户说"把主题改成暖色一点"会命中 includes('改') 被判为修改画框，
 * 于是**重写当前画框而非调整 Token**——用户以为在改主题，实际画框被改掉了。
 *
 * 本模块采用规则分类：即时、零成本、可单测。之所以不先上 LLM 分析，是因为
 * 它会给每条消息增加一次阻塞往返，而四分流落库与候选确认卡片属 A2 范畴
 * （T-AE-33 / T-AE-34），届时再引入模型判定收益更实在。
 *
 * ⚠️ 当前边界：change_theme 与 question 能被**识别**并回显给用户，但尚未接入
 * 各自的处理链路——落 Token 与候选确认在 A2 完成。见 doc/aesthetic/spec.md §8.2。
 */

/** 可量化的设计系统词汇：出现这些词通常意味着在谈主题而非页面内容 */
const THEME_TERMS = [
  '主题', '配色', '色调', '主色', '色值', '换色', '调色',
  '圆角', '字号', '字体大小', '行高', '间距', '留白', '阴影', '边框粗细',
  '设计系统', 'token', '风格', '色板', '暗色', '深色模式', '浅色模式'
];

/** 页面实体词：出现这些词说明在谈具体页面/组件，而非全局主题 */
const PAGE_TERMS = [
  '页面', '画框', '画板', '登录页', '首页', '列表', '表单', '弹窗', '卡片',
  '按钮文案', '这一页', '这个页面', '当前页', '导航栏', '顶栏', '底栏', '页头', '页脚'
];

const MODIFY_VERBS = [
  '改', '修改', '重构', '替换', '调整', '优化', '重做', '换成',
  '填充', '更新', '补充', '加上', '去掉', '删除', '设置成', '设置为', '完善', '微调'
];
const CREATE_VERBS = ['新建', '生成', '做一个', '做个', '创建', '来一个', '设计一个', '加一个页面', '新建画框', '设计新页面'];
const QUESTION_MARKS = ['？', '?'];
const QUESTION_TERMS = ['是什么', '为什么', '怎么做', '如何', '能不能', '可以吗', '支持吗', '有没有'];

export interface IntentResult {
  intent: GenerationIntent;
  /** 命中的判定依据，用于向用户回显与调试 */
  reason: string;
  /** 是否针对具体元素的定向修改 */
  isElementTargeted?: boolean;
}

const hit = (text: string, terms: string[]) => terms.find((t) => text.includes(t));

/**
 * @param text        用户输入
 * @param hasActiveScreen 当前是否有选中画框（无选中时"修改"无从谈起）
 */
export function classifyIntent(text: string, hasActiveScreen: boolean): IntentResult {
  const t = text.trim();

  // 0. 强特征优先：如果用户引用了元素（Add to Chat 功能注入的 [引用元素 nid=...] 标识）
  // 必须判定为修改画框中的指定元素，绝不能兜底为新建画框
  if (t.includes('[引用元素') || (t.includes('nid="') && t.includes('元素片段:'))) {
    return {
      intent: 'modify_screen',
      reason: '检测到精准元素引用上下文',
      isElementTargeted: true
    };
  }

  // 1. 提问：问号或疑问词，且不含明确的创建/修改动词
  const qMark = QUESTION_MARKS.some((m) => t.endsWith(m));
  const qTerm = hit(t, QUESTION_TERMS);
  if ((qMark || qTerm) && !hit(t, CREATE_VERBS) && !hit(t, MODIFY_VERBS)) {
    return { intent: 'question', reason: `疑问句式${qTerm ? `（"${qTerm}"）` : ''}` };
  }

  // 2. 主题调整：命中设计系统词汇，且未指向具体页面实体
  //    这是 ISSUE-007 的核心修复——必须先于 modify 判定，
  //    否则"把主色改成暖橙"会被 "改" 抢先判为修改画框。
  const themeTerm = hit(t, THEME_TERMS);
  const pageTerm = hit(t, PAGE_TERMS);
  if (themeTerm && !pageTerm && !t.includes('@')) {
    return { intent: 'change_theme', reason: `设计系统词汇"${themeTerm}"且未指向具体页面` };
  }

  // 2.5 混合/双态词（如“创建/修改”）：在有引用画框时修改优先，无引用画框时新建优先 (BR-RSM-01)
  if (t.includes('创建/修改')) {
    if (hasActiveScreen || t.includes('@')) {
      return { intent: 'modify_screen', reason: '存在活跃画框引用且包含“创建/修改”双态指令，按修改执行' };
    }
    return { intent: 'create_screen', reason: '未引用画框且包含“创建/修改”双态指令，按新建执行' };
  }

  // 2.7 显式强修改指令（如“按附件图片精准修改页面”、“修改当前页面”）：
  // 无论是否选中画框，明确指出修改页面即锁定为修改意图，阻止静默退回新建
  const explicitModifyKeywords = [
    '按附件图片精准修改', '按附件图片修改', '精准修改', '按图修改',
    '修改页面', '修改当前', '修改此', '修改该', '修改画框', '修改本页',
    '修改这一页', '替换当前', '更新当前'
  ];
  const explicitModifyHit = explicitModifyKeywords.find((kw) => t.includes(kw));
  if (explicitModifyHit && !t.includes('新建页面') && !t.includes('新建画框') && !t.includes('创建新页面')) {
    return { intent: 'modify_screen', reason: `显式修改指令"${explicitModifyHit}"` };
  }

  // 3. 显式创建：明确要求创建新画框/页面
  const createVerb = hit(t, CREATE_VERBS);
  if (createVerb) {
    return { intent: 'create_screen', reason: `创建动词"${createVerb}"` };
  }

  // 4. 显式修改已有页面：
  // a) 命中修改动词且有活跃画框
  const modifyVerb = hit(t, MODIFY_VERBS);
  if (modifyVerb && hasActiveScreen) {
    return { intent: 'modify_screen', reason: `修改动词"${modifyVerb}"且有选中画框` };
  }

  // b) 输入中通过 @ 引用了具体画框，且命中修改动词
  if (t.includes('@') && modifyVerb) {
    return { intent: 'modify_screen', reason: `引用了已有画框并要求修改（"${modifyVerb}"）` };
  }

  // 5. 兜底：
  // 无明确修改指令时一律判定为新建页面，杜绝无修改动词时误重写或误弹出候选比选
  return { intent: 'create_screen', reason: '默认新建' };
}
