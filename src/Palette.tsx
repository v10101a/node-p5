import React, { useEffect, useMemo, useRef, useState } from 'react';
import { NODE_DEFS } from './nodes/defs';
import { CATEGORY_COLORS, type Category } from './types';

export interface PaletteItem { key: string; label: string; category: Category | 'canvas'; hint?: string }

const SPECIALS: PaletteItem[] = [
  { key: '@note', label: 'Sticky note', category: 'canvas', hint: 'a place to write' },
  { key: '@group', label: 'Group', category: 'canvas', hint: 'a named box' },
];

export function Palette({ screen, onPick, onClose }: { screen: { x: number; y: number }; onPick: (key: string) => void; onClose: () => void }) {
  const [q, setQ] = useState('');
  const [idx, setIdx] = useState(0);
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    ref.current?.focus();
    const t = setTimeout(() => ref.current?.focus(), 30);
    return () => clearTimeout(t);
  }, []);

  const items = useMemo<PaletteItem[]>(() => {
    const all: PaletteItem[] = [
      ...NODE_DEFS.filter((d) => !d.singleton).map((d) => ({ key: d.type, label: d.label, category: d.category as Category, hint: d.description })),
      ...SPECIALS,
    ];
    const s = q.trim().toLowerCase();
    if (!s) return all;
    return all.filter((i) => i.label.toLowerCase().includes(s) || i.key.includes(s) || i.category.includes(s) || i.hint?.toLowerCase().includes(s));
  }, [q]);

  useEffect(() => setIdx(0), [q]);

  const w = 280, h = 380;
  const x = Math.min(screen.x, window.innerWidth - w - 12), y = Math.min(screen.y, window.innerHeight - h - 12);

  let lastCat = '';
  return (
    <div className="palette" style={{ left: x, top: y, width: w }} onPointerDown={(e) => e.stopPropagation()} onDoubleClick={(e) => e.stopPropagation()}>
      <input ref={ref} placeholder="add a node…" value={q} onChange={(e) => setQ(e.target.value)}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === 'Escape') onClose();
          else if (e.key === 'ArrowDown') { e.preventDefault(); setIdx((i) => Math.min(items.length - 1, i + 1)); }
          else if (e.key === 'ArrowUp') { e.preventDefault(); setIdx((i) => Math.max(0, i - 1)); }
          else if (e.key === 'Enter' && items[idx]) onPick(items[idx].key);
        }} />
      <div className="palette-list" style={{ maxHeight: h - 50 }}>
        {items.length === 0 && <div className="palette-empty">nothing matches</div>}
        {items.map((it, i) => {
          const header = it.category !== lastCat ? it.category : null;
          lastCat = it.category;
          return (
            <React.Fragment key={it.key}>
              {header && !q && <div className="palette-cat">{header}</div>}
              <div className={'palette-item' + (i === idx ? ' active' : '')} onMouseEnter={() => setIdx(i)} onClick={() => onPick(it.key)}>
                <span className="dot" style={{ background: it.category === 'canvas' ? '#ffe27a' : it.category === 'output' ? '#2a2a2e' : CATEGORY_COLORS[it.category] }} />
                <span className="pl">{it.label}</span>
                {it.hint && <span className="ph">{it.hint}</span>}
              </div>
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
}
