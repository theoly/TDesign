import React from 'react';
import {
  AlignHorizontalDistributeCenter,
  AlignHorizontalDistributeEnd,
  AlignHorizontalDistributeStart,
  AlignHorizontalJustifyCenter,
  AlignHorizontalJustifyEnd,
  AlignHorizontalJustifyStart,
  AlignVerticalDistributeCenter,
  AlignVerticalJustifyCenter,
  ArrowDown,
  ArrowRight,
  Grid,
  LayoutGrid,
  Maximize2,
  Minimize2,
  RotateCcw,
  Rows,
  WrapText
} from 'lucide-react';
import { ComputedLayoutInfo } from '../../stores/useProjectStore';

interface LayoutInspectorProps {
  computedLayout?: ComputedLayoutInfo;
  declarations: Record<string, string>;
  onStyleChange: (prop: string, val: string, isCustom?: boolean) => void;
  onClearProp?: (prop: string) => void;
}

const GAP_TOKEN_OPTIONS = [
  { label: '默认', value: '' },
  { label: '0px (space-0)', value: 'var(--space-0)' },
  { label: '4px (space-1)', value: 'var(--space-1)' },
  { label: '8px (space-2)', value: 'var(--space-2)' },
  { label: '12px (space-3)', value: 'var(--space-3)' },
  { label: '16px (space-4)', value: 'var(--space-4)' },
  { label: '20px (space-5)', value: 'var(--space-5)' },
  { label: '24px (space-6)', value: 'var(--space-6)' },
  { label: '32px (space-8)', value: 'var(--space-8)' }
];

