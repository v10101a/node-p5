import React, { memo, useEffect, useRef } from 'react';
import type { NoteData } from '../types';
import { updateNote, nextNoteColor, removeItems } from '../store';
import { sizes } from './layout';

export const NoteView = memo(function NoteView({ note, x, y, selected, remoteColor }: { note: NoteData; x: number; y: number; selected: boolean; remoteColor?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    sizes.set(note.id, { w: note.w, h: note.h });
    return () => { sizes.delete(note.id); };
  }, [note.id, note.w, note.h]);
  // a note you just made is ready to type into
  useEffect(() => {
    if (selected && !note.text) ref.current?.querySelector('textarea')?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const style: React.CSSProperties = { left: x, top: y, width: note.w, height: note.h, background: note.color };
  if (remoteColor) style.boxShadow = `0 0 0 2px ${remoteColor}`;
  return (
    <div ref={ref} className={'note' + (selected ? ' selected' : '')} data-note={note.id} style={style}>
      <div className="note-head">
        <button className="note-color" data-widget style={{ background: nextNoteColor(note.color) }} title="change color"
          onPointerDown={(e) => e.stopPropagation()} onClick={() => updateNote(note.id, { color: nextNoteColor(note.color) })} />
        <span className="grip">⋯</span>
        <button className="note-x" data-widget onPointerDown={(e) => e.stopPropagation()} onClick={() => removeItems([note.id])} title="delete">×</button>
      </div>
      <textarea className="note-text" data-widget value={note.text} placeholder="write something…" spellCheck={false}
        onChange={(e) => updateNote(note.id, { text: e.target.value })}
        onPointerDown={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()} onWheel={(e) => e.stopPropagation()} />
      <span className="resize" data-resize={note.id} />
    </div>
  );
});
