import { DesignProse } from '../../../../types/designSystem';
import { getBuiltinDesignProse } from '../../../../styles/presets/designProse';

export interface ResolveDesignProseOptions {
  presetId?: string;
  projectProseMarkdown?: string;
}

let cachedProse: DesignProse | null = null;
let cachedKey: string = '';

/**
 * 解析并提供设计散文契约 (REQ-OD-03 / BR-03.3)
 * 优先级：工程根目录 DESIGN.md > 内置预设散文
 * 结果在工程未变动时走内存缓存 (NFR-P01)
 */
export function resolveDesignProse(options: ResolveDesignProseOptions): DesignProse {
  const { presetId = 'tech-blue', projectProseMarkdown } = options;
  const key = `${presetId}::${projectProseMarkdown ? projectProseMarkdown.slice(0, 100) : 'none'}`;

  if (cachedProse && cachedKey === key) {
    return cachedProse;
  }

  if (projectProseMarkdown && projectProseMarkdown.trim()) {
    const lines = projectProseMarkdown.trim().split('\n');
    const firstHeader = lines.find((l) => l.startsWith('# '))?.replace(/^#\s*/, '') || '工程自定义设计规范';

    cachedProse = {
      presetId,
      title: firstHeader,
      tone: 'Project Custom Specification',
      rulesMarkdown: projectProseMarkdown.trim(),
      source: 'project_override'
    };
    cachedKey = key;
    return cachedProse;
  }

  const builtin = getBuiltinDesignProse(presetId);
  cachedProse = {
    ...builtin,
    source: 'builtin_preset'
  };
  cachedKey = key;
  return cachedProse;
}

/** 强制重置缓存（工程切换或存盘后调用） */
export function clearDesignProseCache(): void {
  cachedProse = null;
  cachedKey = '';
}
