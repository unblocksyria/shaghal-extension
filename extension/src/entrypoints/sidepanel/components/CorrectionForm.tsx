import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getCategories, type CategoryItem, type ServiceRecord } from '../../../lib/endpoints';
import { submitCorrection, type CorrectionType } from '../../../lib/submit';
import { serviceName } from '../../../lib/serviceName';
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

/** The six fields, keyed by the type the API records each correction against. */
const FIELD_TYPES: CorrectionType[] = ['url', 'description', 'category', 'support_email', 'support_url', 'other'];

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
  const { t } = useTranslation();
  const labels: Record<CorrectionType, string> = {
    url: t('correction.fieldUrl'),
    description: t('correction.fieldDescription'),
    category: t('correction.fieldCategory'),
    support_email: t('correction.fieldSupportEmail'),
    support_url: t('correction.fieldSupportUrl'),
    other: t('correction.fieldOther'),
  };
  const placeholders: Record<CorrectionType, string> = {
    url: t('correction.fieldUrlPlaceholder'),
    description: t('correction.fieldDescriptionPlaceholder'),
    category: '',
    support_email: t('correction.fieldSupportEmailPlaceholder'),
    support_url: t('correction.fieldSupportUrlPlaceholder'),
    other: t('correction.fieldOtherPlaceholder'),
  };
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
          else setError(t('correction.categoriesFailed', { message: result.error.message }));
        });
      }
    }
  };

  // In catalogue order, so the form does not reshuffle as boxes are ticked.
  const chosen = FIELD_TYPES.filter((type) => selected.has(type));
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
      ? t('correction.chooseFirst')
      : choosingCategories && categories.size === 0
        ? t('correction.chooseCategory')
        : choosingCategories && categories.size > MAX_CATEGORIES
          ? t('correction.maxCategories', { max: MAX_CATEGORIES })
          : chosen.some((type) => type !== 'category' && proposedOf(type).length === 0)
            ? t('correction.enterValue')
            : chosen.some((type) => unchanged(type))
              ? t('correction.unchanged')
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
      changes: chosen.map((type) => ({ correctionType: type, proposedValue: proposedOf(type) })),
      submitterEmail: email.trim().length > 0 ? email.trim() : undefined,
      evidenceUrls: uploaded.urls,
    });
    setBusy(false);
    if (!result.ok) {
      setError(result.error.status === 429 ? t('correction.rateLimited') : result.error.message);
      return;
    }
    setSent(true);
  };

  if (sent) {
    return (
      <SentState
        title={t('correction.sentTitle')}
        message={t('correction.sentMessage')}
        actionLabel={t('common.backTo', { name: serviceName(props.service) })}
        onAction={props.onBack}
      />
    );
  }

  return (
    <FormShell
      backLabel={t('common.backTo', { name: serviceName(props.service) })}
      onBack={props.onBack}
      title={t('correction.title')}
      intro={t('correction.intro', { name: serviceName(props.service) })}
    >
      <div style={{ display: 'grid', gap: 8 }}>
        <span className="us-label">
          {t('correction.whatToCorrect')} <span aria-hidden="true">*</span>
        </span>
        <div
          role="group"
          aria-label={t('correction.whatToCorrect')}
          style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}
        >
          {FIELD_TYPES.map((type) => (
            <button
              key={type}
              type="button"
              role="checkbox"
              aria-checked={selected.has(type)}
              className="us-chip"
              onClick={() => toggle(type)}
            >
              {labels[type]}
            </button>
          ))}
        </div>
      </div>

      {chosen.map((type) => {
        const current = recorded(props.service, type);
        return (
          <div key={type} className="us-animate-fade" style={{ display: 'grid', gap: 8 }}>
            <span className="us-label">
              {labels[type]} <span aria-hidden="true">*</span>
            </span>
            {type !== 'other' && (
              <p className="us-current">
                <span style={{ color: 'var(--us-text-muted)' }}>{t('correction.recordedAs')}</span>
                {current.length > 0 ? (
                  <span style={{ fontWeight: 500 }}>{current}</span>
                ) : (
                  <span style={{ color: 'var(--us-text-muted)', fontStyle: 'italic' }}>
                    {t('correction.nothingRecorded')}
                  </span>
                )}
              </p>
            )}
            {type === 'category' ? (
              <CategoryPicker options={categoryOptions} selected={categories} onChange={setCategories} />
            ) : type === 'description' || type === 'other' ? (
              <Textarea
                aria-label={labels[type]}
                placeholder={placeholders[type]}
                value={values[type] ?? ''}
                onChange={(event) => setValues((prev) => ({ ...prev, [type]: event.target.value }))}
                rows={3}
              />
            ) : (
              <Input
                aria-label={labels[type]}
                type={type === 'support_email' ? 'email' : 'text'}
                placeholder={placeholders[type]}
                value={values[type] ?? ''}
                onChange={(event) => setValues((prev) => ({ ...prev, [type]: event.target.value }))}
              />
            )}
          </div>
        );
      })}

      <ScreenshotField
        screenshots={screenshots}
        locked={busy}
        label={t('correction.evidenceLabel')}
        hint={t('correction.evidenceHint')}
      />

      <EmailField value={email} onChange={setEmail} />

      <FormFooter
        label={t('correction.submit')}
        busyLabel={t('correction.submitting')}
        busy={busy}
        blocker={blocker}
        note={t('correction.note')}
        error={error}
        onSubmit={() => void submit()}
      />
    </FormShell>
  );
}
