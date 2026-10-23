import { activeLanguage } from './i18n';

/** A record with a service's English name and optional Arabic name. */
export interface NamedService {
  name: string;
  nameAr?: string | null;
}

/**
 * The name wrapped in Unicode isolates (U+2068, U+2069) when the panel is in Arabic, so a
 * right-to-left paragraph can't move its punctuation, such as the plus in "Disney+".
 * In English the name is returned as it is.
 */
export function isolate(name: string): string {
  if (activeLanguage() !== 'ar') return name;
  return `\u2068${name}\u2069`;
}

/** The English name, plus the Arabic name in brackets when the panel is in Arabic and one exists. */
export function serviceName(service: NamedService): string {
  if (activeLanguage() !== 'ar') return service.name;
  const english = isolate(service.name);
  const arabic = service.nameAr;
  return arabic === null || arabic === undefined || arabic.length === 0 ? english : `${english} (${arabic})`;
}
