import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import React, { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import {
  calculateDragSnap,
  resolveVerticalGrowthPushRight,
  resolveOverlapAfterManualMove,
  CANVAS_LAYOUT_CONSTANTS
} from '../src/utils/canvasLayout';
import { useProjectStore } from '../src/stores/useProjectStore';
import { InfiniteCanvas } from '../src/components/canvas/InfiniteCanvas';
import { Screen } from '../src/types/project';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

describe('工作区网格线对齐与自动吸附避让 (Canvas Grid Alignment & Snap - T-SNAP-01 ~ T-SNAP-06)', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    useProjectStore.setState({
      settings: {
        deviceProfile: 'pc',
        frameWidth: 1440,
        viewportGuideHeight: 900,
        showViewportGuide: true,
        colorMode: 'light',
        lodBudget: 12
      }
    });
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  test('CHK-F-01: 拖动页面靠近同行顶部（阈值 30px）时，自动吸附对齐该排顶部（y 相同）并生成水平参考线', () => {
    const screens: Record<string, Screen> = {
      'screen-1': {
        id: 'screen-1',
        name: '首页',
        position: { x: 100, y: 120 },
        htmlContent: '<div>页面1</div>',
        measuredHeight: 800
      } as Screen,
      'screen-2': {
        id: 'screen-2',
        name: '详情页',
        position: { x: 1660, y: 120 },
        htmlContent: '<div>页面2</div>',
        measuredHeight: 800
      } as Screen
    };

    // 1. 靠近顶部（垂直偏差 18px <= 30px）：自动吸附到 y = 120，并生成水平参考线
    const snapNear = calculateDragSnap('screen-3', { x: 500, y: 138 }, screens, 1440);
    expect(snapNear.snappedPosition.y).toBe(120);
    expect(snapNear.guides.horizontalY).toBe(120);
    expect(snapNear.guides.active).toBe(true);

    // 2. 超出吸附阈值（偏差 45px > 30px）：保持原有 y，不生成水平参考线
    const snapFar = calculateDragSnap('screen-3', { x: 500, y: 165 }, screens, 1440);
    expect(snapFar.snappedPosition.y).toBe(165);
    expect(snapFar.guides.horizontalY).toBeUndefined();
  });

  test('CHK-F-02: 拖动页面靠近同列（阈值 30px）时，自动吸附对齐该列并生成垂直对齐参考线', () => {
    const screens: Record<string, Screen> = {
      'screen-1': {
        id: 'screen-1',
        name: '首页',
        position: { x: 100, y: 120 },
        htmlContent: '<div>页面1</div>',
        measuredHeight: 800
      } as Screen
    };

    // 1. 靠近同列（水平偏差 15px <= 30px）：自动吸附到 x = 100，并生成垂直参考线
    const snapCol = calculateDragSnap('screen-2', { x: 115, y: 1000 }, screens, 1440);
    expect(snapCol.snappedPosition.x).toBe(100);
    expect(snapCol.guides.verticalX).toBe(100);
    expect(snapCol.guides.active).toBe(true);

    // 2. 靠近右侧相邻列（标准列距 = 100 + 1440 + 120 = 1660，偏差 10px）
    const snapNextCol = calculateDragSnap('screen-2', { x: 1670, y: 120 }, screens, 1440);
    expect(snapNextCol.snappedPosition.x).toBe(1660);
    expect(snapNextCol.guides.verticalX).toBe(1660);
    expect(snapNextCol.guides.active).toBe(true);

    // 3. 超出吸附阈值（偏差 50px）：不吸附
    const snapFarX = calculateDragSnap('screen-2', { x: 400, y: 1000 }, screens, 1440);
    expect(snapFarX.snappedPosition.x).toBe(400);
    expect(snapFarX.guides.verticalX).toBeUndefined();
  });

  test('CHK-F-03: 移动页面时，画布实时呈现发光的对齐网格线（水平吸附线 / 垂直列线）并在释放时清除', async () => {
    useProjectStore.setState({
      activeSnapGuides: {
        horizontalY: 120,
        verticalX: 100,
        active: true
      }
    });

    await act(async () => {
      root.render(<InfiniteCanvas />);
    });

    const hGuide = container.querySelector('[data-testid="snap-guide-horizontal"]');
    const vGuide = container.querySelector('[data-testid="snap-guide-vertical"]');

    expect(hGuide).not.toBeNull();
    expect(vGuide).not.toBeNull();
    expect(hGuide?.textContent).toContain('同行顶部对齐 Y: 120px');
    expect(vGuide?.textContent).toContain('同列对齐 X: 100px');
    expect(hGuide?.className).toContain('border-sky-400');
    expect(hGuide?.className).toContain('border-dashed');

    // 释放时清除参考线
    act(() => {
      useProjectStore.getState().clearSnapGuides();
    });

    const hGuideAfter = container.querySelector('[data-testid="snap-guide-horizontal"]');
    const vGuideAfter = container.querySelector('[data-testid="snap-guide-vertical"]');
    expect(hGuideAfter).toBeNull();
    expect(vGuideAfter).toBeNull();
  });

  test('CHK-F-04: 拖动释放后画框横向间隔统一保持 gapX，同行顶部对齐，所有页面绝对不发生重叠', () => {
    const screens: Record<string, Screen> = {
      'screen-1': {
        id: 'screen-1',
        name: '页面1',
        position: { x: 100, y: 120 },
        htmlContent: '<div>页面1</div>',
        measuredHeight: 800
      } as Screen,
      'screen-2': {
        id: 'screen-2',
        name: '页面2',
        position: { x: 1660, y: 120 },
        htmlContent: '<div>页面2</div>',
        measuredHeight: 800
      } as Screen
    };

    // 尝试将新画框 screen-3 放置在与 screen-1 严重重叠的位置 (x: 150, y: 135)
    const result = resolveOverlapAfterManualMove({
      movedScreenId: 'screen-3',
      newPosition: { x: 150, y: 135 },
      screens: {
        ...screens,
        'screen-3': {
          id: 'screen-3',
          name: '页面3',
          position: { x: 150, y: 135 },
          htmlContent: '<div>页面3</div>',
          measuredHeight: 800
        } as Screen
      },
      frameWidth: 1440,
      gapX: 120
    });

    // 1. 同排顶部对齐：自动校正到 y = 120
    expect(result.position.y).toBe(120);

    // 2. 左侧防侵入：screen-3 被推开至 screen-1 右侧安全间距 100 + 1440 + 120 = 1660
    expect(result.position.x).toBe(1660);

    // 3. 右侧级联避让：原处于 1660 的 screen-2 被向右递推一列至 1660 + 1440 + 120 = 3220
    const screen2Shift = result.shiftedScreens.find((s) => s.id === 'screen-2');
    expect(screen2Shift).toBeDefined();
    expect(screen2Shift?.newX).toBe(3220);
  });

  test('CHK-F-05: 页面竖向加长影响到下面排的页面时（侵入最小间隔且水平投影重合），自动将受影响页面右移一列', () => {
    // screen-1 在顶排 (100, 120)，高度由 800 扩增至 1300
    // screen-2 在下排 (100, 1000)，正好位于 screen-1 正下方
    // screen-1 扩增后总高度 = 1300 + 36 = 1336，底部为 120 + 1336 = 1456
    // 下排最小安全 Y = 1456 + 120 = 1576 > 1000，发生严重侵入！
    const screens: Record<string, Screen> = {
      'screen-1': {
        id: 'screen-1',
        name: '顶排页面',
        position: { x: 100, y: 120 },
        htmlContent: '<div>长内容</div>',
        measuredHeight: 800
      } as Screen,
      'screen-2': {
        id: 'screen-2',
        name: '下排页面',
        position: { x: 100, y: 1000 },
        htmlContent: '<div>下排内容</div>',
        measuredHeight: 800
      } as Screen
    };

    const growthResult = resolveVerticalGrowthPushRight({
      changedScreenId: 'screen-1',
      newHeight: 1300,
      screens,
      frameWidth: 1440,
      gapX: 120,
      gapY: 120
    });

    // screen-2 必须被自动右移一列：100 + (1440 + 120) = 1660
    expect(growthResult.shiftedScreens.length).toBe(1);
    expect(growthResult.shiftedScreens[0].id).toBe('screen-2');
    expect(growthResult.shiftedScreens[0].newX).toBe(1660);
  });

  test('CHK-F-06: 下面排页面右移一列如果导致与同行右侧页面碰撞，自动发生级联递推右移，保障全排不重叠', () => {
    // screen-1 在 (100, 120)
    // screen-2 在下排 (100, 1000)
    // screen-3 在下排且已占据右侧一列 (1660, 1000)
    const screens: Record<string, Screen> = {
      'screen-1': {
        id: 'screen-1',
        name: '顶排页面',
        position: { x: 100, y: 120 },
        htmlContent: '<div>页面</div>',
        measuredHeight: 800
      } as Screen,
      'screen-2': {
        id: 'screen-2',
        name: '下排页面1',
        position: { x: 100, y: 1000 },
        htmlContent: '<div>下排1</div>',
        measuredHeight: 800
      } as Screen,
      'screen-3': {
        id: 'screen-3',
        name: '下排页面2',
        position: { x: 1660, y: 1000 },
        htmlContent: '<div>下排2</div>',
        measuredHeight: 800
      } as Screen
    };

    const growthResult = resolveVerticalGrowthPushRight({
      changedScreenId: 'screen-1',
      newHeight: 1300,
      screens,
      frameWidth: 1440,
      gapX: 120,
      gapY: 120
    });

    // screen-2 右移到 1660
    const shift2 = growthResult.shiftedScreens.find((s) => s.id === 'screen-2');
    expect(shift2).toBeDefined();
    expect(shift2?.newX).toBe(1660);

    // screen-3 发生级联右移到 3220
    const shift3 = growthResult.shiftedScreens.find((s) => s.id === 'screen-3');
    expect(shift3).toBeDefined();
    expect(shift3?.newX).toBe(3220);
  });

  test('集成联动: useProjectStore.updateScreen 高度增长自动触发下排避让', () => {
    const screens: Record<string, Screen> = {
      's-top': {
        id: 's-top',
        name: '顶排',
        position: { x: 100, y: 120 },
        htmlContent: '<div>顶</div>',
        measuredHeight: 800
      } as Screen,
      's-bot': {
        id: 's-bot',
        name: '底排',
        position: { x: 100, y: 1000 },
        htmlContent: '<div>底</div>',
        measuredHeight: 800
      } as Screen
    };

    useProjectStore.setState({
      screens,
      screenOrder: ['s-top', 's-bot']
    });

    // 调用 updateScreen 扩展 s-top 的 measuredHeight 到 1400
    useProjectStore.getState().updateScreen('s-top', { measuredHeight: 1400 });

    const updatedBot = useProjectStore.getState().screens['s-bot'];
    expect(updatedBot.position.x).toBe(1660);
  });
});
