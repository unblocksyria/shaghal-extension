import { useCallback, useEffect, useRef, useState } from 'react';
import {
  checkDuplicate,
  getServiceBySlug,
  type DuplicateCheck,
  type ServiceRecord,
} from '../../lib/endpoints';
import { captureAndUploadScreenshot } from '../../lib/evidence';
import { resolveTurnstileToken } from '../../lib/turnstile';
import { sendSessionMessage } from '../../lib/messaging';
import { DevTokenSettings } from './DevTokenSettings';
import { useActiveTab } from './hooks/useActiveTab';
import { useSessionState } from './hooks/useSessionState';
import { CheckView } from './components/CheckView';
import { NewServiceForm } from './components/NewServiceForm';
import { FunctionalityReportForm } from './components/FunctionalityReportForm';
import { CorrectionForm } from './components/CorrectionForm';
import { ReportTypeChooser } from './components/ReportTypeChooser';
import { SessionCard, downloadSessionJson } from './components/SessionCard';
import { BrandHeader } from '../../components/ui/BrandHeader';
import { LatticeBackground } from '../../components/LatticeBackground';
import type { EvidenceItem } from './types';
import { AlertTriangle, Globe, RefreshCw } from 'lucide-react';
import '../../styles/theme.css';

type PanelView = 'settings' | 'check' | 'choose-report' | 'new-service' | 'correction' | 'report-functionality';

