import { describe, test, expect } from 'bun:test';
import { NidEngine } from '../src/utils/nidEngine';
import { TokenLintEngine } from '../src/utils/tokenLint';
import { techBlueTheme } from '../src/utils/themePresets';
import { PromptBuilder } from '../src/services/ai/promptBuilder';
import { ImageGenerator } from '../src/utils/imageGenerator';

describe('TDesign Core Engines', () => {
  describe('NidEngine (PRD §3.6.1 / D11)', () => {
    test('generateNid produces 8-char alphanumeric string', () => {
      const nid1 = NidEngine.generateNid();
      const nid2 = NidEngine.generateNid();
      expect(nid1.length).toBe(8);
      expect(nid2.length).toBe(8);
      expect(nid1).not.toBe(nid2);
    });

    test('injectNids preserves existing nids and injects missing ones', () => {
      const input = `<div class="card"><button data-nid="existing1">Click</button><span>Label</span></div>`;
      const output = NidEngine.injectNids(input);
      expect(output).toContain('data-nid="existing1"');
      expect(output).toMatch(/<div data-nid="[a-z0-9]{8}" class="card">/);
      expect(output).toMatch(/<span data-nid="[a-z0-9]{8}">Label<\/span>/);
    });

    test('stripInternalAttributes cleanses all engine attributes for export', () => {
      const input = `<div data-nid="abc12345" data-component-id="comp-1" data-component-instance="inst-1" data-asset-id="ast-1" class="card">Hello</div>`;
      const output = NidEngine.stripInternalAttributes(input);
      expect(output).not.toContain('data-nid');
      expect(output).not.toContain('data-component');
      expect(output).not.toContain('data-asset');
      expect(output).toBe('<div class="card">Hello</div>');
    });
  });

  describe('TokenLintEngine (PRD §3.5.4)', () => {
    test('detects hardcoded styling escape values', () => {
      const html = `<div style="color: #ff0000; font-size: 19px; padding: 13px;">Hardcoded</div>`;
      const report = TokenLintEngine.scan(html, techBlueTheme);
      expect(report.issues.length).toBeGreaterThan(0);
      expect(report.complianceRate).toBeLessThan(100);
    });

    test('autoFix transforms inline styles to Token CSS variables', () => {
      const html = `<div style="color: #ff0000; border-radius: 9px;">Content</div>`;
      const fixed = TokenLintEngine.autoFix(html);
      expect(fixed).toContain('var(--color-primary)');
      expect(fixed).toContain('var(--radius-md)');
    });
  });

  describe('PromptBuilder (PRD §3.2.7 / §3.5.5 / §3.7.4)', () => {
    test('injects active project components, decisions, and system constraints', () => {
      const prompt = PromptBuilder.buildSystemPrompt({
        designSystem: techBlueTheme,
        deviceProfile: 'pc',
        frameWidth: 1440,
        components: [
          {
            id: 'comp-1',
            name: 'Primary Button 按钮',
            templateHtml: '<button class="btn btn-primary r-md"><span>OK</span></button>',
            createdAt: 1000,
            updatedAt: 1000
          }
        ],
        decisions: [
          {
            id: 'dec-1',
            text: '所有卡片必须带有阴影',
            scope: 'global',
            active: true,
            source: { kind: 'manual', createdAt: 1000 }
          }
        ]
      });

      expect(prompt).toContain('Primary Button 按钮');
      expect(prompt).toContain('comp-1');
      expect(prompt).toContain('所有卡片必须带有阴影');
      expect(prompt).toContain('REUSABLE PROJECT COMPONENTS');
    });

    test('parses explicit @ artboard mentions in user messages', () => {
      const mentions = PromptBuilder.parseMentions('请参考 @登录注册页 (Login) 生成一个修改密码页面');
      expect(mentions.length).toBe(1);
      expect(mentions[0]).toBe('登录注册页 (Login)');
    });
  });

  describe('ImageGenerator (PRD §3.4.1)', () => {
    test('calculates correct dimensions for aspect ratios', () => {
      const dimSquare = ImageGenerator.getDimensions('1:1');
      expect(dimSquare.width).toBe(800);
      expect(dimSquare.height).toBe(800);

      const dimLandscape = ImageGenerator.getDimensions('16:9');
      expect(dimLandscape.width).toBe(960);
      expect(dimLandscape.height).toBe(540);

      const dimPortrait = ImageGenerator.getDimensions('9:16');
      expect(dimPortrait.width).toBe(540);
      expect(dimPortrait.height).toBe(960);
    });
  });
});
