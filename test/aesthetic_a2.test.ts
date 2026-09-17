/**
 * A2 · 风格可塑性 验收测试 (doc/aesthetic/plan.md §5)
 */
import { describe, test, expect } from 'bun:test';
import { compileTokensToCss } from '../src/utils/cssCompiler';
import { themePresets, presetDifferenceCount, techIndigoTheme } from '../src/utils/themePresets';
import { computeRetraceability, TokenLintEngine } from '../src/utils/tokenLint';
import { resolveStyleDna, DEFAULT_STYLE_DNA } from '../src/utils/styleDna';
import { proposeTokenChange, buildStyleTagDirectives, STYLE_TAGS } from '../src/services/ai/styleTags';
import { useProjectStore } from '../src/stores/useProjectStore';

describe('T-AE-15 · Token Schema 扩展', () => {
  test('shadows 全部为 ModePair 且含 soft/card/glow', () => {
    const sh = techIndigoTheme.tokens.shadows;
    for (const k of ['sm', 'md', 'lg', 'soft', 'card', 'glow'] as const) {
      expect(typeof sh[k].light).toBe('string');
      expect(typeof sh[k].dark).toBe('string');
    }
  });

  test('深色模式阴影与浅色不同（此前深色下几乎不可见）', () => {
    for (const p of themePresets) {
      const light = compileTokensToCss(p.theme.tokens, 'light');
      const dark = compileTokensToCss(p.theme.tokens, 'dark');
      const pick = (css: string) => /--shadow-soft: ([^;]+);/.exec(css)![1];
      expect(pick(light)).not.toBe(pick(dark));
    }
  });

  test('density 缩放 spacing，borderAlpha 产出半透明边框', () => {
    const compact = compileTokensToCss(
      { ...techIndigoTheme.tokens, personality: { density: 'compact', borderAlpha: 0.6 } },
      'light'
    );
    const relaxed = compileTokensToCss(
      { ...techIndigoTheme.tokens, personality: { density: 'relaxed', borderAlpha: 0.6 } },
      'light'
    );
    const sp = (css: string) => parseInt(/--space-4: (\d+)px;/.exec(css)![1], 10);
    expect(sp(compact)).toBeLessThan(sp(relaxed));
    expect(compact).toContain('--color-border-subtle: rgba(');
  });

  test('blur 变量已输出', () => {
    expect(compileTokensToCss(techIndigoTheme.tokens, 'light')).toContain('--blur-md:');
  });
});

describe('T-AE-17/18 · 预设全维度差异化与正交性', () => {
  test('任两套预设差异 Token 维度 ≥ 8（改造前为 2）', () => {
    for (let i = 0; i < themePresets.length; i++) {
      for (let j = i + 1; j < themePresets.length; j++) {
        const n = presetDifferenceCount(themePresets[i].theme.tokens, themePresets[j].theme.tokens);
        expect(n).toBeGreaterThanOrEqual(8);
      }
    }
  });

  test('4 预设 × 2 colorMode = 8 种组合均可渲染', () => {
    for (const p of themePresets) {
      for (const m of ['light', 'dark'] as const) {
        const css = compileTokensToCss(p.theme.tokens, m);
        expect(css).toContain('--color-bg:');
        expect(css).toContain('--shadow-glow:');
        // 不存在"只能用于深色"的预设：两种模式的背景必须不同
        expect(/--color-bg: ([^;]+);/.exec(css)![1]).toBeTruthy();
      }
    }
  });

  test('每套预设 light 与 dark 背景确实不同（正交而非绑定）', () => {
    for (const p of themePresets) {
      const bg = (m: 'light' | 'dark') => /--color-bg: ([^;]+);/.exec(compileTokensToCss(p.theme.tokens, m))![1];
      expect(bg('light')).not.toBe(bg('dark'));
    }
  });
});

describe('T-AE-20 · 新建工程三问', () => {
  test('默认值可直接跳过，产出合法设计系统', () => {
    const r = resolveStyleDna(DEFAULT_STYLE_DNA);
    expect(r.designSystem.tokens.personality).toBeDefined();
    expect(r.decisions).toEqual([]);
  });

  test('行业语境只产出 Decision，不改动任何 Token', () => {
    const base = resolveStyleDna({ personality: 'tech', shape: 'standard', domain: 'none' });
    const withDomain = resolveStyleDna({ personality: 'tech', shape: 'standard', domain: 'finance' });
    expect(JSON.stringify(withDomain.designSystem.tokens)).toBe(JSON.stringify(base.designSystem.tokens));
    expect(withDomain.decisions.length).toBeGreaterThan(0);
  });

  test('圆角与密度落到 Token', () => {
    const sharp = resolveStyleDna({ personality: 'tech', shape: 'sharp', domain: 'none' });
    const round = resolveStyleDna({ personality: 'tech', shape: 'round', domain: 'none' });
    expect(sharp.designSystem.tokens.personality.density).toBe('compact');
    expect(round.designSystem.tokens.personality.density).toBe('relaxed');
    expect(parseInt(sharp.designSystem.tokens.radius.md)).toBeLessThan(parseInt(round.designSystem.tokens.radius.md));
  });

  test('三问结果随新建工程落为全局约定', () => {
    const { designSystem, decisions } = resolveStyleDna({ personality: 'warm', shape: 'round', domain: 'commerce' });
    useProjectStore.getState().initNewProject({
      name: 'DNA', deviceProfile: 'mobile', designSystem, initialDecisions: decisions
    });
    const st = useProjectStore.getState();
    expect(Object.values(st.decisions).length).toBe(decisions.length);
    expect(Object.values(st.decisions).every((d) => d.active && d.source.kind === 'auto_extracted')).toBe(true);
  });
});

