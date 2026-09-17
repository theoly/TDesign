import techBlueRaw from './DESIGN.tech-blue.md?raw';
import minimalistSlateRaw from './DESIGN.minimalist-slate.md?raw';
import vibrantVioletRaw from './DESIGN.vibrant-violet.md?raw';
import emeraldNatureRaw from './DESIGN.emerald-nature.md?raw';
import { DesignProse } from '../../types/designSystem';

export const BUILTIN_DESIGN_PROSES: Record<string, DesignProse> = {
  'tech-blue': {
    presetId: 'tech-blue',
    title: '现代科技质感',
    tone: 'Linear / Stripe 工业科技风',
    rulesMarkdown: techBlueRaw,
    source: 'builtin_preset'
  },
  'minimalist-slate': {
    presetId: 'minimalist-slate',
    title: '极简性冷淡',
    tone: 'Apple / Vercel 极简单色风',
    rulesMarkdown: minimalistSlateRaw,
    source: 'builtin_preset'
  },
  'vibrant-violet': {
    presetId: 'vibrant-violet',
    title: '温润活力',
    tone: 'Airbnb / Duolingo 温暖圆润风',
    rulesMarkdown: vibrantVioletRaw,
    source: 'builtin_preset'
  },
  'emerald-nature': {
    presetId: 'emerald-nature',
    title: '极客赛博',
    tone: 'Cyber / High-Tech 高密数据大屏风',
    rulesMarkdown: emeraldNatureRaw,
    source: 'builtin_preset'
  }
};

/**
 * 获取指定主题的内置散文契约。若未指定或不存在，默认回退至 tech-blue
 */
export function getBuiltinDesignProse(presetId?: string): DesignProse {
  if (presetId && BUILTIN_DESIGN_PROSES[presetId]) {
    return BUILTIN_DESIGN_PROSES[presetId];
  }
  return BUILTIN_DESIGN_PROSES['tech-blue'];
}
