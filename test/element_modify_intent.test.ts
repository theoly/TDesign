import { describe, it, expect } from 'bun:test';
import { classifyIntent } from '../src/services/ai/intentClassifier';
import { enrichContext } from '../src/services/ai/engine/context/contextEnricher';

describe('修改元素意图识别与定向画框约束 (Bugfix: 修改元素时新建了一个页面)', () => {
  it('当输入带有 [引用元素] 时，哪怕包含“填充/参考图片”等词汇，也必须判定为 modify_screen', () => {
    const prompt = `[引用元素 nid="ho2m25cl" 画框="送花表达心意 - 牵手币充值" 标签=<div>]
元素片段:
<div data-nid="ho2m25cl" class="card bg-surface p-3 col items-center justify-between">
  <div data-nid="ho2m25cm" class="badge">特权</div>
</div>

参考图片，填充选项卡内容`;

    const result = classifyIntent(prompt, false);
    expect(result.intent).toBe('modify_screen');
    expect(result.isElementTargeted).toBe(true);
    expect(result.reason).toContain('精准元素引用');
  });

  it('当输入包含常规元素修改动词“填充/更新/补充”且有活跃画框时，判定为 modify_screen', () => {
    const result = classifyIntent('填充选项卡内容，设置价格为80币', true);
    expect(result.intent).toBe('modify_screen');
  });

  it('contextEnricher 在用户引用元素时，能精准解析目标画框并注入定向修改约束，严禁输出 screen_new', () => {
    const prompt = `[引用元素 nid="ho2m25cl" 画框="送花表达心意 - 牵手币充值" 标签=<div>]
元素片段:
<div data-nid="ho2m25cl" class="card">
  <span>选项卡</span>
</div>

参考图片，填充选项卡内容`;

    const screens = {
      'screen-other': {
        id: 'screen-other',
        name: '其他页面',
        htmlContent: '<main data-nid="oth-1">Other</main>'
      },
      'screen-target': {
        id: 'screen-target',
        name: '送花表达心意 - 牵手币充值',
        htmlContent: '<main data-nid="root"><div data-nid="ho2m25cl">选项卡</div></main>'
      }
    };

    const enriched = enrichContext({
      rawPrompt: prompt,
      intent: 'modify_screen',
      activeScreenId: 'screen-other', // 即使 activeScreenId 处于其他页面
      screens,
      deviceProfile: 'mobile',
      frameWidth: 390,
      baseSystemPrompt: 'System Prompt'
    });

    // 验证目标画框被精准重定向至“送花表达心意 - 牵手币充值”
    expect(enriched.targetScreen).toBeDefined();
    expect(enriched.targetScreen?.id).toBe('screen-target');
    expect(enriched.targetScreen?.name).toBe('送花表达心意 - 牵手币充值');

    // 验证 prompt 中严禁输出 screen_new，必须指定被修改画框的 identifier
    const userMessage = enriched.messages.find((m) => m.role === 'user');
    expect(userMessage).toBeDefined();
    expect(userMessage?.content).toContain('identifier="screen-target"');
    expect(userMessage?.content).toContain('严禁输出 identifier="screen_new"');
    expect(userMessage?.content).toContain('data-nid="ho2m25cl"');
  });
});
