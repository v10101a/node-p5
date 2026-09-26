import React, { memo, useState } from 'react';
import type { GroupData } from '../types';
import { updateGroup } from '../store';

export const GroupView = memo(function GroupView({ group, x, y, selected }: { group: GroupData; x: number; y: number; selected: boolean }) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(group.name);
  return (
    <div className={'group' + (selected ? ' selected' : '')} data-group={group.id}
      style={{ left: x, top: y, width: group.w, height: group.h, borderColor: group.color, background: group.color + '14' }}>
      <div className="group-head" data-group-header={group.id} style={{ background: group.color }}>
        {editing ? (
          <input autoFocus value={text} data-widget onChange={(e) => setText(e.target.value)}
            onBlur={() => { setEditing(false); if (text.trim()) updateGroup(group.id, { name: text.trim() }); }}
            onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); if (e.key === 'Escape') setEditing(false); }}
            onPointerDown={(e) => e.stopPropagation()} />
        ) : (
          <span onDoubleClick={(e) => { e.stopPropagation(); setText(group.name); setEditing(true); }}>{group.name}</span>
        )}
      </div>
      <span className="resize" data-resize={group.id} />
    </div>
  );
});
