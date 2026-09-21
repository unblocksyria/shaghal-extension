export interface GeoCheckResult {
  checked: boolean;
  countryCode?: string;
  country?: string;
  proxyOrVpn?: boolean;
}

interface IpWhoResponse {
  success?: boolean;
  country?: string;
  country_code?: string;
  security?: {
    anonymous?: boolean;
    proxy?: boolean;
    vpn?: boolean;
    tor?: boolean;
  };
}

export async function checkGeoLocation(): Promise<GeoCheckResult> {
  let payload: IpWhoResponse;
  try {
    const response = await fetch('https://ipwho.is/');
    if (!response.ok) return { checked: false };
    payload = (await response.json()) as IpWhoResponse;
  } catch {
    return { checked: false };
  }
  if (payload.success !== true || payload.country_code === undefined) return { checked: false };

  const security = payload.security ?? {};
  return {
    checked: true,
    countryCode: payload.country_code,
    country: payload.country,
    proxyOrVpn: Boolean(security.proxy || security.vpn || security.anonymous || security.tor),
  };
}

export function geoWarning(result: GeoCheckResult): string | null {
  if (!result.checked || result.countryCode === undefined) return null;
  const parts: string[] = [];
  if (result.countryCode !== 'SY') {
    parts.push(`You appear to be browsing from ${result.country ?? result.countryCode}, not Syria.`);
  }
  if (result.proxyOrVpn) {
    parts.push('A VPN or proxy was detected.');
  }
  if (parts.length === 0) return null;
  return `${parts.join(' ')} Disable it before testing so your report reflects access from Syria.`;
}
