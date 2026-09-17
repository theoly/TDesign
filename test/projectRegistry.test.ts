import { describe, test, expect, beforeEach } from 'bun:test';
import {
  LEGACY_PROJECT_KEY,
  WORKSPACE_KEY,
  deleteProjectData,
  listProjects,
  migrateLegacyProject,
  projectExists,
  projectKey,
  readProject,
  removeMeta,
  upsertMeta,
  writeProject
} from '../src/utils/projectRegistry';

const meta = (id: string, name: string, updatedAt = Date.now()) => ({
  id,
  name,
  deviceProfile: 'pc' as const,
  frameWidth: 1440,
  createdAt: 1,
  updatedAt,
  screenCount: 2
});

describe('projectRegistry —— 多工程存储 (PRD §3.0.1)', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  test('upsert 新增与更新同一 id 不产生重复条目', () => {
    upsertMeta(meta('p1', '工程一'));
    upsertMeta(meta('p1', '改名后'));
    const all = listProjects();
    expect(all.length).toBe(1);
    expect(all[0].name).toBe('改名后');
  });

  test('列表按最后修改时间倒序', () => {
    upsertMeta(meta('old', '旧', 1000));
    upsertMeta(meta('new', '新', 9000));
    expect(listProjects().map((p) => p.id)).toEqual(['new', 'old']);
  });

  test('工程数据按 id 独立存储，互不覆盖', () => {
    writeProject('a', JSON.stringify({ name: 'A' }));
    writeProject('b', JSON.stringify({ name: 'B' }));
    expect(JSON.parse(readProject('a')!).name).toBe('A');
    expect(JSON.parse(readProject('b')!).name).toBe('B');
  });

  test('从列表移除不删除工程数据', () => {
    writeProject('p1', '{}');
    upsertMeta(meta('p1', '工程一'));
    removeMeta('p1');
    expect(listProjects().length).toBe(0);
    expect(projectExists('p1')).toBe(true);
  });

  test('删除工程同时清掉数据与列表条目', () => {
    writeProject('p1', '{}');
    upsertMeta(meta('p1', '工程一'));
    deleteProjectData('p1');
    expect(listProjects().length).toBe(0);
    expect(projectExists('p1')).toBe(false);
  });

  test('列表有条目但数据丢失时可被检出（卡片需置灰）', () => {
    upsertMeta(meta('ghost', '幽灵工程'));
    expect(listProjects().length).toBe(1);
    expect(projectExists('ghost')).toBe(false);
  });

  test('损坏的注册表 JSON 不抛异常，退化为空列表', () => {
    localStorage.setItem(WORKSPACE_KEY, '{ 这不是 JSON');
    expect(listProjects()).toEqual([]);
  });
});

describe('旧版单工程存档迁移', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  test('迁移后旧存档进入列表，工程数据可读，旧 key 被清理', () => {
    localStorage.setItem(
      LEGACY_PROJECT_KEY,
      JSON.stringify({
        id: 'proj_default',
        name: '我的旧工程',
        savedAt: 1234,
        settings: { deviceProfile: 'mobile', frameWidth: 390 },
        screens: { s1: { htmlContent: '<p>hi</p>' }, s2: { htmlContent: '<p>ho</p>' } }
      })
    );

    const migrated = migrateLegacyProject()!;
    expect(migrated).not.toBeNull();
    expect(migrated.name).toBe('我的旧工程');
    expect(migrated.deviceProfile).toBe('mobile');
    expect(migrated.screenCount).toBe(2);
    expect(migrated.previewHtml).toBe('<p>hi</p>');

    // 数据可读，且不再占用 proj_default 这个会与新建工程冲突的 id
    expect(migrated.id).not.toBe('proj_default');
    expect(readProject(migrated.id)).not.toBeNull();
    expect(localStorage.getItem(LEGACY_PROJECT_KEY)).toBeNull();
    expect(listProjects().length).toBe(1);
  });

  test('注册表已有工程时不再迁移，避免重复导入', () => {
    upsertMeta(meta('p1', '已有工程'));
    localStorage.setItem(LEGACY_PROJECT_KEY, JSON.stringify({ name: '旧的', screens: {} }));
    expect(migrateLegacyProject()).toBeNull();
    expect(listProjects().length).toBe(1);
  });

  test('没有旧存档时返回 null', () => {
    expect(migrateLegacyProject()).toBeNull();
  });

  test('迁移写入的 key 与 projectKey 一致', () => {
    localStorage.setItem(LEGACY_PROJECT_KEY, JSON.stringify({ name: 'X', screens: {} }));
    const m = migrateLegacyProject()!;
    expect(localStorage.getItem(projectKey(m.id))).not.toBeNull();
  });
});
