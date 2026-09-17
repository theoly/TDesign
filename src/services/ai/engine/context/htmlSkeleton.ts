export function htmlSkeletonize(html: string): string {
  if (!html || typeof html !== 'string') return '';
  if (typeof DOMParser === 'undefined') {
    // Fallback if no DOMParser in runtime
    return html.slice(0, 500);
  }

  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');

    // 1. Remove scripts and styles
    doc.querySelectorAll('script, style, link, meta').forEach((el) => el.remove());

    // 2. Simplify SVGs: preserve outer svg attributes/classes, remove dense path/polygon children
    doc.querySelectorAll('svg').forEach((svg) => {
      svg.innerHTML = '<path d="..."/>';
    });

    // 3. TreeWalker: prune textual noise, keeping element tree, data-nid and classes
    const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT);
    const textNodes: Node[] = [];
    while (walker.nextNode()) {
      textNodes.push(walker.currentNode);
    }

    for (const node of textNodes) {
      const text = node.nodeValue?.trim() || '';
      if (!text) {
        node.nodeValue = '';
      } else if (text.length > 8) {
        node.nodeValue = text.slice(0, 4) + '...';
      }
    }

    return doc.body.innerHTML.trim();
  } catch (err) {
    console.warn('htmlSkeletonize error, returning truncated original:', err);
    return html.slice(0, 1000);
  }
}
