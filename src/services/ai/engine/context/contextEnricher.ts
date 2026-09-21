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
  /**
   * 上游裁决的目标画框 (BR-GT-06)。传入 `{ id }` 即锁定目标；传入 `{ id: null }`
   * 表示本轮明确不针对任何现有画框，富化器不得再自行推断或兜底绑定。
   */
  targetScreenOverride?: { id: string | null };
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
    projectProseMarkdown,
    targetScreenOverride
  } = params;

  // 1. Resolve mentions (ISSUE-012 fix)
  const { referencedScreens, unmatchedMentions } = resolveMentions(rawPrompt, screens);

  // 2. Identify target screen if modify_screen (ISSUE-011 fix)
  let targetScreenId = activeScreenId;

  // 2.0 上游已裁决目标画框：直接采信，跳过全部推断与兜底 (BR-GT-06)
  const hasOverride = Boolean(targetScreenOverride);
  if (hasOverride) {
    targetScreenId = targetScreenOverride!.id;
  }

  // 2.1 尝试从 [引用元素 ... 画框="xxx" ...] 中提取目标画框
  const screenNameMatch = hasOverride ? null : rawPrompt.match(/画框="([^"]+)"/);
  if (screenNameMatch) {
    const matchedName = screenNameMatch[1].trim();
    const foundEntry = Object.entries(screens).find(([, s]) => s.name === matchedName);
    if (foundEntry) {
      targetScreenId = foundEntry[0];
    }
  }

  // 2.2 尝试从 nid="xxx" 中按内容反向检索目标画框
  const nidMatch = rawPrompt.match(/nid="([^"]+)"/);
  const elementNid = nidMatch ? nidMatch[1].trim() : null;
  if (!hasOverride && !targetScreenId && elementNid) {
    const foundEntry = Object.entries(screens).find(([, s]) => s.htmlContent.includes(`data-nid="${elementNid}"`));
    if (foundEntry) {
      targetScreenId = foundEntry[0];
    }
  }

  // 2.3 尝试从提示词中精准匹配已有画框全名
  if (!hasOverride && !targetScreenId) {
    const sorted = Object.entries(screens).sort(([, a], [, b]) => b.name.length - a.name.length);
    for (const [sId, s] of sorted) {
      if (s.name && s.name.length >= 2 && rawPrompt.includes(s.name)) {
        targetScreenId = sId;
        break;
      }
    }
  }

  // 2.4 若仍未匹配，但当前为修改意图且存在画框，自动绑定首个画框，确保注入上下文。
  //     上游已裁决时不得兜底——「没引用就别改现有页」的底线在此 (BR-GT-05)
  if (!hasOverride && !targetScreenId && Object.keys(screens).length > 0 && intent === 'modify_screen') {
    targetScreenId = Object.keys(screens)[0];
  }

  let targetOriginalHtml = '';
  let targetName = '';
  if (targetScreenId && screens[targetScreenId]) {
    targetOriginalHtml = screens[targetScreenId].htmlContent;
    targetName = screens[targetScreenId].name;
  }

  // 3. Enforce budget guard
  const budgetResult = enforceBudgetGuard({
    targetHtml: targetOriginalHtml,
    targetId: targetScreenId || undefined,
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
    userPrompt = `[Attached Reference UI Design Screenshot: "${attachment.name}"]
[VISUAL REVERSE-ENGINEERING & REPLICATION PROTOCOL (高保真视觉反推与还原协议)]:
You MUST thoroughly visually analyze the attached screenshot and reproduce its exact UI design, visual mood, layout hierarchy, and element structures into high-fidelity HTML:

1. GLOBAL CANVAS & AMBIENT MOOD (全局氛围与背景):
   - Check the overall background of the screenshot: Is it a warm peach/coral gradient, a pastel tint, or a brand atmosphere?
   - If the screenshot has a colored or gradient background, DO NOT flatten it to stark white! Apply ambient background classes (.bg-ambient-warm, .bg-ambient-cool, or .bg-gradient-soft) or gradient styling to the outer container.
   - If there are floating soft rounded elements, decorative squares or ambient blobs in the background, reproduce them using subtle background shapes.

2. HERO SECTION VS. BOTTOM SHEET DECOUPLING (顶部平铺与底部卡片解耦):
   - In the screenshot, if the top branding (app logo, app title, slogan, 3 feature cards) is displayed directly on the ambient background, DO NOT wrap the top area in an artificial card or border! Keep it directly on the canvas flow.
   - If the lower section is a white bottom-sheet card with rounded top corners, wrap that entire lower section inside a cohesive container (e.g. .sheet-card or .card .r-xl with .p-6).

3. BUTTON PLACEMENT & IN-FLOW INTEGRITY (按钮位置与卡片流式对齐):
   - CRITICAL: Replicate the EXACT button placement shown in the screenshot!
   - If the primary CTA button ("立即登录" / "提交") sits inside the form card above the social proof avatars, KEEP IT INSIDE THE FORM CARD!
   - NEVER rip the button out into a fixed bottom bar (.cta-fixed) unless the screenshot explicitly shows a sticky floating bottom bar.

4. FORM MORPHOLOGY & INPUT DETAILS (输入框微形态与前缀):
   - Replicate prefix elements like country code (+86 |) accurately inside the input container using an inline row with a vertical divider (.divider-v or text divider).
   - Replicate inline action buttons (like "获取验证码" pill button) directly inside or alongside the input field.
   - STRICT ANTI-HALLUCINATION: ONLY render icons that visibly exist in the screenshot. DO NOT invent or add arbitrary lock icons or decorations if they are absent in the screenshot!

5. FEATURE CARDS & SOCIAL PROOF (功能卡片与社交背书):
   - If the screenshot has 3 feature cards in a row ("实名认证", "线下见面", "兴趣匹配"), render them side-by-side using .grid-3 .gap-2 or .row .gap-2 with .flex-1.
   - Replicate social proof avatar clusters ("已有 12,860 位单身青年加入") using .avatar-group with .avatar and accompanying text.

User Request: ${userPrompt}`;
  }

  // Inject target screen if modifying (ISSUE-011 core)
  const isTargetedScreenModification =
    (intent === 'modify_screen' || Boolean(elementNid)) &&
    Boolean(targetScreenId) &&
    Boolean(budgetResult.targetScreenHtml);

  if (isTargetedScreenModification && targetScreenId) {
    const elementDirective = elementNid
      ? `\n[定向元素精准修改约束]: 用户明确引用了画框中 data-nid="${elementNid}" 的元素。请必须在完整输出该画框 HTML 时，重点对此节点进行精准设计与填充，严禁新建画框！除被修改元素外，其余已有布局结构和所有已有 data-nid 必须完整保留。\n`
      : '';

    userPrompt = `[待修改目标画框当前 ${budgetResult.targetIsSkeleton ? '骨架' : 'HTML'}] (名称: "${targetName}"):
\`\`\`html
${budgetResult.targetScreenHtml}
\`\`\`
${elementDirective}
[重要修改约束]: 请在严格保留原有业务内容、文本和已有 data-nid 的基础上进行指定调整。必须且仅输出被 <artifact identifier="${targetScreenId}" type="screen" title="${targetName}"> 与 </artifact> 包裹的完整 HTML，严禁输出 identifier="screen_new"。\n\n${ARTIFACT_OUTPUT_REMINDER}\n\n用户修改需求: ${userPrompt}`;
  } else {
    userPrompt = `${userPrompt}\n\n[指令约束: 适配当前 ${deviceProfile} 设备 (${frameWidth}px)，必须且仅输出被 <artifact identifier="screen_new" type="screen" title="贴切精简页面标题(不超过20字)"> 与 </artifact> 包裹的完整高保真页面，严禁在标签外输出寒暄或解释]\n\n${ARTIFACT_OUTPUT_REMINDER}`;
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
    targetScreen: targetScreenId
      ? {
          id: targetScreenId,
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
