import { useState } from 'react';
import { getCategories, type CategoryItem, type ServiceRecord } from '../../../lib/endpoints';
import { submitCorrection, type CorrectionType } from '../../../lib/submit';
import { Input } from '../../../components/ui/Input';
import { Textarea } from '../../../components/ui/Textarea';
import { CategoryPicker } from './CategoryPicker';
import {
  EmailField,
  FormFooter,
  FormShell,
  ScreenshotField,
  SentState,
  uploadScreenshots,
  useSavedEmail,
  useScreenshots,
} from './FormParts';

const FIELDS: { type: CorrectionType; label: string; placeholder: string }[] = [
  { type: 'url', label: 'Website URL', placeholder: 'example.com' },
  { type: 'description', label: 'Description', placeholder: 'Enter the correct description...' },
  { type: 'category', label: 'Categories', placeholder: '' },
  { type: 'support_email', label: 'Support Email', placeholder: 'support@example.com' },
  { type: 'support_url', label: 'Support URL', placeholder: 'example.com/support' },
  { type: 'other', label: 'Other Information', placeholder: 'Describe what needs to be corrected...' },
];

function recorded(service: ServiceRecord, type: CorrectionType): string {
  switch (type) {
    case 'url':
      return service.url ?? '';
    case 'description':
      return service.description ?? '';
    case 'category':
      return (service.categories ?? []).map((category) => category.name).join(', ');
    case 'support_email':
      return service.supportEmail ?? '';
    case 'support_url':
      return service.supportUrl ?? '';
    case 'other':
      return '';
  }
}

/** The API's cap on a service's categories. */
const MAX_CATEGORIES = 10;

function recordedCategoryIds(service: ServiceRecord): Set<string> {
  return new Set((service.categories ?? []).map((category) => category.id));
}

function sameSet(a: Set<string>, b: Set<string>): boolean {
  return a.size === b.size && [...a].every((value) => b.has(value));
}

