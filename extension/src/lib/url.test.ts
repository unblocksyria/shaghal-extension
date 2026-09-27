import { matchUrl } from './url';
import { describe, expect, it } from 'vitest';
import { hostOf, isOwnSite, normalizeServiceUrl, siteOf } from './url';

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
