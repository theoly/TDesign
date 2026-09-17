import { EngineMessage, TokenUsage } from '../core/types';
import { StructureDiff } from '../../../../utils/structureGuard';

export interface PipelineInput {
  rawPrompt: string;
  attachment?: { name: string; dataUrl: string };
  activeScreenId: string | null;
  styleTagIds?: string[];
}

export type PipelineIntent = 'create_screen' | 'modify_screen' | 'change_theme' | 'question';

export interface PipelineContext {
  input: PipelineInput;
  intent: PipelineIntent;
  intentReason: string;
  hasExplicitStructuralChangeIntent: boolean; // 用户是否明确要求“增删”元素

  targetScreen?: {
    id: string;
    name: string;
    htmlContent: string;
    isSkeleton: boolean;
  };

  referencedScreens: Array<{
    id: string;
    name: string;
    skeletonHtml: string;
  }>;
  unmatchedMentions: string[];

  activeRules: string[];
  activeDecisions: Array<{ id: string; rule: string; rationale: string }>;

  assembledMessages: EngineMessage[];
  estimatedChars: number;
  isContextTrimmed: boolean;
  warnings: string[];
}

export interface PipelineOutput {
  status:
    | 'applied'
    | 'staged_side_by_side'
    | 'rejected_by_guard'
    | 'no_html'
    | 'theme_proposed'
    | 'answered_question'
    | 'aborted'
    | 'error';
  rawResponse: string;
  reasoningText?: string;
  extractedHtml?: string;
  structureDiff?: StructureDiff;
  stagedScreen?: {
    id: string;
    targetOriginalId: string;
    name: string;
    htmlContent: string;
  };
  themeProposal?: any;
  changeSet?: Record<string, unknown>;
  errorMessage?: string;
  usage?: TokenUsage;
  artifactMetadata?: {
    identifier?: string;
    type?: string;
    title?: string;
    isFallback: boolean;
  };
  warnings?: string[];
}

export type PipelineInterceptor<T = any> = (
  context: PipelineContext,
  next: () => Promise<PipelineOutput>
) => Promise<PipelineOutput>;
