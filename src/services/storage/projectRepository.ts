import { ProjectStorage } from './projectStorage';
import { getBaseCss } from '../../styles/baseCss';
import { getBuiltinDesignProse } from '../../styles/presets/designProse';
import { ArtifactManifest } from '../../types/project';

/**
 * 将画框对象或元信息规范化为标准 ArtifactManifest (REQ-OD-05 / BR-05.1)
 */
export function normalizeToArtifactManifest(
  raw: Record<string, unknown>,
  deviceProfile: 'pc' | 'mobile' = 'pc'
): ArtifactManifest {
  const id = String(raw.id || 'screen_default');
  return {
    id,
    kind: (raw.kind as ArtifactManifest['kind']) || 'screen',
    renderer: 'html-iframe',
    entry: String(raw.entry || `screens/${id}.html`),
    title: String(raw.title || raw.name || id),
    device: (raw.device as 'pc' | 'mobile') || deviceProfile,
    createdAt: typeof raw.createdAt === 'string' ? raw.createdAt : new Date().toISOString(),
    updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : new Date().toISOString(),
    metadata: (raw.metadata as Record<string, unknown>) || {}
  };
}

/**
 * 工程文件夹读写 (A2 / T-AE-40, T-AE-42, T-AE-44)。
 *
 * 落 PRD §2.7 的目录结构。此前整个工程写在单个 localStorage key 下（ISSUE-008），
 * 与 PRD D1「Tauri 桌面应用 + 工程文件夹」直接冲突，且把 `Asset.relPath` 这类
 * 本就为文件存储设计的字段架空。
 *
 * ```
 * MyProject.aidesign/
 * ├── project.json         # 主文档（不含画框 HTML 正文、不含会话）
 * ├── base.css             # 基座副本，类名白名单由此解析 (PRD §2.3.1)
 * ├── DESIGN.md            # 设计散文规范副本 (REQ-OD-03 / BR-03.2)
 * ├── screens/{id}.html    # 画框 HTML 基线，便于外部 diff 与版本管理
 * ├── screens/{id}.css     # 画框 scopedCss
 * ├── assets/images|icons  # 附件原文件
 * └── conversations/       # 会话 JSONL 分片（见 conversationStore.ts）
 * ```
 *
 * **画框 HTML 单独成文件**正是 PRD §2.7 选择文件夹的理由之一：可被 Git 版本管理、
 * 可人工检查与外部编辑、损坏时可局部恢复。
 */

const PROJECT_JSON = 'project.json';
const BASE_CSS = 'base.css';
const DESIGN_MD = 'DESIGN.md';
const LOCK_FILE = '.session.lock';

/** project.json 中的画框条目——正文外置，此处只留元信息 */
interface ScreenMeta {
  id: string;
  name: string;
  position: { x: number; y: number };
  measuredHeight?: number;
  thumbnail?: string;
  kind?: string;
  renderer?: string;
  entry?: string;
  title?: string;
  device?: string;
  createdAt?: string;
  updatedAt?: string;
  metadata?: Record<string, unknown>;
}

/**
 * 工程主文档。
 *
 * ⚠️ `screens` 的实际持久化形态是 **Record<id, Screen>**（见 useProjectStore.saveProject），
 * 尽管 `types/project.ts` 的 `ProjectData` 把它声明为 `Screen[]`——这是既有的
 * 类型与实现不符，此处按**真实形态**处理，不去改动持久化契约。
 */
export interface ProjectDocument {
  id: string;
  name: string;
  schemaVersion?: number;
  createdAt?: number;
  savedAt?: number;
  settings: Record<string, unknown>;
  designSystem: Record<string, unknown>;
  screens: Record<string, Record<string, unknown>>;
  screenOrder?: string[];
  assets?: unknown;
  components?: unknown;
  decisions?: unknown;
  overrides?: unknown;
  panelStates?: unknown;
  coverImage?: string;
  quickPrompts?: unknown;
}

