/**
 * A2 · 持久化与会话存档 验收测试 (doc/aesthetic/plan.md §5.1 / §5.2)
 */
import { describe, test, expect, beforeEach } from 'bun:test';
import {
  LocalStorageStorage,
  QuotaExceededError,
  createProjectStorage
} from '../src/services/storage/projectStorage';
import { ConversationStore, type ConversationTurn } from '../src/services/storage/conversationStore';
import type { ProjectStorage } from '../src/services/storage/projectStorage';

/** 模拟写满的存储：happy-dom 的 localStorage 方法不可覆写，故用注入式假实现测契约 */
class FullStorage implements ProjectStorage {
  readonly kind = 'localStorage' as const;
  async ensureDir() {}
  async exists() { return false; }
  async readText() { return null; }
  async writeTextAtomic(rel: string): Promise<void> { throw new QuotaExceededError(rel); }
  async appendLine(rel: string): Promise<void> { throw new QuotaExceededError(rel); }
  async readTailLines() { return []; }
  async readAllLines() { return []; }
  async writeBinary(rel: string): Promise<void> { throw new QuotaExceededError(rel); }
  async listDir() { return []; }
  async remove() {}
}
import { AttachmentStore, parseDataUrl, approxBytes } from '../src/services/storage/attachmentStore';

const PNG_1PX =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

const turn = (id: string, ts: number, text = 'hi'): ConversationTurn => ({
  turnId: id,
  ts,
  user: { text },
  assistant: { text: 'ok', durationMs: 100 }
});

let storage: LocalStorageStorage;
let conv: ConversationStore;

beforeEach(() => {
  localStorage.clear();
  storage = new LocalStorageStorage('test');
  conv = new ConversationStore(storage);
});

describe('T-AE-30 · 存储层抽象', () => {
  test('无 Tauri 运行时回退 localStorage', () => {
    expect(createProjectStorage('p1').kind).toBe('localStorage');
  });

  test('原子写入与读取往返一致', async () => {
    await storage.writeTextAtomic('project.json', '{"a":1}');
    expect(await storage.readText('project.json')).toBe('{"a":1}');
  });

  test('配额溢出抛出可识别错误而非裸异常', async () => {
    await expect(new FullStorage().writeTextAtomic('x', 'y')).rejects.toBeInstanceOf(QuotaExceededError);
  });
});

describe('T-AE-31 · 会话 JSONL 分片与恢复', () => {
  test('重开工程后会话完整恢复', async () => {
    for (let i = 0; i < 5; i++) await conv.appendTurn(turn(`t${i}`, Date.UTC(2026, 8, 16) + i, `msg ${i}`));
    // 模拟重开：用同一存储新建一个 store 实例
    const reopened = new ConversationStore(new LocalStorageStorage('test'));
    const restored = await reopened.loadRecent(50);
    expect(restored.length).toBe(5);
    expect(restored.map((t) => t.user.text)).toEqual(['msg 0', 'msg 1', 'msg 2', 'msg 3', 'msg 4']);
  });

  test('按月分片，索引正确统计', async () => {
    await conv.appendTurn(turn('a', Date.UTC(2026, 7, 5)));
    await conv.appendTurn(turn('b', Date.UTC(2026, 8, 5)));
    await conv.appendTurn(turn('c', Date.UTC(2026, 8, 6)));
    const s = await conv.stats();
    expect(s.shards).toBe(2);
    expect(s.turns).toBe(3);
  });

  test('追加不重写已有内容（无写入放大）', async () => {
    await conv.appendTurn(turn('a', Date.UTC(2026, 8, 1)));
    const after1 = await storage.readAllLines('conversations/2026-09.jsonl');
    await conv.appendTurn(turn('b', Date.UTC(2026, 8, 2)));
    const after2 = await storage.readAllLines('conversations/2026-09.jsonl');
    expect(after2.length).toBe(after1.length + 1);
    expect(after2[0]).toBe(after1[0]); // 第一行逐字节未变
  });

  test('损坏一行不影响其余轮次加载（JSONL 关键优势）', async () => {
    for (let i = 0; i < 3; i++) await conv.appendTurn(turn(`t${i}`, Date.UTC(2026, 8, 16) + i));
    const raw = (await storage.readText('conversations/2026-09.jsonl'))!.split('\n');
    raw[1] = '{ 这行被损坏了';
    await storage.writeTextAtomic('conversations/2026-09.jsonl', raw.join('\n'));
    const restored = await conv.loadRecent(50);
    expect(restored.length).toBe(2);
    expect(restored.map((t) => t.turnId)).toEqual(['t0', 't2']);
  });

  test('写入失败不抛出到调用方（不拖垮工程保存）', async () => {
    // ISSUE-008 的数据丢失级风险正源于此前没有任何捕获
    const failing = new ConversationStore(new FullStorage());
    await expect(failing.appendTurn(turn('x', Date.now()))).resolves.toBe(false);
  });

  test('附件落盘失败同样不抛出', async () => {
    await expect(new AttachmentStore(new FullStorage()).save('a.png', PNG_1PX)).resolves.toBeNull();
  });

  test('向上滚动可加载更早轮次', async () => {
    const base = Date.UTC(2026, 8, 10);
    for (let i = 0; i < 4; i++) await conv.appendTurn(turn(`t${i}`, base + i * 1000));
    const older = await conv.loadBefore(base + 2000, 10);
    expect(older.map((t) => t.turnId)).toEqual(['t0', 't1']);
  });
});

