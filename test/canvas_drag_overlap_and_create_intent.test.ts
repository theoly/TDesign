import { describe, test, expect, beforeEach } from 'bun:test';
import { classifyIntent } from '../src/services/ai/intentClassifier';
import { resolveToolFromAIResponse } from '../src/services/tools/toolResolver';
import {
  resolveOverlapAfterManualMove,
  CANVAS_LAYOUT_CONSTANTS
} from '../src/utils/canvasLayout';
import { useProjectStore } from '../src/stores/useProjectStore';
import { useHistoryStore } from '../src/stores/useHistoryStore';
import { Screen } from '../src/types/project';

describe('CHK-F-01 / CHK-F-02 / CHK-F-03: 意图分类与工具解析纯净化', () => {
  test('即使有活跃画框，输入无修改动词的页面需求一律判定为 create_screen', () => {
    const naturalPrompts = [
      '动态详情',
      '会员中心',
      '商品结算页',
      '送花表达心意 - 牵手币充值',
      '个人资料与设置',
      '聊天会话窗口'
    ];

    for (const prompt of naturalPrompts) {
      const result = classifyIntent(prompt, true);
      expect(result.intent).toBe('create_screen');
    }
  });

  test('显式修改动词在有活跃画框时准确判定为 modify_screen', () => {
    const modifyPrompts = [
      '把按钮改成红色',
      '优化顶部导航栏间距',
      '删除底部的版权信息',
      '重构当前表单为两列',
      '替换主要卡片样式',
      '完善个人简介区域'
    ];

    for (const prompt of modifyPrompts) {
      const result = classifyIntent(prompt, true);
      expect(result.intent).toBe('modify_screen');
    }
  });

  test('精准元素引用一律判定为 modify_screen', () => {
    const refPrompt = '[引用元素 nid="n1234567"] 更改背景颜色为浅蓝';
    const result = classifyIntent(refPrompt, true);
    expect(result.intent).toBe('modify_screen');
    expect(result.isElementTargeted).toBe(true);
  });

  test('@画框 仅引用未指定修改动词时，判定为以原画框为参考的 create_screen', () => {
    const prompt = '@首页 做一个风格类似的详情页';
    const result = classifyIntent(prompt, true);
    expect(result.intent).toBe('create_screen');

    const promptNoVerb = '@首页 动态详情页';
    const resultNoVerb = classifyIntent(promptNoVerb, true);
    expect(resultNoVerb.intent).toBe('create_screen');
  });

  test('@画框 包含修改动词时，准确判定为 modify_screen', () => {
    const prompt = '@首页 把背景颜色改成深黑色';
    const result = classifyIntent(prompt, true);
    expect(result.intent).toBe('modify_screen');
  });

  test('resolveToolFromAIResponse: 无修改动词输入不触发 modify_screen，默认生成 create_screen', () => {
    const screens: Record<string, Screen> = {
      'screen-1': {
        id: 'screen-1',
        name: '首页',
        htmlContent: '<div data-nid="root1"><h1>首页</h1></div>',
        position: { x: 100, y: 120 }
      }
    };

    const resolved = resolveToolFromAIResponse({
      rawResponse: '<artifact identifier="screen_new" type="screen" title="动态详情"><div data-nid="root2"><h1>动态详情</h1></div></artifact>',
      userPrompt: '动态详情',
      extractedHtml: '<div data-nid="root2"><h1>动态详情</h1></div>',
      artifactMetadata: { identifier: 'screen_new', title: '动态详情' },
      activeScreenId: 'screen-1',
      screens
    });

    expect(resolved?.tool).toBe('create_screen');
    if (resolved?.tool === 'create_screen') {
      expect(resolved.params.title).toBe('动态详情');
    }
  });

  test('resolveToolFromAIResponse: @首页 做一个类似风格的个人中心 解析为以首页为引用的 create_screen', () => {
    const screens: Record<string, Screen> = {
      'screen-1': {
        id: 'screen-1',
        name: '首页',
        htmlContent: '<div data-nid="root1"><h1>首页</h1></div>',
        position: { x: 100, y: 120 }
      }
    };

    const resolved = resolveToolFromAIResponse({
      rawResponse: '<artifact identifier="screen_new" type="screen" title="个人中心"><div data-nid="root2"><h1>个人中心</h1></div></artifact>',
      userPrompt: '@首页 做一个类似风格的个人中心',
      extractedHtml: '<div data-nid="root2"><h1>个人中心</h1></div>',
      artifactMetadata: { identifier: 'screen_new', title: '个人中心' },
      activeScreenId: 'screen-1',
      screens
    });

    expect(resolved?.tool).toBe('create_screen');
    if (resolved?.tool === 'create_screen') {
      expect(resolved.params.referencedScreenId).toBe('screen-1');
    }
  });

  test('resolveToolFromAIResponse: 明确修改动词时准确触发 modify_screen', () => {
    const screens: Record<string, Screen> = {
      'screen-1': {
        id: 'screen-1',
        name: '首页',
        htmlContent: '<div data-nid="root1"><h1>首页</h1></div>',
        position: { x: 100, y: 120 }
      }
    };

    const resolved = resolveToolFromAIResponse({
      rawResponse: '<artifact identifier="screen-1" type="screen" title="会员中心"><div data-nid="root1"><h1>会员中心</h1></div></artifact>',
      userPrompt: '把标题修改为会员中心',
      extractedHtml: '<div data-nid="root1"><h1>会员中心</h1></div>',
      artifactMetadata: { identifier: 'screen-1', title: '会员中心' },
      activeScreenId: 'screen-1',
      screens
    });

    expect(resolved?.tool).toBe('modify_screen');
    if (resolved?.tool === 'modify_screen') {
      expect(resolved.params.screenId).toBe('screen-1');
    }
  });
});

