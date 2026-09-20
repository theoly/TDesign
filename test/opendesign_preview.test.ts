import { describe, test, expect } from 'bun:test';
import { useProjectStore } from '../src/stores/useProjectStore';
import {
  themePresets,
  defaultTheme,
  neutralModernTheme,
  antBlueTheme,
  supabaseEmeraldTheme,
  techBlueTheme
} from '../src/utils/themePresets';
import { compileTokensToCss } from '../src/utils/cssCompiler';
import { presetDifferenceCount } from '../src/utils/themePresets';

describe('T-ODP-01 · 默认主题 Neutral Modern 与扩展预设库完备性', () => {
  test('defaultTheme 指向 neutralModernTheme 且各项 Token 完备', () => {
    expect(defaultTheme.id).toBe('theme-neutral-modern');
    expect(neutralModernTheme.name).toContain('Neutral Modern');

    // 调色板
    expect(neutralModernTheme.tokens.colors.primary['500']).toBe('#2563eb');
    expect(neutralModernTheme.tokens.colors.primary['50']).toBeDefined();
    expect(neutralModernTheme.tokens.colors.neutral['900']).toBeDefined();

    // ModePair
    expect(neutralModernTheme.tokens.colors.background.light).toBe('#f8fafc');
    expect(neutralModernTheme.tokens.colors.background.dark).toBe('#090d16');
    expect(neutralModernTheme.tokens.colors.surface.light).toBe('#ffffff');
    expect(neutralModernTheme.tokens.colors.surface.dark).toBe('#121826');

    // 阴影与圆角
    expect(neutralModernTheme.tokens.shadows.md.light).toBeDefined();
    expect(neutralModernTheme.tokens.shadows.md.dark).toBeDefined();
    expect(neutralModernTheme.tokens.radius.md).toBe('6px');

    // 性格参数
    expect(neutralModernTheme.tokens.personality.density).toBe('standard');
    expect(neutralModernTheme.tokens.personality.borderAlpha).toBeCloseTo(0.55, 2);
  });

  test('预设库扩充至 7 套，并包含 Ant Design 与 Supabase', () => {
    expect(themePresets.length).toBe(7);
    const ids = themePresets.map((p) => p.id);
    expect(ids).toContain('neutral-modern');
    expect(ids).toContain('tech-blue');
    expect(ids).toContain('vibrant-violet');
    expect(ids).toContain('minimalist-slate');
    expect(ids).toContain('emerald-nature');
    expect(ids).toContain('ant-blue');
    expect(ids).toContain('supabase-emerald');
  });

  test('全量预设两两之间差异维度均 >= 8 (严格拒绝换皮同质化)', () => {
    for (let i = 0; i < themePresets.length; i++) {
      for (let j = i + 1; j < themePresets.length; j++) {
        const a = themePresets[i].theme;
        const b = themePresets[j].theme;
        const diff = presetDifferenceCount(a.tokens, b.tokens);
        expect(diff).toBeGreaterThanOrEqual(8);
      }
    }
  });

  test('所有预设均能成功编译为合法的 CSS 变量且无空属性', () => {
    for (const p of themePresets) {
      for (const mode of ['light', 'dark'] as const) {
        const css = compileTokensToCss(p.theme.tokens, mode);
        expect(css).toContain('--color-primary:');
        expect(css).toContain('--color-bg:');
        expect(css).toContain('--color-surface:');
        expect(css).toContain('--color-text-primary:');
        expect(css).toContain('--radius-md:');
        expect(css).toContain('--shadow-md:');
        expect(css).not.toContain('undefined');
        expect(css).not.toContain('null');
      }
    }
  });
});

describe('T-ODP-03 · 纯净画布与 0 样张工作区生命周期', () => {
  test('initNewProject 默认创建 0 画框纯净工程 (方案 A)', () => {
    const id = useProjectStore.getState().initNewProject({
      name: '纯净新项目',
      deviceProfile: 'pc'
    });

    const state = useProjectStore.getState();
    expect(state.id).toBe(id);
    expect(state.screenOrder.length).toBe(0);
    expect(Object.keys(state.screens).length).toBe(0);
    expect(state.activeScreenId).toBeNull();
    // 默认主题生效为 neutralModernTheme
    expect(state.designSystem.id).toBe('theme-neutral-modern');
  });

  test('显式传入 createSpecimen: true 时仍可生成样张画框', () => {
    const id = useProjectStore.getState().initNewProject({
      name: '带样张项目',
      deviceProfile: 'pc',
      createSpecimen: true
    });

    const state = useProjectStore.getState();
    expect(state.id).toBe(id);
    expect(state.screenOrder.length).toBe(1);
    const screenId = state.screenOrder[0];
    expect(state.screens[screenId]?.metadata?.kind).toBe('specimen');
  });

  test('通过 addBlankScreen() 可一键创建业务空白画框并自动激活', () => {
    useProjectStore.getState().initNewProject({
      name: '空白创建测试',
      deviceProfile: 'pc'
    });

    expect(useProjectStore.getState().screenOrder.length).toBe(0);

    const blankId = useProjectStore.getState().addBlankScreen('首页画框');
    const updatedState = useProjectStore.getState();

    expect(updatedState.screenOrder.length).toBe(1);
    expect(updatedState.screenOrder[0]).toBe(blankId);
    expect(updatedState.activeScreenId).toBe(blankId);
    expect(updatedState.screens[blankId].name).toBe('首页画框');
    expect(updatedState.screens[blankId].metadata?.kind).toBeUndefined();
  });
});
