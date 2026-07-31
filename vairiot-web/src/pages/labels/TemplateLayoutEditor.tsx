import {
  AlignStartVertical, AlignCenterVertical, AlignEndVertical,
  AlignStartHorizontal, AlignCenterHorizontal, AlignEndHorizontal,
  Bold, Italic, Group, Ungroup,
} from 'lucide-react';
import { useRef, useState, type CSSProperties, type PointerEvent, type ReactNode } from 'react';

import {
  computeLabelElements, labelPadding,
  type ElementKey,
  type LabelLayoutInput,
  type LayoutMap,
  type StyleMap,
} from './labelLayout';

const KEY_TITLES: Record<ElementKey, string> = {
  barcode: 'Barcode', logo: 'Logo',
  name: 'Asset name', assetNumber: 'Asset number', iar: 'GS1 identifier',
  serialNumber: 'Serial number', barcodeValue: 'Barcode value',
  site: 'Site', category: 'Category', companyName: 'Company name',
  companyAddress: 'Company address', companyEmail: 'Company email',
};

type AlignMode = 'left' | 'hcenter' | 'right' | 'top' | 'vcenter' | 'bottom';

/**
 * Freeform template editor: renders the label zoomed-in with every enabled
 * element as a draggable box. Supports multi-select (shift-click or drag a
 * selection), align actions, grouping (grouped elements select and move as
 * one) and per-field text styling. All changes flow up into the layout /
 * style / group maps owned by the parent, which the preview, print and canvas
 * renderers consume.
 */
