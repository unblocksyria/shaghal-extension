import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { CategoryItem } from '../../../lib/endpoints';
import { ChevronDown, Search } from 'lucide-react';

/**
 * A searchable list of category checkboxes behind a toggle. The list comes
 * after its toggle in the page, for keyboard and screen reader order, and is
 * drawn above it. Escape, a click outside or tabbing away closes it; Escape
 * also gives focus back to the toggle.
 */
export function CategoryPicker(props: {
  options: CategoryItem[];
  selected: Set<string>;
  onChange: (selected: Set<string>) => void;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const listId = useId();
  const wrapper = useRef<HTMLDivElement>(null);
  const toggleButton = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      if (!wrapper.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', outside);
    return () => document.removeEventListener('pointerdown', outside);
  }, [open]);

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (normalized.length === 0) return props.options;
    return props.options.filter((option) => option.name.toLowerCase().includes(normalized));
  }, [props.options, query]);

  const toggle = (id: string) => {
    const next = new Set(props.selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    props.onChange(next);
  };

  const selectedNames = useMemo(
    () => props.options.filter((option) => props.selected.has(option.id)).map((option) => option.name),
    [props.selected, props.options],
  );

  return (
    <div
      ref={wrapper}
      style={{ position: 'relative', display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 6, minWidth: 0 }}
      onKeyDown={(event) => {
        if (event.key !== 'Escape' || !open) return;
        // Only the list closes, not a dialog the picker sits in.
        event.stopPropagation();
        setOpen(false);
        toggleButton.current?.focus();
      }}
      onBlur={(event) => {
        const next = event.relatedTarget as Node | null;
        if (open && next !== null && !wrapper.current?.contains(next)) setOpen(false);
      }}
    >
      <button
        ref={toggleButton}
        type="button"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => setOpen((current) => !current)}
        style={{
          width: '100%',
          minHeight: 44,
          backgroundColor: 'var(--us-input-bg)',
          border: '1px solid var(--us-border)',
          borderRadius: 'var(--us-radius-control)',
          padding: '0 12px',
          color: 'var(--us-text-primary)',
          fontSize: 'var(--us-text-md)',
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
            textAlign: 'start',
            color: props.selected.size === 0 ? 'var(--us-text-dim)' : 'var(--us-text-primary)',
          }}
        >
          {props.selected.size === 0
            ? t('categoryPicker.select')
            : t('categoryPicker.selected', {
                n: props.selected.size,
                names: `${selectedNames.slice(0, 3).join(', ')}${selectedNames.length > 3 ? '…' : ''}`,
              })}
        </span>
        <ChevronDown
          size={16}
          aria-hidden="true"
          color="var(--us-text-muted)"
          style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s ease', flexShrink: 0 }}
        />
      </button>
      {open && (
        <div
          id={listId}
          role="group"
          aria-label={t('categoryPicker.listLabel')}
          style={{
            position: 'absolute',
            bottom: '100%',
            insetInlineStart: 0,
            insetInlineEnd: 0,
            marginBottom: 6,
            backgroundColor: 'var(--us-card)',
            border: '1px solid var(--us-border)',
            borderRadius: 'var(--us-radius-control)',
            boxShadow: '0 8px 24px var(--us-shadow-color)',
            zIndex: 20,
            display: 'grid',
            gridTemplateRows: 'auto 1fr',
            maxHeight: 280,
            minWidth: 0,
            overflow: 'hidden',
          }}
        >
          <div style={{ position: 'relative', padding: 10 }}>
            {/* Centred on the 38px field: 10px of padding, then (38 - 14) / 2. */}
            <Search
              size={14}
              aria-hidden="true"
              color="var(--us-text-dim)"
              style={{ position: 'absolute', insetInlineStart: 20, top: 22 }}
            />
            <input
              autoFocus
              type="search"
              aria-label={t('categoryPicker.searchLabel')}
              placeholder={t('categoryPicker.search')}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              style={{
                width: '100%',
                height: 38,
                backgroundColor: 'var(--us-input-bg)',
                border: '1px solid var(--us-border)',
                borderRadius: 'var(--us-radius-control)',
                paddingBlock: 0,
                paddingInlineStart: 32,
                paddingInlineEnd: 12,
                color: 'var(--us-text-primary)',
                fontSize: 'var(--us-text-sm)',
                outline: 'none',
              }}
            />
          </div>
          <div style={{ overflowY: 'auto', padding: '0 6px 6px 6px' }}>
            {filtered.length === 0 && (
              <div style={{ padding: '8px 10px', fontSize: 'var(--us-text-xs)', color: 'var(--us-text-muted)' }}>
                {t('categoryPicker.none')}
              </div>
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
                  fontSize: 'var(--us-text-sm)',
                  lineHeight: '20px',
                  color: 'var(--us-text-primary)',
                  cursor: 'pointer',
                  backgroundColor: props.selected.has(option.id) ? 'var(--us-gold-subtle)' : 'transparent',
                }}
              >
                <input type="checkbox" checked={props.selected.has(option.id)} onChange={() => toggle(option.id)} />
                <span>{option.name}</span>
              </label>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
