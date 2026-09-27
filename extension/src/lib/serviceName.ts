import { activeLanguage } from './i18n';

/** Anything that carries both names a service record may have. */
export interface NamedService {
  name: string;
  nameAr?: string | null;
}

/**
 * The name to show: the English name alone, and in Arabic the English name
 * with the Arabic one in brackets when the catalogue has one (spec 0002, AC-6).
 * A null `nameAr` never produces brackets.
 */
export function serviceName(service: NamedService): string {
  if (activeLanguage() !== 'ar') return service.name;
  const arabic = service.nameAr;
  return arabic === null || arabic === undefined || arabic.length === 0 ? service.name : `${service.name} (${arabic})`;
}
