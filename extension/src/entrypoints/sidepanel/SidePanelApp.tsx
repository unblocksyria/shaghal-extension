import { useState } from 'react';
import { getServiceBySlug, type CatalogService, type ServiceRecord } from '../../lib/endpoints';
import { isOwnSite, normalizeServiceUrl } from '../../lib/url';
import { SettingsView } from './SettingsView';
import { useActiveTab } from './hooks/useActiveTab';
import { useServiceMatch } from './hooks/useServiceMatch';
import { PageCard } from './components/PageCard';
import { ReportForm } from './components/ReportForm';
import { CorrectionForm } from './components/CorrectionForm';
import { ReportServiceForm } from './components/ReportServiceForm';
import { HowItWorks } from './components/HowItWorks';
import { hintStyle } from './components/FormParts';
import { BrandHeader } from '../../components/ui/BrandHeader';
import '../../styles/theme.css';

type PanelView =
  | { name: 'home' }
  | { name: 'report' | 'correction'; service: ServiceRecord; pageUrl: string | null }
  | { name: 'report-service'; url: string; pageTitle: string | null };

export function SidePanelApp() {
  const [view, setView] = useState<PanelView>({ name: 'home' });
  // Settings opens over the current view, which stays mounted so a form's draft survives.
  const [settingsOpen, setSettingsOpen] = useState(false);
  const activeTab = useActiveTab();
  const onOwnSite = isOwnSite(activeTab.url);
  const { state: matchState, reload } = useServiceMatch(onOwnSite ? null : activeTab.url);

  // A service picked from the list, only for the page it was picked on.
  const [pickedFor, setPickedFor] = useState<{ pageUrl: string; service: CatalogService } | null>(null);
  const picked = pickedFor !== null && pickedFor.pageUrl === activeTab.url ? pickedFor.service : null;

  // The report and correction forms need the full record: its parts and details.
  const [opening, setOpening] = useState(false);
  // Shown only on the page it happened on.
  const [openFailure, setOpenFailure] = useState<{ pageUrl: string | null; message: string } | null>(null);
  const openError = openFailure !== null && openFailure.pageUrl === activeTab.url ? openFailure.message : null;
  const open = async (service: CatalogService, name: 'report' | 'correction') => {
    setOpenFailure(null);
    setOpening(true);
    const result = await getServiceBySlug(service.slug);
    setOpening(false);
    if (!result.ok) {
      setOpenFailure({ pageUrl: activeTab.url, message: `Could not open ${service.name}: ${result.error.message}` });
      return;
    }
    setView({ name, service: result.data, pageUrl: activeTab.url });
  };

  const home = () => setView({ name: 'home' });

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
              if (url !== null) setView({ name: 'report-service', url, pageTitle: activeTab.title });
            }}
          />
        );
    }
  };

  return (
    <div className="us-app-container">
      <div className="us-app-content">
        <BrandHeader onOpenSettings={() => setSettingsOpen(true)} />
        <main style={{ padding: '0 16px 24px 16px', display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 14 }}>
          {settingsOpen && <SettingsView onBack={() => setSettingsOpen(false)} />}
          <div
            style={{
              display: settingsOpen ? 'none' : 'grid',
              gridTemplateColumns: 'minmax(0, 1fr)',
              gap: 14,
            }}
          >
            {openError !== null && <p style={{ ...hintStyle, color: 'var(--us-danger)' }}>{openError}</p>}
            {opening ? <p style={hintStyle}>Opening…</p> : page()}
          </div>
        </main>
      </div>
    </div>
  );
}