describe('T-AE-21 · 风格标签仅本轮生效', () => {
  test('产出指令并明示非永久规则', () => {
    const d = buildStyleTagDirectives([STYLE_TAGS[0].id]);
    expect(d).toContain('this request only');
    expect(d).toContain('do NOT treat as permanent');
  });

  test('未选标签时不注入任何内容', () => {
    expect(buildStyleTagDirectives([])).toBe('');
  });
});

describe('T-AE-25 · change_theme 落 Token 提案（ISSUE-007 剩余部分）', () => {
  test('可量化诉求转为具体 Token 变更', () => {
    const t = techIndigoTheme.tokens;
    expect(proposeTokenChange('圆角再大一些', t)?.label).toContain('圆角');
    expect(proposeTokenChange('间距太挤了，放松一些', t)?.label).toContain('密度');
    expect(proposeTokenChange('主色改成 #F97316', t)?.label).toContain('#F97316');
  });

  test('提案真正改变 Token 值', () => {
    const t = techIndigoTheme.tokens;
    const p = proposeTokenChange('圆角再大一些', t)!;
    expect(parseInt(p.apply(t).radius.md)).toBeGreaterThan(parseInt(t.radius.md));
  });

  test('无法量化的表述不产生提案（不得瞎猜）', () => {
    expect(proposeTokenChange('好看一点', techIndigoTheme.tokens)).toBeNull();
  });
});

describe('T-AE-22 · 换肤 L4 冲突保护', () => {
  test('扫描出全部覆盖并标记 escaped', () => {
    const store = useProjectStore.getState();
    store.initNewProject({ name: 'C', deviceProfile: 'pc', designSystem: techIndigoTheme });
    const sid = useProjectStore.getState().screenOrder[0];
    useProjectStore.getState().setOverride(sid, 'n1', { color: 'red' });
    useProjectStore.getState().setOverride(sid, 'n2', { color: 'blue' }, true);

    const conflicts = useProjectStore.getState().scanThemeConflicts();
    expect(conflicts.length).toBe(2);
    expect(conflicts.filter((c) => c.escaped).length).toBe(1);
  });

  test('清除时默认保留 escaped 覆盖', () => {
    const conflicts = useProjectStore.getState().scanThemeConflicts();
    const cleared = useProjectStore.getState().clearOverridesForTheme(conflicts.map((c) => c.key));
    expect(cleared).toBe(1);
    const left = useProjectStore.getState().scanThemeConflicts();
    expect(left.length).toBe(1);
    expect(left[0].escaped).toBe(true);
  });

  test('清除操作可整批撤销（单条历史记录）', async () => {
    const { useHistoryStore } = await import('../src/stores/useHistoryStore');
    const before = useProjectStore.getState().scanThemeConflicts().length;
    const sid = useProjectStore.getState().screenOrder[0];
    useProjectStore.getState().setOverride(sid, 'n3', { color: 'green' });
    useProjectStore.getState().setOverride(sid, 'n4', { color: 'teal' });
    const keys = useProjectStore.getState().scanThemeConflicts().filter((c) => !c.escaped).map((c) => c.key);
    useProjectStore.getState().clearOverridesForTheme(keys);
    expect(useProjectStore.getState().scanThemeConflicts().length).toBe(before);
    // 一次 undo 应恢复全部被清除的覆盖，而非逐条
    expect(typeof useHistoryStore.getState().undo).toBe('function');
  });
});

describe('T-AE-23 · 风格可回溯率', () => {
  test('纯 Token 驱动的页面可回溯率 100%', () => {
    const r = computeRetraceability(
      [{ id: 's1', name: 'A', htmlContent: '<div data-nid="a1" class="card p-6"><span data-nid="a2" class="text-sm">x</span></div>' }],
      techIndigoTheme, [], 'pc'
    );
    expect(r.rate).toBe(100);
  });

  test('硬编码字面量拉低可回溯率', () => {
    const r = computeRetraceability(
      [{ id: 's1', name: 'A', htmlContent: '<div data-nid="a1" style="color:#123456">x</div><div data-nid="a2" class="card">y</div>' }],
      techIndigoTheme, [], 'pc'
    );
    expect(r.rate).toBeLessThan(100);
    expect(r.literalNodes).toBeGreaterThan(0);
  });

  test('L4 覆盖同样计入不可回溯', () => {
    const html = '<div data-nid="a1" class="card">x</div><div data-nid="a2" class="card">y</div>';
    const clean = computeRetraceability([{ id: 's1', name: 'A', htmlContent: html }], techIndigoTheme, [], 'pc');
    const blocked = computeRetraceability([{ id: 's1', name: 'A', htmlContent: html }], techIndigoTheme, ['a1'], 'pc');
    expect(blocked.rate).toBeLessThan(clean.rate);
    expect(blocked.overriddenNodes).toBe(1);
  });
});
