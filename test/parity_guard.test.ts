/**
 * Parity Guard · 样式真源与设计系统完备性守卫 (REQ-OD-02 / B2)
 *
 * 核心原则：base.css 是唯一的权威真源，派生白名单是缓存；
 * 本套件作为 CI 常驻防线，严格拦截以下 4 类漂移：
 * 1. 白名单与基座 CSS 类名漂移；
 * 2. base.css 中使用了未由 compileTokensToCss 声明的悬空 CSS 变量；
 * 3. 主题预设遗漏 A1/A2/B 槽位、未提供 ModePair 阴影或毛玻璃刻度；
 * 4. TokenLint 判定基准与白名单同源性。
 */
import { describe, test, expect } from 'bun:test';
import { getBaseCss, ALL_BASE_CSS, DeviceProfile } from '../src/styles/baseCss';
import { extractClassWhitelist, compileTokensToCss } from '../src/utils/cssCompiler';
import { themePresets } from '../src/utils/themePresets';
import { TokenLintEngine } from '../src/utils/tokenLint';

const ALL_THEMES = themePresets.map((p) => ({ name: p.name, theme: p.theme }));

describe('CHK-OD-01 · 真源与派生白名单一致性 (Whitelist Parity)', () => {
  const profiles: DeviceProfile[] = ['pc', 'mobile'];

  for (const profile of profiles) {
    test(`[${profile}] 派生白名单物理存在于 baseCss 中且无重复`, () => {
      const baseCss = getBaseCss(profile);
      const whitelist = extractClassWhitelist(baseCss);

      expect(whitelist.length).toBeGreaterThan(120);

      // 无重复类名
      const uniqueSet = new Set(whitelist);
      expect(uniqueSet.size).toBe(whitelist.length);

      // 白名单中每个类名都真实以 .class 开头存在于该档位样式表中
      for (const cls of whitelist) {
        expect(baseCss).toContain(`.${cls}`);
      }

      // 编辑器内部高亮类不应泄漏至派生白名单
      expect(whitelist).not.toContain('aidesign-selected');
      expect(whitelist).not.toContain('aidesign-hovered');
    });
  }
});

describe('CHK-OD-01 · CSS 变量双向对齐与零悬空守卫 (Zero Dangling Vars)', () => {
  // 从 base.css 提取所有用到的 var(--xxx)
  const varMatches = [...ALL_BASE_CSS.matchAll(/var\(\s*(--[a-zA-Z0-9_-]+)/g)].map((m) => m[1]);
  const usedVars = [...new Set(varMatches)].sort();

  test('基座 CSS 必须至少消耗核心变量', () => {
    expect(usedVars.length).toBeGreaterThan(30);
    expect(usedVars).toContain('--color-primary');
    expect(usedVars).toContain('--color-bg');
    expect(usedVars).toContain('--shadow-card');
  });

  for (const { name, theme } of ALL_THEMES) {
    for (const mode of ['light', 'dark'] as const) {
      test(`[${name}][${mode}] 所有在 base.css 中使用的 CSS 变量均必须由 compileTokensToCss 声明`, () => {
        const compiledCss = compileTokensToCss(theme.tokens, mode);
        const declaredMatches = [...compiledCss.matchAll(/(--[a-zA-Z0-9_-]+)\s*:/g)].map((m) => m[1]);
        const declaredVars = new Set(declaredMatches);

        const danglingVars = usedVars.filter((v) => !declaredVars.has(v));
        expect(danglingVars).toEqual([]);
      });
    }
  }
});

describe('CHK-OD-02 · 主题预设核心槽位完备性守卫 (Preset Slots Parity)', () => {
  const REQUIRED_SHADOW_KEYS = ['sm', 'md', 'lg', 'soft', 'card', 'glow'] as const;
  const REQUIRED_BLUR_KEYS = ['sm', 'md', 'lg'] as const;

  for (const { name, theme } of ALL_THEMES) {
    test(`[${name}] A1 槽位完备 (主色 500 与 100)`, () => {
      const c = theme.tokens.colors;
      expect(c.primary['500']).toBeDefined();
      expect(c.primary['100']).toBeDefined();
      expect(c.primary['500']).toMatch(/^#[0-9a-fA-F]{6}$/);
    });

    test(`[${name}] A2 槽位完备 (背景与表面 ModePair)`, () => {
      const c = theme.tokens.colors;
      for (const slot of ['background', 'surface', 'surfaceAlt'] as const) {
        expect(c[slot]).toBeDefined();
        expect(c[slot].light).toBeDefined();
        expect(c[slot].dark).toBeDefined();
      }
    });

    test(`[${name}] B 槽位完备 (文本、边框、状态色)`, () => {
      const c = theme.tokens.colors;
      for (const slot of ['textPrimary', 'textSecondary', 'border'] as const) {
        expect(c[slot]).toBeDefined();
        expect(c[slot].light).toBeDefined();
        expect(c[slot].dark).toBeDefined();
      }
      expect(c.success).toBeDefined();
      expect(c.warning).toBeDefined();
      expect(c.danger).toBeDefined();
    });

    test(`[${name}] 阴影必须是全量 ModePair (暗色模式不可缺失)`, () => {
      const s = theme.tokens.shadows;
      for (const k of REQUIRED_SHADOW_KEYS) {
        expect(s[k]).toBeDefined();
        expect(s[k].light).toBeTruthy();
        expect(s[k].dark).toBeTruthy();
      }
    });

    test(`[${name}] 毛玻璃与性格密度完备`, () => {
      const b = theme.tokens.blur;
      for (const k of REQUIRED_BLUR_KEYS) {
        expect(b[k]).toBeDefined();
      }

      const p = theme.tokens.personality;
      expect(['compact', 'standard', 'relaxed']).toContain(p.density);
      expect(p.borderAlpha).toBeGreaterThanOrEqual(0);
      expect(p.borderAlpha).toBeLessThanOrEqual(1);
    });
  }
});

describe('CHK-OD-01 · TokenLint 与派生白名单对齐', () => {
  test('不在白名单中的未知类名被精确捕获', () => {
    const dummyHtml = `<div data-nid="test1" class="card unknown-odd-class-123">Content</div>`;

    const report = TokenLintEngine.scan(dummyHtml, themePresets[0].theme, 'pc');
    const unknownClassIssues = report.issues.filter((i) => i.issueType === 'unknown_class');

    expect(unknownClassIssues.length).toBe(1);
    expect(unknownClassIssues[0].description).toContain('unknown-odd-class-123');
  });
});
