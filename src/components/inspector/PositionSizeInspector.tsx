import React from 'react';
import { Move, Ruler } from 'lucide-react';
import { ComputedBoxModel, ComputedLayoutInfo } from '../../stores/useProjectStore';
import { SpacingNumberInput } from './BoxModelInspector';

/**
 * 定位与尺寸检查器 (doc/feature/inspector-geometry-tabs/spec.md BR-INS-03/04)
 *
 * 此前面板顶部只读地显示「尺寸: 352 × 178px」，宽高不可改，定位能力整段缺失。
 * 本组件补齐这两块，并沿用 `SpacingNumberInput` 的输入规整与方向键步进。
 */

export interface PositionSizeInspectorProps {
  computedBox?: ComputedBoxModel;
  computedLayout?: ComputedLayoutInfo;
  declarations: Record<string, string>;
  onStyleChange: (prop: string, val: string, isCustom?: boolean) => void;
}

const POSITION_OPTIONS: Array<{ value: string; label: string }> = [
  { value: '', label: '默认' },
  { value: 'static', label: 'Static 常规流' },
  { value: 'relative', label: 'Relative 相对' },
  { value: 'absolute', label: 'Absolute 绝对' },
  { value: 'fixed', label: 'Fixed 固定' },
  { value: 'sticky', label: 'Sticky 粘性' }
];

const OFFSET_FIELDS: Array<{ prop: 'top' | 'right' | 'bottom' | 'left'; label: string }> = [
  { prop: 'top', label: 'T' },
  { prop: 'right', label: 'R' },
  { prop: 'bottom', label: 'B' },
  { prop: 'left', label: 'L' }
];

const SIZE_PRESETS: Array<{ label: string; value: string; title: string }> = [
  { label: '自动', value: 'auto', title: '由内容与布局决定' },
  { label: '撑满', value: '100%', title: '占满父容器可用宽度/高度' },
  { label: '适应内容', value: 'fit-content', title: '收缩到内容尺寸' }
];

const INPUT_CLS =
  'w-full bg-slate-950 border border-slate-700 rounded-md px-1.5 py-1 text-center text-slate-200 text-[11px] font-mono focus:outline-none focus:border-blue-500 disabled:opacity-40 disabled:cursor-not-allowed';

/** 生效值转占位提示：0px / auto 这类噪声值不值得显示 */
export function toPlaceholder(computed?: string): string {
  if (!computed) return '—';
  const v = computed.trim();
  if (!v || v === 'auto' || v === 'normal') return 'auto';
  if (v === '0px') return '0';
  if (v.endsWith('px')) return v.slice(0, -2);
  return v;
}

/** static（含未设置时的默认值）下四向偏移与层级在 CSS 中无效，应禁用而非放任误操作 (BR-INS-04) */
export function isOffsetDisabled(declaredPosition: string, computedPosition?: string): boolean {
  const effective = declaredPosition || computedPosition || 'static';
  return effective === 'static';
}

export const PositionSizeInspector: React.FC<PositionSizeInspectorProps> = ({
  computedBox,
  computedLayout,
  declarations,
  onStyleChange
}) => {
  const declaredPosition = declarations['position'] || '';
  const offsetsDisabled = isOffsetDisabled(declaredPosition, computedLayout?.position);

  return (
    <div className="space-y-3">
      {/* ── 尺寸 ───────────────────────────────── */}
      <div className="space-y-2">
        <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1">
          <Ruler className="w-3.5 h-3.5 text-slate-400" />
          <span>尺寸 (SIZE)</span>
        </span>

        <div className="grid grid-cols-2 gap-2">
          {(['width', 'height'] as const).map((prop) => (
            <div key={prop}>
              <span className="text-[10px] text-slate-500 block mb-1">
                {prop === 'width' ? '宽度 W' : '高度 H'}
                <span className="text-slate-600 ml-1 font-mono">
                  {prop === 'width'
                    ? `${Math.round(computedBox?.width ?? 0)}px`
                    : `${Math.round(computedBox?.height ?? 0)}px`}
                </span>
              </span>
              <SpacingNumberInput
                value={declarations[prop] || ''}
                placeholder={toPlaceholder(
                  prop === 'width' ? computedLayout?.width : computedLayout?.height
                )}
                allowAuto
                onChange={(v) => onStyleChange(prop, v)}
                className={INPUT_CLS}
                title={prop === 'width' ? '宽度' : '高度'}
                data-testid={`size-${prop}`}
              />
            </div>
          ))}
        </div>

        <div className="flex items-center gap-1">
          <span className="text-[10px] text-slate-500 shrink-0">快捷:</span>
          {SIZE_PRESETS.map((p) => (
            <button
              key={p.value}
              type="button"
              title={p.title}
              onClick={() => onStyleChange('width', p.value)}
              className="px-1.5 py-0.5 bg-slate-950 hover:bg-slate-800 border border-slate-700 rounded text-[10px] text-slate-300 transition"
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── 定位 ───────────────────────────────── */}
      <div className="space-y-2 pt-2 border-t border-slate-800/80">
        <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1">
          <Move className="w-3.5 h-3.5 text-slate-400" />
          <span>定位 (POSITION)</span>
        </span>

        <div className="grid grid-cols-2 gap-2">
          <div>
            <span className="text-[10px] text-slate-500 block mb-1">定位方式</span>
            <select
              value={declaredPosition}
              onChange={(e) => onStyleChange('position', e.target.value)}
              aria-label="定位方式"
              data-testid="position-mode"
              className="w-full bg-slate-950 border border-slate-700 rounded-lg p-1.5 text-slate-200 text-xs"
            >
              {POSITION_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                  {o.value === '' && computedLayout?.position ? `（当前 ${computedLayout.position}）` : ''}
                </option>
              ))}
            </select>
          </div>
          <div>
            <span className="text-[10px] text-slate-500 block mb-1">层级 z-index</span>
            <SpacingNumberInput
              value={declarations['z-index'] || ''}
              placeholder={toPlaceholder(computedLayout?.zIndex)}
              allowNegative
              unitless
              disabled={offsetsDisabled}
              onChange={(v) => onStyleChange('z-index', v)}
              className={INPUT_CLS}
              title="层级"
              data-testid="position-zindex"
            />
          </div>
        </div>

        <div>
          <div className="grid grid-cols-4 gap-1 text-center mb-1">
            {OFFSET_FIELDS.map((f) => (
              <span key={f.prop} className="text-[10px] text-slate-500">
                {f.label}
              </span>
            ))}
          </div>
          <div className="grid grid-cols-4 gap-1">
            {OFFSET_FIELDS.map((f) => (
              <SpacingNumberInput
                key={f.prop}
                value={declarations[f.prop] || ''}
                placeholder={toPlaceholder(computedLayout?.[f.prop])}
                allowNegative
                allowAuto
                disabled={offsetsDisabled}
                onChange={(v) => onStyleChange(f.prop, v)}
                className={INPUT_CLS}
                title={f.prop}
                data-testid={`offset-${f.prop}`}
              />
            ))}
          </div>
        </div>

        {offsetsDisabled && (
          <p className="text-[10px] text-slate-500 leading-tight" data-testid="offset-static-hint">
            当前为 static 常规流，四向偏移与层级不会生效。改为 Relative / Absolute 后可用。
          </p>
        )}
      </div>
    </div>
  );
};
