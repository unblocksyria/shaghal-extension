import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { applyStoredLanguage } from '../../lib/i18n';
import { apiErrorMessage } from '../../lib/api';
import { captureOpener, queueRestore, runQueuedFocus } from '../../lib/focusFlow';
import type { CatalogService, ServiceRecord } from '../../lib/endpoints';
import { loadRecord, peekRecord } from '../../lib/reads';
import { watchSavedLanguage } from '../../lib/settings';
import { isOwnSite, normalizeServiceUrl } from '../../lib/url';
import { isolate } from '../../lib/serviceName';
import { SettingsView } from './SettingsView';
import { useActiveTab } from './hooks/useActiveTab';
import { useServiceMatch } from './hooks/useServiceMatch';
import { PageCard } from './components/PageCard';
import { ReportForm } from './components/ReportForm';
import { CorrectionForm } from './components/CorrectionForm';
import { ReportServiceForm } from './components/ReportServiceForm';
import { HowItWorks } from './components/HowItWorks';
import { TestQueue } from './components/TestQueue';
import { FirstRun } from './components/FirstRun';
import { HostAccessNotice } from './components/HostAccessNotice';
import { detailStyle } from './components/FormParts';
import { BrandHeader } from '../../components/ui/BrandHeader';
import '../../styles/theme.css';

type PanelView =
  | { name: 'home' }
  | {
      name: 'report' | 'correction';
      service: ServiceRecord;
      slug: string;
      pageUrl: string | null;
      /** Parts the tester came to report, added to the report from the start. */
      parts?: string[];
      /** Bumped by "Test another part", so the next report starts as a new form with its own draft. */
      round?: number;
    }
  | { name: 'report-service'; url: string; pageTitle: string | null };

export function SidePanelApp() {
  const { t } = useTranslation();
  const [view, setView] = useState<PanelView>({ name: 'home' });
  // Settings opens over the current view, which stays mounted so a form's draft survives.
  const [settingsOpen, setSettingsOpen] = useState(false);
  // Apply the saved language and follow changes made in this or any other panel.
  useEffect(() => {
    void applyStoredLanguage();
    return watchSavedLanguage(() => void applyStoredLanguage());
  }, []);
  const activeTab = useActiveTab();
  const currentPage = useRef(activeTab.url);
  useEffect(() => {
    currentPage.current = activeTab.url;
  }, [activeTab.url]);
  const onOwnSite = isOwnSite(activeTab.url);
  const { state: matchState, reload } = useServiceMatch(onOwnSite ? null : activeTab.url, {
    loading: activeTab.loading,
  });

  // A service picked from the candidate list. Applies only to the page it was picked on.
  const [pickedFor, setPickedFor] = useState<{ pageUrl: string; service: CatalogService } | null>(null);
  const picked = pickedFor !== null && pickedFor.pageUrl === activeTab.url ? pickedFor.service : null;

  // The report and correction forms need the full service record. The card has
  // usually loaded it already; otherwise it is fetched on open.
  const [opening, setOpening] = useState(false);
  // Shown only on the page where the fetch failed.
  const [openFailure, setOpenFailure] = useState<{ pageUrl: string | null; message: string } | null>(null);
  const openError = openFailure !== null && openFailure.pageUrl === activeTab.url ? openFailure.message : null;
  const open = async (service: CatalogService, name: 'report' | 'correction', parts?: string[]) => {
    if (opening) return;
    setOpenFailure(null);
    captureOpener();
    const kept = peekRecord(service.slug);
    if (kept?.fresh === true) {
      setView({ name, service: kept.value, slug: service.slug, pageUrl: activeTab.url, parts });
      return;
    }
    setOpening(true);
    const result = await loadRecord(service.slug);
    setOpening(false);
    if (currentPage.current !== activeTab.url) return;
    if (!result.ok) {
      setOpenFailure({
        pageUrl: activeTab.url,
        message: t('app.openFailed', { name: isolate(service.name), message: apiErrorMessage(result.error) }),
      });
      return;
    }
    setView({ name, service: result.data, slug: service.slug, pageUrl: activeTab.url, parts });
  };

  const home = () => {
    queueRestore();
    setView({ name: 'home' });
  };
  // Only a return asks for a restore, and it runs once the view it returns to is committed.
  useEffect(() => {
    runQueuedFocus();
  }, [view, settingsOpen]);

  const page = () => {
    switch (view.name) {
      case 'report':
        return (
          <ReportForm
            key={`${view.service.id}:${view.round ?? 0}`}
            service={view.service}
            slug={view.slug}
            pageUrl={view.pageUrl}
            parts={view.parts}
            onBack={home}
            onAgain={() => setView({ ...view, parts: undefined, round: (view.round ?? 0) + 1 })}
          />
        );
      case 'correction':
        return (
          <CorrectionForm
            key={view.service.id}
            service={view.service}
            slug={view.slug}
            onBack={home}
            // The service this correction is for, even if the tab has moved on since.
            onReport={() => setView({ name: 'report', service: view.service, slug: view.slug, pageUrl: view.pageUrl })}
          />
        );
      case 'report-service':
        return <ReportServiceForm url={view.url} pageTitle={view.pageTitle} onBack={home} />;
      case 'home':
        if (onOwnSite)
          return (
            <>
              <HowItWorks />
              <TestQueue />
            </>
          );
        return (
          <PageCard
            pageUrl={activeTab.url}
            state={matchState}
            picked={picked}
            onPick={(service) => activeTab.url !== null && setPickedFor({ pageUrl: activeTab.url, service })}
            onUnpick={() => {
              queueRestore();
              setPickedFor(null);
            }}
            onRetry={reload}
            onReport={(service, parts) => void open(service, 'report', parts)}
            onCorrect={(service) => void open(service, 'correction')}
            onReportNew={() => {
              const url = normalizeServiceUrl(activeTab.url ?? '');
              if (url !== null) {
                captureOpener();
                setView({ name: 'report-service', url, pageTitle: activeTab.title });
              }
            }}
          />
        );
    }
  };

  const openSettings = () => {
    captureOpener();
    setSettingsOpen(true);
  };
  const closeSettings = () => {
    queueRestore();
    setSettingsOpen(false);
  };

  return (
    <div className="us-app-container">
      <div className="us-app-content">
        <BrandHeader onOpenSettings={openSettings} />
        <main style={{ padding: '0 16px 24px', display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 12 }}>
          <HostAccessNotice />
          {settingsOpen && <SettingsView onBack={closeSettings} />}
          <div
            style={{
              display: settingsOpen ? 'none' : 'grid',
              gridTemplateColumns: 'minmax(0, 1fr)',
              gap: 12,
            }}
          >
            {/* The two lines a reader is told about change without a click of their own. */}
            <div aria-live="polite" style={{ display: 'contents' }}>
              {openError !== null && <p style={{ ...detailStyle, color: 'var(--us-danger)' }}>{openError}</p>}
            </div>
            <div aria-live="polite" style={{ display: 'contents' }}>
              {opening && <p style={detailStyle}>{t('app.opening')}</p>}
            </div>
            {!opening && view.name === 'home' && <FirstRun />}
            {!opening && page()}
          </div>
        </main>
      </div>
    </div>
  );
}
