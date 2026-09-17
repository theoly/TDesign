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
  '按钮文案', '这一页', '这个页面', '当前页'
];

const MODIFY_VERBS = ['改', '修改', '重构', '替换', '调整', '优化', '重做', '换成'];
const CREATE_VERBS = ['新建', '生成', '做一个', '做个', '创建', '来一个', '设计一个', '加一个页面'];
const QUESTION_MARKS = ['？', '?'];
const QUESTION_TERMS = ['是什么', '为什么', '怎么做', '如何', '能不能', '可以吗', '支持吗', '有没有'];

export interface IntentResult {
  intent: GenerationIntent;
  /** 命中的判定依据，用于向用户回显与调试 */
  reason: string;
}

const hit = (text: string, terms: string[]) => terms.find((t) => text.includes(t));

/**
 * @param text        用户输入
 * @param hasActiveScreen 当前是否有选中画框（无选中时"修改"无从谈起）
 */
export function classifyIntent(text: string, hasActiveScreen: boolean): IntentResult {
  const t = text.trim();

  // 1. 提问：问号或疑问词，且不含明确的创建/修改动词
  const qMark = QUESTION_MARKS.some((m) => t.endsWith(m));
  const qTerm = hit(t, QUESTION_TERMS);
  if ((qMark || qTerm) && !hit(t, CREATE_VERBS)) {
    return { intent: 'question', reason: `疑问句式${qTerm ? `（"${qTerm}"）` : ''}` };
  }

  // 2. 主题调整：命中设计系统词汇，且未指向具体页面实体
  //    这是 ISSUE-007 的核心修复——必须先于 modify 判定，
  //    否则"把主色改成暖橙"会被 "改" 抢先判为修改画框。
  const themeTerm = hit(t, THEME_TERMS);
  const pageTerm = hit(t, PAGE_TERMS);
  if (themeTerm && !pageTerm) {
    return { intent: 'change_theme', reason: `设计系统词汇"${themeTerm}"且未指向具体页面` };
  }

  // 3. 显式创建
  const createVerb = hit(t, CREATE_VERBS);
  if (createVerb) {
    return { intent: 'create_screen', reason: `创建动词"${createVerb}"` };
  }

  // 4. 修改：需要有选中画框才成立
  const modifyVerb = hit(t, MODIFY_VERBS);
  if (modifyVerb && hasActiveScreen) {
    return { intent: 'modify_screen', reason: `修改动词"${modifyVerb}"且有选中画框` };
  }

  // 5. 兜底：新建画框
  return { intent: 'create_screen', reason: '默认新建' };
}