/** Everything ticked goes in one submission; the review queue splits it into one item per field. */
export function CorrectionForm(props: { service: ServiceRecord; onBack: () => void }) {
  const [selected, setSelected] = useState<Set<CorrectionType>>(new Set());
  const [values, setValues] = useState<Partial<Record<CorrectionType, string>>>({});
  const [categories, setCategories] = useState<Set<string>>(new Set());
  const [categoryOptions, setCategoryOptions] = useState<CategoryItem[]>([]);
  const screenshots = useScreenshots();
  const [email, setEmail] = useSavedEmail();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const toggle = (type: CorrectionType) => {
    const adding = !selected.has(type);
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next;
    });
    // Categories start from the recorded set, so adding one is one tick.
    if (adding && type === 'category') {
      setCategories(recordedCategoryIds(props.service));
      if (categoryOptions.length === 0) {
        void getCategories().then((result) => {
          if (result.ok) setCategoryOptions(result.data);
          else setError(`Could not load categories: ${result.error.message}`);
        });
      }
    }
  };

  // In catalogue order, so the form does not reshuffle as boxes are ticked.
  const chosen = FIELDS.filter((field) => selected.has(field.type));
  // The API takes a category change as a JSON array of category IDs.
  const proposedOf = (type: CorrectionType) =>
    type === 'category' ? JSON.stringify([...categories]) : (values[type] ?? '').trim();
  const unchanged = (type: CorrectionType) =>
    type === 'category'
      ? sameSet(categories, recordedCategoryIds(props.service))
      : type !== 'other' && proposedOf(type) === recorded(props.service, type);
  const choosingCategories = selected.has('category');
  const blocker =
    chosen.length === 0
      ? 'Choose what needs to be corrected.'
      : choosingCategories && categories.size === 0
        ? 'Choose at least one category.'
        : choosingCategories && categories.size > MAX_CATEGORIES
          ? `A service can have at most ${MAX_CATEGORIES} categories.`
          : chosen.some((field) => field.type !== 'category' && proposedOf(field.type).length === 0)
            ? 'Enter the correct information for each field you ticked.'
            : chosen.some((field) => unchanged(field.type))
              ? 'One of these is what is already recorded.'
              : null;

  const submit = async () => {
    setBusy(true);
    setError(null);
    const uploaded = await uploadScreenshots(screenshots, 'correction');
    if (!uploaded.ok) {
      setBusy(false);
      setError(uploaded.message);
      return;
    }
    const result = await submitCorrection({
      serviceId: props.service.id,
      changes: chosen.map((field) => ({ correctionType: field.type, proposedValue: proposedOf(field.type) })),
      submitterEmail: email.trim().length > 0 ? email.trim() : undefined,
      evidenceUrls: uploaded.urls,
    });
    setBusy(false);
    if (!result.ok) {
      setError(
        result.error.status === 429 ? 'Too many corrections from this network. Try again later.' : result.error.message,
      );
      return;
    }
    setSent(true);
  };

  if (sent) {
    return (
      <SentState
        title="Correction Submitted"
        message="Thank you for helping improve our data. We'll review your correction and update the service information if approved."
        actionLabel={`Back to ${props.service.name}`}
        onAction={props.onBack}
      />
    );
  }

  return (
    <FormShell
      backLabel={`Back to ${props.service.name}`}
      onBack={props.onBack}
      title="Suggest Correction"
      intro={`Something wrong in ${props.service.name}'s listing? Tell us what it should be.`}
    >
      <div style={{ display: 'grid', gap: 8 }}>
        <span className="us-label">
          What needs to be corrected? <span aria-hidden="true">*</span>
        </span>
        <div
          role="group"
          aria-label="What needs to be corrected?"
          style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}
        >
          {FIELDS.map((field) => (
            <button
              key={field.type}
              type="button"
              role="checkbox"
              aria-checked={selected.has(field.type)}
              className="us-chip"
              onClick={() => toggle(field.type)}
            >
              {field.label}
            </button>
          ))}
        </div>
      </div>

      {chosen.map((field) => {
        const current = recorded(props.service, field.type);
        return (
          <div key={field.type} className="us-animate-fade" style={{ display: 'grid', gap: 8 }}>
            <span className="us-label">
              {field.label} <span aria-hidden="true">*</span>
            </span>
            {field.type !== 'other' && (
              <p className="us-current">
                <span style={{ color: 'var(--us-text-muted)' }}>Currently recorded as:</span>
                {current.length > 0 ? (
                  <span style={{ fontWeight: 500 }}>{current}</span>
                ) : (
                  <span style={{ color: 'var(--us-text-muted)', fontStyle: 'italic' }}>Nothing recorded yet.</span>
                )}
              </p>
            )}
            {field.type === 'category' ? (
              <CategoryPicker options={categoryOptions} selected={categories} onChange={setCategories} />
            ) : field.type === 'description' || field.type === 'other' ? (
              <Textarea
                aria-label={field.label}
                placeholder={field.placeholder}
                value={values[field.type] ?? ''}
                onChange={(event) => setValues((prev) => ({ ...prev, [field.type]: event.target.value }))}
                rows={3}
              />
            ) : (
              <Input
                aria-label={field.label}
                type={field.type === 'support_email' ? 'email' : 'text'}
                placeholder={field.placeholder}
                value={values[field.type] ?? ''}
                onChange={(event) => setValues((prev) => ({ ...prev, [field.type]: event.target.value }))}
              />
            )}
          </div>
        );
      })}

      <ScreenshotField
        screenshots={screenshots}
        label="Evidence screenshots"
        hint="Optional. A screenshot from the official source helps us verify it faster."
      />

      <EmailField value={email} onChange={setEmail} />

      <FormFooter
        label="Submit Correction"
        busyLabel="Submitting…"
        busy={busy}
        blocker={blocker}
        note="We review all corrections before applying them. Usually within 24 hours."
        error={error}
        onSubmit={() => void submit()}
      />
    </FormShell>
  );
}
