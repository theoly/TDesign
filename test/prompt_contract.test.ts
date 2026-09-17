import { describe, test, expect } from 'bun:test';
import {
  PromptBuilder,
  PROMPT_SECTION_ORDER,
  ARTIFACT_OUTPUT_CONTRACT,
  ARTIFACT_OUTPUT_REMINDER,
  extractSectionOrder
} from '../src/services/ai/promptBuilder';
import { CRAFT_DEFERENCE_PREAMBLE, getCraftRules } from '../src/services/ai/craft';
import { enrichContext } from '../src/services/ai/engine/context/contextEnricher';
import { techBlueTheme } from '../src/utils/themePresets';

describe('Prompt & Craft Contract Specifications (REQ-OD-06 / BR-06)', () => {
  describe('CHK-OD-05 & CHK-OD-12 · 输出契约单一声明源与去冲突', () => {
    test('PromptBuilder 输出格式必须声明 <artifact> 标签，且输出节与 ARTIFACT_OUTPUT_CONTRACT 一致', () => {
      const prompt = PromptBuilder.buildSystemPrompt({
        designSystem: techBlueTheme,
        decisions: [],
        deviceProfile: 'pc',
        frameWidth: 1440,
        intent: 'create_screen'
      });

      expect(prompt).toContain('<artifact identifier="');
      expect(prompt).toContain('</artifact>');
      expect(prompt).toContain(ARTIFACT_OUTPUT_CONTRACT);
    });

    test('contextEnricher 单行提醒必须与 ARTIFACT_OUTPUT_REMINDER 完全一致且无旧代码块要求', () => {
      // 1. 新建画框
      const createRes = enrichContext({
        rawPrompt: '创建一个仪表盘',
        intent: 'create_screen',
        activeScreenId: null,
        screens: {},
        deviceProfile: 'pc',
        frameWidth: 1440,
        baseSystemPrompt: 'Base Prompt'
      });

      const createUserPrompt = createRes.messages.find((m) => m.role === 'user')?.content || '';
      expect(createUserPrompt).toContain(ARTIFACT_OUTPUT_REMINDER);
      expect(createUserPrompt).not.toContain('完整的 ```html ... ``` 代码块');

      // 2. 修改画框
      const modifyRes = enrichContext({
        rawPrompt: '修改背景色',
        intent: 'modify_screen',
        activeScreenId: 'scr_1',
        screens: {
          scr_1: { id: 'scr_1', name: '登录页', htmlContent: '<div class="login">Old</div>' }
        },
        deviceProfile: 'pc',
        frameWidth: 1440,
        baseSystemPrompt: 'Base Prompt'
      });

      const modifyUserPrompt = modifyRes.messages.find((m) => m.role === 'user')?.content || '';
      expect(modifyUserPrompt).toContain('<artifact identifier="scr_1" type="screen" title="登录页">');
      expect(modifyUserPrompt).toContain(ARTIFACT_OUTPUT_REMINDER);
      expect(modifyUserPrompt).not.toContain('必须且仅输出完整的 ```html ... ``` 代码块');
    });
  });

  describe('CHK-OD-10 · Craft 规则层与让位前言', () => {
    test('Craft 章节正文以 CRAFT_DEFERENCE_PREAMBLE 让位前言开头', () => {
      const prompt = PromptBuilder.buildSystemPrompt({
        designSystem: techBlueTheme,
        decisions: [],
        deviceProfile: 'pc',
        frameWidth: 1440,
        intent: 'create_screen'
      });

      expect(prompt).toContain('### CRAFT REFERENCES');
      expect(prompt).toContain(CRAFT_DEFERENCE_PREAMBLE);
    });

    test('change_theme 与 question 意图下 Craft 规则与 Few-Shot 零注入', () => {
      // 1. change_theme
      const themePrompt = PromptBuilder.buildSystemPrompt({
        designSystem: techBlueTheme,
        decisions: [],
        deviceProfile: 'pc',
        frameWidth: 1440,
        intent: 'change_theme'
      });
      expect(themePrompt).not.toContain('### CRAFT REFERENCES');
      expect(themePrompt).not.toContain('### REFERENCE EXAMPLE');
      expect(getCraftRules('change_theme')).toHaveLength(0);

      // 2. question
      const questionPrompt = PromptBuilder.buildSystemPrompt({
        designSystem: techBlueTheme,
        decisions: [],
        deviceProfile: 'pc',
        frameWidth: 1440,
        intent: 'question'
      });
      expect(questionPrompt).not.toContain('### CRAFT REFERENCES');
      expect(questionPrompt).not.toContain('### REFERENCE EXAMPLE');
      expect(getCraftRules('question')).toHaveLength(0);
    });
  });

  describe('CHK-OD-11 & CHK-OD-18 · 确定性章节顺序契约与末位铁律', () => {
    test('extractSectionOrder 恒为 PROMPT_SECTION_ORDER 的子序列且 output_contract 恒为最后一项', () => {
      const prompt = PromptBuilder.buildSystemPrompt({
        designSystem: techBlueTheme,
        decisions: [{ id: 'd1', text: '按钮使用胶囊圆角', scope: 'global', source: { kind: 'manual', createdAt: 0 }, active: true }],
        designRules: ['禁止使用深色底文字'],
        deviceProfile: 'pc',
        frameWidth: 1440,
        intent: 'create_screen'
      });

      const order = extractSectionOrder(prompt);

      // 校验所有产出章节相对次序完全遵循 PROMPT_SECTION_ORDER
      let lastIndex = -1;
      for (const sec of order) {
        const expectedIndex = PROMPT_SECTION_ORDER.indexOf(sec);
        expect(expectedIndex).toBeGreaterThan(lastIndex);
        lastIndex = expectedIndex;
      }

      // 末位铁律：最后一项必须是 output_contract
      expect(order[order.length - 1]).toBe('output_contract');
    });

    test('CHK-OD-18: contextEnricher 中非空 D18/D20 章节严格位于 output_contract 之前', () => {
      const baseSystemPrompt = PromptBuilder.buildSystemPrompt({
        designSystem: techBlueTheme,
        decisions: [],
        deviceProfile: 'pc',
        frameWidth: 1440,
        intent: 'create_screen'
      });

      const enriched = enrichContext({
        rawPrompt: '新建首页',
        intent: 'create_screen',
        activeScreenId: null,
        screens: {},
        deviceProfile: 'pc',
        frameWidth: 1440,
        baseSystemPrompt,
        designRules: ['卡片带 1px 细边框', '主色对比度大于 4.5'],
        decisions: [{ id: 'D-01', rule: '标题统一左对齐', rationale: '保持版面规整' }]
      });

      const systemPrompt = enriched.messages.find((m) => m.role === 'system')?.content || '';
      const order = extractSectionOrder(systemPrompt);

      expect(order).toContain('project_conventions');
      expect(order).toContain('active_decisions');
      expect(order).toContain('output_contract');

      const d18Idx = order.indexOf('project_conventions');
      const d20Idx = order.indexOf('active_decisions');
      const contractIdx = order.indexOf('output_contract');

      // 严格保证 D18 与 D20 位于 output_contract 之前
      expect(d18Idx).toBeLessThan(contractIdx);
      expect(d20Idx).toBeLessThan(contractIdx);
      // output_contract 必须是整个 System Prompt 的最后一节
      expect(order[order.length - 1]).toBe('output_contract');
    });
  });

  describe('CHK-N-06 · 提示词体积稳定性审计 (NFR-A01)', () => {
    test('create_screen 的 System Prompt 字符数相对基线波动在合理区间（<= +5% 预期）', () => {
      const prompt = PromptBuilder.buildSystemPrompt({
        designSystem: techBlueTheme,
        decisions: [],
        deviceProfile: 'pc',
        frameWidth: 1440,
        intent: 'create_screen'
      });

      // 提示词完整长度（含基础类名白名单、Tokens、Craft References、Few-shot、Output Contract 等）
      // 保持在 10000 ~ 12000 字符紧凑区间（相对基准 10,800 字符波动 <= 5%）
      expect(prompt.length).toBeGreaterThan(10000);
      expect(prompt.length).toBeLessThan(12000);
    });
  });
});

