import { classifyIntent } from '../../../intentClassifier';
import { proposeTokenChange } from '../../../styleTags';
import { PipelineInput, PipelineIntent } from '../types';

export interface IntentAnalysisResult {
  intent: PipelineIntent;
  reason: string;
  hasExplicitStructuralChangeIntent: boolean;
  themeProposal?: any;
}

const STRUCTURAL_CHANGE_KEYWORDS = [
  '新增', '加一个', '添加', '删除', '去掉', '补充', '移除', '插一个',
  'add', 'remove', 'delete', 'insert', 'append'
];

export function analyzePipelineIntent(
  input: PipelineInput,
  currentTokens?: any
): IntentAnalysisResult {
  const classified = classifyIntent(input.rawPrompt, Boolean(input.activeScreenId));
  const rawLower = input.rawPrompt.toLowerCase();

  const hasExplicitStructuralChangeIntent = STRUCTURAL_CHANGE_KEYWORDS.some((kw) =>
    rawLower.includes(kw.toLowerCase())
  );

  let themeProposal: any = null;
  if (classified.intent === 'change_theme' && currentTokens) {
    themeProposal = proposeTokenChange(input.rawPrompt, currentTokens);
  }

  return {
    intent: classified.intent as PipelineIntent,
    reason: classified.reason,
    hasExplicitStructuralChangeIntent,
    themeProposal
  };
}