export class ProjectRepository {
  constructor(private readonly storage: ProjectStorage) {}

  /** 写入工程。画框正文外置为独立文件，project.json 只留元信息 */
  async save(doc: ProjectDocument): Promise<void> {
    await this.storage.ensureDir('screens');

    const deviceProfile = (doc.settings as { deviceProfile?: 'pc' | 'mobile' }).deviceProfile ?? 'pc';

    const screenMetas: Record<string, ScreenMeta> = {};
    for (const [sid, raw] of Object.entries(doc.screens ?? {})) {
      const { htmlContent, scopedCss, ...meta } = raw;
      if (typeof htmlContent === 'string') {
        await this.storage.writeTextAtomic(`screens/${sid}.html`, htmlContent);
      }
      if (typeof scopedCss === 'string' && scopedCss) {
        await this.storage.writeTextAtomic(`screens/${sid}.css`, scopedCss);
      }

      // REQ-OD-05 / BR-05.1 & BR-05.2: 规范化 ArtifactManifest 并落盘侧车
      const manifest = normalizeToArtifactManifest({ ...raw, id: sid }, deviceProfile);
      await this.storage.writeTextAtomic(
        `screens/${sid}.manifest.json`,
        JSON.stringify(manifest, null, 2)
      );

      screenMetas[sid] = {
        ...manifest,
        name: (raw.name as string) || manifest.title,
        position: (raw.position as { x: number; y: number }) || { x: 0, y: 0 },
        measuredHeight: raw.measuredHeight as number | undefined,
        thumbnail: raw.thumbnail as string | undefined,
        metadata: (raw.metadata as Record<string, unknown>) || {}
      };
    }

    await this.storage.writeTextAtomic(BASE_CSS, getBaseCss(deviceProfile));

    // REQ-OD-03 / BR-03.2: 初始工程根目录生成 DESIGN.md 副本
    const presetId = (doc.designSystem as { id?: string })?.id?.replace(/^theme-/, '') || 'tech-blue';
    const hasDesignMd = await this.storage.exists(DESIGN_MD);
    if (!hasDesignMd) {
      const prose = getBuiltinDesignProse(presetId);
      await this.storage.writeTextAtomic(DESIGN_MD, prose.rulesMarkdown);
    }

    await this.storage.writeTextAtomic(
      PROJECT_JSON,
      JSON.stringify({ ...doc, screens: screenMetas, savedAt: Date.now() }, null, 2)
    );
  }

  async getDesignProseMarkdown(): Promise<string | null> {
    return this.storage.readText(DESIGN_MD);
  }

  async writeDesignProseMarkdown(content: string): Promise<void> {
    await this.storage.writeTextAtomic(DESIGN_MD, content);
  }

  /** 读回工程。缺失的画框文件跳过而非整体失败——局部损坏可局部恢复 */
  async load(): Promise<ProjectDocument | null> {
    const raw = await this.storage.readText(PROJECT_JSON);
    if (!raw) return null;

    let doc: ProjectDocument;
    try {
      doc = JSON.parse(raw) as ProjectDocument;
    } catch {
      return null;
    }

    const deviceProfile = (doc.settings as { deviceProfile?: 'pc' | 'mobile' })?.deviceProfile ?? 'pc';
    const screens: Record<string, Record<string, unknown>> = {};
    for (const [sid, meta] of Object.entries(doc.screens ?? {})) {
      const htmlContent = await this.storage.readText(`screens/${sid}.html`);
      if (htmlContent === null) {
        // 单个画框文件缺失只跳过该画框——局部损坏可局部恢复，
        // 这正是 PRD §2.7 选择文件夹而非单文件的理由之一
        console.warn(`[project] 画框正文缺失，跳过: ${sid}`);
        continue;
      }
      const scopedCss = await this.storage.readText(`screens/${sid}.css`);

      // 自动补齐历史记录缺失的 renderer / entry 等契约字段 (BR-05.1)
      const norm = normalizeToArtifactManifest({ ...meta, id: sid }, deviceProfile);
      screens[sid] = {
        ...meta,
        renderer: norm.renderer,
        entry: norm.entry,
        kind: norm.kind,
        title: norm.title,
        device: norm.device,
        htmlContent,
        ...(scopedCss ? { scopedCss } : {})
      };
    }
    return { ...doc, screens };
  }

