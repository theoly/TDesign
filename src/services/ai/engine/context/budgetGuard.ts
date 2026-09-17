export const CONTEXT_BUDGET = {
  /** 软阈值：超过此值时，@引用画框强制降级为骨架，禁用样张 Few-Shot */
  SOFT_LIMIT_CHARS: 24_000,
  /** 硬阈值 (对齐 PRD §3.2.6): 超过此值时目标待修改画框亦降级为骨架 */
  HARD_LIMIT_CHARS: 30_000
};

export interface BudgetGuardResult {
  isContextTrimmed: boolean;
  targetScreenHtml: string;
  targetIsSkeleton: boolean;
  referencedScreens: Array<{ id: string; name: string; skeletonHtml: string }>;
  warnings: string[];
}

export function enforceBudgetGuard(params: {
  targetHtml?: string;
  targetId?: string;
  targetName?: string;
  referencedScreens: Array<{ id: string; name: string; skeletonHtml: string }>;
  skeletonizeFn: (html: string) => string;
}): BudgetGuardResult {
  const { targetHtml = '', referencedScreens, skeletonizeFn } = params;
  const warnings: string[] = [];
  let isContextTrimmed = false;

  let currentTargetHtml = targetHtml;
  let targetIsSkeleton = false;

  // Calculate total payload chars
  const refChars = referencedScreens.reduce((acc, r) => acc + r.skeletonHtml.length, 0);
  let totalChars = currentTargetHtml.length + refChars;

  // 1. Soft limit: if total > SOFT_LIMIT, prune reference skeletons to ultra-compact
  if (totalChars > CONTEXT_BUDGET.SOFT_LIMIT_CHARS) {
    isContextTrimmed = true;
    warnings.push('上下文体积超出 24k 字符软限制，参考画框已压缩为紧凑骨架。');
    referencedScreens.forEach((r) => {
      if (r.skeletonHtml.length > 1500) {
        r.skeletonHtml = r.skeletonHtml.slice(0, 1500) + '<!-- [截断] -->';
      }
    });
    totalChars = currentTargetHtml.length + referencedScreens.reduce((acc, r) => acc + r.skeletonHtml.length, 0);
  }

  // 2. Hard limit: if target itself > HARD_LIMIT (30k per PRD §3.2.6), skeletonize target screen
  if (currentTargetHtml.length > CONTEXT_BUDGET.HARD_LIMIT_CHARS) {
    isContextTrimmed = true;
    targetIsSkeleton = true;
    warnings.push('目标画框超过 30k 字符硬限制，已降级为结构骨架注入。');
    currentTargetHtml = skeletonizeFn(currentTargetHtml);
  }

  return {
    isContextTrimmed,
    targetScreenHtml: currentTargetHtml,
    targetIsSkeleton,
    referencedScreens,
    warnings
  };
}
