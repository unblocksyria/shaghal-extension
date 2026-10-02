/** @vitest-environment jsdom */
import { describe, expect, it } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { applyLanguage } from '../../../lib/i18n';
import { fakeApi } from '../../../testing/fakeApi';
import serviceDetails from '../../../testing/fixtures/service-details.json';
import { useServiceDetails } from './useServiceDetails';

describe('the record behind a matched card', () => {
  it('asks once per language, and asks again when the panel language changes', async () => {
    applyLanguage('en');
    const api = fakeApi().on('GET', '/services/netflix', { data: serviceDetails }).install();
    const { result } = renderHook(() => useServiceDetails('netflix'));
    await waitFor(() => expect(result.current.status).toBe('ready'));

    act(() => applyLanguage('ar'));
    await waitFor(() => expect(api.callsTo('GET', '/services/netflix')).toHaveLength(2));
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(api.callsTo('GET', '/services/netflix').at(0)?.url).toContain('locale=en');
    expect(api.callsTo('GET', '/services/netflix').at(1)?.url).toContain('locale=ar');

    applyLanguage('en');
  });

  it('holds nothing from the old language while the new answer is in flight', async () => {
    applyLanguage('en');
    const api = fakeApi().on('GET', '/services/netflix', { data: serviceDetails }).install();
    const { result } = renderHook(() => useServiceDetails('netflix'));
    await waitFor(() => expect(result.current.status).toBe('ready'));

    // The Arabic answer waits, so the switch is visible while it is in flight.
    const release = api.hold('GET', '/services/netflix', { data: serviceDetails });
    act(() => applyLanguage('ar'));
    await waitFor(() => expect(result.current.status).toBe('loading'));
    release();
    await waitFor(() => expect(result.current.status).toBe('ready'));

    applyLanguage('en');
  });
});
