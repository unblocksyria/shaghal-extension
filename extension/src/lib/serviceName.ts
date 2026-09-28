import { activeLanguage } from './i18n';

/** A record with a service's English name and optional Arabic name. */
export interface NamedService {
  name: string;
  nameAr?: string | null;
}

/** The English name, plus the Arabic name in brackets when the panel is in Arabic and one exists. */
export function serviceName(service: NamedService): string {
  if (activeLanguage() !== 'ar') return service.name;
  const arabic = service.nameAr;
  return arabic === null || arabic === undefined || arabic.length === 0 ? service.name : `${service.name} (${arabic})`;
}
