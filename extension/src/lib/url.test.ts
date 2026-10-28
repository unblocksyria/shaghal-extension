import { describe, expect, it } from 'vitest';
import { SITE_BASE } from './config';
import { hostOf, isOwnSite, matchUrl, normalizeServiceUrl, siteOf, testedHostOf, webUrl } from './url';

describe('siteOf', () => {
  it('lowercases and drops www. and the port', () => {
    expect(siteOf('https://WWW.Example.com:8443/path?q=1')).toBe('example.com');
  });

  it('keeps other subdomains, so a different site stays different', () => {
    expect(siteOf('https://accounts.example.com/')).toBe('accounts.example.com');
  });

  it('is empty for nothing or an unparseable address', () => {
    expect(siteOf(null)).toBe('');
    expect(siteOf(undefined)).toBe('');
    expect(siteOf('not a url')).toBe('');
  });
});

describe('normalizeServiceUrl', () => {
  it('keeps only the scheme and host, without www.', () => {
    expect(normalizeServiceUrl('https://www.Netflix.com/browse?x=1#top')).toBe('https://netflix.com');
  });

  it('refuses pages that are not on the web', () => {
    expect(normalizeServiceUrl('chrome://extensions')).toBeNull();
    expect(normalizeServiceUrl('file:///tmp/a.html')).toBeNull();
    expect(normalizeServiceUrl('')).toBeNull();
  });
});

describe('hostOf', () => {
  it('keeps the port', () => {
    expect(hostOf('http://localhost:3000/a')).toBe('localhost:3000');
  });
});

describe('isOwnSite', () => {
  it('recognises Unblock Syria, its subdomains and the short domain', () => {
    expect(isOwnSite('https://unblocksyria.com/en')).toBe(true);
    expect(isOwnSite('https://verify.unblocksyria.com/')).toBe(true);
    expect(isOwnSite('https://ubsyr.com/x')).toBe(true);
  });

  it('is not fooled by a lookalike', () => {
    expect(isOwnSite('https://unblocksyria.com.evil.example/')).toBe(false);
    expect(isOwnSite('https://notunblocksyria.com/')).toBe(false);
  });

  it('is false for no page or a non-web page', () => {
    expect(isOwnSite(null)).toBe(false);
    expect(isOwnSite('chrome://newtab')).toBe(false);
  });
});

describe('lookup privacy', () => {
  it('keeps detailed matching but removes credentials and fragments', () => {
    expect(matchUrl('https://alice:secret@play.google.com/store/apps/details?id=app.name#token=private')).toBe(
      'https://play.google.com/store/apps/details?id=app.name',
    );
  });
  it.each([
    'http://localhost:8787/secret',
    'http://127.0.0.1/',
    'http://[::1]/',
    'http://printer/',
    'http://office.local/',
    'file:///private/a',
    'chrome://settings/',
    'https://example.com/' + 'a'.repeat(2048),
  ])('does not disclose an unsupported or local address: %s', (url) => expect(matchUrl(url)).toBeNull());
});

describe('addresses that are not a page to look up', () => {
  it('give no host, no lookup and no own-site claim when they do not parse', () => {
    expect(hostOf('not a url')).toBe('');
    expect(isOwnSite('not a url')).toBe(false);
    expect(matchUrl('not a url')).toBeNull();
  });

  it('count the configured site as our own, on its exact origin only', () => {
    expect(isOwnSite(`${SITE_BASE}/en/services/netflix`)).toBe(true);
    expect(isOwnSite('http://localhost:3010/')).toBe(false);
  });

  it.each(['https://router.home.arpa/', 'https://wiki.internal/', 'http://intranet./', 'https://nas.local/'])(
    'are never sent when they name a reserved or single-label host: %s',
    (url) => expect(matchUrl(url)).toBeNull(),
  );

  it('are sent with the host lowercased and the path and query kept', () => {
    expect(matchUrl('HTTPS://Play.Google.COM/store?id=1')).toBe('https://play.google.com/store?id=1');
  });
});

describe('testedHostOf', () => {
  it('keeps only the host, lowercased, without www. or a trailing dot', () => {
    expect(testedHostOf('https://WWW.Web.Telegram.org./a/#chat?x=1')).toBe('web.telegram.org');
    expect(testedHostOf('http://user:pass@accounts.example.com:8443/login?next=/')).toBe('accounts.example.com');
  });

  it('keeps an international name in the punycode form browsers report', () => {
    expect(testedHostOf('https://موقع.example/')).toBe('xn--4gbrim.example');
  });

  it('is null for a host that is not a domain name, even when browsers accept it', () => {
    // Underscores pass the URL parser but are not valid in a domain name.
    expect(testedHostOf('https://under_score.example/')).toBeNull();
  });

  it('is null for pages that are not public web addresses', () => {
    for (const url of [
      null,
      'not a url',
      'chrome://extensions',
      'file:///tmp/a.html',
      'http://192.168.1.1/',
      'http://[::1]/',
      'http://localhost:3000/',
      'http://printer.local/',
      'https://intranet/',
    ]) {
      expect(testedHostOf(url)).toBeNull();
    }
  });
});

describe('webUrl', () => {
  it('lets through web addresses only, so an API value cannot become a script link', () => {
    expect(webUrl(' https://help.example.com/en ')).toBe('https://help.example.com/en');
    expect(webUrl('http://example.com')).toBe('http://example.com/');
    expect(webUrl('javascript:alert(1)')).toBeNull();
    expect(webUrl('ftp://files.example.com')).toBeNull();
    expect(webUrl('not a url')).toBeNull();
    expect(webUrl(null)).toBeNull();
    expect(webUrl(undefined)).toBeNull();
  });
});
