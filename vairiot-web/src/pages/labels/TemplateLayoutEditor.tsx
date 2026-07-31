import { useRef, useState, type CSSProperties, type PointerEvent } from 'react';

import {
  computeLabelElements,
  type ElementKey,
  type LabelLayoutInput,
  type LayoutMap,
} from './labelLayout';

const KEY_TITLES: Record<ElementKey, string> = {
  barcode: 'Barcode', logo: 'Logo',
  name: 'Asset name', assetNumber: 'Asset number', iar: 'GS1 identifier',
  serialNumber: 'Serial number', barcodeValue: 'Barcode value',
  site: 'Site', category: 'Category', companyName: 'Company name',
  companyAddress: 'Company address', companyEmail: 'Company email',
};

/**
 * Freeform template editor: renders the label zoomed-in with every enabled
 * element as a draggable box. Dragging writes fractional positions into the
 * layout map (owned by the parent), which the preview/print/canvas renderers
 * all consume.
 */
export function TemplateLayoutEditor({
  input,
  barcodeDataUrl,
  logoDataUrl,
  onLayoutChange,
}: {
  input: LabelLayoutInput;
  barcodeDataUrl: string | null;
  logoDataUrl: string | null;
  onLayoutChange: (layout: LayoutMap) => void;
}) {
  const { widthPx, heightPx, design } = input;
  const zoom = Math.min(6, Math.max(1.5, 560 / widthPx));
  const [activeKey, setActiveKey] = useState<ElementKey | null>(null);
  const dragRef = useRef<{
    key: ElementKey;
    startClientX: number;
    startClientY: number;
    startX: number; // element px at 1x
    startY: number;
    w: number;
    h: number;
  } | null>(null);

  const elements = computeLabelElements(input);

  const onPointerDown = (e: PointerEvent<HTMLDivElement>, key: ElementKey) => {
    const el = elements.find(x => x.key === key);
    if (!el) return;
    e.preventDefault();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    dragRef.current = {
      key,
      startClientX: e.clientX,
      startClientY: e.clientY,
      startX: el.x,
      startY: el.y,
      w: el.w,
      h: el.h,
    };
    setActiveKey(key);
  };

  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag) return;
    const nx = drag.startX + (e.clientX - drag.startClientX) / zoom;
    const ny = drag.startY + (e.clientY - drag.startClientY) / zoom;
    const clampedX = Math.min(Math.max(0, nx), Math.max(0, widthPx - drag.w));
    const clampedY = Math.min(Math.max(0, ny), Math.max(0, heightPx - drag.h));
    onLayoutChange({
      ...(design.layout ?? {}),
      [drag.key]: { x: clampedX / widthPx, y: clampedY / heightPx },
    });
  };

  const onPointerUp = () => {
    dragRef.current = null;
    setActiveKey(null);
  };

  const boxStyle = (key: ElementKey, x: number, y: number, w: number, h: number): CSSProperties => ({
    position: 'absolute',
    left: x * zoom,
    top: y * zoom,
    width: w * zoom,
    height: h * zoom,
    cursor: 'move',
    touchAction: 'none',
    outline: activeKey === key
      ? '2px solid #615AA0'
      : '1px dashed rgba(97, 90, 160, 0.45)',
    outlineOffset: 1,
    borderRadius: 2,
    userSelect: 'none',
  });

  return (
    <div className="space-y-2">
      <div
        className="relative bg-white border border-gray-300 rounded shadow-sm overflow-hidden"
        style={{ width: widthPx * zoom, height: heightPx * zoom, maxWidth: '100%' }}
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
        Drag any element to position it. Positions are stored relative to the label size,
        so the template scales with different label dimensions.
      </p>
    </div>
  );
}
