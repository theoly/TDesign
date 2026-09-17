import { EngineMessage } from '../core/types';
import { DesignProse } from '../../../../types/designSystem';
import { htmlSkeletonize } from './htmlSkeleton';
import { resolveMentions } from './mentionResolver';
import { enforceBudgetGuard } from './budgetGuard';
import { resolveDesignProse } from './designProseProvider';
import { ARTIFACT_OUTPUT_CONTRACT, ARTIFACT_OUTPUT_REMINDER } from '../../promptBuilder';

export interface ContextEnricherParams {
  rawPrompt: string;
  intent: 'create_screen' | 'modify_screen' | 'change_theme' | 'question';
  activeScreenId: string | null;
  screens: Record<string, { id: string; name: string; htmlContent: string; scopedCss?: string }>;
  deviceProfile: 'pc' | 'mobile';
  frameWidth: number;
  baseSystemPrompt: string;
  attachment?: { name: string; dataUrl: string };
  designRules?: string[]; // PRD D18
  decisions?: Array<{ id: string; rule: string; rationale: string }>; // PRD D20
  presetId?: string;
  projectProseMarkdown?: string;
}

export interface EnrichedContextResult {
  messages: EngineMessage[];
  unmatchedMentions: string[];
  referencedScreens: Array<{ id: string; name: string; skeletonHtml: string }>;
  targetScreen?: {
    id: string;
    name: string;
    htmlContent: string;
    isSkeleton: boolean;
  };
  isContextTrimmed: boolean;
  warnings: string[];
  estimatedChars: number;
  designProse?: DesignProse;
}

export function enrichContext(params: ContextEnricherParams): EnrichedContextResult {
  const {
    rawPrompt,
    intent,
    activeScreenId,
    screens,
    deviceProfile,
    frameWidth,
    baseSystemPrompt,
    attachment,
    designRules = [],
    decisions = [],
    presetId,
    projectProseMarkdown
  } = params;

  // 1. Resolve mentions (ISSUE-012 fix)
  const { referencedScreens, unmatchedMentions } = resolveMentions(rawPrompt, screens);

  // 2. Identify target screen if modify_screen (ISSUE-011 fix)
  let targetOriginalHtml = '';
  let targetName = '';
  if (intent === 'modify_screen' && activeScreenId && screens[activeScreenId]) {
    targetOriginalHtml = screens[activeScreenId].htmlContent;
    targetName = screens[activeScreenId].name;
  }

  // 3. Enforce budget guard
  const budgetResult = enforceBudgetGuard({
    targetHtml: targetOriginalHtml,
    targetId: activeScreenId || undefined,
    targetName,
    referencedScreens,
    skeletonizeFn: htmlSkeletonize
  });

  // 3.5. Resolve Design Prose (DESIGN.md)
  const designProse = resolveDesignProse({
    presetId,
    projectProseMarkdown
  });

  // 4. Assemble System Prompt with DESIGN.md, D18 Rules and D20 Decisions
  // 遵守末位铁律 (BR-06.3 / CHK-OD-18)：D18 与 D20 章节必须严格置于 OUTPUT CONTRACT 之前
  let systemContent = baseSystemPrompt;
  const extraSections: string[] = [];

  if (designProse && designProse.rulesMarkdown && !systemContent.includes('### DESIGN SPECIFICATION')) {
    extraSections.push(`### DESIGN SPECIFICATION (DESIGN.md - [${designProse.source === 'project_override' ? '工程覆盖' : '预设基准'}]):\n${designProse.rulesMarkdown}`);
  }

  if (designRules.length > 0 && !systemContent.includes('### PROJECT CONVENTIONS')) {
    extraSections.push(`### PROJECT CONVENTIONS (D18):\n${designRules.map((r, i) => `${i + 1}. ${r}`).join('\n')}`);
  }

  if (decisions.length > 0 && !systemContent.includes('### ACTIVE DECISIONS')) {
    extraSections.push(`### ACTIVE DECISIONS (D20):\n${decisions
      .map((d) => `- [${d.id}] ${d.rule}: ${d.rationale}`)
      .join('\n')}`);
  }

  if (extraSections.length > 0) {
    const outputContractIdx = systemContent.indexOf('### OUTPUT CONTRACT');
    if (outputContractIdx !== -1) {
      const beforeContract = systemContent.slice(0, outputContractIdx).trimEnd();
      const contractPart = systemContent.slice(outputContractIdx);
      systemContent = `${beforeContract}\n\n${extraSections.join('\n\n')}\n\n${contractPart}`;
    } else {
      systemContent = `${systemContent.trimEnd()}\n\n${extraSections.join('\n\n')}\n\n${ARTIFACT_OUTPUT_CONTRACT}`;
    }
  }

  // 5. Assemble User Prompt with target screen & reference screenshots
  let userPrompt = rawPrompt;

  if (attachment) {
    userPrompt = `[Attached Reference UI Design Screenshot: "${attachment.name}"]\nPlease visually analyze the attached screenshot: hierarchy, grid, colors, typography, buttons, inputs. Recreate it into complete HTML that adheres strictly to the current Design System Tokens and Base CSS classes.\n\nUser Request: ${userPrompt}`;
  }

  // Inject target screen if modifying (ISSUE-011 core)
  if (intent === 'modify_screen' && activeScreenId && budgetResult.targetScreenHtml) {
    userPrompt = `[待修改目标画框当前 ${budgetResult.targetIsSkeleton ? '骨架' : 'HTML'}] (名称: "${targetName}"):
\`\`\`html
${budgetResult.targetScreenHtml}
\`\`\`

[重要修改约束]: 请在严格保留原有业务内容、文本和已有 data-nid 的基础上进行指定调整。必须且仅输出被 <artifact identifier="${activeScreenId}" type="screen" title="${targetName}"> 与 </artifact> 包裹的完整 HTML。\n\n${ARTIFACT_OUTPUT_REMINDER}\n\n用户修改需求: ${userPrompt}`;
  } else {
    userPrompt = `${userPrompt}\n\n[指令约束: 适配当前 ${deviceProfile} 设备 (${frameWidth}px)，必须且仅输出被 <artifact identifier="screen_new" type="screen" title="画框标题"> 与 </artifact> 包裹的完整高保真页面，严禁在标签外输出寒暄或解释]\n\n${ARTIFACT_OUTPUT_REMINDER}`;
  }

  // Inject referenced screen skeletons if any
  if (budgetResult.referencedScreens.length > 0) {
    const refsBlock = budgetResult.referencedScreens
      .map((r) => `[参考画框风格骨架: "${r.name}"]:\n\`\`\`html\n${r.skeletonHtml}\n\`\`\``)
      .join('\n\n');
    userPrompt = `${refsBlock}\n\n${userPrompt}`;
  }

  const messages: EngineMessage[] = [
    { role: 'system', content: systemContent },
    {
      role: 'user',
      content: userPrompt,
      imageUrl: attachment ? attachment.dataUrl : undefined
    }
  ];

  const estimatedChars = messages.reduce((acc, m) => acc + (m.content?.length || 0), 0);

  return {
    messages,
    unmatchedMentions,
    referencedScreens: budgetResult.referencedScreens,
    targetScreen: activeScreenId
      ? {
          id: activeScreenId,
          name: targetName,
          htmlContent: budgetResult.targetScreenHtml,
          isSkeleton: budgetResult.targetIsSkeleton
        }
      : undefined,
    isContextTrimmed: budgetResult.isContextTrimmed,
    warnings: budgetResult.warnings,
    estimatedChars,
    designProse
  };
}
