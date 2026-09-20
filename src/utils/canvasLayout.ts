/**
 * 画布页面智能布局引擎 (Canvas Layout Engine)
 * 
 * 核心设计规则 (doc/feature/canvas-layout-engine/spec.md):
 * 1. 最小安全间距与防重叠: 水平间距 GAP_X (80px), 垂直间距 GAP_Y (100px)
 * 2. 自动折行: 一排最多容纳 5 张画框 (MAX_SCREENS_PER_ROW = 5), 满 5 张折行向下
 * 3. 邻近原则: 无引用时紧随当前活跃或最近画框所在排的空位, 排满则折行
 * 4. 引用画框衍生与右移避让: 有引用画框时在原画框正右侧插入, 并将其右侧同行画框整体右移避让
 */

import { Screen, ScreenId } from '../types/project';

export const CANVAS_LAYOUT_CONSTANTS = {
  START_X: 100,
  START_Y: 120,
  DEFAULT_GAP_X: 120,
  DEFAULT_GAP_Y: 120,
  MAX_SCREENS_PER_ROW: 5,
  DEFAULT_HEIGHT: 800,
  TITLE_BAR_HEIGHT: 36,
  ROW_Y_TOLERANCE: 50 // 同一行画框 Y 坐标容差 (px)
};

export interface ScreenRect {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ScreenShiftInstruction {
  id: string;
  newX: number;
}

export interface LayoutCalculationResult {
  position: { x: number; y: number };
  shiftedScreens: ScreenShiftInstruction[];
}

export interface CanvasLayoutOptions {
  frameWidth: number;
  viewportGuideHeight?: number;
  gapX?: number;
  gapY?: number;
  maxPerRow?: number;
  referencedScreenId?: string | null;
  anchorScreenId?: string | null;
}

/**
 * 获取画框在画布上的完整尺寸矩形 (含顶栏 36px)
 */
export function getScreenRect(
  screen: { id: string; position?: { x: number; y: number }; measuredHeight?: number },
  frameWidth: number,
  fallbackHeight: number = CANVAS_LAYOUT_CONSTANTS.DEFAULT_HEIGHT
): ScreenRect {
  const height = (screen.measuredHeight || fallbackHeight) + CANVAS_LAYOUT_CONSTANTS.TITLE_BAR_HEIGHT;
  return {
    id: screen.id,
    x: screen.position?.x ?? CANVAS_LAYOUT_CONSTANTS.START_X,
    y: screen.position?.y ?? CANVAS_LAYOUT_CONSTANTS.START_Y,
    width: frameWidth,
    height
  };
}

/**
 * 判断两个矩形在考虑安全间距时是否发生重叠或侵入间距
 */
export function isRectOverlapping(
  r1: { x: number; y: number; width: number; height: number },
  r2: { x: number; y: number; width: number; height: number },
  minGapX: number = 0,
  minGapY: number = 0
): boolean {
  if (r1.x + r1.width + minGapX <= r2.x) return false;
  if (r2.x + r2.width + minGapX <= r1.x) return false;
  if (r1.y + r1.height + minGapY <= r2.y) return false;
  if (r2.y + r2.height + minGapY <= r1.y) return false;
  return true;
}

/**
 * 将既有画框按 Y 坐标聚合分组为多个水平排 (Rows)
 */
export interface ScreenRow {
  y: number;
  screens: ScreenRect[];
  maxBottomY: number;
}

export function groupScreensIntoRows(
  screenRects: ScreenRect[],
  tolerance: number = CANVAS_LAYOUT_CONSTANTS.ROW_Y_TOLERANCE
): ScreenRow[] {
  if (screenRects.length === 0) return [];

  // 按 Y 升序, 其次按 X 升序
  const sorted = [...screenRects].sort((a, b) => {
    if (Math.abs(a.y - b.y) <= tolerance) {
      return a.x - b.x;
    }
    return a.y - b.y;
  });

  const rows: ScreenRow[] = [];

  for (const rect of sorted) {
    // 查找是否属于已有行
    let matchedRow = rows.find((r) => Math.abs(r.y - rect.y) <= tolerance);
    if (!matchedRow) {
      matchedRow = {
        y: rect.y,
        screens: [],
        maxBottomY: rect.y + rect.height
      };
      rows.push(matchedRow);
    }
    matchedRow.screens.push(rect);
    matchedRow.screens.sort((a, b) => a.x - b.x);
    matchedRow.maxBottomY = Math.max(matchedRow.maxBottomY, rect.y + rect.height);
  }

  // 行按 Y 升序排列
  rows.sort((a, b) => a.y - b.y);
  return rows;
}

/**
 * 计算新建画框的位置以及右移避让指令
 */
export function calculateNewScreenPosition(
  screens: Record<string, Screen>,
  screenOrder: string[],
  options: CanvasLayoutOptions
): LayoutCalculationResult {
  const {
    frameWidth,
    viewportGuideHeight,
    gapX = CANVAS_LAYOUT_CONSTANTS.DEFAULT_GAP_X,
    gapY = CANVAS_LAYOUT_CONSTANTS.DEFAULT_GAP_Y,
    maxPerRow = CANVAS_LAYOUT_CONSTANTS.MAX_SCREENS_PER_ROW,
    referencedScreenId,
    anchorScreenId
  } = options;

  const fallbackHeight = viewportGuideHeight || CANVAS_LAYOUT_CONSTANTS.DEFAULT_HEIGHT;
  const newHeight = fallbackHeight + CANVAS_LAYOUT_CONSTANTS.TITLE_BAR_HEIGHT;

  // 1. 空画布情况
  const existingScreens = screenOrder
    .map((id) => screens[id])
    .filter(
      (s): s is Screen =>
        Boolean(s && s.position && !Number.isNaN(s.position.x) && !Number.isNaN(s.position.y))
    );

  if (existingScreens.length === 0) {
    return {
      position: {
        x: CANVAS_LAYOUT_CONSTANTS.START_X,
        y: CANVAS_LAYOUT_CONSTANTS.START_Y
      },
      shiftedScreens: []
    };
  }

  const existingRects = existingScreens.map((s) => getScreenRect(s, frameWidth, fallbackHeight));

  // 2. 有引用画框情况 (referencedScreenId)
  if (referencedScreenId && screens[referencedScreenId]) {
    const refScreen = screens[referencedScreenId];
    const refRect = getScreenRect(refScreen, frameWidth, fallbackHeight);

    const newX = refRect.x + refRect.width + gapX;
    const newY = refRect.y;
    const shiftDelta = frameWidth + gapX;

    const shiftedScreens: ScreenShiftInstruction[] = [];

    // 寻找原画框右侧且在同行水平区间的画框进行平移避让
    for (const rect of existingRects) {
      if (rect.id === referencedScreenId) continue;

      // 判断是否在原画框右侧 (允许微小容差)
      const isToRight = rect.x >= refRect.x + refRect.width - 10;

      // 判断垂直区间是否有交叠
      const isVerticalOverlap = !(rect.y + rect.height <= newY || rect.y >= newY + newHeight);

      if (isToRight && isVerticalOverlap) {
        shiftedScreens.push({
          id: rect.id,
          newX: rect.x + shiftDelta
        });
      }
    }

    return {
      position: { x: newX, y: newY },
      shiftedScreens
    };
  }

  // 3. 无引用画框情况: 按 5 列网格与折行规则计算
  const rows = groupScreensIntoRows(existingRects);

  // 确定锚点行 (优先 anchorScreenId 所在行, 否则最后一行)
  let targetRowIndex = -1;
  if (anchorScreenId && screens[anchorScreenId]) {
    targetRowIndex = rows.findIndex((r) => r.screens.some((s) => s.id === anchorScreenId));
  }
  if (targetRowIndex === -1) {
    targetRowIndex = rows.length - 1;
  }

  const startX = CANVAS_LAYOUT_CONSTANTS.START_X;

  // 检查当前行及后续行是否有空位 (< maxPerRow)
  let chosenX = -1;
  let chosenY = -1;

  for (let i = targetRowIndex; i < rows.length; i++) {
    const row = rows[i];
    if (row.screens.length < maxPerRow) {
      const rightmost = row.screens[row.screens.length - 1];
      chosenX = rightmost.x + rightmost.width + gapX;
      chosenY = row.y;
      break;
    }
  }

  // 如果从锚点行到最后一行全部已满 (>= maxPerRow), 折行到全新的下一行
  if (chosenX === -1 || chosenY === -1) {
    const lastRow = rows[rows.length - 1];
    chosenX = startX;
    chosenY = lastRow.maxBottomY + gapY;
  }

  // 4. AABB 碰撞兜底防护: 确保绝对不发生任何重叠
  let candidateRect = { x: chosenX, y: chosenY, width: frameWidth, height: newHeight };
  let attempts = 0;
  while (attempts < 50) {
    const collided = existingRects.find((r) => isRectOverlapping(candidateRect, r, 0, 0));
    if (!collided) {
      break;
    }
    // 若重叠, 尝试右移该行, 若超出 5 列宽度, 则换行向下
    const nextX = collided.x + collided.width + gapX;
    const maxRowWidth = startX + maxPerRow * (frameWidth + gapX);
    if (nextX + frameWidth <= maxRowWidth) {
      candidateRect = { ...candidateRect, x: nextX };
    } else {
      // 换行到所有既有画框的最底部下方
      const globalMaxBottom = Math.max(...existingRects.map((r) => r.y + r.height));
      candidateRect = {
        ...candidateRect,
        x: startX,
        y: globalMaxBottom + gapY
      };
    }
    attempts++;
  }

  return {
    position: { x: candidateRect.x, y: candidateRect.y },
    shiftedScreens: []
  };
}

/**
 * 一键整理所有画框为规整的 5 列网格
 */
export function arrangeScreensGrid(
  screens: Record<string, Screen>,
  screenOrder: string[],
  frameWidth: number,
  viewportGuideHeight?: number,
  gapX: number = CANVAS_LAYOUT_CONSTANTS.DEFAULT_GAP_X,
  gapY: number = CANVAS_LAYOUT_CONSTANTS.DEFAULT_GAP_Y,
  maxPerRow: number = CANVAS_LAYOUT_CONSTANTS.MAX_SCREENS_PER_ROW
): Record<ScreenId, { x: number; y: number }> {
  const result: Record<ScreenId, { x: number; y: number }> = {};
  const fallbackHeight = viewportGuideHeight || CANVAS_LAYOUT_CONSTANTS.DEFAULT_HEIGHT;

  let curRowY = CANVAS_LAYOUT_CONSTANTS.START_Y;
  const startX = CANVAS_LAYOUT_CONSTANTS.START_X;

  for (let i = 0; i < screenOrder.length; i += maxPerRow) {
    const rowIds = screenOrder.slice(i, i + maxPerRow);
    let rowMaxHeight = fallbackHeight;

    rowIds.forEach((id, colIndex) => {
      const s = screens[id];
      if (!s) return;
      const h = s.measuredHeight || fallbackHeight;
      rowMaxHeight = Math.max(rowMaxHeight, h);

      result[id] = {
        x: startX + colIndex * (frameWidth + gapX),
        y: curRowY
      };
    });

    curRowY += rowMaxHeight + CANVAS_LAYOUT_CONSTANTS.TITLE_BAR_HEIGHT + gapY;
  }

  return result;
}


export interface SnapGuides {
  horizontalY?: number;
  verticalX?: number;
  active: boolean;
}

export interface DragSnapResult {
  snappedPosition: { x: number; y: number };
  guides: SnapGuides;
}

export interface DragSnapOptions {
  frameWidth: number;
  gapX?: number;
  gapY?: number;
  snapThreshold?: number;
}

/**
 * 拖拽页面时的实时网格吸附与辅助线计算 (BR-ALIGN-01 ~ BR-ALIGN-03)
 *
 * 1. 同行顶部吸附：当拖拽中的画框顶部与其它画框顶部距离 <= snapThreshold (默认 30px) 时，
 *    自动吸附对齐到该排顶部（y 相同），并生成水平网格辅助线。
 * 2. 同列/水平间距吸附：当水平坐标靠近已有画框的列 X 或相邻一列基准 (x + width + gapX) 时，
 *    自动吸附对齐，并生成垂直网格辅助线。
 */
export function calculateDragSnap(
  draggingScreenId: string,
  tentativePos: { x: number; y: number },
  screens: Record<string, Screen>,
  frameWidth: number,
  options?: {
    gapX?: number;
    gapY?: number;
    snapThreshold?: number;
  }
): DragSnapResult {
  const snapThreshold = options?.snapThreshold ?? 30;
  const gapX = options?.gapX ?? CANVAS_LAYOUT_CONSTANTS.DEFAULT_GAP_X;

  let snappedX = tentativePos.x;
  let snappedY = tentativePos.y;
  let guideH: number | undefined;
  let guideV: number | undefined;

  const otherScreens = Object.values(screens).filter(
    (s): s is Screen => Boolean(s && s.id !== draggingScreenId && s.position)
  );

  if (otherScreens.length > 0) {
    // 1. 同行顶部吸附：候选 Y 坐标为其它画框的顶部 Y
    let minDiffY = snapThreshold + 1;
    let targetY: number | undefined;

    const candidateYs = new Set<number>();
    for (const s of otherScreens) {
      if (s.position) {
        candidateYs.add(s.position.y);
      }
    }

    for (const cy of candidateYs) {
      const diff = Math.abs(tentativePos.y - cy);
      if (diff <= snapThreshold && diff < minDiffY) {
        minDiffY = diff;
        targetY = cy;
      }
    }

    if (targetY !== undefined) {
      snappedY = targetY;
      guideH = targetY;
    }

    // 2. 同列对齐吸附：候选 X 坐标
    // - 其它画框自身 X (同列竖向对齐)
    // - 其它画框右侧一列 X (x + frameWidth + gapX)
    // - 其它画框左侧一列 X (x - frameWidth - gapX)
    let minDiffX = snapThreshold + 1;
    let targetX: number | undefined;

    const candidateXs = new Set<number>();
    for (const s of otherScreens) {
      if (s.position) {
        candidateXs.add(s.position.x);
        candidateXs.add(s.position.x + frameWidth + gapX);
        const leftX = s.position.x - frameWidth - gapX;
        if (leftX >= 0) {
          candidateXs.add(leftX);
        }
      }
    }

    for (const cx of candidateXs) {
      const diff = Math.abs(tentativePos.x - cx);
      if (diff <= snapThreshold && diff < minDiffX) {
        minDiffX = diff;
        targetX = cx;
      }
    }

    if (targetX !== undefined) {
      snappedX = targetX;
      guideV = targetX;
    }
  }

  return {
    snappedPosition: { x: snappedX, y: snappedY },
    guides: {
      horizontalY: guideH,
      verticalX: guideV,
      active: guideH !== undefined || guideV !== undefined
    }
  };
}

export interface VerticalGrowthOptions {
  changedScreenId: string;
  newHeight: number;
  screens: Record<string, Screen>;
  frameWidth: number;
  gapX?: number;
  gapY?: number;
}

export interface VerticalGrowthResult {
  shiftedScreens: ScreenShiftInstruction[];
}

/**
 * 竖向加长影响下排页面时的「右移一列」级联避让算法 (BR-ALIGN-06)
 *
 * 规则：
 * 当画框 A 竖向加长（或位置变动），使得 A 的下边界 + gapY 侵入下方排画框 B 的顶部，
 * 且 A 与 B 在水平 X 轴上存在交叠：
 * 1. 自动将受影响的画框 B 右移一列 (B.x + frameWidth + gapX)；
 * 2. 若 B 右移后导致与 B 同行右侧的画框 C 产生重叠或间距不足 gapX，
 *    自动发生级联递推右移，保障全排画框绝不重叠且横向间距统一。
 */
export function resolveVerticalGrowthPushRight(
  options: VerticalGrowthOptions
): VerticalGrowthResult {
  const {
    changedScreenId,
    newHeight,
    screens,
    frameWidth,
    gapX = CANVAS_LAYOUT_CONSTANTS.DEFAULT_GAP_X,
    gapY = CANVAS_LAYOUT_CONSTANTS.DEFAULT_GAP_Y
  } = options;

  const targetScreen = screens[changedScreenId];
  if (!targetScreen || !targetScreen.position) {
    return { shiftedScreens: [] };
  }

  const columnWidth = frameWidth + gapX;
  const targetTop = targetScreen.position.y;
  const targetTotalHeight = newHeight + CANVAS_LAYOUT_CONSTANTS.TITLE_BAR_HEIGHT;
  const targetBottom = targetTop + targetTotalHeight;
  const targetMinYBelow = targetBottom + gapY;

  // 记录每个画框的位置
  const currentPositions: Record<string, { x: number; y: number }> = {};
  for (const [id, s] of Object.entries(screens)) {
    if (s && s.position) {
      currentPositions[id] = { x: s.position.x, y: s.position.y };
    }
  }

  const originalPositions = { ...currentPositions };

  let changed = true;
  let loops = 0;
  const maxLoops = 20;

  while (changed && loops < maxLoops) {
    changed = false;
    loops++;

    for (const [id, s] of Object.entries(screens)) {
      if (id === changedScreenId || !s) continue;
      const curPos = currentPositions[id];
      if (!curPos) continue;

      // 检查是否位于下方排 (Y >= targetTop + 50)
      const isBelowTarget = curPos.y >= targetTop + 50;
      // 检查是否侵入了目标画框的最小垂直间距
      const isEncroaching = curPos.y < targetMinYBelow;
      const targetLeft = currentPositions[changedScreenId].x;
      const targetRight = targetLeft + frameWidth;
      const curRight = curPos.x + frameWidth;

      // 检查水平投影是否与目标有重合
      const isHorizontalOverlapWithTarget = !(curRight <= targetLeft || curPos.x >= targetRight);

      if (isBelowTarget && isEncroaching && isHorizontalOverlapWithTarget) {
        // 直接受影响：右移一列
        const newX = curPos.x + columnWidth;
        currentPositions[id] = { ...curPos, x: newX };
        changed = true;

        // 检查该行右侧其它画框是否产生碰撞
        for (const [rowScreenId, rowScreenPos] of Object.entries(currentPositions)) {
          if (
            rowScreenId !== id &&
            rowScreenId !== changedScreenId &&
            Math.abs(rowScreenPos.y - curPos.y) <= CANVAS_LAYOUT_CONSTANTS.ROW_Y_TOLERANCE
          ) {
            if (rowScreenPos.x >= curPos.x && rowScreenPos.x < newX + frameWidth + gapX) {
              currentPositions[rowScreenId] = {
                ...rowScreenPos,
                x: rowScreenPos.x + columnWidth
              };
              changed = true;
            }
          }
        }
      }
    }

    // 全局排内防重叠级联递推兜底
    for (const [id1, pos1] of Object.entries(currentPositions)) {
      for (const [id2, pos2] of Object.entries(currentPositions)) {
        if (id1 >= id2) continue;
        if (Math.abs(pos1.y - pos2.y) <= CANVAS_LAYOUT_CONSTANTS.ROW_Y_TOLERANCE) {
          const leftId = pos1.x <= pos2.x ? id1 : id2;
          const rightId = pos1.x <= pos2.x ? id2 : id1;
          const leftPos = currentPositions[leftId];
          const rightPos = currentPositions[rightId];

          if (rightPos.x < leftPos.x + frameWidth + gapX) {
            currentPositions[rightId] = {
              ...rightPos,
              x: leftPos.x + frameWidth + gapX
            };
            changed = true;
          }
        }
      }
    }
  }

  const shiftedScreens: ScreenShiftInstruction[] = [];
  for (const [id, pos] of Object.entries(currentPositions)) {
    if (id === changedScreenId) continue;
    const orig = originalPositions[id];
    if (orig && orig.x !== pos.x) {
      shiftedScreens.push({
        id,
        newX: pos.x
      });
    }
  }

  return { shiftedScreens };
}

export interface ManualMoveOverlapOptions {
  movedScreenId: string;
  newPosition: { x: number; y: number };
  screens: Record<string, Screen>;
  screenOrder?: string[];
  frameWidth: number;
  viewportGuideHeight?: number;
  gapX?: number;
  gapY?: number;
}

export interface ManualMoveOverlapResult {
  position: { x: number; y: number };
  shiftedScreens: ScreenShiftInstruction[];
}

/**
 * 手动移动画框后的防重叠与右移避让计算 (BR-LAYOUT-DRAG-01 & BR-ALIGN-01~06)
 *
 * 当用户拖动画框并在画布上释放时：
 * 1. 同行顶部严格对齐：如果处于已有行的垂直容差内，自动贴齐该排顶部 Y；
 * 2. 若画框与左侧画框发生重叠或间距不足，矫正被拖动画框至安全位置并保持统一 gapX 间距；
 * 3. 若画框插入到已有画框中间或与右侧画框重叠，自动将右侧所有受影响的画框向右递推平移；
 * 4. 若新位置竖向加长或侵入下方排画框，自动将受影响的下方画框右移一列并级联避让。
 */
export function resolveOverlapAfterManualMove(
  options: ManualMoveOverlapOptions
): ManualMoveOverlapResult {
  const {
    movedScreenId,
    newPosition,
    screens,
    frameWidth,
    viewportGuideHeight,
    gapX = CANVAS_LAYOUT_CONSTANTS.DEFAULT_GAP_X,
    gapY = CANVAS_LAYOUT_CONSTANTS.DEFAULT_GAP_Y
  } = options;

  const target = screens[movedScreenId];
  if (!target) {
    return { position: newPosition, shiftedScreens: [] };
  }

  const fallbackHeight = viewportGuideHeight || CANVAS_LAYOUT_CONSTANTS.DEFAULT_HEIGHT;
  const movedHeight = (target.measuredHeight || fallbackHeight) + CANVAS_LAYOUT_CONSTANTS.TITLE_BAR_HEIGHT;
  const movedRect = {
    id: movedScreenId,
    x: newPosition.x,
    y: newPosition.y,
    width: frameWidth,
    height: movedHeight
  };

  // 收集其它具备有效坐标的画框
  const otherScreens = Object.values(screens).filter(
    (s): s is Screen => Boolean(s && s.id !== movedScreenId && s.position)
  );

  if (otherScreens.length === 0) {
    return { position: newPosition, shiftedScreens: [] };
  }

  const otherRects = otherScreens.map((s) => getScreenRect(s, frameWidth, fallbackHeight));

  // 筛选处于相同水平带（垂直相交或行 Y 容差在 50px 内）的画框
  const rowScreens = otherRects.filter((rect) => {
    const isVerticallyOverlapping = !(
      rect.y + rect.height <= movedRect.y ||
      rect.y >= movedRect.y + movedRect.height
    );
    const isWithinRowTolerance =
      Math.abs(rect.y - movedRect.y) <= CANVAS_LAYOUT_CONSTANTS.ROW_Y_TOLERANCE;
    return isVerticallyOverlapping || isWithinRowTolerance;
  });

  // 1. 同排顶部对齐 (BR-ALIGN-01)
  let finalMovedY = movedRect.y;
  if (rowScreens.length > 0) {
    const closestRow = [...rowScreens].sort(
      (a, b) => Math.abs(a.y - movedRect.y) - Math.abs(b.y - movedRect.y)
    )[0];
    if (closestRow && Math.abs(closestRow.y - movedRect.y) <= CANVAS_LAYOUT_CONSTANTS.ROW_Y_TOLERANCE) {
      finalMovedY = closestRow.y;
    }
  }

  // 根据中心相对位置划分左侧邻居与右侧邻居 (中心点对称判定)
  const movedCenter = movedRect.x + movedRect.width / 2;
  const leftScreens = rowScreens.filter((r) => movedCenter >= r.x + r.width / 2);
  const rightScreens = rowScreens.filter((r) => movedCenter < r.x + r.width / 2);

  // 2. 左侧防侵入：不能与左侧画框重叠，至少保留 gapX 间距
  let finalMovedX = Math.max(0, movedRect.x);
  if (leftScreens.length > 0) {
    const maxLeftEdge = Math.max(...leftScreens.map((r) => r.x + r.width));
    const minAllowedX = maxLeftEdge + gapX;
    finalMovedX = Math.max(finalMovedX, minAllowedX);
  }

  // 3. 右侧级联右移避让：按 X 升序排序依次递推
  rightScreens.sort((a, b) => a.x - b.x);

  const shiftedScreens: ScreenShiftInstruction[] = [];
  let currentRightEdge = finalMovedX + frameWidth + gapX;

  for (const r of rightScreens) {
    if (r.x < currentRightEdge) {
      shiftedScreens.push({
        id: r.id,
        newX: currentRightEdge
      });
      currentRightEdge = currentRightEdge + r.width + gapX;
    } else {
      currentRightEdge = r.x + r.width + gapX;
    }
  }

  // 4. 检查是否侵入下方排画框的垂直安全间隔，若是，级联右移下方受影响画框 (BR-ALIGN-06)
  const verticalGrowthResult = resolveVerticalGrowthPushRight({
    changedScreenId: movedScreenId,
    newHeight: target.measuredHeight || fallbackHeight,
    screens: {
      ...screens,
      [movedScreenId]: {
        ...target,
        position: { x: finalMovedX, y: finalMovedY }
      }
    },
    frameWidth,
    gapX,
    gapY
  });

  const shiftedMap = new Map<string, number>();
  for (const s of shiftedScreens) {
    shiftedMap.set(s.id, s.newX);
  }
  for (const s of verticalGrowthResult.shiftedScreens) {
    shiftedMap.set(s.id, s.newX);
  }

  const allShifted: ScreenShiftInstruction[] = Array.from(shiftedMap.entries()).map(
    ([id, newX]) => ({ id, newX })
  );

  return {
    position: { x: finalMovedX, y: finalMovedY },
    shiftedScreens: allShifted
  };
}
