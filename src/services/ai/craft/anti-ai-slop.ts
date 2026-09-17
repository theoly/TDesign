import { CraftRule } from './types';

export const antiAiSlopCraft: CraftRule = {
  slug: 'anti-ai-slop',
  title: '反 AI 塑料感与审美负面清单 (Anti-AI-Slop Craft)',
  appliesTo: ['create_screen', 'modify_screen'],
  body: `- 严禁无节制堆叠炫目多色大范围渐变；若需渐变仅允许同色系微质感微渐变 (.bg-gradient-subtle)。
- 严禁等权重卡片海：禁止页面平铺十几张视觉分量、尺寸、阴影完全一致的卡片，必须有主次焦点与信息聚合。
- 严禁直接使用 emoji 符号充当界面功能图标（如 🏠 🔍 ⚙️）；图标必须使用内联 SVG (class="icon")。
- 严禁所有容器千篇一律施加过重阴影；默认优先使用 1px 微质感边框 (.border-subtle) 界定空间，次要容器无需阴影。`
};
