import { PipelineContext, PipelineOutput } from '../types';

export interface ScreenApplyResult {
  status: 'applied' | 'staged_side_by_side' | 'no_html';
  stagedScreen?: {
    id: string;
    targetOriginalId: string;
    name: string;
    htmlContent: string;
  };
  changeSet: Record<string, unknown>;
}

export function applyGeneratedHtml(
  context: PipelineContext,
  generatedHtml?: string,
  artifactMeta?: { identifier?: string; title?: string }
): ScreenApplyResult {
  if (!generatedHtml) {
    return {
      status: 'no_html',
      changeSet: {}
    };
  }

  // D17: For modify_screen, stage as side-by-side candidate
  if (context.intent === 'modify_screen' && context.targetScreen) {
    const original = context.targetScreen;
    const candidateId = `screen_cand_${Date.now()}`;
    const baseName = artifactMeta?.title || original.name;
    const candidateName = `${baseName} (AI 调整候选)`;

    return {
      status: 'staged_side_by_side',
      stagedScreen: {
        id: candidateId,
        targetOriginalId: original.id,
        name: candidateName,
        htmlContent: generatedHtml
      },
      changeSet: {
        screens: [
          {
            id: original.id,
            name: original.name,
            action: 'candidate_staged',
            candidateId
          }
        ]
      }
    };
  }

  // For create_screen
  const newScreenId = artifactMeta?.identifier || `screen_${Date.now()}`;
  const newScreenName = artifactMeta?.title || '新设计页 (AI 生成)';
  return {
    status: 'applied',
    changeSet: {
      screens: [
        {
          id: newScreenId,
          name: newScreenName,
          action: 'created'
        }
      ]
    }
  };
}
