import { Screen } from '../types/project';

export interface ComponentOccurrence {
  screenId: string;
  screenName: string;
  nid: string;
  html: string;
  previewTitle: string;
}

export interface ComponentCandidate {
  fingerprint: string;
  count: number;
  suggestedName: string;
  templateHtml: string;
  occurrences: ComponentOccurrence[];
}

export class ComponentDetector {
  /**
   * Generates a structural fingerprint for an element subtree.
   * Format: tag.sortedClasses[children]
   * Strips all texts, image sources, data-*, style attributes, etc.
   */
  public static computeFingerprint(el: Element): string {
    const tag = el.tagName.toLowerCase();
    
    // Sort and normalize class list
    const classList = Array.from(el.classList).sort().join('.');
    const head = classList ? `${tag}.${classList}` : tag;

    // Filter child elements (ignore pure text / comment nodes)
    const childEls = Array.from(el.children).filter(
      (c) => !['script', 'style', 'noscript'].includes(c.tagName.toLowerCase())
    );

    if (childEls.length === 0) {
      return head;
    }

    const childFingerprints = childEls.map((c) => this.computeFingerprint(c)).join('+');
    return `${head}>(${childFingerprints})`;
  }

  /**
   * Scans all screens in the project to detect structural duplicate subtrees (PRD §3.7.1)
   * Returns candidates that repeat at least minOccurrences times (default 3).
   */
  public static detectRepeatedStructures(
    screens: Record<string, Screen>,
    minOccurrences = 3
  ): ComponentCandidate[] {
    const fingerprintMap = new Map<string, ComponentOccurrence[]>();
    const parser = new DOMParser();

    Object.values(screens).forEach((screen) => {
      try {
        const doc = parser.parseFromString(`<body>${screen.htmlContent}</body>`, 'text/html');
        const allElements = doc.body.querySelectorAll('*');

        allElements.forEach((el) => {
          // Skip elements that are already part of a component instance
          if (el.hasAttribute('data-component-id') || el.closest('[data-component-id]')) {
            return;
          }

          const nid = el.getAttribute('data-nid');
          if (!nid) return;

          // Skip root body / trivial single leaves
          const tag = el.tagName.toLowerCase();
          if (['body', 'html', 'head'].includes(tag)) return;

          // Only consider nodes with at least 1 child or notable semantic classes (cards, buttons, widgets)
          const hasChildren = el.children.length > 0;
          const hasSemanticClass = Array.from(el.classList).some((cls) =>
            ['card', 'panel', 'btn', 'badge', 'widget', 'metric', 'list-item', 'nav-item'].includes(cls)
          );

          if (!hasChildren && !hasSemanticClass) return;

          const fp = this.computeFingerprint(el);
          // Ignore ultra-simple single wrappers like "div>(div)" with no classes
          if (fp.length < 8) return;

          const occurrences = fingerprintMap.get(fp) || [];
          const previewTitle = (el.textContent || '').trim().slice(0, 24) || tag;

          occurrences.push({
            screenId: screen.id,
            screenName: screen.name,
            nid,
            html: el.outerHTML,
            previewTitle
          });

          fingerprintMap.set(fp, occurrences);
        });
      } catch (e) {
        console.warn(`Failed to scan screen ${screen.id} for component duplicates:`, e);
      }
    });

    const candidates: ComponentCandidate[] = [];

    fingerprintMap.forEach((occurrences, fingerprint) => {
      if (occurrences.length >= minOccurrences) {
        // Derive human-readable name from the first occurrence
        const first = occurrences[0];
        let suggestedName = '复用组件卡片';

        if (fingerprint.includes('card')) {
          suggestedName = '数据/内容卡片 (Card)';
        } else if (fingerprint.includes('btn')) {
          suggestedName = '操作按钮组 (Button)';
        } else if (fingerprint.includes('grid') || fingerprint.includes('col')) {
          suggestedName = '布局模块 (Layout Group)';
        } else if (first.previewTitle) {
          suggestedName = `组件: ${first.previewTitle.slice(0, 10)}`;
        }

        candidates.push({
          fingerprint,
          count: occurrences.length,
          suggestedName,
          templateHtml: first.html,
          occurrences
        });
      }
    });

    // Sort descending by occurrence count
    return candidates.sort((a, b) => b.count - a.count);
  }
}
