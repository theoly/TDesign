import { compareStructure, StructureDiff } from '../../../../../utils/structureGuard';
import { PipelineContext } from '../types';

export interface GuardCheckResult {
  passed: boolean;
  structureDiff?: StructureDiff;
  reason?: string;
}

export function checkStructureIntegrity(
  context: PipelineContext,
  generatedHtml: string
): GuardCheckResult {
  if (context.intent !== 'modify_screen' || !context.targetScreen?.htmlContent) {
    return { passed: true };
  }

  const beforeHtml = context.targetScreen.htmlContent;
  const diff = compareStructure(beforeHtml, generatedHtml);

  // If strict structure matches
  if (diff.ok) {
    return { passed: true, structureDiff: diff };
  }

  // If user explicitly asked for structural additions/deletions, allow pass-through
  if (context.hasExplicitStructuralChangeIntent) {
    return {
      passed: true,
      structureDiff: diff,
      reason: '用户输入明确包含增删需求，守卫自动放行'
    };
  }

  // Otherwise, reject to prevent silent data destruction
  return {
    passed: false,
    structureDiff: diff,
    reason: `结构守卫拦截: 检测到原有节点被非预期修改 (新增 ${diff.added.length} 处, 丢失 ${diff.removed.length} 处)`
  };
}
