import { DesignSystem } from '../types/designSystem';
import { extractClassWhitelist } from './cssCompiler';
import { getBaseCss, type DeviceProfile } from '../styles/baseCss';

/** 编辑器注入的运行时类，不属于设计基座，不应报为 unknown_class */
const IGNORED_CLASS_PREFIXES = ['aidesign-'];

export interface LintIssue {
  nid: string;
  tagName: string;
  issueType: 'literal_color' | 'literal_radius' | 'literal_spacing' | 'unknown_class' | 'escaped_override';
  description: string;
  rawSnippet: string;
  suggestedFix: string;
}

export interface LintReport {
  totalNodes: number;
  compliantNodes: number;
  complianceRate: number; // 0 - 100
  issues: LintIssue[];
}

export class TokenLintEngine {
  /**
   * Scans HTML content and returns structured lint report
   */
  public static scan(html: string, designSystem: DesignSystem, deviceProfile: DeviceProfile = 'pc'): LintReport {
    const issues: LintIssue[] = [];
    let totalNodes = 0;
    const whitelist = new Set(extractClassWhitelist(getBaseCss(deviceProfile)));

    // Parse all element nodes
    const tagMatches = html.matchAll(/<([a-zA-Z0-9-]+)([^>]*?)>/g);

    for (const m of tagMatches) {
      const tag = m[1].toLowerCase();
      const attrs = m[2];

      if (['!doctype', 'html', 'head', 'meta', 'title', 'link', 'style', 'script'].includes(tag)) {
        continue;
      }

      totalNodes++;
      const nidMatch = attrs.match(/data-nid=["']([a-zA-Z0-9]+)["']/);
      const nid = nidMatch ? nidMatch[1] : 'unknown';

      // 1. Check for literal hex or rgb colors in inline style
      const styleMatch = attrs.match(/style=["']([^"']+)["']/);
      if (styleMatch) {
        const styleStr = styleMatch[1];
        const hexMatch = styleStr.match(/#([a-fA-F0-9]{3,8})\b/);
        if (hexMatch && !styleStr.includes('var(--color-')) {
          issues.push({
            nid,
            tagName: tag,
            issueType: 'literal_color',
            description: `发现硬编码字面量色值 "${hexMatch[0]}"，破坏主题统一`,
            rawSnippet: hexMatch[0],
            suggestedFix: 'var(--color-primary)'
          });
        }

        const rgbMatch = styleStr.match(/rgba?\([^)]+\)/);
        if (rgbMatch) {
          issues.push({
            nid,
            tagName: tag,
            issueType: 'literal_color',
            description: `发现字面量 RGB 声明 "${rgbMatch[0]}"`,
            rawSnippet: rgbMatch[0],
            suggestedFix: 'var(--color-surface)'
          });
        }

        // Check for non-ladder border-radius
        const radiusMatch = styleStr.match(/border-radius:\s*([0-9]+px)/);
        if (radiusMatch && !['0px', '4px', '8px', '12px', '16px', '9999px'].includes(radiusMatch[1])) {
          issues.push({
            nid,
            tagName: tag,
            issueType: 'literal_radius',
            description: `非阶梯圆角 "${radiusMatch[1]}"`,
            rawSnippet: radiusMatch[0],
            suggestedFix: 'border-radius: var(--radius-md)'
          });
        }
      }

      // 4. T-AE-04: 检测白名单外的类名
      // 这是发现"Prompt 承诺了但 base.css 中不存在"的类名漂移的唯一防线。
      // 此前 unknown_class 只在类型中声明、无任何实现，导致 51 个空转类名长期无人察觉。
      const classMatch = attrs.match(/\bclass=["']([^"']*)["']/);
      if (classMatch) {
        const unknown = classMatch[1]
          .split(/\s+/)
          .filter(Boolean)
          .filter(c => !whitelist.has(c) && !IGNORED_CLASS_PREFIXES.some(p => c.startsWith(p)));
        for (const c of unknown) {
          issues.push({
            nid,
            tagName: tag,
            issueType: 'unknown_class',
            description: `类名 "${c}" 不在基座样式表中，渲染时不会产生任何样式`,
            rawSnippet: c,
            suggestedFix: '改用白名单内的类名，或经设计系统面板申请基座演进 (PRD §3.5.6)'
          });
        }
      }
    }

    const nonCompliantNodes = new Set(issues.map(i => i.nid)).size;
    const compliantNodes = Math.max(0, totalNodes - nonCompliantNodes);
    const complianceRate = totalNodes > 0 ? Math.round((compliantNodes / totalNodes) * 100) : 100;

    return {
      totalNodes,
      compliantNodes,
      complianceRate,
      issues
    };
  }

  /**
   * One-click batch auto-fix: maps literal values to nearest standard Tokens
   */
  public static autoFix(html: string): string {
    let fixed = html;
    // Replace hex colors with var(--color-primary) or var(--color-surface)
    fixed = fixed.replace(/color:\s*#[a-fA-F0-9]{3,8}/gi, 'color: var(--color-primary)');
    fixed = fixed.replace(/background(?:-color)?:\s*#[a-fA-F0-9]{3,8}/gi, 'background-color: var(--color-surface)');
    // Fix random px radius
    fixed = fixed.replace(/border-radius:\s*[0-9]+px/gi, 'border-radius: var(--radius-md)');
    return fixed;
  }
}

/**
 * 工程级「风格可回溯率」(A2 / T-AE-23)。
 *
 * 换主题时，只有能用 Token 表达的部分会自动回溯到已有页面；硬编码的字面量
 * 永远不跟随。此前 tokenLint 只产出孤立报告、没有产品位置——把它前置为
 * 换肤的决策依据，就从"事后报告"变成了"事前预期管理"。
 *
 * 参见 doc/aesthetic/spec.md §7.4(b)。
 */
export interface RetraceabilityReport {
  /** 0~100，可跟随主题变化的节点占比 */
  rate: number;
  totalNodes: number;
  /** 含硬编码字面量、永远不会跟随主题的节点数 */
  literalNodes: number;
  /** 被 L4 !important 覆盖挡住的节点数 */
  overriddenNodes: number;
  screens: Array<{ screenId: string; screenName: string; rate: number }>;
}

export function computeRetraceability(
  screens: Array<{ id: string; name: string; htmlContent: string }>,
  designSystem: DesignSystem,
  overrideNids: string[],
  deviceProfile: DeviceProfile = 'pc'
): RetraceabilityReport {
  const overridden = new Set(overrideNids);
  let totalNodes = 0;
  let literalNodes = 0;
  let overriddenNodes = 0;
  const perScreen: RetraceabilityReport['screens'] = [];

  for (const sc of screens) {
    const report = TokenLintEngine.scan(sc.htmlContent, designSystem, deviceProfile);
    // 只有字面量类问题代表"永远不跟随主题"；unknown_class 是另一回事
    const literalIds = new Set(
      report.issues
        .filter((i) => i.issueType.startsWith('literal_'))
        .map((i) => i.nid)
    );
    const scOverridden = [...new Set(
      (sc.htmlContent.match(/data-nid="([a-zA-Z0-9]+)"/g) || [])
        .map((m) => m.slice(10, -1))
        .filter((n) => overridden.has(n))
    )];

    const blocked = new Set([...literalIds, ...scOverridden]);
    totalNodes += report.totalNodes;
    literalNodes += literalIds.size;
    overriddenNodes += scOverridden.length;
    perScreen.push({
      screenId: sc.id,
      screenName: sc.name,
      rate: report.totalNodes > 0 ? Math.round(((report.totalNodes - blocked.size) / report.totalNodes) * 100) : 100
    });
  }

  const blockedTotal = literalNodes + overriddenNodes;
  return {
    rate: totalNodes > 0 ? Math.round(((totalNodes - blockedTotal) / totalNodes) * 100) : 100,
    totalNodes,
    literalNodes,
    overriddenNodes,
    screens: perScreen
  };
}
