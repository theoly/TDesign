import { PromptBuilder } from '../..//promptBuilder';
import { htmlSkeletonize } from './htmlSkeleton';

export interface ReferencedScreen {
  id: string;
  name: string;
  skeletonHtml: string;
}

export interface MentionResolveResult {
  referencedScreens: ReferencedScreen[];
  unmatchedMentions: string[];
}

export function resolveMentions(
  rawPrompt: string,
  screens: Record<string, { id: string; name: string; htmlContent: string }>
): MentionResolveResult {
  const mentionNames = PromptBuilder.parseMentions(rawPrompt);
  const referencedScreens: ReferencedScreen[] = [];
  const unmatchedMentions: string[] = [];

  const screenList = Object.values(screens);

  for (const name of mentionNames) {
    const cleanName = name.trim().toLowerCase();
    // Match by exact name or case-insensitive fuzzy match
    const found = screenList.find(
      (s) => s.name.trim().toLowerCase() === cleanName || s.name.trim().toLowerCase().includes(cleanName)
    );

    if (found) {
      referencedScreens.push({
        id: found.id,
        name: found.name,
        skeletonHtml: htmlSkeletonize(found.htmlContent)
      });
    } else {
      unmatchedMentions.push(name);
    }
  }

  return {
    referencedScreens,
    unmatchedMentions
  };
}
