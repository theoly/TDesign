import React, { useEffect, useMemo, useState } from 'react';
import { useWorkspaceStore } from '../../stores/useWorkspaceStore';
import { themePresets } from '../../utils/themePresets';
import {
  DEFAULT_STYLE_DNA,
  DOMAIN_OPTIONS,
  PERSONALITY_OPTIONS,
  SHAPE_OPTIONS,
  resolveStyleDna,
  type StyleDnaAnswers
} from '../../utils/styleDna';
import { ProjectMeta } from '../../utils/projectRegistry';
import {
  AlertTriangle,
  FolderOpen,
  Laptop,
  MoreHorizontal,
  Plus,
  HardDriveDownload,
  Search,
  Smartphone,
  Trash2,
  X
} from 'lucide-react';

/** 卡片缩略图：用受限 iframe 渲染首个画框并缩放，比维护一份 PNG 缓存简单且始终新鲜 */
const ProjectThumbnail: React.FC<{ meta: ProjectMeta }> = ({ meta }) => {
  const srcDoc = useMemo(() => {
    if (!meta.previewHtml) return null;
    return `<!doctype html><html><head><meta charset="utf-8">
<style>${meta.previewCss || ''}
  html,body{margin:0;padding:0;background:var(--color-bg,#fff);}
</style></head><body>${meta.previewHtml}</body></html>`;
  }, [meta.previewHtml, meta.previewCss]);

  if (!srcDoc) {
    return (
      <div className="w-full h-full flex items-center justify-center text-slate-600 text-[11px]">
        暂无预览
      </div>
    );
  }

  const scale = 240 / meta.frameWidth;
  return (
    <iframe
      title={`${meta.name} 预览`}
      sandbox="allow-same-origin"
      srcDoc={srcDoc}
      tabIndex={-1}
      aria-hidden
      className="border-0 pointer-events-none origin-top-left"
      style={{
        width: `${meta.frameWidth}px`,
        height: `${Math.round(150 / scale)}px`,
        transform: `scale(${scale})`
      }}
    />
  );
};

