import { describe, it, expect } from 'bun:test';
import { enrichContext, detectRegionIsolationDirective } from '../src/services/ai/engine/context/contextEnricher';
import { PromptBuilder } from '../src/services/ai/promptBuilder';
import { techBlueTheme } from '../src/utils/themePresets';

describe('跨端专用语义区块词典与修改隔离体系 (Universal Region Lexicon & Isolation)', () => {
  it('CHK-URL-01: 移动端专用区块识别与隔离守卫注入（状态栏/系统栏不破坏下方 Hero 渐变大色块）', () => {
    // 模拟用户指令：“去掉顶部系统栏渐变色”
    const prompt = '去掉顶部系统栏渐变色';
    const directive = detectRegionIsolationDirective(prompt, 'mobile');

    expect(directive).toContain('专用语义区块修改与隔离守卫');
    expect(directive).toContain('系统状态栏 (Status Bar)');
    expect(directive).toContain('绝对不得外溢破坏或清除下方导航栏 (.appbar) 或 Hero 宣传区 (.hero-section) 的渐变大色块');
    expect(directive).toContain('作用域单向隔离铁律');

    // 在 enrichContext 修改画框流程中验证实际组装注入
    const enriched = enrichContext({
      rawPrompt: prompt,
      intent: 'modify_screen',
      activeScreenId: 'sc_01',
      screens: {
        sc_01: {
          id: 'sc_01',
          name: '认证信息',
          htmlContent: '<main><header class="bg-gradient-amber"><div class="status-bar">9:41</div><h1>真实，最有吸引力</h1></header></main>'
        }
      },
      deviceProfile: 'mobile',
      frameWidth: 390,
      baseSystemPrompt: 'MOCK_SYSTEM_PROMPT'
    });

    const userMessage = enriched.messages.find((m) => m.role === 'user')?.content || '';
    expect(userMessage).toContain('[专用语义区块修改与隔离守卫 (Universal Region Isolation Guard)]');
    expect(userMessage).toContain('系统状态栏 (Status Bar)');
  });

  it('CHK-URL-02: PC 端专用区块识别与作用域单向隔离（侧边栏、筛选栏、表格、分页器）', () => {
    // 场景 A: 修改侧边栏
    const directiveSidebar = detectRegionIsolationDirective('把左侧菜单背景调暗', 'pc');
    expect(directiveSidebar).toContain('侧边栏/导航菜单 (Sidebar)');
    expect(directiveSidebar).toContain('严禁外溢修改右侧主工作台或画布背景');

    // 场景 B: 筛选栏背景调整
    const directiveToolbar = detectRegionIsolationDirective('去掉筛选栏背景色', 'pc');
    expect(directiveToolbar).toContain('筛选栏/工具栏 (Toolbar)');
    expect(directiveToolbar).toContain('严禁破坏下方数据表格或外部大卡片背景');

    // 场景 C: 数据表格与分页器
    const directiveTable = detectRegionIsolationDirective('把数据表格加上分割线，分页器居右', 'pc');
    expect(directiveTable).toContain('数据表格 (Data Table)');
    expect(directiveTable).toContain('分页器 (Pagination)');
  });

  it('CHK-URL-03: 对比度与反色联动铁律（严禁白底白字不可读缺陷）', () => {
    const directive = detectRegionIsolationDirective('把状态栏背景变成白色', 'mobile');
    expect(directive).toContain('对比度与反色联动铁律');
    expect(directive).toContain('原反白文字 (.text-white, .text-inverse) 必须联动转为深色文字，严禁产生“白底白字”不可读缺陷');
  });

  it('CHK-URL-04: 美学规则确立移动端与 PC 端专用语义容器解耦原则', () => {
    // 移动端包含 .status-bar, .hero-section 解耦与 white-on-white 禁令
    const mobilePrompt = PromptBuilder.buildSystemPrompt({
      designSystem: techBlueTheme,
      deviceProfile: 'mobile',
      frameWidth: 390,
      intent: 'create_screen'
    });
    expect(mobilePrompt).toContain('.status-bar');
    expect(mobilePrompt).toContain('.hero-section');
    expect(mobilePrompt).toContain('SEMANTIC REGION DECOUPLING');
    expect(mobilePrompt).toContain('Never emit invisible white-on-white text');

    // PC 端包含 sidebar, toolbar, table 解耦与对比度禁令
    const pcPrompt = PromptBuilder.buildSystemPrompt({
      designSystem: techBlueTheme,
      deviceProfile: 'pc',
      frameWidth: 1440,
      intent: 'create_screen'
    });
    expect(pcPrompt).toContain('SEMANTIC REGIONS');
    expect(pcPrompt).toContain('sidebar');
    expect(pcPrompt).toContain('toolbar');
    expect(pcPrompt).toContain('Never emit white-on-white text');
  });

  it('CHK-URL-05: 提示词体积预算严格合规 (NFR-A01 审计无溢出)', () => {
    const pcPrompt = PromptBuilder.buildSystemPrompt({
      designSystem: techBlueTheme,
      decisions: [],
      deviceProfile: 'pc',
      frameWidth: 1440,
      intent: 'create_screen'
    });

    expect(pcPrompt.length).toBeGreaterThan(10000);
    expect(pcPrompt.length).toBeLessThan(12000);
  });
});
