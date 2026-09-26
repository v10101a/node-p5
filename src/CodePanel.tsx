import React, { useEffect, useMemo, useRef, useState } from 'react';
import { applyCode } from './apply';

function highlight(code: string): string {
  const esc = code.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return esc.replace(/(\/\/.*$)|('(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*")|\b(function|const|let|var|if|else|for|return|new|true|false|null)\b|\b(\d+\.?\d*)\b/gm, (m, c, s, k, n) => {
    if (c) return `<span class="c">${c}</span>`;
    if (s) return `<span class="s">${s}</span>`;
    if (k) return `<span class="k">${k}</span>`;
    if (n) return `<span class="n">${n}</span>`;
    return m;
  });
}

type Status = { kind: 'synced' | 'dirty' | 'applied' | 'error'; msg?: string };

export function CodePanel({ code, onClose, avoid }: { code: string; onClose: () => void; avoid?: { x: number; y: number; w: number; h: number } }) {
  const [text, setText] = useState(code);
  const [status, setStatus] = useState<Status>({ kind: 'synced' });
  const [copied, setCopied] = useState(false);
  const focused = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const preRef = useRef<HTMLPreElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const codeRef = useRef(code);
  codeRef.current = code;

  // follow the graph while not editing
  useEffect(() => {
    if (!focused.current) { setText(code); setStatus({ kind: 'synced' }); }
  }, [code]);

  const apply = (t: string) => {
    const r = applyCode(t);
    setStatus(r.ok ? { kind: 'applied' } : { kind: 'error', msg: r.error });
    return r.ok;
  };
  const onChange = (t: string) => {
    setText(t);
    setStatus({ kind: 'dirty' });
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => apply(t), 600);
  };
  const onBlur = () => {
    focused.current = false;
    if (timer.current) clearTimeout(timer.current);
    if (status.kind === 'dirty') { if (!apply(text)) return; }
    if (status.kind === 'error') return; // keep the broken text visible
    setText(codeRef.current);
    setStatus({ kind: 'synced' });
  };
  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    e.stopPropagation();
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); if (timer.current) clearTimeout(timer.current); apply(text); }
    else if (e.key === 'Escape') (e.currentTarget as HTMLTextAreaElement).blur();
    else if (e.key === 'Tab') {
      e.preventDefault();
      const el = e.currentTarget;
      const s = el.selectionStart, en = el.selectionEnd;
      onChange(text.slice(0, s) + '  ' + text.slice(en));
      requestAnimationFrame(() => { el.selectionStart = el.selectionEnd = s + 2; });
    }
  };
  const sync = () => { if (preRef.current && taRef.current) { preRef.current.scrollTop = taRef.current.scrollTop; preRef.current.scrollLeft = taRef.current.scrollLeft; } };
  const html = useMemo(() => highlight(text) + '\n', [text]);

  const copy = async () => { try { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1200); } catch {} };
  const download = () => {
    const blob = new Blob([text], { type: 'text/javascript' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'sketch.js';
    a.click();
    URL.revokeObjectURL(a.href);
  };
  const stop = (e: React.SyntheticEvent) => e.stopPropagation();
  // dock below the preview when it sits in the right-hand column
  const style: React.CSSProperties = {};
  if (avoid && avoid.x + avoid.w > window.innerWidth - 560) { style.top = Math.min(avoid.y + avoid.h + 12, window.innerHeight - 220); style.width = Math.max(460, avoid.w); }
  return (
    <div className="codepanel" style={style} onPointerDown={stop} onDoubleClick={stop} onWheel={stop}>
      <div className="codepanel-head">
        <span className="title">sketch.js</span>
        <span className={'status ' + status.kind}>
          {status.kind === 'synced' && 'in sync · edit me'}
          {status.kind === 'dirty' && 'editing…'}
          {status.kind === 'applied' && 'applied to the patch'}
          {status.kind === 'error' && (status.msg ?? 'error')}
        </span>
        <span className="spacer" />
        <button onClick={copy}>{copied ? 'copied!' : 'copy'}</button>
        <button onClick={download}>download</button>
        <button onClick={onClose}>×</button>
      </div>
      <div className="codewrap">
        <pre ref={preRef} className="code" aria-hidden dangerouslySetInnerHTML={{ __html: html }} />
        <textarea ref={taRef} className="code codeinput" value={text} spellCheck={false} wrap="off"
          onChange={(e) => onChange(e.target.value)} onFocus={() => { focused.current = true; }} onBlur={onBlur} onKeyDown={onKeyDown} onScroll={sync} />
      </div>
    </div>
  );
}
