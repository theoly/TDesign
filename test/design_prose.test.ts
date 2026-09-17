import { describe, test, expect } from 'bun:test';
import { BUILTIN_DESIGN_PROSES, getBuiltinDesignProse } from '../src/styles/presets/designProse';

describe('CHK-OD-06 · 主题设计散文契约 (DESIGN.md)', () => {
  const REQUIRED_PRESETS = ['tech-blue', 'minimalist-slate', 'vibrant-violet', 'emerald-nature'];
  const REQUIRED_SECTIONS = [
    '# 1. 设计哲学与基调',
    '# 2. 60-30-10 配色法则',
    '# 3. 排版节奏与信息密度',
    '# 4. 严禁事项与负面约束'
  ];

  test('4 套内置预设散文物理存在且章节完备', () => {
    for (const presetId of REQUIRED_PRESETS) {
      const prose = BUILTIN_DESIGN_PROSES[presetId];
      expect(prose).toBeDefined();
      expect(prose.presetId).toBe(presetId);
      expect(prose.title).toBeTruthy();
      expect(prose.tone).toBeTruthy();
      expect(prose.source).toBe('builtin_preset');

      for (const section of REQUIRED_SECTIONS) {
        expect(prose.rulesMarkdown).toContain(section);
      }
    }
  });

  test('未知 presetId 自动安全回退至 tech-blue 默认散文', () => {
    const fallback = getBuiltinDesignProse('unknown-preset-xyz');
    expect(fallback.presetId).toBe('tech-blue');
    expect(fallback.title).toBe('现代科技质感');
  });

  test('CHK-OD-06 · enrichContext 优先读取工程自定义散文且标为 project_override', async () => {
    const { enrichContext } = await import('../src/services/ai/engine/context/contextEnricher');
    const customMarkdown = `# 自定义团队规范\n\n## 1. 设计哲学\n独具一格`;

    const result = enrichContext({
      rawPrompt: '新建页面',
      intent: 'create_screen',
      activeScreenId: null,
      screens: {},
      deviceProfile: 'pc',
      frameWidth: 1440,
      baseSystemPrompt: 'Base System Prompt',
      presetId: 'tech-blue',
      projectProseMarkdown: customMarkdown
    });

    expect(result.designProse).toBeDefined();
    expect(result.designProse?.source).toBe('project_override');
    expect(result.designProse?.title).toBe('自定义团队规范');
    const systemPrompt = result.messages.find((m) => m.role === 'system')?.content || '';
    expect(systemPrompt).toContain('### DESIGN SPECIFICATION (DESIGN.md - [工程覆盖]):');
    expect(systemPrompt).toContain('自定义团队规范');
  });

  test('CHK-OD-06 · 无工程自定义散文时，enrichContext 回退至内置预设散文且标为 builtin_preset', async () => {
    const { enrichContext } = await import('../src/services/ai/engine/context/contextEnricher');
    const { clearDesignProseCache } = await import('../src/services/ai/engine/context/designProseProvider');
    clearDesignProseCache();

    const result = enrichContext({
      rawPrompt: '新建页面',
      intent: 'create_screen',
      activeScreenId: null,
      screens: {},
      deviceProfile: 'pc',
      frameWidth: 1440,
      baseSystemPrompt: 'Base System Prompt',
      presetId: 'minimalist-slate'
    });

    expect(result.designProse).toBeDefined();
    expect(result.designProse?.source).toBe('builtin_preset');
    expect(result.designProse?.presetId).toBe('minimalist-slate');
    const systemPrompt = result.messages.find((m) => m.role === 'system')?.content || '';
    expect(systemPrompt).toContain('### DESIGN SPECIFICATION (DESIGN.md - [预设基准]):');
    expect(systemPrompt).toContain('极简性冷淡');
  });
});