export function SidePanelApp() {
  const [view, setView] = useState<PanelView>('check');
  const [duplicate, setDuplicate] = useState<DuplicateCheck | null>(null);
  const [service, setService] = useState<ServiceRecord | null>(null);
  const [evidence, setEvidence] = useState<EvidenceItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [settingsReturnView, setSettingsReturnView] = useState<PanelView>('check');
  const activeTab = useActiveTab();
  const sessionState = useSessionState();
  const session = sessionState.active;
  const endedSession = sessionState.lastEnded;
  const lastCheckedUrlRef = useRef<string | null>(null);

  const runDuplicateCheck = useCallback(async () => {
    if (activeTab.url === null) return;
    setError(null);
    setChecking(true);
    try {
      const result = await checkDuplicate(activeTab.url);
      if (!result.ok) {
        setError(`Duplicate check failed: ${result.error.message}`);
        return;
      }
      setDuplicate(result.data);
      if (result.data.duplicateType === 'published' && result.data.existingService) {
        const serviceResult = await getServiceBySlug(result.data.existingService.slug);
        if (!serviceResult.ok) {
          setError(`Service lookup failed: ${serviceResult.error.message}`);
          return;
        }
        setService(serviceResult.data);
        setView('choose-report');
      } else {
        setView('new-service');
      }
    } catch (checkError) {
      setError(`Duplicate check failed: ${String(checkError)}`);
    } finally {
      setChecking(false);
    }
  }, [activeTab.url]);

  useEffect(() => {
    if (view !== 'check' || activeTab.url === null) return;
    if (lastCheckedUrlRef.current === activeTab.url) return;
    lastCheckedUrlRef.current = activeTab.url;
    void runDuplicateCheck();
  }, [activeTab.url, view, runDuplicateCheck]);

  const resetToCheck = () => {
    lastCheckedUrlRef.current = null;
    setDuplicate(null);
    setService(null);
    setView('check');
  };

  const takeScreenshot = async () => {
    setError(null);
    const token = await resolveTurnstileToken();
    const currentWindow = await chrome.windows.getCurrent();
    const reportType = view === 'new-service' ? 'submission' : view === 'correction' ? 'correction' : 'functionality_report';
    const result = await captureAndUploadScreenshot(currentWindow.id ?? 0, reportType, token);
    if (!result.ok) {
      setError(result.error.message);
      return;
    }
    setEvidence((current) => [...current, result.data]);
  };

  const startTest = async () => {
    if (activeTab.tabId === null) return;
    await sendSessionMessage({ type: 'START_TEST', tabId: activeTab.tabId });
  };

  const endTest = async () => {
    await sendSessionMessage({ type: 'END_TEST' });
  };

  const statusClass = error !== null ? 'status-error' : session !== null ? 'status-active' : 'status-idle';

  const page = (view: PanelView) => {
    switch (view) {
      case 'settings':
        return <DevTokenSettings onBack={() => setView(settingsReturnView)} />;
      case 'check':
        return (
          <CheckView
            activeUrl={activeTab.url}
            checking={checking}
            duplicate={duplicate}
            onCheck={() => void runDuplicateCheck()}
          />
        );
      case 'choose-report':
        return service === null ? null : (
          <ReportTypeChooser
            service={service}
            onChooseFunctionality={() => setView('report-functionality')}
            onChooseCorrection={() => setView('correction')}
          />
        );
      case 'correction':
        return service === null ? null : (
          <CorrectionForm
            service={service}
            evidence={evidence}
            onBack={resetToCheck}
            onError={setError}
            onTakeScreenshot={takeScreenshot}
          />
        );
      case 'new-service':
        return (
          <NewServiceForm
            url={activeTab.url ?? ''}
            notice={duplicate?.message}
            evidence={evidence}
            onBack={resetToCheck}
            onError={setError}
            onTakeScreenshot={takeScreenshot}
          />
        );
      case 'report-functionality':
        return service === null ? null : (
          <FunctionalityReportForm
            service={service}
            evidence={evidence}
            onBack={resetToCheck}
            onError={setError}
            onTakeScreenshot={takeScreenshot}
          />
        );
    }
  };

  return (
    <div className={`us-app-container ${statusClass}`}>
      <div className="us-ambient-container" aria-hidden="true">
        <div className="us-ambient-layer us-ambient-idle" />
        <div className="us-ambient-layer us-ambient-active" />
        <div className="us-ambient-layer us-ambient-error" />
        <LatticeBackground />
      </div>
      <div className="us-app-content">
        <BrandHeader
          onOpenSettings={() => {
            setSettingsReturnView(view);
            setView('settings');
          }}
          isRecording={session !== null}
          activeRequestsCount={session?.logs.length ?? 0}
        />

        <main style={{ padding: '0 16px 24px 16px', display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 14 }}>
          {error !== null && (
            <div
              style={{
                backgroundColor: 'var(--us-failing-bg)',
                border: '1px solid var(--us-failing-border)',
                borderRadius: 'var(--us-radius-control)',
                padding: '12px 14px',
                display: 'flex',
                alignItems: 'flex-start',
                gap: 10,
                fontSize: 13,
                color: 'var(--us-failing)',
              }}
            >
              <AlertTriangle size={17} style={{ flexShrink: 0, marginTop: 1 }} />
              <div style={{ lineHeight: 1.4 }}>{error}</div>
            </div>
          )}

          <div
            style={{
              backgroundColor: '#141416',
              border: '1px solid var(--us-border)',
              borderRadius: 'var(--us-radius-control)',
              padding: '8px 12px',
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              boxShadow: 'var(--shadow-syrian-card)',
            }}
          >
            <div
              style={{
                width: 28,
                height: 28,
                borderRadius: 6,
                backgroundColor: 'rgba(255, 255, 255, 0.04)',
                border: '1px solid var(--us-border)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              <Globe size={14} color="var(--us-gold)" />
            </div>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ fontSize: 10, textTransform: 'uppercase', color: 'var(--us-text-dim)', fontWeight: 600 }}>
                Active Webpage
              </div>
              <div
                style={{
                  fontSize: 12,
                  color: 'var(--us-text-muted)',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
                title={activeTab.url ?? ''}
              >
                {activeTab.url ?? 'No active tab'}
              </div>
            </div>
            {activeTab.url !== null && (
              <button
                onClick={() => void runDuplicateCheck()}
                disabled={checking}
                title="Re-check this URL"
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--us-text-dim)',
                  cursor: 'pointer',
                  padding: 4,
                  display: 'flex',
                  alignItems: 'center',
                }}
              >
                <RefreshCw size={13} style={{ animation: checking ? 'spin 1s linear infinite' : 'none' }} />
              </button>
            )}
          </div>

          {page(view)}

          <SessionCard
            tabId={activeTab.tabId}
            session={session}
            endedSession={endedSession}
            onStartTest={() => void startTest()}
            onEndTest={() => void endTest()}
            onExport={() => {
              const source = session ?? endedSession;
              if (source !== null) downloadSessionJson(source);
            }}
          />
        </main>
      </div>
    </div>
  );
}