export function TemplateLayoutEditor({
  input,
  barcodeDataUrl,
  logoDataUrl,
  groups,
  onLayoutChange,
  onStylesChange,
  onGroupsChange,
}: {
  input: LabelLayoutInput;
  barcodeDataUrl: string | null;
  logoDataUrl: string | null;
  groups: ElementKey[][];
  onLayoutChange: (layout: LayoutMap) => void;
  onStylesChange: (styles: StyleMap) => void;
  onGroupsChange: (groups: ElementKey[][]) => void;
}) {
  const { widthPx, heightPx, design } = input;
  const styles: StyleMap = design.styles ?? {};
  const zoom = Math.min(6, Math.max(1.5, 560 / widthPx));
  const [selected, setSelected] = useState<Set<ElementKey>>(new Set());
  const dragRef = useRef<{
    pressedKey: ElementKey;
    startClientX: number;
    startClientY: number;
    // Snapshot of every dragged element at pointer-down (px at 1x).
    members: { key: ElementKey; x: number; y: number; w: number; h: number }[];
    moved: boolean;
    shift: boolean;
  } | null>(null);

  const elements = computeLabelElements(input);
  const selectedEls = elements.filter(e => selected.has(e.key));
  const selectedTextEls = selectedEls.filter(e => e.kind === 'text');

  /** The set an element selects: its whole group, or just itself. */
  const unitFor = (key: ElementKey): ElementKey[] => {
    const g = groups.find(g => g.includes(key));
    return g ? g.filter(k => elements.some(e => e.key === k)) : [key];
  };

  const writePositions = (moves: { key: ElementKey; x: number; y: number }[]) => {
    const next: LayoutMap = { ...(design.layout ?? {}) };
    for (const m of moves) {
      next[m.key] = { x: m.x / widthPx, y: m.y / heightPx };
    }
    onLayoutChange(next);
  };

  /* ── Selection + drag ── */

  const onPointerDown = (e: PointerEvent<HTMLDivElement>, key: ElementKey) => {
    e.preventDefault();
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);

    const unit = unitFor(key);
    let next: Set<ElementKey>;
    if (e.shiftKey) {
      next = new Set(selected);
      const allIn = unit.every(k => next.has(k));
      if (allIn) unit.forEach(k => next.delete(k));
      else unit.forEach(k => next.add(k));
    } else if (unit.every(k => selected.has(k))) {
      next = new Set(selected); // keep multi-selection for dragging
    } else {
      next = new Set(unit);
    }
    setSelected(next);

    const members = elements
      .filter(el => next.has(el.key))
      .map(el => ({ key: el.key, x: el.x, y: el.y, w: el.w, h: el.h }));
    dragRef.current = {
      pressedKey: key,
      startClientX: e.clientX,
      startClientY: e.clientY,
      members,
      moved: false,
      shift: e.shiftKey,
    };
  };

  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.members.length === 0) return;
    let dx = (e.clientX - drag.startClientX) / zoom;
    let dy = (e.clientY - drag.startClientY) / zoom;
    if (!drag.moved && Math.abs(dx) < 2 && Math.abs(dy) < 2) return;
    drag.moved = true;

    // Clamp the delta so every member stays on the label — relative
    // positions inside the selection are preserved.
    for (const m of drag.members) {
      dx = Math.min(Math.max(dx, -m.x), Math.max(-m.x, widthPx - m.w - m.x));
      dy = Math.min(Math.max(dy, -m.y), Math.max(-m.y, heightPx - m.h - m.y));
    }
    writePositions(drag.members.map(m => ({ key: m.key, x: m.x + dx, y: m.y + dy })));
  };

  const onPointerUp = () => {
    dragRef.current = null;
  };

  const clearSelection = () => setSelected(new Set());

  /* ── Align actions ── */

  const align = (mode: AlignMode) => {
    if (selectedEls.length === 0) return;
    const pad = labelPadding(widthPx, heightPx);
    const labelBox = { x: pad, y: pad, w: widthPx - pad * 2, h: heightPx - pad * 2 };

    const minX = Math.min(...selectedEls.map(e => e.x));
    const minY = Math.min(...selectedEls.map(e => e.y));
    const bbox = {
      x: minX,
      y: minY,
      w: Math.max(...selectedEls.map(e => e.x + e.w)) - minX,
      h: Math.max(...selectedEls.map(e => e.y + e.h)) - minY,
    };

    // A single element — or a selection that is one whole group — moves as a
    // unit relative to the label. A loose multi-selection aligns its members
    // within the selection's own bounding box.
    const asUnit = selectedEls.length === 1
      || groups.some(g => selectedEls.every(e => g.includes(e.key)));

    if (asUnit) {
      let dx = 0, dy = 0;
      switch (mode) {
        case 'left':    dx = labelBox.x - bbox.x; break;
        case 'hcenter': dx = labelBox.x + (labelBox.w - bbox.w) / 2 - bbox.x; break;
        case 'right':   dx = labelBox.x + labelBox.w - bbox.w - bbox.x; break;
        case 'top':     dy = labelBox.y - bbox.y; break;
        case 'vcenter': dy = labelBox.y + (labelBox.h - bbox.h) / 2 - bbox.y; break;
        case 'bottom':  dy = labelBox.y + labelBox.h - bbox.h - bbox.y; break;
      }
      writePositions(selectedEls.map(el => ({ key: el.key, x: el.x + dx, y: el.y + dy })));
      return;
    }

    writePositions(selectedEls.map(el => {
      let { x, y } = el;
      switch (mode) {
        case 'left':    x = bbox.x; break;
        case 'hcenter': x = bbox.x + (bbox.w - el.w) / 2; break;
        case 'right':   x = bbox.x + bbox.w - el.w; break;
        case 'top':     y = bbox.y; break;
        case 'vcenter': y = bbox.y + (bbox.h - el.h) / 2; break;
        case 'bottom':  y = bbox.y + bbox.h - el.h; break;
      }
      return { key: el.key, x, y };
    }));
  };

  /* ── Group / ungroup ── */

  const selectionTouchesGroup = groups.some(g => g.some(k => selected.has(k)));

  const groupSelection = () => {
    if (selected.size < 2) return;
    const rest = groups.filter(g => !g.some(k => selected.has(k)));
    onGroupsChange([...rest, [...selected]]);
  };

  const ungroupSelection = () => {
    onGroupsChange(groups.filter(g => !g.some(k => selected.has(k))));
  };

  /* ── Text styles ── */

  const patchSelectedStyles = (patch: Partial<{ bold: boolean; italic: boolean; font: number }>) => {
    if (selectedTextEls.length === 0) return;
    const next: StyleMap = { ...styles };
    for (const el of selectedTextEls) {
      next[el.key] = { ...next[el.key], ...patch };
    }
    onStylesChange(next);
  };

  const allBold = selectedTextEls.length > 0 && selectedTextEls.every(e => e.bold);
  const allItalic = selectedTextEls.length > 0 && selectedTextEls.every(e => e.italic);
  const uniformFont = selectedTextEls.length > 0
    && selectedTextEls.every(e => e.font === selectedTextEls[0].font)
    ? Math.round(selectedTextEls[0].font ?? 0) : null;

  /* ── Toolbar ── */

  const ToolButton = ({ title, onClick, active = false, disabled = false, children }: {
    title: string; onClick: () => void; active?: boolean; disabled?: boolean; children: ReactNode;
  }) => (
    <button
      type="button"
      title={title}
      disabled={disabled}
      onClick={onClick}
      className={`p-1.5 rounded border text-gray-600 transition-colors ${
        active ? 'bg-v-violet/10 border-v-violet text-v-violet' : 'border-gray-200 bg-white hover:bg-gray-50'
      } ${disabled ? 'opacity-35 cursor-default' : ''}`}
    >
      {children}
    </button>
  );

  const noSelection = selectedEls.length === 0;
  const noText = selectedTextEls.length === 0;

  const boxStyle = (key: ElementKey, x: number, y: number, w: number, h: number): CSSProperties => ({
    position: 'absolute',
    left: x * zoom,
    top: y * zoom,
    width: w * zoom,
    height: h * zoom,
    cursor: 'move',
    touchAction: 'none',
    outline: selected.has(key)
      ? '2px solid #615AA0'
      : '1px dashed rgba(97, 90, 160, 0.45)',
    outlineOffset: 1,
    borderRadius: 2,
    userSelect: 'none',
  });

  return (
    <div className="space-y-2">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-1.5">
        <ToolButton title="Align left" disabled={noSelection} onClick={() => align('left')}><AlignStartVertical size={14} /></ToolButton>
        <ToolButton title="Align centre" disabled={noSelection} onClick={() => align('hcenter')}><AlignCenterVertical size={14} /></ToolButton>
        <ToolButton title="Align right" disabled={noSelection} onClick={() => align('right')}><AlignEndVertical size={14} /></ToolButton>
        <span className="w-px h-5 bg-gray-200 mx-1" />
        <ToolButton title="Align top" disabled={noSelection} onClick={() => align('top')}><AlignStartHorizontal size={14} /></ToolButton>
        <ToolButton title="Align middle" disabled={noSelection} onClick={() => align('vcenter')}><AlignCenterHorizontal size={14} /></ToolButton>
        <ToolButton title="Align bottom" disabled={noSelection} onClick={() => align('bottom')}><AlignEndHorizontal size={14} /></ToolButton>
        <span className="w-px h-5 bg-gray-200 mx-1" />
        <ToolButton title="Group selection" disabled={selected.size < 2} onClick={groupSelection}><Group size={14} /></ToolButton>
        <ToolButton title="Ungroup" disabled={!selectionTouchesGroup} onClick={ungroupSelection}><Ungroup size={14} /></ToolButton>
        <span className="w-px h-5 bg-gray-200 mx-1" />
        <ToolButton title="Bold" disabled={noText} active={allBold} onClick={() => patchSelectedStyles({ bold: !allBold })}><Bold size={14} /></ToolButton>
        <ToolButton title="Italic" disabled={noText} active={allItalic} onClick={() => patchSelectedStyles({ italic: !allItalic })}><Italic size={14} /></ToolButton>
        <div className="flex items-center gap-1 ml-1">
          <span className="text-[11px] text-gray-500">Font</span>
          <input
            type="number" min={3} max={40} step={1}
            disabled={noText}
            value={uniformFont ?? ''}
            placeholder="–"
            onChange={e => {
              const v = Number(e.target.value);
              if (v >= 3 && v <= 40) patchSelectedStyles({ font: v });
            }}
            className="w-14 text-xs rounded border border-gray-200 px-1.5 py-1 focus:outline-none focus:ring-2 focus:ring-v-pink disabled:opacity-35"
          />
          <span className="text-[11px] text-gray-400">px</span>
        </div>
        <span className="flex-1" />
        <span className="text-[11px] text-gray-400">
          {noSelection ? 'Click an element · shift-click for multi-select'
            : `${selectedEls.length} selected`}
        </span>
      </div>

      {/* Canvas */}
      <div
        className="relative bg-white border border-gray-300 rounded shadow-sm overflow-hidden"
        style={{ width: widthPx * zoom, height: heightPx * zoom, maxWidth: '100%' }}
        onPointerDown={clearSelection}
      >
        {elements.map(el => (
          <div
            key={el.key}
            title={KEY_TITLES[el.key]}
            style={boxStyle(el.key, el.x, el.y, el.w, el.h)}
            onPointerDown={e => onPointerDown(e, el.key)}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
          >
            {el.kind === 'barcode' && (barcodeDataUrl
              ? <img src={barcodeDataUrl} alt="barcode" draggable={false}
                  style={{ width: '100%', height: '100%', pointerEvents: 'none' }} />
              : <div className="w-full h-full bg-gray-100" />)}
            {el.kind === 'logo' && (logoDataUrl
              ? <img src={logoDataUrl} alt="logo" draggable={false}
                  style={{ width: '100%', height: '100%', objectFit: 'contain', pointerEvents: 'none' }} />
              : <div className="w-full h-full bg-gray-100" />)}
            {el.kind === 'text' && (
              <span
                style={{
                  fontSize: (el.font ?? 8) * zoom,
                  lineHeight: 1.15,
                  fontWeight: el.bold ? 700 : 400,
                  fontStyle: el.italic ? 'italic' : 'normal',
                  fontFamily: 'Montserrat, sans-serif',
                  color: el.color,
                  whiteSpace: 'nowrap',
                  pointerEvents: 'none',
                  display: 'block',
                }}
              >
                {el.text}
              </span>
            )}
          </div>
        ))}
      </div>
      <p className="text-[11px] text-gray-400">
        Drag any element to position it. Shift-click to select several, then align or group them —
        grouped elements move as one. Positions are stored relative to the label size, so the
        template scales with different label dimensions.
      </p>
    </div>
  );
}
