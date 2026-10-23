import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { applyStoredLanguage } from '../../lib/i18n';
import { apiErrorMessage } from '../../lib/api';
import { captureOpener, queueRestore, runQueuedFocus } from '../../lib/focusFlow';
import { getServiceBySlug, type CatalogService, type ServiceRecord } from '../../lib/endpoints';
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
import { HostAccessNotice } from './components/HostAccessNotice';
import { hintStyle } from './components/FormParts';
import { BrandHeader } from '../../components/ui/BrandHeader';
import '../../styles/theme.css';

type PanelView =
  | { name: 'home' }
  | { name: 'report' | 'correction'; service: ServiceRecord; pageUrl: string | null }
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
  const { state: matchState, reload } = useServiceMatch(onOwnSite ? null : activeTab.url);

  // A service picked from the candidate list. Applies only to the page it was picked on.
  const [pickedFor, setPickedFor] = useState<{ pageUrl: string; service: CatalogService } | null>(null);
  const picked = pickedFor !== null && pickedFor.pageUrl === activeTab.url ? pickedFor.service : null;

  // The report and correction forms need the full service record, fetched on open.
  const [opening, setOpening] = useState(false);
  // Shown only on the page where the fetch failed.
  const [openFailure, setOpenFailure] = useState<{ pageUrl: string | null; message: string } | null>(null);
  const openError = openFailure !== null && openFailure.pageUrl === activeTab.url ? openFailure.message : null;
  const open = async (service: CatalogService, name: 'report' | 'correction') => {
    if (opening) return;
    setOpenFailure(null);
    captureOpener();
    setOpening(true);
    const result = await getServiceBySlug(service.slug);
    setOpening(false);
    if (currentPage.current !== activeTab.url) return;
    if (!result.ok) {
      setOpenFailure({
        pageUrl: activeTab.url,
        message: t('app.openFailed', { name: isolate(service.name), message: apiErrorMessage(result.error) }),
      });
      return;
    }
    setView({ name, service: result.data, pageUrl: activeTab.url });
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
        return <ReportForm key={view.service.id} service={view.service} pageUrl={view.pageUrl} onBack={home} />;
      case 'correction':
        return <CorrectionForm key={view.service.id} service={view.service} onBack={home} />;
      case 'report-service':
        return <ReportServiceForm url={view.url} pageTitle={view.pageTitle} onBack={home} />;
      case 'home':
        if (onOwnSite) return <HowItWorks />;
        return (
          <PageCard
            pageUrl={activeTab.url}
            state={matchState}
            picked={picked}
            onPick={(service) => activeTab.url !== null && setPickedFor({ pageUrl: activeTab.url, service })}
            onRetry={reload}
            onReport={(service) => void open(service, 'report')}
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
        <main style={{ padding: '0 16px 24px 16px', display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 14 }}>
          <HostAccessNotice />
          {settingsOpen && <SettingsView onBack={closeSettings} />}
          <div
            style={{
              display: settingsOpen ? 'none' : 'grid',
              gridTemplateColumns: 'minmax(0, 1fr)',
              gap: 14,
            }}
          >
            {/* The two lines a reader is told about change without a click of their own. */}
            <div aria-live="polite" style={{ display: 'contents' }}>
              {openError !== null && <p style={{ ...hintStyle, color: 'var(--us-danger)' }}>{openError}</p>}
            </div>
            <div aria-live="polite" style={{ display: 'contents' }}>
              {opening && <p style={hintStyle}>{t('app.opening')}</p>}
            </div>
            {!opening && page()}
          </div>
        </main>
      </div>
    </div>
  );
}
