import React, { useEffect, useState } from 'react';
import { commentsAdapter } from '../lib/comments';

// Small pill that shows the comment count for a given (scope, scopeId).
// Hides itself when count === 0 unless `alwaysShow` is set — the spec wants
// the map UI to feel uncrowded by default. Click opens the comments drawer.
//
// Re-renders whenever the comments store changes so badges update across
// every surface (Card, FactSheet, DataTable) the moment a note is saved.
const CommentChip = ({ scope, scopeId, onOpen, alwaysShow = false, size = 'sm', title }) => {
  const [count, setCount] = useState(() => commentsAdapter.countFor(scope, scopeId));

  useEffect(() => {
    setCount(commentsAdapter.countFor(scope, scopeId));
    const unsub = commentsAdapter.subscribe(() => {
      setCount(commentsAdapter.countFor(scope, scopeId));
    });
    return unsub;
  }, [scope, scopeId]);

  if (count === 0 && !alwaysShow) return null;

  const isLg = size === 'lg';
  const style = {
    display: 'inline-flex', alignItems: 'center', gap: 4,
    padding: isLg ? '4px 10px' : '2px 7px',
    borderRadius: 999,
    fontSize: isLg ? '0.78rem' : '0.7rem',
    fontWeight: 700,
    background: count > 0 ? '#eff6ff' : 'transparent',
    color: count > 0 ? 'var(--accent)' : 'var(--text-muted)',
    border: '1px solid',
    borderColor: count > 0 ? 'var(--accent)' : 'var(--border)',
    cursor: 'pointer',
    lineHeight: 1.1,
    userSelect: 'none',
    whiteSpace: 'nowrap',
  };

  const label = count === 0 ? 'Add note' : `${count}`;

  return (
    <button
      type="button"
      className="comment-chip"
      title={title || (count === 0 ? 'Add note' : `${count} note${count === 1 ? '' : 's'}`)}
      onClick={(e) => { e.stopPropagation(); onOpen?.({ scope, scopeId }); }}
      style={style}
    >
      <span aria-hidden="true">{count === 0 ? '+' : '\u{1F4AC}'}</span>
      <span>{label}</span>
    </button>
  );
};

export default CommentChip;
