import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as S from './store';
import { useGraph, useRemotes } from './hooks';
import { compile } from './compile';
import { Canvas, type View } from './canvas/Canvas';
import { Minimap } from './canvas/Minimap';
import { Palette } from './Palette';
import { Preview } from './Preview';
import { CodePanel } from './CodePanel';
import { Toolbar } from './Toolbar';
import type { PatchJSON } from './types';
import { STARTER_SKETCH } from './decompile';
import { applyCode } from './apply';

type P = { x: number; y: number };

export default function App() {
  const graph = useGraph();
  const remotes = useRemotes();
  const [view, setView] = useState<View>({ x: 0, y: 0, k: 1 });
  const [selection, setSelection] = useState<Set<string>>(new Set());
  const [palette, setPalette] = useState<{ screen: P; world: P } | null>(null);
  const [showCode, setShowCode] = useState(false);
  const [connected, setConnected] = useState(S.provider.wsconnected);
  const [vp, setVp] = useState({ w: window.innerWidth, h: window.innerHeight });
  const [showHelp, setShowHelp] = useState(() => !localStorage.getItem('patch-help-seen'));
  const [previewRect, setPreviewRect] = useState<{ x: number; y: number; w: number; h: number } | undefined>();
  const mouseWorld = useRef<P>({ x: 0, y: 0 });
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    S.whenReady().then(() => {
      if (S.getGraph().nodes.length === 0) {
        S.ensureCanvas();
        applyCode(STARTER_SKETCH);
        S.addNote(1060, 120, 'The sketch on the right is always running.\n\nEdit it as code with </> code, or here as nodes — both ways stay in sync.');
      } else S.ensureCanvas();
    });
    const onStatus = (e: { status: string }) => setConnected(e.status === 'connected');
    S.provider.on('status', onStatus);
    setConnected(S.provider.wsconnected);
    const onResize = () => setVp({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener('resize', onResize);
    return () => { S.provider.off('status', onStatus); window.removeEventListener('resize', onResize); };
  }, []);

  const live = useMemo(() => compile(graph.nodes, graph.edges, true), [graph]);
  const exportCode = useMemo(() => (showCode ? compile(graph.nodes, graph.edges, false).code : ''), [graph, showCode]);
  const canvasNode = graph.nodes.find((n) => n.type === 'canvas');
  const size = { w: Number(canvasNode?.params?.width ?? 600), h: Number(canvasNode?.params?.height ?? 400) };

  const openPalette = useCallback((screen: P, world: P) => setPalette({ screen, world }), []);
  const closePalette = useCallback(() => setPalette(null), []);

  const centerWorld = () => ({ x: (vp.w / 2 - view.x) / view.k, y: (vp.h / 2 - view.y) / view.k });

  const pick = (key: string) => {
    const w = palette?.world ?? centerWorld();
    let id: string | null = null;
    if (key === '@note') id = S.addNote(w.x, w.y);
    else if (key === '@group') id = S.addGroup({ x: w.x, y: w.y, w: 320, h: 220 });
    else id = S.addNode(key, w.x, w.y);
    setPalette(null);
    if (id) setSelection(new Set([id]));
  };

  const save = () => {
    const blob = new Blob([JSON.stringify(S.exportPatch(), null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${S.room}.patch.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };
  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    try {
      const p = JSON.parse(await f.text()) as PatchJSON;
      if (p.version !== 1) throw new Error('unknown format');
      S.loadPatch(p);
      setSelection(new Set());
    } catch (err) {
      alert('Could not load that file: ' + (err as Error).message);
    }
  };
  const fresh = () => {
    if (graph.nodes.length > 1 && !confirm('Clear the whole canvas for everyone in this room?')) return;
    S.clearAll();
    S.ensureCanvas();
    setSelection(new Set());
  };
  const groupSel = () => {
    // reuse the canvas shortcut path by dispatching a key event
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'g' }));
  };

  return (
    <div className="app">
      <Canvas graph={graph} view={view} setView={setView} selection={selection} setSelection={setSelection}
        openPalette={openPalette} closePalette={closePalette} paletteOpen={!!palette} mouseWorld={mouseWorld} />
      <Toolbar remotes={remotes} connected={connected} showCode={showCode}
        onAddNode={() => openPalette({ x: vp.w / 2 - 140, y: vp.h / 2 - 190 }, centerWorld())}
        onNote={() => { const c = centerWorld(); setSelection(new Set([S.addNote(c.x - 100, c.y - 60)])); }}
        onGroup={groupSel}
        onToggleCode={() => setShowCode((s) => !s)}
        onSave={save} onLoad={() => fileInput.current?.click()} onNew={fresh}
        onFit={() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'f' }))} />
      <Preview code={live.code} size={size} compileErrors={live.errors} onRect={setPreviewRect} />
      {showCode && <CodePanel code={exportCode} onClose={() => setShowCode(false)} avoid={previewRect} />}
      {palette && <Palette screen={palette.screen} onPick={pick} onClose={closePalette} />}
      <div className="minimap-wrap" onPointerDown={(e) => e.stopPropagation()}>
        <Minimap graph={graph} view={view} viewport={vp} onJump={(wx, wy) => setView((v) => ({ ...v, x: vp.w / 2 - wx * v.k, y: vp.h / 2 - wy * v.k }))} />
      </div>
      {showHelp && (
        <div className="help" onPointerDown={(e) => e.stopPropagation()}>
          <b>drag</b> pan · <b>⇧drag</b> select · <b>⌘scroll</b> zoom · <b>double-click</b> add node · <b>drag port</b> wire · <b>drop on nothing</b> dangles · <b>N</b> note · <b>G</b> group · <b>⌘C/⌘V</b> copy as JSON
          <button onClick={() => { setShowHelp(false); localStorage.setItem('patch-help-seen', '1'); }}>got it</button>
        </div>
      )}
      <input ref={fileInput} type="file" accept=".json,application/json" style={{ display: 'none' }} onChange={onFile} />
    </div>
  );
}
