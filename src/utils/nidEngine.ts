export class NidEngine {
  private static counter = 100000;

  public static generateNid(): string {
    const timestamp = Math.floor(Date.now() / 1000).toString(36);
    const count = (this.counter++).toString(36);
    const raw = `${timestamp}${count}`.slice(-8);
    return raw.padStart(8, '0');
  }

  /**
   * Injects 8-character base36 data-nid into every HTML element
   */
  public static injectNids(html: string): string {
    return html.replace(/<([a-zA-Z0-9-]+)([^>]*?)(\/?)>/g, (match, tag, attrs, selfClose) => {
      const lowerTag = tag.toLowerCase();
      if (['!doctype', 'html', 'head', 'meta', 'title', 'link', 'style', 'script'].includes(lowerTag)) {
        return match;
      }
      if (/data-nid=["'][^"']+["']/.test(attrs)) {
        return match;
      }
      const nid = this.generateNid();
      return `<${tag} data-nid="${nid}"${attrs}${selfClose ? ' /' : ''}>`;
    });
  }

  /**
   * Strips all internal engineering attributes (data-nid, data-asset-id, data-component-*)
   * for clean production export (PRD §3.9.2)
   */
  public static stripInternalAttributes(html: string): string {
    return html.replace(/\s*data-(?:nid|asset-id|component-[a-z0-9-]+)=["'][^"']*["']/gi, '');
  }
}
