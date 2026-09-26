import React, { useState } from 'react';
import type { RemoteState } from './hooks';
import { room, me, undoManager } from './store';

interface Props {
  remotes: RemoteState[];
  onAddNode: () => void;
  onNote: () => void;
  onGroup: () => void;
  onToggleCode: () => void;
  showCode: boolean;
  onSave: () => void;
  onLoad: () => void;
  onNew: () => void;
  onFit: () => void;
  connected: boolean;
}

export function Toolbar(p: Props) {
  const [copied, setCopied] = useState(false);
  const share = async () => {
    try { await navigator.clipboard.writeText(location.href); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch {}
  };
  const stop = (e: React.SyntheticEvent) => e.stopPropagation();
  return (
    <>
      <div className="toolbar left" onPointerDown={stop} onDoubleClick={stop}>
        <span className="logo">◐ patch</span>
        <button className="room" onClick={share} title="copy link to this room">{copied ? 'link copied!' : `#${room}`}</button>
        <span className="sep" />
        <button onClick={() => undoManager.undo()} title="undo (⌘Z)">↶</button>
        <button onClick={() => undoManager.redo()} title="redo (⇧⌘Z)">↷</button>
        <span className="sep" />
        <button onClick={p.onAddNode} title="add node (Tab / double-click)">+ node</button>
        <button onClick={p.onNote} title="sticky note (N)">note</button>
        <button onClick={p.onGroup} title="group selection (G)">group</button>
        <button onClick={p.onFit} title="fit to view (F)">fit</button>
      </div>
      <div className="toolbar right" onPointerDown={stop} onDoubleClick={stop}>
        <span className="presence">
          <span className="avatar me" style={{ background: me.color }} title={`${me.name} (you)`}>{me.name[0]}</span>
          {p.remotes.map((r) => (
            <span key={r.clientId} className="avatar" style={{ background: r.user.color }} title={r.user.name}>{r.user.name[0]}</span>
          ))}
          <span className={'conn ' + (p.connected ? 'on' : 'off')} title={p.connected ? 'connected' : 'offline — changes are saved locally'} />
        </span>
        <span className="sep" />
        <button className={p.showCode ? 'active' : ''} onClick={p.onToggleCode} title="show compiled sketch.js">{'</>'} code</button>
        <button onClick={p.onSave} title="download patch as JSON">save</button>
        <button onClick={p.onLoad} title="load a patch JSON">load</button>
        <button onClick={p.onNew} title="clear the canvas">new</button>
      </div>
    </>
  );
}