describe('T-AE-32 · 附件落盘，会话不存 base64', () => {
  test('dataUrl 落为 assets/ 下的文件并返回 relPath', async () => {
    const asset = await new AttachmentStore(storage).save('ref.png', PNG_1PX);
    expect(asset).not.toBeNull();
    expect(asset!.relPath).toMatch(/^assets\/images\/asset_[a-z0-9_]+\.png$/);
    expect(asset!.mimeType).toBe('image/png');
  });

  test('会话记录中不含任何 base64 原文', async () => {
    const asset = await new AttachmentStore(storage).save('ref.png', PNG_1PX);
    await conv.appendTurn({
      turnId: 'a', ts: Date.now(),
      user: { text: '照这个做', attachments: [asset!.relPath] },
      assistant: { text: 'ok' }
    });
    const raw = (await storage.readText('conversations/' + new Date().toISOString().slice(0, 7) + '.jsonl')) ?? '';
    expect(raw).not.toContain('base64');
    expect(raw).not.toContain(PNG_1PX.slice(30, 60));
    expect(raw).toContain('assets/images/');
  });

  test('非法 dataUrl 不落盘', async () => {
    expect(await new AttachmentStore(storage).save('x', 'not-a-data-url')).toBeNull();
    expect(parseDataUrl('nope')).toBeNull();
  });

  test('体积估算可用于配额预判', () => {
    expect(approxBytes(PNG_1PX.split(',')[1])).toBeGreaterThan(0);
  });
});

describe('T-AE-36/37 · 变更摘要与 Checkpoint 锚点', () => {
  test('变更摘要随轮次持久化，可反查 Checkpoint', async () => {
    await conv.appendTurn({
      turnId: 't1', ts: Date.now(),
      user: { text: '做个登录页' },
      assistant: { text: '' },
      intent: 'create_screen',
      changeSet: {
        screens: [{ id: 's1', name: '登录页', action: 'created' }],
        checkpointId: 'cp_1',
        tokens: [{ path: 'colors.primary.500', from: '#2563eb', to: '#f97316' }]
      }
    });
    const [restored] = await conv.loadRecent(10);
    // 重开工程后「回到这里」仍可用——此前重开即全部失效
    expect(restored.changeSet?.checkpointId).toBe('cp_1');
    expect(restored.changeSet?.screens?.[0].name).toBe('登录页');
    expect(restored.changeSet?.tokens?.[0].to).toBe('#f97316');
  });
});

describe('T-AE-38 · 归档导出与超限清理', () => {
  test('导出 Markdown 含变更时间线', async () => {
    await conv.appendTurn({
      turnId: 't1', ts: Date.UTC(2026, 8, 16),
      user: { text: '做个登录页' },
      assistant: { text: '' },
      changeSet: { screens: [{ id: 's1', name: '登录页', action: 'created' }] }
    });
    const md = await conv.exportMarkdown();
    expect(md).toContain('# 会话归档');
    expect(md).toContain('做个登录页');
    expect(md).toContain('画框「登录页」创建');
  });

  test('超限清理折叠为只读摘要而非删除', async () => {
    await conv.appendTurn({
      turnId: 'old', ts: Date.UTC(2026, 6, 1),
      user: { text: '一段很长的历史消息'.repeat(20) },
      assistant: { text: '一段很长的助手回复'.repeat(50) },
      changeSet: { checkpointId: 'cp_old' }
    });
    await conv.appendTurn(turn('new', Date.UTC(2026, 8, 1)));

    const compacted = await conv.compactOldest(1);
    expect(compacted).toBe(1);

    const lines = await storage.readAllLines('conversations/2026-07.jsonl');
    const kept = JSON.parse(lines[0]);
    // 原文被丢弃，但锚点与变更摘要保留
    expect(kept.assistant.text).toBe('');
    expect(kept.user.text.length).toBeLessThanOrEqual(80);
    expect(kept.changeSet.checkpointId).toBe('cp_old');
  });
});

describe('T-AE-35 / ISSUE-010 · 决策溯源', () => {
  test('AI 提取的约定记为 auto_extracted 并带会话锚点', async () => {
    const { useProjectStore } = await import('../src/stores/useProjectStore');
    const { techIndigoTheme } = await import('../src/utils/themePresets');
    useProjectStore.getState().initNewProject({ name: 'D', deviceProfile: 'pc', designSystem: techIndigoTheme });

    useProjectStore.getState().addDecision('不使用渐变', 'global', undefined, {
      kind: 'auto_extracted',
      conversationId: 'ast_123'
    });
    const dec = Object.values(useProjectStore.getState().decisions).find((d) => d.text === '不使用渐变')!;
    expect(dec.source.kind).toBe('auto_extracted');
    // conversationId 此前恒为 undefined，导致「供用户回溯」的设计落空
    expect(dec.source.conversationId).toBe('ast_123');
  });

  test('用户手写的约定仍记为 manual', async () => {
    const { useProjectStore } = await import('../src/stores/useProjectStore');
    useProjectStore.getState().addDecision('按钮一律胶囊圆角', 'global');
    const dec = Object.values(useProjectStore.getState().decisions).find((d) => d.text === '按钮一律胶囊圆角')!;
    expect(dec.source.kind).toBe('manual');
    expect(dec.source.conversationId).toBeUndefined();
  });
});
