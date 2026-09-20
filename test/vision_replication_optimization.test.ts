import { describe, it, expect } from 'bun:test';
import { PromptBuilder } from '../src/services/ai/promptBuilder';
import { enrichContext } from '../src/services/ai/engine/context/contextEnricher';
import { techBlueTheme } from '../src/utils/themePresets';
import { extractClassWhitelist } from '../src/utils/cssCompiler';
import { getBaseCss } from '../src/styles/baseCss';
import { TokenLintEngine } from '../src/utils/tokenLint';

describe('图片高保真复刻流程与算法优化测试 (Vision Replication Optimization)', () => {
  it('CHK-F-01: 当请求包含图片附件 (hasAttachment: true) 时，自动抑制通用 Few-Shot 范例代码', () => {
    // 场景 A: 无附件纯文本新建 -> 正常包含 REFERENCE EXAMPLE
    const promptWithoutAttachment = PromptBuilder.buildSystemPrompt({
      designSystem: techBlueTheme,
      deviceProfile: 'mobile',
      frameWidth: 390,
      intent: 'create_screen',
      hasAttachment: false
    });
    expect(promptWithoutAttachment).toContain('### REFERENCE EXAMPLE');

    // 场景 B: 附带参考图 -> 必须抑制 REFERENCE EXAMPLE，防止范例中的锁头图标和 .cta-fixed 污染输出
    const promptWithAttachment = PromptBuilder.buildSystemPrompt({
      designSystem: techBlueTheme,
      deviceProfile: 'mobile',
      frameWidth: 390,
      intent: 'create_screen',
      hasAttachment: true
    });
    expect(promptWithAttachment).not.toContain('### REFERENCE EXAMPLE');
    // 同时保证 output_contract 依旧为末尾
    expect(promptWithAttachment).toContain('### OUTPUT CONTRACT');
  });

  it('CHK-F-02: 当包含图片附件时，contextEnricher 注入完整的《高保真视觉反推协议》', () => {
    const enriched = enrichContext({
      rawPrompt: '按附件图片精准创建/修改页面',
      intent: 'create_screen',
      activeScreenId: null,
      screens: {},
      deviceProfile: 'mobile',
      frameWidth: 390,
      baseSystemPrompt: 'SYSTEM_PROMPT_MOCK',
      attachment: {
        name: 'login_screenshot.png',
        dataUrl: 'data:image/png;base64,mockBase64Data'
      }
    });

    const userMessage = enriched.messages.find((m) => m.role === 'user');
    expect(userMessage).toBeDefined();
    expect(userMessage?.imageUrl).toBe('data:image/png;base64,mockBase64Data');

    const content = userMessage?.content || '';
    // 包含协议核心指引
    expect(content).toContain('VISUAL REVERSE-ENGINEERING & REPLICATION PROTOCOL');
    expect(content).toContain('GLOBAL CANVAS & AMBIENT MOOD');
    expect(content).toContain('HERO SECTION VS. BOTTOM SHEET DECOUPLING');
    expect(content).toContain('BUTTON PLACEMENT & IN-FLOW INTEGRITY');
    expect(content).toContain('STRICT ANTI-HALLUCINATION');
    expect(content).toContain('FEATURE CARDS & SOCIAL PROOF');
  });

  it('CHK-F-03: 移动端美学规范更新：表单内按钮遵照原图位置排版，解除对 .cta-fixed 的绝对强制', () => {
    const promptMobile = PromptBuilder.buildSystemPrompt({
      designSystem: techBlueTheme,
      deviceProfile: 'mobile',
      frameWidth: 390,
      intent: 'create_screen'
    });

    // 依然保留必要契约
    expect(promptMobile).toContain('SINGLE COLUMN ONLY');
    expect(promptMobile).toContain('NO HOVER STATES');
    expect(promptMobile).toContain('cta-fixed');

    // 增加了卡片内流式表单按钮指引与设计参考对齐
    expect(promptMobile).toContain('CTA BUTTON PLACEMENT');
    expect(promptMobile).toContain('ALWAYS match the button placement in the reference');
  });

  it('CHK-F-04: 基座样式白名单完整覆盖：新增的氛围渐变、底部面板与细分隔线', () => {
    const mobileWhitelist = extractClassWhitelist(getBaseCss('mobile'));
    const pcWhitelist = extractClassWhitelist(getBaseCss('pc'));

    const newClasses = [
      'bg-gradient-soft',
      'bg-ambient-warm',
      'bg-ambient-cool',
      'sheet-card',
      'divider-v'
    ];

    for (const cls of newClasses) {
      expect(mobileWhitelist).toContain(cls);
      expect(pcWhitelist).toContain(cls);
    }

    // TokenLint 扫描包含这些新类的 HTML 应 0 报错
    const sampleHtml = `
      <main class="col bg-ambient-warm">
        <div class="sheet-card p-6 col gap-4">
          <div class="row items-center">
            <span>+86</span>
            <span class="divider-v"></span>
            <input class="input" placeholder="请输入手机号" />
          </div>
          <button class="btn btn-primary">立即登录</button>
        </div>
      </main>
    `;

    const report = TokenLintEngine.scan(sampleHtml, techBlueTheme, 'mobile');
    const unknownClasses = report.issues.filter((i) => i.issueType === 'unknown_class');
    const literalColors = report.issues.filter((i) => i.issueType === 'literal_color');

    expect(unknownClasses.length).toBe(0);
    expect(literalColors.length).toBe(0);
  });

  it('CHK-F-05: 纯文本场景向后兼容性验证：不带附件时保持原有 Few-Shot 与美学段落完整', () => {
    const prompt = PromptBuilder.buildSystemPrompt({
      designSystem: techBlueTheme,
      deviceProfile: 'mobile',
      frameWidth: 390,
      intent: 'create_screen'
    });

    expect(prompt).toContain('### REFERENCE EXAMPLE');
    expect(prompt).toContain('### CRAFT REFERENCES');
    expect(prompt).toContain('### CLASS WHITELIST');
  });
});