describe('CHK-F-04 / CHK-F-05: resolveOverlapAfterManualMove 手动拖动防重叠与右移避让', () => {
  const frameWidth = 390;
  const gapX = 120;

  test('拖动到两个页面中间时，自动将右侧所有页面向右平移推开', () => {
    // 既有 3 个页面：
    // A: x=100 (右边沿 490)
    // B: x=610 (490 + 120)
    // C: x=1120 (610 + 390 + 120)
    const screens: Record<string, Screen> = {
      'screen-a': { id: 'screen-a', name: 'A', htmlContent: '', position: { x: 100, y: 120 } },
      'screen-b': { id: 'screen-b', name: 'B', htmlContent: '', position: { x: 610, y: 120 } },
      'screen-c': { id: 'screen-c', name: 'C', htmlContent: '', position: { x: 1120, y: 120 } },
      'screen-d': { id: 'screen-d', name: 'D', htmlContent: '', position: { x: 2000, y: 120 } }
    };

    // 用户将 D 拖拽至 x=500 (位于 A 与 B 之间)
    const result = resolveOverlapAfterManualMove({
      movedScreenId: 'screen-d',
      newPosition: { x: 500, y: 120 },
      screens,
      frameWidth,
      gapX
    });

    // D 矫正至紧贴 A 之后：100 + 390 + 120 = 610
    expect(result.position.x).toBe(610);
    expect(result.position.y).toBe(120);

    // B 必须被推开至 D 之后：610 + 390 + 120 = 1120
    const bShift = result.shiftedScreens.find((s) => s.id === 'screen-b');
    expect(bShift).toBeDefined();
    expect(bShift!.newX).toBe(1120);

    // C 必须随之被推开至 B 之后：1120 + 390 + 120 = 1630
    const cShift = result.shiftedScreens.find((s) => s.id === 'screen-c');
    expect(cShift).toBeDefined();
    expect(cShift!.newX).toBe(1630);
  });

  test('拖动至最左侧或与左侧重叠时，被拖动画框自动矫正安全间距并推开右侧', () => {
    const screens: Record<string, Screen> = {
      'screen-a': { id: 'screen-a', name: 'A', htmlContent: '', position: { x: 100, y: 120 } },
      'screen-b': { id: 'screen-b', name: 'B', htmlContent: '', position: { x: 610, y: 120 } },
      'screen-new': { id: 'screen-new', name: 'New', htmlContent: '', position: { x: 0, y: 0 } }
    };

    // 拖到 x=0 (在 A 的左侧)
    const result = resolveOverlapAfterManualMove({
      movedScreenId: 'screen-new',
      newPosition: { x: 0, y: 120 },
      screens,
      frameWidth,
      gapX
    });

    expect(result.position.x).toBe(0);
    // A 被推开至 0 + 390 + 120 = 510
    const aShift = result.shiftedScreens.find((s) => s.id === 'screen-a');
    expect(aShift?.newX).toBe(510);
    // B 被推开至 510 + 390 + 120 = 1020
    const bShift = result.shiftedScreens.find((s) => s.id === 'screen-b');
    expect(bShift?.newX).toBe(1020);
  });

  test('拖动到远端空白区域时不推开任何画框', () => {
    const screens: Record<string, Screen> = {
      'screen-a': { id: 'screen-a', name: 'A', htmlContent: '', position: { x: 100, y: 120 } },
      'screen-b': { id: 'screen-b', name: 'B', htmlContent: '', position: { x: 610, y: 120 } },
      'screen-c': { id: 'screen-c', name: 'C', htmlContent: '', position: { x: 2000, y: 120 } }
    };

    const result = resolveOverlapAfterManualMove({
      movedScreenId: 'screen-c',
      newPosition: { x: 2500, y: 120 },
      screens,
      frameWidth,
      gapX
    });

    expect(result.position.x).toBe(2500);
    expect(result.shiftedScreens.length).toBe(0);
  });

  test('拖动到不同行 (垂直不重叠) 时不触发该行的推开避让', () => {
    const screens: Record<string, Screen> = {
      'screen-a': { id: 'screen-a', name: 'A', htmlContent: '', position: { x: 100, y: 120 } },
      'screen-b': { id: 'screen-b', name: 'B', htmlContent: '', position: { x: 610, y: 120 } },
      'screen-c': { id: 'screen-c', name: 'C', htmlContent: '', position: { x: 500, y: 1200 } }
    };

    const result = resolveOverlapAfterManualMove({
      movedScreenId: 'screen-c',
      newPosition: { x: 500, y: 1200 },
      screens,
      frameWidth,
      gapX
    });

    expect(result.position.x).toBe(500);
    expect(result.shiftedScreens.length).toBe(0);
  });
});

