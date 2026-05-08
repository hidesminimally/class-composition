import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  commentsAdapter,
  PREDEFINED_TAGS,
  getRememberedAuthor,
  setRememberedAuthor,
} from '../lib/comments';

// Slide-in drawer for canvassing notes. Controlled component:
//   isOpen, scope ('tract' | 'local'), scopeId, scopeLabel, onClose
//
// One instance lives at App.jsx top level. Any surface that wants to open
// the drawer just sets {scope, scopeId} and toggles isOpen.
//
// Storage is delegated to commentsAdapter (localStorage v1; Supabase later).
// A passive subscription to the store keeps the list fresh without each
// caller having to re-mount the drawer.
const CommentsDrawer = ({ isOpen, scope, scopeId, scopeLabel, onClose }) => {
  const [, forceTick] = useState(0);
  const [showAll, setShowAll] = useState(false); // future-proof; only relevant if we add cross-scope view
  const [author, setAuthor] = useState(getRememberedAuthor());
  const [body, setBody] = useState('');
  const [tags, setTags] = useState([]);
  const [editingId, setEditingId] = useState(null);
  const [editBody, setEditBody] = useState('');
  const [editTags, setEditTags] = useState([]);
  const importInputRef = useRef(null);
  const bodyRef = useRef(null);

  // Re-render when the store changes (covers add/edit/delete/import from any surface).
  useEffect(() => {
    if (!isOpen) return;
    const unsub = commentsAdapter.subscribe(() => forceTick(t => t + 1));
    return unsub;
  }, [isOpen]);

  // Reset transient state when scope changes.
  useEffect(() => {
    setEditingId(null);
    setBody('');
    setTags([]);
    setShowAll(false);
  }, [scope, scopeId]);

  // ESC closes.
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e) => { if (e.key === 'Escape') onClose?.(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  const notes = useMemo(() => {
    if (!scope || !scopeId) return [];
    return commentsAdapter.list(scope, scopeId);
  }, [scope, scopeId, isOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  const headerTitle = useMemo(() => {
    if (!scope || !scopeId) return 'Notes';
    if (scope === 'tract') return `Notes — Tract ${scopeLabel || scopeId}`;
    return `Notes — ${scopeLabel || scopeId} Local`;
  }, [scope, scopeId, scopeLabel]);

  const toggleTag = (t, current, setter) => {
    setter(current.includes(t) ? current.filter(x => x !== t) : [...current, t]);
  };

  const handleSubmit = (e) => {
    e?.preventDefault?.();
    if (!body.trim()) return;
    setRememberedAuthor(author);
    commentsAdapter.add(scope, scopeId, { author, body, tags });
    setBody('');
    setTags([]);
    bodyRef.current?.focus?.();
  };

  const startEdit = (note) => {
    setEditingId(note.id);
    setEditBody(note.body);
    setEditTags(note.tags || []);
  };
  const cancelEdit = () => { setEditingId(null); setEditBody(''); setEditTags([]); };
  const saveEdit = () => {
    commentsAdapter.update(editingId, { body: editBody, tags: editTags });
    cancelEdit();
  };
  const handleDelete = (note) => {
    if (!window.confirm('Delete this note? This cannot be undone.')) return;
    commentsAdapter.delete(note.id);
  };

  const canEdit = (note) => {
    const a = (author || '').trim();
    return a && note.author && note.author.trim().toLowerCase() === a.toLowerCase();
  };

  const handleExport = () => {
    const data = commentsAdapter.exportAll();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `tanc-notes-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleImportClick = () => importInputRef.current?.click();
  const handleImportFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const text = await file.text();
      const json = JSON.parse(text);
      commentsAdapter.importAll(json);
    } catch (err) {
      window.alert('Could not parse that file. Expected a JSON export from this app.');
    }
  };

  const overlayStyle = {
    position: 'fixed', inset: 0,
    background: 'rgba(15,23,42,0.18)',
    opacity: isOpen ? 1 : 0,
    pointerEvents: isOpen ? 'auto' : 'none',
    transition: 'opacity 200ms ease',
    zIndex: 90,
  };
  const drawerStyle = {
    position: 'fixed', top: 0, right: 0, bottom: 0,
    width: 'min(360px, 100vw)',
    background: 'white',
    borderLeft: '1px solid var(--border)',
    boxShadow: '-8px 0 24px rgba(15,23,42,0.12)',
    transform: isOpen ? 'translateX(0)' : 'translateX(100%)',
    transition: 'transform 200ms ease',
    zIndex: 100,
    display: 'flex', flexDirection: 'column',
  };

  return (
    <>
      <div style={overlayStyle} onClick={onClose} aria-hidden={!isOpen} />
      <aside
        className="comments-drawer"
        style={drawerStyle}
        role="dialog"
        aria-label={headerTitle}
        aria-hidden={!isOpen}
      >
        <header style={{ padding: '16px 16px 12px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
            <h2 style={{ margin: 0, fontSize: '1rem', fontWeight: 800, color: 'var(--primary)' }}>
              {headerTitle}
            </h2>
            <button
              onClick={onClose}
              aria-label="Close notes"
              style={{
                background: 'none', border: 'none', fontSize: '1.4rem', cursor: 'pointer',
                color: 'var(--text-muted)', padding: 0, lineHeight: 1,
              }}
            >&times;</button>
          </div>
          <div style={{ display: 'flex', gap: 6, marginTop: 10, flexWrap: 'wrap' }}>
            <button
              onClick={handleExport}
              style={btnSecondary}
              title="Download all notes as JSON"
            >Export</button>
            <button
              onClick={handleImportClick}
              style={btnSecondary}
              title="Merge a previously-exported notes file"
            >Import</button>
            <input
              ref={importInputRef}
              type="file"
              accept="application/json,.json"
              onChange={handleImportFile}
              style={{ display: 'none' }}
            />
          </div>
        </header>

        <div style={{ flex: 1, overflow: 'auto', padding: '12px 16px' }}>
          {notes.length === 0 ? (
            <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem', padding: '8px 0' }}>
              No notes yet. Add the first one below.
            </div>
          ) : notes.map(note => {
            const isEditing = editingId === note.id;
            const editable = canEdit(note);
            return (
              <article
                key={note.id}
                style={{
                  border: '1px solid var(--border)',
                  borderRadius: 6,
                  padding: 10,
                  marginBottom: 10,
                  background: '#fafbfc',
                }}
              >
                <div style={{
                  display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'baseline',
                  fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: 6,
                }}>
                  <strong style={{ color: 'var(--text)', fontWeight: 700 }}>
                    {note.author || 'anonymous'}
                  </strong>
                  <time>{formatDate(note.createdAt)}</time>
                </div>
                {isEditing ? (
                  <>
                    <textarea
                      value={editBody}
                      onChange={(e) => setEditBody(e.target.value)}
                      rows={3}
                      style={textareaStyle}
                    />
                    <TagPicker selected={editTags} onToggle={(t) => toggleTag(t, editTags, setEditTags)} />
                    <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                      <button onClick={saveEdit} style={btnPrimary}>Save</button>
                      <button onClick={cancelEdit} style={btnSecondary}>Cancel</button>
                    </div>
                  </>
                ) : (
                  <>
                    <div style={{ fontSize: '0.88rem', color: 'var(--text)', whiteSpace: 'pre-wrap', lineHeight: 1.4 }}>
                      {note.body}
                    </div>
                    {note.tags?.length > 0 && (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 8 }}>
                        {note.tags.map(t => (
                          <span key={t} style={tagPillStyle}>{t}</span>
                        ))}
                      </div>
                    )}
                    {editable && (
                      <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                        <button
                          onClick={() => startEdit(note)}
                          style={btnLink}
                        >Edit</button>
                        <button
                          onClick={() => handleDelete(note)}
                          style={{ ...btnLink, color: '#dc2626' }}
                        >Delete</button>
                      </div>
                    )}
                  </>
                )}
              </article>
            );
          })}
        </div>

        <form
          onSubmit={handleSubmit}
          style={{
            borderTop: '1px solid var(--border)',
            padding: '12px 16px',
            background: '#f8fafc',
            flexShrink: 0,
          }}
        >
          <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
            <input
              type="text"
              placeholder="Your name"
              value={author}
              onChange={(e) => setAuthor(e.target.value)}
              onBlur={() => setRememberedAuthor(author)}
              style={inputStyle}
            />
          </div>
          <textarea
            ref={bodyRef}
            placeholder="Add a note…"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={3}
            style={textareaStyle}
          />
          <TagPicker selected={tags} onToggle={(t) => toggleTag(t, tags, setTags)} />
          <button
            type="submit"
            disabled={!body.trim()}
            style={{
              ...btnPrimary,
              width: '100%',
              marginTop: 8,
              opacity: body.trim() ? 1 : 0.5,
              cursor: body.trim() ? 'pointer' : 'not-allowed',
            }}
          >Add note</button>
        </form>
      </aside>
    </>
  );
};

function TagPicker({ selected, onToggle }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 6 }}>
      {PREDEFINED_TAGS.map(t => {
        const on = selected.includes(t);
        return (
          <button
            key={t}
            type="button"
            onClick={() => onToggle(t)}
            style={{
              fontSize: '0.7rem',
              padding: '3px 8px',
              borderRadius: 999,
              border: '1px solid',
              borderColor: on ? 'var(--accent)' : 'var(--border)',
              background: on ? 'var(--accent)' : 'white',
              color: on ? 'white' : 'var(--text-muted)',
              cursor: 'pointer',
              fontWeight: 600,
            }}
          >{t}</button>
        );
      })}
    </div>
  );
}

function formatDate(iso) {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    return d.toLocaleString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
  } catch (_) { return iso; }
}

const inputStyle = {
  flex: 1,
  padding: '6px 8px',
  fontSize: '0.85rem',
  border: '1px solid var(--border)',
  borderRadius: 4,
  background: 'white',
  color: 'var(--text)',
};
const textareaStyle = {
  width: '100%',
  padding: '6px 8px',
  fontSize: '0.88rem',
  border: '1px solid var(--border)',
  borderRadius: 4,
  background: 'white',
  color: 'var(--text)',
  fontFamily: 'inherit',
  resize: 'vertical',
  boxSizing: 'border-box',
};
const btnPrimary = {
  background: 'var(--accent)', color: 'white',
  border: 'none', borderRadius: 4,
  padding: '6px 12px', fontSize: '0.82rem', fontWeight: 700,
  cursor: 'pointer',
};
const btnSecondary = {
  background: 'white', color: 'var(--accent)',
  border: '1px solid var(--accent)', borderRadius: 4,
  padding: '4px 10px', fontSize: '0.78rem', fontWeight: 600,
  cursor: 'pointer',
};
const btnLink = {
  background: 'none', border: 'none', padding: 0,
  fontSize: '0.78rem', fontWeight: 600,
  color: 'var(--accent)', cursor: 'pointer',
};
const tagPillStyle = {
  fontSize: '0.7rem', padding: '2px 7px', borderRadius: 999,
  background: '#eff6ff', color: 'var(--accent)',
  border: '1px solid #dbeafe', fontWeight: 600,
};

export default CommentsDrawer;
