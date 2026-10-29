import { useTranslation } from 'react-i18next';

/**
 * Said after the text of a link that opens a new tab, for screen readers. The
 * eye has the arrow icon beside such links, or the row they sit in.
 */
export function NewTabNote() {
  const { t } = useTranslation();
  return <span className="us-visually-hidden"> {t('common.newTab')}</span>;
}