describe('CHK-F-06: useProjectStore updateScreenPositions 与历史栈原子撤销', () => {
  beforeEach(() => {
    useProjectStore.setState({
      screens: {
        's-1': { id: 's-1', name: 'Page 1', htmlContent: '', position: { x: 100, y: 120 } },
        's-2': { id: 's-2', name: 'Page 2', htmlContent: '', position: { x: 610, y: 120 } },
        's-3': { id: 's-3', name: 'Page 3', htmlContent: '', position: { x: 1120, y: 120 } }
      },
      screenOrder: ['s-1', 's-2', 's-3'],
      activeScreenId: 's-1'
    });
    useHistoryStore.setState({ past: [], future: [], checkpoints: [] });
  });

  test('批量原子更新画框坐标并支持完整撤销 (Undo/Redo)', () => {
    const store = useProjectStore.getState();

    // 模拟 s-2 移动到 800，引起 s-3 避让移动到 1310
    const originalPositions = {
      's-2': { x: 610, y: 120 },
      's-3': { x: 1120, y: 120 }
    };
    const newPositions = {
      's-2': { x: 800, y: 120 },
      's-3': { x: 1310, y: 120 }
    };

    store.updateScreenPositions(newPositions, '移动画框并自动避让', originalPositions);

    // 验证更新生效
    const stateAfter = useProjectStore.getState();
    expect(stateAfter.screens['s-2']?.position.x).toBe(800);
    expect(stateAfter.screens['s-3']?.position.x).toBe(1310);

    // 验证历史栈记入
    const historyState = useHistoryStore.getState();
    expect(historyState.past.length).toBe(1);
    expect(historyState.past[0].label).toBe('移动画框并自动避让');

    // 验证撤销 (Undo)
    historyState.undo();
    const stateUndo = useProjectStore.getState();
    expect(stateUndo.screens['s-2']?.position.x).toBe(610);
    expect(stateUndo.screens['s-3']?.position.x).toBe(1120);

    // 验证重做 (Redo)
    useHistoryStore.getState().redo();
    const stateRedo = useProjectStore.getState();
    expect(stateRedo.screens['s-2']?.position.x).toBe(800);
    expect(stateRedo.screens['s-3']?.position.x).toBe(1310);
  });
});
