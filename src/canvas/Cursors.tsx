import React from 'react';
import type { RemoteState } from '../hooks';

export function Cursors({ remotes, k }: { remotes: RemoteState[]; k: number }) {
  return (
    <>
      {remotes.map((r) =>
        r.cursor ? (
          <div key={r.clientId} className="cursor" style={{ transform: `translate(${r.cursor.x}px, ${r.cursor.y}px) scale(${1 / k})` }}>
            <svg width="18" height="22" viewBox="0 0 18 22">
              <path d="M2 2 L16 11 L9.5 12.5 L6 20 Z" fill={r.user.color} stroke="#fff" strokeWidth="1.5" strokeLinejoin="round" />
            </svg>
            <span className="cursor-name" style={{ background: r.user.color }}>{r.user.name}</span>
          </div>
        ) : null,
      )}
    </>
  );
}
