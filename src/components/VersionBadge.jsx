import React, { useState } from 'react';

// Tiny corner badge showing the build's git SHA. Hover/click to see the
// branch and ISO build timestamp. Useful for confirming a deploy actually
// shipped — `b030aed` in the corner means you're on commit b030aed.
const V = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : { sha: 'dev', branch: 'unknown', buildTime: '' };

const VersionBadge = () => {
  const [open, setOpen] = useState(false);

  const builtAt = V.buildTime ? new Date(V.buildTime) : null;
  const dateStr = builtAt
    ? `${builtAt.toISOString().slice(0, 10)} ${builtAt.toISOString().slice(11, 16)}Z`
    : '';

  return (
    <div
      onClick={() => setOpen(o => !o)}
      title={`branch: ${V.branch}\nbuilt: ${V.buildTime}`}
      style={{
        position: 'fixed', bottom: 6, left: 8, zIndex: 50,
        background: 'rgba(15, 23, 42, 0.7)', color: '#e2e8f0',
        padding: '2px 7px', borderRadius: 4,
        fontSize: '0.65rem', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
        cursor: 'pointer', userSelect: 'none', lineHeight: 1.4,
      }}
    >
      {open ? (
        <span>
          v{V.sha} · {V.branch} · {dateStr}
        </span>
      ) : (
        <span>v{V.sha}</span>
      )}
    </div>
  );
};

export default VersionBadge;