export const LayoutInspector: React.FC<LayoutInspectorProps> = ({
  computedLayout,
  declarations,
  onStyleChange,
  onClearProp
}) => {
  // Current effective values (override takes precedence over computed)
  const effectiveDisplay = String(declarations['display'] || computedLayout?.display || 'block').toLowerCase();
  const isFlex = effectiveDisplay === 'flex' || effectiveDisplay === 'inline-flex';
  const isGrid = effectiveDisplay === 'grid' || effectiveDisplay === 'inline-grid';

  const effectiveDirection = String(declarations['flex-direction'] || computedLayout?.flexDirection || 'row').toLowerCase();
  const effectiveAlign = String(declarations['align-items'] || computedLayout?.alignItems || 'stretch').toLowerCase();
  const effectiveJustify = String(declarations['justify-content'] || computedLayout?.justifyContent || 'flex-start').toLowerCase();
  const effectiveWrap = String(declarations['flex-wrap'] || computedLayout?.flexWrap || 'nowrap').toLowerCase();
  const effectiveGap = declarations['gap'] ?? (computedLayout?.gap && computedLayout.gap !== '0px' && computedLayout.gap !== 'normal' ? computedLayout.gap : '');

  const isOverridden = (prop: string) => Boolean(declarations[prop]);

  return (
    <div className="space-y-3 pt-2 border-t border-slate-800" data-testid="layout-inspector">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">
          布局与对齐 (Layout)
        </span>
        {(isOverridden('display') ||
          isOverridden('flex-direction') ||
          isOverridden('align-items') ||
          isOverridden('justify-content') ||
          isOverridden('flex-wrap') ||
          isOverridden('gap')) && (
          <button
            onClick={() => {
              ['display', 'flex-direction', 'align-items', 'justify-content', 'flex-wrap', 'gap'].forEach((p) => {
                if (declarations[p]) onStyleChange(p, '');
              });
            }}
            title="还原布局覆盖为基线"
            className="text-[10px] text-blue-400 hover:text-blue-300 flex items-center gap-1"
          >
            <RotateCcw className="w-2.5 h-2.5" />
            <span>还原布局</span>
          </button>
        )}
      </div>

      {/* Display Mode Switcher */}
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-[10px] text-slate-500">布局模式</span>
          {isOverridden('display') && <span className="w-1.5 h-1.5 rounded-full bg-blue-500" title="已手动覆盖" />}
        </div>
        <div className="grid grid-cols-3 gap-1 p-0.5 bg-slate-950 border border-slate-800 rounded-lg">
          <button
            type="button"
            onClick={() => onStyleChange('display', 'flex')}
            className={`py-1 px-1.5 rounded text-[11px] font-medium transition flex items-center justify-center gap-1 ${
              effectiveDisplay === 'flex'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
            }`}
          >
            <Rows className="w-3 h-3" />
            <span>Flex</span>
          </button>
          <button
            type="button"
            onClick={() => onStyleChange('display', 'grid')}
            className={`py-1 px-1.5 rounded text-[11px] font-medium transition flex items-center justify-center gap-1 ${
              effectiveDisplay === 'grid'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
            }`}
          >
            <Grid className="w-3 h-3" />
            <span>Grid</span>
          </button>
          <button
            type="button"
            onClick={() => onStyleChange('display', 'block')}
            className={`py-1 px-1.5 rounded text-[11px] font-medium transition flex items-center justify-center gap-1 ${
              effectiveDisplay === 'block'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
            }`}
          >
            <Maximize2 className="w-3 h-3" />
            <span>Block</span>
          </button>
        </div>
      </div>

      {/* Flex controls: Direction & Wrap */}
      {isFlex && (
        <div className="space-y-2.5 bg-slate-950/60 p-2.5 rounded-xl border border-slate-800/80">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] text-slate-500">主轴方向</span>
                {isOverridden('flex-direction') && <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />}
              </div>
              <div className="grid grid-cols-2 gap-1 bg-slate-900 p-0.5 rounded-lg border border-slate-800">
                <button
                  type="button"
                  title="横向排列 (Row)"
                  onClick={() => onStyleChange('flex-direction', 'row')}
                  className={`py-1 rounded text-[10px] font-medium flex items-center justify-center gap-1 transition ${
                    effectiveDirection === 'row'
                      ? 'bg-slate-800 text-blue-400 border border-slate-700 shadow-sm'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <ArrowRight className="w-3 h-3" />
                  <span>Row</span>
                </button>
                <button
                  type="button"
                  title="纵向排列 (Column)"
                  onClick={() => onStyleChange('flex-direction', 'column')}
                  className={`py-1 rounded text-[10px] font-medium flex items-center justify-center gap-1 transition ${
                    effectiveDirection === 'column'
                      ? 'bg-slate-800 text-blue-400 border border-slate-700 shadow-sm'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <ArrowDown className="w-3 h-3" />
                  <span>Col</span>
                </button>
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] text-slate-500">自动换行</span>
                {isOverridden('flex-wrap') && <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />}
              </div>
              <div className="grid grid-cols-2 gap-1 bg-slate-900 p-0.5 rounded-lg border border-slate-800">
                <button
                  type="button"
                  title="不换行 (Nowrap)"
                  onClick={() => onStyleChange('flex-wrap', 'nowrap')}
                  className={`py-1 rounded text-[10px] font-medium flex items-center justify-center transition ${
                    effectiveWrap === 'nowrap'
                      ? 'bg-slate-800 text-blue-400 border border-slate-700 shadow-sm'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <span>单行</span>
                </button>
                <button
                  type="button"
                  title="换行 (Wrap)"
                  onClick={() => onStyleChange('flex-wrap', 'wrap')}
                  className={`py-1 rounded text-[10px] font-medium flex items-center justify-center gap-1 transition ${
                    effectiveWrap === 'wrap'
                      ? 'bg-slate-800 text-blue-400 border border-slate-700 shadow-sm'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <WrapText className="w-3 h-3" />
                  <span>换行</span>
                </button>
              </div>
            </div>
          </div>

          {/* Justify Content */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] text-slate-500">主轴对齐 (Justify)</span>
              {isOverridden('justify-content') && <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />}
            </div>
            <div className="grid grid-cols-5 gap-1 bg-slate-900 p-0.5 rounded-lg border border-slate-800">
              {[
                { val: 'flex-start', label: '起点', tip: 'Start (左/上)' },
                { val: 'center', label: '居中', tip: 'Center (居中)' },
                { val: 'flex-end', label: '终点', tip: 'End (右/下)' },
                { val: 'space-between', label: '两端', tip: 'Space Between (两端散开)' },
                { val: 'space-around', label: '环绕', tip: 'Space Around (环绕均分)' }
              ].map(({ val, label, tip }) => (
                <button
                  key={val}
                  type="button"
                  title={tip}
                  onClick={() => onStyleChange('justify-content', val)}
                  className={`py-1 rounded text-[10px] font-medium transition ${
                    effectiveJustify === val
                      ? 'bg-slate-800 text-blue-400 border border-slate-700 shadow-sm'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Align Items */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] text-slate-500">交叉轴对齐 (Align)</span>
              {isOverridden('align-items') && <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />}
            </div>
            <div className="grid grid-cols-4 gap-1 bg-slate-900 p-0.5 rounded-lg border border-slate-800">
              {[
                { val: 'stretch', label: '拉伸', tip: 'Stretch (拉伸填满)' },
                { val: 'flex-start', label: '居顶', tip: 'Start (居顶/居左)' },
                { val: 'center', label: '居中', tip: 'Center (垂直居中)' },
                { val: 'flex-end', label: '居底', tip: 'End (居底/居右)' }
              ].map(({ val, label, tip }) => (
                <button
                  key={val}
                  type="button"
                  title={tip}
                  onClick={() => onStyleChange('align-items', val)}
                  className={`py-1 rounded text-[10px] font-medium transition ${
                    effectiveAlign === val
                      ? 'bg-slate-800 text-blue-400 border border-slate-700 shadow-sm'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Gap for Flex & Grid */}
      {(isFlex || isGrid) && (
        <div>
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] text-slate-500">子项间距 (Gap)</span>
            {isOverridden('gap') && <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />}
          </div>
          <div className="flex items-center gap-1.5">
            <select
              value={
                GAP_TOKEN_OPTIONS.some((o) => o.value === effectiveGap)
                  ? effectiveGap
                  : effectiveGap ? 'custom' : ''
              }
              onChange={(e) => {
                if (e.target.value !== 'custom') {
                  onStyleChange('gap', e.target.value);
                }
              }}
              className="flex-1 bg-slate-950 border border-slate-700 rounded-lg p-1.5 text-slate-200 text-xs focus:outline-none focus:border-blue-500"
            >
              {GAP_TOKEN_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
              {!GAP_TOKEN_OPTIONS.some((o) => o.value === effectiveGap) && effectiveGap && (
                <option value="custom">自定义 ({effectiveGap})</option>
              )}
            </select>
            {isOverridden('gap') && (
              <button
                type="button"
                onClick={() => onStyleChange('gap', '')}
                title="清除自定义间距"
                className="p-1.5 text-slate-500 hover:text-slate-300 rounded bg-slate-900 border border-slate-800"
              >
                <RotateCcw className="w-3 h-3" />
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
