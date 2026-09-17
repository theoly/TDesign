import { CraftRule } from './types';

export const typographyCraft: CraftRule = {
  slug: 'typography',
  title: '排版与文字阶梯 (Typography Craft)',
  appliesTo: ['create_screen', 'modify_screen'],
  body: `- 字阶必须保持清晰的跳跃层次：主标题 (text-2xl/text-3xl font-bold) -> 副标题/小节 (text-lg/text-base font-semibold) -> 正文 (text-sm/text-base) -> 辅助说明 (text-xs/text-sm text-muted)。
- 行高规则：正文与段落必须使用 leading-relaxed 或 leading-normal 保证阅读舒适度；单行徽标或按钮文本使用 leading-none 或 leading-tight。
- 字距规则：全部大写或小型大写字母文本必须施加额外字距 (letter-spacing >= 0.06em / tracking-wide)，避免密集拥挤。`
};
