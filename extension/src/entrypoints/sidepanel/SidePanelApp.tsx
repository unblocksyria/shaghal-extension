import { useCallback, useEffect, useRef, useState } from 'react';
import {
  checkDuplicate,
  getServiceBySlug,
  type DuplicateCheck,
  type ServiceRecord,
} from '../../lib/endpoints';
import { captureScreenshot } from '../../lib/evidence';
import { sendSessionMessage } from '../../lib/messaging';
import { normalizeServiceUrl, hostOf } from '../../lib/url';
import { classifyLogs, type LogVerdict } from '../../lib/classifier';
import { checkDnsConsistency, type DnsCheckResult } from '../../lib/dnsCheck';
import { checkGeoLocation, geoWarning } from '../../lib/geo';
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
import { AlertTriangle, Globe, RefreshCw, WifiOff } from 'lucide-react';
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
  const autoCheckedRef = useRef(false);
  const serviceUrl = normalizeServiceUrl(activeTab.url ?? '');
  const [dnsResult, setDnsResult] = useState<DnsCheckResult | null>(null);
  const [geoStatus, setGeoStatus] = useState<{ text: string; warning: boolean } | null>(null);
  const displayedSessionForVerdict = session ?? endedSession;
  const recordedServiceHost = hostOf(displayedSessionForVerdict?.metadata?.serviceUrl ?? '');
  const verdict: LogVerdict | null =
    displayedSessionForVerdict !== null
      ? classifyLogs(
          displayedSessionForVerdict.logs,
          displayedSessionForVerdict.contentSignal,
          recordedServiceHost.length > 0 ? recordedServiceHost : undefined,
        )
      : null;
  const partSuggestions: Partial<Record<string, { level: 'working' | 'failing'; evidence: string }>> = {};
  if (verdict !== null) {
    for (const slug of ['landing_page', 'core_use'] as const) {
      const part = verdict.parts[slug];
      if (part.level !== undefined) {
        partSuggestions[slug] = { level: part.level, evidence: part.evidence };
      }
    }
  }

  const runDuplicateCheck = useCallback(async () => {
    if (serviceUrl === null) {
      setError('Open a real website (http or https) in the active tab to test it.');
      return;
    }
    setError(null);
    setChecking(true);
    try {
      const result = await checkDuplicate(serviceUrl);
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
  }, [serviceUrl]);

  useEffect(() => {
    if (autoCheckedRef.current) return;
    if (view !== 'check' || serviceUrl === null) return;
    autoCheckedRef.current = true;
    void runDuplicateCheck();
  }, [serviceUrl, view, runDuplicateCheck]);

  useEffect(() => {
    if (session === null) {
      setGeoStatus(null);
      return;
    }
    let cancelled = false;
    const run = () => {
      void checkGeoLocation().then((result) => {
        if (cancelled) return;
        const warning = geoWarning(result);
        setGeoStatus({
          text:
            warning ??
            (result.checked ? `Browsing from ${result.country ?? result.countryCode} — no VPN detected` : 'Geo check unavailable'),
          warning: warning !== null,
        });
      });
    };
    run();
    const interval = setInterval(run, 20000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [session !== null]);

  const resetToCheck = () => {
    setDuplicate(null);
    setService(null);
    setView('check');
  };

  const removeEvidence = (id: string) => {
    setEvidence((current) => current.filter((item) => item.id !== id));
  };

  const takeScreenshot = async () => {
    setError(null);
    const currentWindow = await chrome.windows.getCurrent();
    try {
      const captured = await captureScreenshot(currentWindow.id ?? 0);
      setEvidence((current) => [...current, captured]);
    } catch (captureError) {
      setError(`Screenshot failed: ${String(captureError)}`);
    }
  };

  const markEvidenceUploaded = (id: string, uploadedUrl: string) => {
    setEvidence((current) => current.map((item) => (item.id === id ? { ...item, uploadedUrl } : item)));
  };

  const startTest = async () => {
    if (activeTab.tabId === null) return;
    await sendSessionMessage({ type: 'START_TEST', tabId: activeTab.tabId });
  };

  const endTest = async () => {
    const response = await sendSessionMessage({ type: 'END_TEST' });
    const ended = response.ok ? response.session ?? null : null;
    if (ended !== null && ended.metadata?.serviceUrl !== undefined) {
      let host: string;
      try {
        host = new URL(ended.metadata.serviceUrl).hostname;
      } catch {
        return;
      }
      setDnsResult(await checkDnsConsistency(host, ended.logs));
    } else {
      setDnsResult(null);
    }
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
            onRemoveEvidence={removeEvidence}
            onEvidenceUploaded={markEvidenceUploaded}
          />
        );
      case 'new-service':
        return (
          <NewServiceForm
            url={serviceUrl ?? ''}
            notice={duplicate?.message}
            evidence={evidence}
            metadata={sessionState.active?.metadata ?? endedSession?.metadata}
            onBack={resetToCheck}
            onError={setError}
            onTakeScreenshot={takeScreenshot}
            onRemoveEvidence={removeEvidence}
            onEvidenceUploaded={markEvidenceUploaded}
          />
        );
      case 'report-functionality':
        return service === null ? null : (
          <FunctionalityReportForm
            service={service}
            evidence={evidence}
            suggestions={partSuggestions}
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
          {geoStatus !== null && geoStatus.warning && (
            <div
              role="alert"
              style={{
                border: '1px solid rgba(185, 168, 123, 0.4)',
                backgroundColor: 'rgba(185, 168, 123, 0.1)',
                borderRadius: 'var(--us-radius-control)',
                padding: '10px 14px',
                display: 'flex',
                gap: 10,
                alignItems: 'flex-start',
                fontSize: 12,
                color: 'var(--us-gold-light)',
              }}
            >
              <WifiOff size={15} color="var(--us-gold)" style={{ flexShrink: 0, marginTop: 1 }} />
              <div style={{ lineHeight: 1.5 }}>{geoStatus.text}</div>
            </div>
          )}

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
                {serviceUrl ?? activeTab.url ?? 'No active tab'}
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
            verdict={verdict}
            dnsResult={dnsResult}
            geoStatus={geoStatus}
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
