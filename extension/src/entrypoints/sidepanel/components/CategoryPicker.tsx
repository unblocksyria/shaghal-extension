import { useMemo, useRef, useState } from 'react';
import type { CategoryItem } from '../../../lib/endpoints';
import { ChevronDown, Search } from 'lucide-react';

export function CategoryPicker(props: {
  options: CategoryItem[];
  selected: Set<string>;
  onChange: (selected: Set<string>) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (normalized.length === 0) return props.options;
    return props.options.filter((option) => option.name.toLowerCase().includes(normalized));
  }, [props.options, query]);

  const toggle = (name: string) => {
    const next = new Set(props.selected);
    if (next.has(name)) next.delete(name);
    else next.add(name);
    props.onChange(next);
  };

  const selectedNames = useMemo(() => {
    const order = new Map(props.options.map((option) => [option.name, option.id]));
    return [...props.selected].sort((a, b) => (order.get(a) ?? a).localeCompare(order.get(b) ?? b));
  }, [props.selected, props.options]);

  return (
    <div
      ref={containerRef}
      style={{ position: 'relative', display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 6, minWidth: 0 }}
    >
      {open && (
        <div
          style={{
            position: 'absolute',
            bottom: '100%',
            left: 0,
            right: 0,
            marginBottom: 6,
            backgroundColor: '#1B1B1D',
            border: '1px solid var(--us-border)',
            borderRadius: 'var(--us-radius-control)',
            boxShadow: '0 8px 24px rgba(0, 0, 0, 0.5)',
            zIndex: 20,
            display: 'grid',
            gridTemplateRows: 'auto 1fr',
            maxHeight: 280,
            minWidth: 0,
            overflow: 'hidden',
          }}
        >
          <div style={{ position: 'relative', padding: 10 }}>
            <Search size={14} color="var(--us-text-dim)" style={{ position: 'absolute', left: 20, top: 20 }} />
            <input
              autoFocus
              placeholder="Search categories..."
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              style={{
                width: '100%',
                height: 38,
                backgroundColor: '#0F0F10',
                border: '1px solid var(--us-border)',
                borderRadius: 'var(--us-radius-control)',
                padding: '0 12px 0 32px',
                color: 'var(--us-text-primary)',
                fontSize: 13,
                outline: 'none',
              }}
            />
          </div>
          <div style={{ overflowY: 'auto', padding: '0 6px 6px 6px' }}>
            {filtered.length === 0 && (
              <div style={{ padding: '10px 8px', fontSize: 12, color: 'var(--us-text-dim)' }}>No categories found.</div>
            )}
            {filtered.map((option) => (
              <label
                key={option.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '8px 10px',
                  borderRadius: 6,
                  fontSize: 13,
                  color: 'var(--us-text-primary)',
                  cursor: 'pointer',
                  backgroundColor: props.selected.has(option.name) ? 'rgba(185, 168, 123, 0.06)' : 'transparent',
                }}
              >
                <input type="checkbox" checked={props.selected.has(option.name)} onChange={() => toggle(option.name)} />
                <span>{option.name}</span>
              </label>
            ))}
          </div>
        </div>
      )}

      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        style={{
          width: '100%',
          minHeight: 44,
          backgroundColor: '#0F0F10',
          border: '1px solid rgba(185, 168, 123, 0.4)',
          borderRadius: 'var(--us-radius-control)',
          padding: '0 12px',
          color: 'var(--us-text-primary)',
          fontSize: 13,
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 8,
        }}
      >
        <span
          style={{
            flex: 1,
            minWidth: 0,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            textAlign: 'left',
            color: props.selected.size === 0 ? 'var(--us-text-dim)' : 'var(--us-text-primary)',
          }}
        >
          {props.selected.size === 0
            ? 'Select correct categories...'
            : `${props.selected.size} selected: ${selectedNames.slice(0, 3).join(', ')}${selectedNames.length > 3 ? '…' : ''}`}
        </span>
        <ChevronDown
          size={14}
          color="var(--us-text-muted)"
          style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s ease', flexShrink: 0 }}
        />
      </button>
    </div>
  );
}
