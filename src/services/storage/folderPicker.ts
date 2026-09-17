/**
 * 工程文件夹选择 (A2 / T-AE-43, PRD §3.0.1)。
 *
 * 「打开本地工程：选择任意 *.aidesign 工程文件夹载入」此前完全没有实现路径——
 * 既无 tauri-plugin-dialog，capabilities 也只有 core:default。
 *
 * 非 Tauri 环境（浏览器开发 / 测试）返回 null，调用方据此回退 localStorage。
 */

type Invoke = <T>(cmd: string, args: Record<string, unknown>) => Promise<T>;

function getInvoke(): Invoke | null {
  const w = globalThis as unknown as { __TAURI__?: { core?: { invoke?: Invoke } } };
  return w.__TAURI__?.core?.invoke ?? null;
}

export function isDesktopRuntime(): boolean {
  return getInvoke() !== null;
}

/** 弹出文件夹选择器。用户取消或非桌面环境返回 null */
export async function pickProjectFolder(title = '选择工程文件夹'): Promise<string | null> {
  const invoke = getInvoke();
  if (!invoke) return null;
  try {
    const selected = await invoke<string | string[] | null>('plugin:dialog|open', {
      options: { directory: true, multiple: false, title }
    });
    if (!selected) return null;
    return Array.isArray(selected) ? selected[0] ?? null : selected;
  } catch (e) {
    console.warn('[folderPicker] 选择失败', e);
    return null;
  }
}

/** 从绝对路径取末段作为工程名 */
export function folderDisplayName(path: string): string {
  const seg = path.replace(/[\\/]+$/, '').split(/[\\/]/).pop() ?? path;
  return seg.replace(/\.aidesign$/i, '');
}