const NewProjectDialog: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const { createProject } = useWorkspaceStore();
  const [name, setName] = useState('未命名工程');
  const [device, setDevice] = useState<'pc' | 'mobile'>('pc');
  // T-AE-20: 轻量三问，全部有默认值、可直接跳过
  const [dna, setDna] = useState<StyleDnaAnswers>(DEFAULT_STYLE_DNA);

  const submit = () => {
    const trimmed = name.trim() || '未命名工程';
    const { designSystem, decisions } = resolveStyleDna(dna);
    createProject(trimmed, device, designSystem, decisions);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="w-full max-w-lg bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800">
          <h2 className="font-bold text-slate-100 text-sm">新建工程</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-200">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-5 text-xs">
          <div className="space-y-1.5">
            <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">工程名称</label>
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && submit()}
              className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-slate-200 focus:outline-none focus:border-blue-500"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">设备档位</label>
            <div className="grid grid-cols-2 gap-2">
              {([
                { key: 'pc', icon: Laptop, title: 'PC 桌面', desc: '画框宽度 1440px' },
                { key: 'mobile', icon: Smartphone, title: '移动端', desc: '画框宽度 390px' }
              ] as const).map((opt) => (
                <button
                  key={opt.key}
                  onClick={() => setDevice(opt.key)}
                  className={`flex flex-col items-start gap-1 p-3 rounded-xl border transition text-left ${
                    device === opt.key
                      ? 'border-blue-500 bg-blue-950/40'
                      : 'border-slate-800 bg-slate-950 hover:border-slate-700'
                  }`}
                >
                  <opt.icon className={`w-4 h-4 ${device === opt.key ? 'text-blue-400' : 'text-slate-500'}`} />
                  <span className="font-semibold text-slate-200">{opt.title}</span>
                  <span className="text-[10px] text-slate-500">{opt.desc}</span>
                </button>
              ))}
            </div>
            {/* D8：档位决定全工程画框宽度与断点语义，中途切换会让已生成页面全部失效 */}
            <p className="flex items-start gap-1.5 text-[10px] text-amber-400/90 leading-relaxed pt-0.5">
              <AlertTriangle className="w-3 h-3 mt-0.5 shrink-0" />
              <span>设备档位在工程创建后不可更改。</span>
            </p>
          </div>

          <div className="space-y-1.5">
            <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">风格性格</label>
            <div className="grid grid-cols-2 gap-2">
              {PERSONALITY_OPTIONS.map((opt) => {
                const preset = themePresets.find((p) => p.id === opt.presetId);
                return (
                  <button
                    key={opt.value}
                    onClick={() => setDna((d) => ({ ...d, personality: opt.value }))}
                    title={opt.hint}
                    className={`flex items-center gap-2 p-2.5 rounded-lg border transition ${
                      dna.personality === opt.value
                        ? 'border-blue-500 bg-blue-950/40'
                        : 'border-slate-800 bg-slate-950 hover:border-slate-700'
                    }`}
                  >
                    <span
                      className="w-4 h-4 rounded-full border border-white/10 shrink-0"
                      style={{ background: preset?.primaryColor }}
                    />
                    <span className="text-slate-300 truncate">{opt.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">圆角与密度</label>
            <div className="grid grid-cols-3 gap-2">
              {SHAPE_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setDna((d) => ({ ...d, shape: opt.value }))}
                  title={opt.hint}
                  className={`p-2.5 rounded-lg border transition text-center ${
                    dna.shape === opt.value
                      ? 'border-blue-500 bg-blue-950/40 text-slate-200'
                      : 'border-slate-800 bg-slate-950 hover:border-slate-700 text-slate-300'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
              行业语境 <span className="normal-case tracking-normal text-slate-600">（可选 · 只生成工程约定，不改 Token）</span>
            </label>
            <div className="flex flex-wrap gap-2">
              {DOMAIN_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setDna((d) => ({ ...d, domain: opt.value }))}
                  className={`px-3 py-1.5 rounded-lg border transition ${
                    dna.domain === opt.value
                      ? 'border-blue-500 bg-blue-950/40 text-slate-200'
                      : 'border-slate-800 bg-slate-950 hover:border-slate-700 text-slate-400'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            <p className="text-[10px] text-slate-500 leading-relaxed pt-0.5">
              三问均有默认值，可直接创建跳过。进入工程后可在风格样张上并排对比、随时更换。
            </p>
          </div>
        </div>

        <div className="flex justify-end gap-2 px-5 py-4 border-t border-slate-800">
          <button onClick={onClose} className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs">
            取消
          </button>
          <button onClick={submit} className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white font-medium rounded-lg text-xs shadow">
            创建并进入
          </button>
        </div>
      </div>
    </div>
  );
};

export const ProjectManager: React.FC = () => {
  const { projects, missingIds, refresh, openProject, renameProject, removeFromList, deleteProject, openLocalFolder, migrateProject } =
    useWorkspaceStore();
  const [search, setSearch] = useState('');
  const [notice, setNotice] = useState<string | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<ProjectMeta | null>(null);

  useEffect(() => {
    refresh();
  }, []);

  const filtered = projects.filter((p) => p.name.toLowerCase().includes(search.trim().toLowerCase()));

  const fmtTime = (t: number) => {
    const d = new Date(t);
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };

  return (
    <div className="w-screen h-screen bg-slate-950 text-slate-200 overflow-y-auto" onClick={() => setMenuFor(null)}>
      <div className="max-w-5xl mx-auto px-8 py-12">
        <header className="flex items-center gap-3 mb-8">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-500 flex items-center justify-center font-bold text-white shadow">
            D
          </div>
          <div>
            <h1 className="text-lg font-bold text-slate-100">AI Designer Studio</h1>
            <p className="text-xs text-slate-500">选择一个工程继续，或新建一个开始。</p>
          </div>
        </header>

        <div className="flex items-center gap-3 mb-6">
          <div className="relative flex-1">
            <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="搜索工程"
              className="w-full bg-slate-900 border border-slate-800 rounded-lg pl-8 pr-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-blue-500"
            />
          </div>
          {/* T-AE-43: 打开任意本地 *.aidesign 工程文件夹 (PRD §3.0.1) */}
          <button
            onClick={async () => {
              const r = await openLocalFolder();
              if (!r.ok && r.message !== '已取消') setNotice(r.message);
            }}
            className="flex items-center gap-1.5 px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 font-medium rounded-lg text-xs transition"
          >
            <FolderOpen className="w-3.5 h-3.5" />
            <span>打开本地工程</span>
          </button>
          <button
            onClick={() => setShowNew(true)}
            className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white font-medium rounded-lg text-xs shadow transition"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>新建工程</span>
          </button>
        </div>

        {notice && (
          <div className="mb-4 px-3 py-2 bg-amber-950/40 border border-amber-800/50 rounded-lg text-[11px] text-amber-200 flex items-center justify-between gap-3">
            <span className="leading-relaxed">{notice}</span>
            <button onClick={() => setNotice(null)} className="text-amber-400 hover:text-amber-200 shrink-0">
              知道了
            </button>
          </div>
        )}

        {projects.length === 0 ? (
          /* 空状态：首次启动给引导，而非一片空白 (PRD §3.0.1) */
          <div className="border border-dashed border-slate-800 rounded-2xl py-20 flex flex-col items-center text-center">
            <FolderOpen className="w-10 h-10 text-slate-700 mb-4" />
            <h2 className="font-semibold text-slate-300 text-sm">还没有任何工程</h2>
            <p className="text-xs text-slate-500 mt-1.5 max-w-xs leading-relaxed">
              新建工程时选择设备档位与主题风格，随后即可用自然语言生成多页面设计。
            </p>
            <button
              onClick={() => setShowNew(true)}
              className="mt-5 flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white font-medium rounded-lg text-xs shadow"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>新建第一个工程</span>
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map((p) => {
              const missing = missingIds.includes(p.id);
              return (
                <div
                  key={p.id}
                  className={`group relative bg-slate-900 border rounded-xl overflow-hidden transition ${
                    missing
                      ? 'border-slate-800 opacity-60'
                      : 'border-slate-800 hover:border-blue-600/60 cursor-pointer'
                  }`}
                  onClick={() => !missing && openProject(p.id)}
                >
                  <div className="h-[150px] bg-slate-950 border-b border-slate-800 overflow-hidden relative">
                    {missing ? (
                      <div className="w-full h-full flex flex-col items-center justify-center gap-1.5 text-slate-600">
                        <AlertTriangle className="w-5 h-5 text-amber-600" />
                        <span className="text-[11px]">工程数据已丢失</span>
                      </div>
                    ) : (
                      <ProjectThumbnail meta={p} />
                    )}
                  </div>

                  <div className="p-3">
                    <div className="flex items-start justify-between gap-2">
                      <span className="font-semibold text-slate-200 text-xs truncate" title={p.name}>
                        {p.name}
                      </span>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setMenuFor(menuFor === p.id ? null : p.id);
                        }}
                        className="text-slate-500 hover:text-slate-200 shrink-0 opacity-0 group-hover:opacity-100 transition"
                      >
                        <MoreHorizontal className="w-4 h-4" />
                      </button>
                    </div>
                    <div className="flex items-center gap-2 mt-1.5 text-[10px] text-slate-500">
                      <span
                        className={`px-1.5 py-0.5 rounded font-medium ${
                          p.deviceProfile === 'pc'
                            ? 'bg-blue-950/60 text-blue-300'
                            : 'bg-emerald-950/60 text-emerald-300'
                        }`}
                      >
                        {p.deviceProfile === 'pc' ? 'PC 1440' : '移动端 390'}
                      </span>
                      <span>{p.screenCount} 个页面</span>
                      {/* T-AE-42: 未迁移的工程仍写 localStorage，受 ~5-10MB 配额限制 */}
                      {p.folderPath ? (
                        <span className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-400" title={p.folderPath}>
                          文件夹
                        </span>
                      ) : (
                        <button
                          onClick={async (e) => {
                            e.stopPropagation();
                            const r = await migrateProject(p.id);
                            if (r.message !== '已取消') setNotice(r.message);
                          }}
                          title="迁移到工程文件夹，摆脱浏览器存储配额限制"
                          className="px-1.5 py-0.5 rounded bg-amber-950/60 text-amber-300 hover:bg-amber-900/60 flex items-center gap-1"
                        >
                          <HardDriveDownload className="w-2.5 h-2.5" />
                          迁移
                        </button>
                      )}
                    </div>
                    <div className="text-[10px] text-slate-600 mt-1">{fmtTime(p.updatedAt)}</div>
                  </div>

                  {menuFor === p.id && (
                    <div
                      className="absolute right-2 top-[160px] w-40 bg-slate-800 border border-slate-700 rounded-lg shadow-2xl py-1 z-20 text-[11px]"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <button
                        onClick={() => {
                          const next = window.prompt('重命名工程', p.name);
                          if (next && next.trim()) renameProject(p.id, next.trim());
                          setMenuFor(null);
                        }}
                        className="w-full text-left px-3 py-1.5 hover:bg-slate-700 text-slate-200"
                      >
                        重命名
                      </button>
                      <button
                        onClick={() => {
                          removeFromList(p.id);
                          setMenuFor(null);
                        }}
                        className="w-full text-left px-3 py-1.5 hover:bg-slate-700 text-slate-300"
                        title="仅移出列表，不删除工程数据"
                      >
                        从列表移除
                      </button>
                      <button
                        onClick={() => {
                          setConfirmDelete(p);
                          setMenuFor(null);
                        }}
                        className="w-full text-left px-3 py-1.5 hover:bg-red-950/60 text-red-400 flex items-center gap-1.5"
                      >
                        <Trash2 className="w-3 h-3" />
                        <span>删除工程</span>
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {showNew && <NewProjectDialog onClose={() => setShowNew(false)} />}

      {/* 删除是不可恢复操作，必须二次确认并说明后果 (PRD §3.0.1) */}
      {confirmDelete && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-sm bg-slate-900 border border-slate-800 rounded-2xl p-5 text-xs">
            <h3 className="font-bold text-slate-100 text-sm flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-red-400" />
              <span>删除工程</span>
            </h3>
            <p className="text-slate-400 mt-3 leading-relaxed">
              将永久删除「<span className="text-slate-200 font-medium">{confirmDelete.name}</span>」
              及其全部页面与资源，<span className="text-red-400">此操作不可恢复</span>。
            </p>
            <div className="flex justify-end gap-2 mt-5">
              <button
                onClick={() => setConfirmDelete(null)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg"
              >
                取消
              </button>
              <button
                onClick={() => {
                  deleteProject(confirmDelete.id);
                  setConfirmDelete(null);
                }}
                className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white font-medium rounded-lg"
              >
                确认删除
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
