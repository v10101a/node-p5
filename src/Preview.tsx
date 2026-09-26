import React, { useEffect, useMemo, useRef, useState } from 'react';
import { buildFrameHtml } from './runtime/frame';
import { setProbes } from './hooks';

interface Props {
  code: string;
  size: { w: number; h: number };
  compileErrors: string[];
  onRect?: (r: { x: number; y: number; w: number; h: number }) => void;
}

function loadPos(): { x: number; y: number; w: number } {
  try { const s = localStorage.getItem('patch-preview'); if (s) return JSON.parse(s); } catch {}
  return { x: -1, y: 64, w: 420 };
}

export function Preview({ code, size, compileErrors, onRect }: Props) {
  const iframe = useRef<HTMLIFrameElement>(null);
  const [ready, setReady] = useState(false);
  const [status, setStatus] = useState<{ kind: string; message: string } | null>(null);
  const [pos, setPos] = useState(loadPos);
  const [dragging, setDragging] = useState(false);
  const drag = useRef<{ sx: number; sy: number; x: number; y: number; w: number; mode: 'move' | 'resize' } | null>(null);

  const html = useMemo(() => buildFrameHtml(new URL('/p5.min.js', location.origin).href), []);

  useEffect(() => {
    const onMsg = (e: MessageEvent) => {
      if (e.source !== iframe.current?.contentWindow) return;
      const m = e.data;
      if (!m) return;
      if (m.type === 'ready') setReady(true);
      else if (m.type === 'probes') setProbes(m.data);
      else if (m.type === 'error') setStatus({ kind: m.kind, message: m.message });
      else if (m.type === 'ok') setStatus(null);
    };
    window.addEventListener('message', onMsg);
    return () => window.removeEventListener('message', onMsg);
  }, []);

  useEffect(() => {
    if (!ready) return;
    const t = setTimeout(() => iframe.current?.contentWindow?.postMessage({ type: 'code', code }, '*'), 30);
    return () => clearTimeout(t);
  }, [code, ready]);

  useEffect(() => { try { localStorage.setItem('patch-preview', JSON.stringify(pos)); } catch {} }, [pos]);

  const w = pos.w;
  const h = Math.max(60, Math.round((w * size.h) / size.w));
  const x = pos.x < 0 ? window.innerWidth - w - 16 : pos.x;

  const onDown = (mode: 'move' | 'resize') => (e: React.PointerEvent) => {
    e.stopPropagation();
    drag.current = { sx: e.clientX, sy: e.clientY, x, y: pos.y, w, mode };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    setDragging(true);
  };
  const onMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    if (d.mode === 'move') setPos((p) => ({ ...p, x: Math.max(0, d.x + e.clientX - d.sx), y: Math.max(0, d.y + e.clientY - d.sy) }));
    else setPos((p) => ({ ...p, w: Math.max(160, Math.min(window.innerWidth - 40, d.w + e.clientX - d.sx)) }));
  };
  const onUp = () => { drag.current = null; setDragging(false); };

  const err = status ? `${status.kind}: ${status.message}` : compileErrors[0];
  useEffect(() => { onRect?.({ x, y: pos.y, w, h: h + 30 + (err ? 28 : 0) }); }, [x, pos.y, w, h, err, onRect]);

  return (
    <div className={'preview' + (dragging ? ' dragging' : '')} style={{ left: x, top: pos.y, width: w }} onPointerDown={(e) => e.stopPropagation()} onDoubleClick={(e) => e.stopPropagation()}>
      <div className="preview-head" onPointerDown={onDown('move')} onPointerMove={onMove} onPointerUp={onUp}>
        <span className={'dot ' + (err ? 'bad' : ready ? 'ok' : '')} />
        <span className="title">sketch</span>
        <span className="dim">{size.w} × {size.h}</span>
      </div>
      <iframe ref={iframe} title="sketch" srcDoc={html} style={{ width: w, height: h, pointerEvents: dragging ? 'none' : 'auto' }} />
      {err && <div className="preview-err">{err}</div>}
      <span className="resize" onPointerDown={onDown('resize')} onPointerMove={onMove} onPointerUp={onUp} />
    </div>
  );
}
