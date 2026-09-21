import { useHistoryStore } from '../stores/useHistoryStore';

/** 文本编辑态：撤销应交还浏览器原生行为，而非回退整页改动 (BR-HIS-10) */
export function isTextEditingTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el || typeof el.tagName !== 'string') return false;
  return Boolean(el.isContentEditable) || el.tagName === 'INPUT' || el.tagName === 'TEXTAREA';
}

/**
 * 统一处理撤销/重做快捷键 (BR-HIS-10)
 *
 * 画布顶层文档与画框 iframe 内各有一套键盘监听——iframe 的事件不冒泡到父文档，
 * 两处必须走同一判定，否则「点了画框里的元素再按 Cmd+Z」就会静默失效。
 *
 * @returns 实际执行的动作；未命中快捷键返回 null
 */
export function handleHistoryShortcut(e: KeyboardEvent): 'undo' | 'redo' | null {
  if (!(e.metaKey || e.ctrlKey)) return null;
  if (typeof e.key !== 'string' || e.key.toLowerCase() !== 'z') return null;
  if (isTextEditingTarget(e.target)) return null;

  e.preventDefault();
  if (e.shiftKey) {
    useHistoryStore.getState().redo();
    return 'redo';
  }
  useHistoryStore.getState().undo();
  return 'undo';
}
