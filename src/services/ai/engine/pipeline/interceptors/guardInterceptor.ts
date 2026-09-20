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

  const prompt = context.input.rawPrompt;
  // 1. 用户显式引用特定元素，明确要求针对该区域进行局部修改或内容填充，守卫直接放行
  if (prompt.includes('[引用元素') || prompt.includes('nid=')) {
    return {
      passed: true,
      reason: '用户针对特定元素进行针对性修改/填充，结构守卫自动放行'
    };
  }

  // 2. 用户明确要求结构性修改（增、删、改、替换、填充等），守卫自动放行
  if (context.hasExplicitStructuralChangeIntent) {
    return {
      passed: true,
      reason: '用户输入明确包含增删或结构调整需求，守卫自动放行'
    };
  }

  const beforeHtml = context.targetScreen.htmlContent;
  const diff = compareStructure(beforeHtml, generatedHtml);

  // If strict structure matches
  if (diff.ok) {
    return { passed: true, structureDiff: diff };
  }

  // Otherwise, reject to prevent silent data destruction
  return {
    passed: false,
    structureDiff: diff,
    reason: `结构守卫拦截: 检测到原有节点被非预期修改 (新增 ${diff.added.length} 处, 丢失 ${diff.removed.length} 处)`
  };
}
