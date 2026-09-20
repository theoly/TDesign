import { describe, it, expect } from 'bun:test';
import {
  calculateNewScreenPosition,
  arrangeScreensGrid,
  groupScreensIntoRows,
  isRectOverlapping,
  CANVAS_LAYOUT_CONSTANTS
} from '../src/utils/canvasLayout';
import { Screen } from '../src/types/project';
import { useProjectStore } from '../src/stores/useProjectStore';
import { useHistoryStore } from '../src/stores/useHistoryStore';
import { resolveToolFromAIResponse } from '../src/services/tools/toolResolver';

function createMockScreen(id: string, x: number, y: number, width = 390, height = 800): Screen {
  return {
    id,
    name: `Screen ${id}`,
    position: { x, y },
    measuredHeight: height,
    htmlContent: '<div data-nid="root">Screen</div>'
  };
}

describe('Canvas Layout Engine (画布智能布局引擎)', () => {
  const frameWidth = 390;
  const gapX = 80;
  const gapY = 100;
  const titleBarHeight = 36;
  const defaultHeight = 800;

  it('CHK-F-01: 空画布时第 1 个页面位于基准起始位置 (100, 120)', () => {
    const screens: Record<string, Screen> = {};
    const screenOrder: string[] = [];

    const result = calculateNewScreenPosition(screens, screenOrder, {
      frameWidth,
      gapX,
      gapY
    });

    expect(result.position).toEqual({ x: 100, y: 120 });
    expect(result.shiftedScreens).toHaveLength(0);
  });

  it('CHK-F-02: 第 2~5 个页面紧随上一画框右侧同行排布，横向间隔等于 gapX', () => {
    const screens: Record<string, Screen> = {
      's-1': createMockScreen('s-1', 100, 120)
    };
    const screenOrder = ['s-1'];

    // 添加第 2 个
    const res2 = calculateNewScreenPosition(screens, screenOrder, {
      frameWidth,
      gapX,
      gapY
    });
    expect(res2.position.x).toBe(100 + frameWidth + gapX); // 100 + 390 + 80 = 570
    expect(res2.position.y).toBe(120);

    // 填满到 4 个
    screens['s-2'] = createMockScreen('s-2', res2.position.x, 120);
    screenOrder.push('s-2');

    const res3 = calculateNewScreenPosition(screens, screenOrder, { frameWidth, gapX, gapY });
    expect(res3.position.x).toBe(570 + 390 + 80); // 1040
    expect(res3.position.y).toBe(120);

    screens['s-3'] = createMockScreen('s-3', res3.position.x, 120);
    screenOrder.push('s-3');

    const res4 = calculateNewScreenPosition(screens, screenOrder, { frameWidth, gapX, gapY });
    expect(res4.position.x).toBe(1040 + 390 + 80); // 1510
    expect(res4.position.y).toBe(120);

    screens['s-4'] = createMockScreen('s-4', res4.position.x, 120);
    screenOrder.push('s-4');

    // 添加第 5 个
    const res5 = calculateNewScreenPosition(screens, screenOrder, { frameWidth, gapX, gapY });
    expect(res5.position.x).toBe(1510 + 390 + 80); // 1980
    expect(res5.position.y).toBe(120);
  });

  it('CHK-F-03: 一排满 5 个后，第 6 个页面自动折行到第二行起始列，保持 gapY 间距', () => {
    const screens: Record<string, Screen> = {};
    const screenOrder: string[] = [];

    // 创建第一排满额 5 个页面
    for (let i = 0; i < 5; i++) {
      const id = `s-${i + 1}`;
      screens[id] = createMockScreen(id, 100 + i * (frameWidth + gapX), 120, frameWidth, 800);
      screenOrder.push(id);
    }

    // 计算第 6 个页面位置
    const res6 = calculateNewScreenPosition(screens, screenOrder, {
      frameWidth,
      gapX,
      gapY
    });

    // 应该折行至第一列 x=100
    expect(res6.position.x).toBe(100);
    // 应该在第一排下方: 120 + 800 + 36 + 100 = 1056
    const expectedRow2Y = 120 + 800 + titleBarHeight + gapY;
    expect(res6.position.y).toBe(expectedRow2Y);
    expect(res6.shiftedScreens).toHaveLength(0);
  });

  it('CHK-F-04: 第二排也满 5 个后（共 10 个），第 11 个页面折行到第三行', () => {
    const screens: Record<string, Screen> = {};
    const screenOrder: string[] = [];

    const row2Y = 120 + 800 + titleBarHeight + gapY; // 1056

    // 第一排 5 个
    for (let i = 0; i < 5; i++) {
      const id = `s-${i + 1}`;
      screens[id] = createMockScreen(id, 100 + i * (frameWidth + gapX), 120);
      screenOrder.push(id);
    }
    // 第二排 5 个
    for (let i = 0; i < 5; i++) {
      const id = `s-${i + 6}`;
      screens[id] = createMockScreen(id, 100 + i * (frameWidth + gapX), row2Y);
      screenOrder.push(id);
    }

    expect(screenOrder.length).toBe(10);

    const res11 = calculateNewScreenPosition(screens, screenOrder, {
      frameWidth,
      gapX,
      gapY
    });

    expect(res11.position.x).toBe(100);
    const expectedRow3Y = row2Y + 800 + titleBarHeight + gapY;
    expect(res11.position.y).toBe(expectedRow3Y);
  });

  it('CHK-F-05 & CHK-F-06: 有引用页面时在右侧新建(忽略5张限制)，并将右侧页面向右平移', () => {
    // 建立 3 个同排页面: s-1(x=100), s-2(x=570), s-3(x=1040)
    const screens: Record<string, Screen> = {
      's-1': createMockScreen('s-1', 100, 120),
      's-2': createMockScreen('s-2', 570, 120),
      's-3': createMockScreen('s-3', 1040, 120)
    };
    const screenOrder = ['s-1', 's-2', 's-3'];

    // 指定基于 s-1 新建衍生页面
    const res = calculateNewScreenPosition(screens, screenOrder, {
      frameWidth,
      gapX,
      gapY,
      referencedScreenId: 's-1'
    });

    // 新画框位置应紧贴 s-1 右侧: 100 + 390 + 80 = 570
    expect(res.position.x).toBe(570);
    expect(res.position.y).toBe(120);

    // 原来在 s-1 右侧的 s-2 和 s-3 应当被平移 frameWidth + gapX (470px)
    const shiftDelta = frameWidth + gapX; // 470
    expect(res.shiftedScreens).toHaveLength(2);

    const s2Shift = res.shiftedScreens.find((s) => s.id === 's-2');
    const s3Shift = res.shiftedScreens.find((s) => s.id === 's-3');

    expect(s2Shift?.newX).toBe(570 + shiftDelta); // 1040
    expect(s3Shift?.newX).toBe(1040 + shiftDelta); // 1510

    // 验证平移后各个画框间距完全等于 gapX 且无重叠
    const newScreenRect = { x: res.position.x, y: res.position.y, width: frameWidth, height: 836 };
    const s2NewRect = { x: s2Shift!.newX, y: 120, width: frameWidth, height: 836 };
    const s3NewRect = { x: s3Shift!.newX, y: 120, width: frameWidth, height: 836 };

    expect(isRectOverlapping(newScreenRect, s2NewRect, 0, 0)).toBe(false);
    expect(isRectOverlapping(s2NewRect, s3NewRect, 0, 0)).toBe(false);
    expect(s2NewRect.x - (newScreenRect.x + newScreenRect.width)).toBe(gapX);
    expect(s3NewRect.x - (s2NewRect.x + s2NewRect.width)).toBe(gapX);
  });

  it('CHK-F-08: arrangeScreensGrid 将所有画框按 5 列规整排布', () => {
    const screens: Record<string, Screen> = {};
    const screenOrder: string[] = [];

    // 创建 7 个混乱位置的页面
    for (let i = 0; i < 7; i++) {
      const id = `s-${i + 1}`;
      screens[id] = createMockScreen(id, i * 200 + 50, (i % 2) * 300);
      screenOrder.push(id);
    }

    const grid = arrangeScreensGrid(screens, screenOrder, frameWidth, 800, gapX, gapY, 5);

    // 前 5 个在第 1 行 (y = 120)
    for (let i = 0; i < 5; i++) {
      expect(grid[`s-${i + 1}`].y).toBe(120);
      expect(grid[`s-${i + 1}`].x).toBe(100 + i * (frameWidth + gapX));
    }

    // 第 6、7 个在第 2 行
    const row2Y = 120 + 800 + titleBarHeight + gapY;
    expect(grid['s-6'].y).toBe(row2Y);
    expect(grid['s-6'].x).toBe(100);
    expect(grid['s-7'].y).toBe(row2Y);
    expect(grid['s-7'].x).toBe(100 + (frameWidth + gapX));
  });

  it('CHK-F-07: useProjectStore.duplicateScreen 紧贴原画框右侧复制并自动右移后续画框', () => {
    // 创建首张画框
    const s1Id = useProjectStore.getState().addBlankScreen('第一页');
    let state = useProjectStore.getState();
    const s1 = state.screens[s1Id];
    expect(s1).toBeDefined();

    // 手动加第二个画框在右侧
    const s2Id = state.addScreen({
      name: '第二页',
      position: { x: s1.position.x + state.settings.frameWidth + 120, y: s1.position.y },
      htmlContent: '<div data-nid="page-2">第二页</div>'
    });

    state = useProjectStore.getState();
    const s2BeforeX = state.screens[s2Id].position.x;

    // 复制第 1 个画框
    const dupId = state.duplicateScreen(s1Id);
    expect(dupId).not.toBeNull();

    state = useProjectStore.getState();
    const dupScreen = state.screens[dupId!];
    expect(dupScreen.position.x).toBe(s1.position.x + state.settings.frameWidth + 120);
    expect(dupScreen.position.y).toBe(s1.position.y);

    // 第二个画框应被向右推开
    const s2AfterX = state.screens[s2Id].position.x;
    expect(s2AfterX).toBe(s2BeforeX + state.settings.frameWidth + 120);

    // 验证撤销: dupScreen 被移除，s2 恢复原有坐标
    useHistoryStore.getState().undo();
    state = useProjectStore.getState();
    expect(state.screens[dupId!]).toBeUndefined();
    expect(state.screens[s2Id].position.x).toBe(s2BeforeX);

    // 验证重做: dupScreen 恢复，s2 再次右移
    useHistoryStore.getState().redo();
    state = useProjectStore.getState();
    expect(state.screens[dupId!]).toBeDefined();
    expect(state.screens[s2Id].position.x).toBe(s2AfterX);
  });

  it('CHK-F-09: toolResolver 在用户提及引用画框时提取 referencedScreenId', () => {
    const screens = {
      'screen-home': { id: 'screen-home', name: '首页', htmlContent: '<div data-nid="h1">首页</div>' },
      'screen-detail': { id: 'screen-detail', name: '商品详情', htmlContent: '<div data-nid="d1">详情</div>' }
    };

    const call = resolveToolFromAIResponse({
      rawResponse: '好的，基于首页生成新页面',
      userPrompt: '新建一个营销落地页，参考@首页的风格',
      activeScreenId: 'screen-detail',
      screens,
      extractedHtml: '<div data-nid="promo-1">营销落地页</div>',
      artifactMetadata: { title: '营销落地页' }
    });

    expect(call).not.toBeNull();
    expect(call?.tool).toBe('create_screen');
    if (call?.tool === 'create_screen') {
      expect(call.params.referencedScreenId).toBe('screen-home');
      expect(call.params.title).toBe('营销落地页');
    }
  });
});