  async isValidProjectFolder(): Promise<boolean> {
    return this.storage.exists(PROJECT_JSON);
  }

  // ── 崩溃恢复 (T-AE-44 / PRD §3.8.5) ────────────────────────────────────
  //
  // 打开工程时落一个 lock，正常关闭时移除。下次打开若发现 lock 仍在，
  // 说明上次是异常退出。会话 JSONL 是追加写的，最多丢最后一行，
  // 因此恢复内容 = 最后一次自动保存 + 完整的会话行。

  async acquireLock(): Promise<void> {
    await this.storage.writeTextAtomic(LOCK_FILE, JSON.stringify({ openedAt: Date.now() }));
  }

  async releaseLock(): Promise<void> {
    await this.storage.remove(LOCK_FILE);
  }

  /** 返回上次异常退出的时间戳；正常关闭过则返回 null */
  async detectUncleanShutdown(): Promise<number | null> {
    const raw = await this.storage.readText(LOCK_FILE);
    if (!raw) return null;
    try {
      return (JSON.parse(raw) as { openedAt: number }).openedAt;
    } catch {
      return Date.now();
    }
  }
}

// ── localStorage → 工程文件夹迁移 (T-AE-42) ────────────────────────────────

export interface MigrationResult {
  ok: boolean;
  screenCount: number;
  /** 迁移前的原始 JSON，失败时用于回退——绝不在验证通过前删除源数据 */
  backup: string;
  error?: string;
}

/**
 * 迁移一个工程到文件夹，**零丢失**是门禁要求，故流程是：
 *   1. 先留下完整备份；
 *   2. 写入文件夹；
 *   3. **读回并逐画框比对**，任何一处不一致即判失败；
 *   4. 失败时不触碰源数据，由调用方决定是否回退。
 *
 * 源 localStorage 数据在验证通过前绝不删除。
 */
export async function migrateProjectToFolder(
  sourceJson: string,
  storage: ProjectStorage
): Promise<MigrationResult> {
  const backup = sourceJson;
  let doc: ProjectDocument;
  try {
    doc = JSON.parse(sourceJson) as ProjectDocument;
  } catch (e) {
    return { ok: false, screenCount: 0, backup, error: `源数据解析失败: ${String(e)}` };
  }

  const repo = new ProjectRepository(storage);
  try {
    await repo.save(doc);
  } catch (e) {
    return { ok: false, screenCount: 0, backup, error: `写入失败: ${String(e)}` };
  }

  // 读回验证：画框数量与每个画框的 HTML 必须逐字节一致
  const reloaded = await repo.load();
  if (!reloaded) {
    return { ok: false, screenCount: 0, backup, error: '读回验证失败：无法解析 project.json' };
  }
  const srcIds = Object.keys(doc.screens ?? {});
  const gotIds = Object.keys(reloaded.screens ?? {});
  if (gotIds.length !== srcIds.length) {
    return {
      ok: false,
      screenCount: gotIds.length,
      backup,
      error: `读回验证失败：画框数量不符（源 ${srcIds.length}，读回 ${gotIds.length}）`
    };
  }
  for (const sid of srcIds) {
    const got = reloaded.screens[sid];
    if (!got || got.htmlContent !== doc.screens[sid].htmlContent) {
      return { ok: false, screenCount: gotIds.length, backup, error: `读回验证失败：画框 ${sid} 内容不一致` };
    }
  }

  return { ok: true, screenCount: gotIds.length, backup };
}
