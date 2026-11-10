import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useSession } from '../../app/session';
import { ErrorAlert } from '../../components/Form';
import { firebaseApp } from '../../lib/firebase';
import { BrandStep } from '../setup/BrandStep';
import { ShopStep } from '../setup/ShopStep';
import { StaffStep } from '../setup/StaffStep';
import { TaxStep } from '../setup/TaxStep';
import { download, exportAll, type ExportResult } from './exportData';

const TABS = [
  { id: 'shop', label: 'Shop profile' },
  { id: 'brand', label: 'Logo and colours' },
  { id: 'tax', label: 'Tax and numbering' },
  { id: 'staff', label: 'Staff and roles' },
  { id: 'data', label: 'Data and backup' },
] as const;
type Tab = (typeof TABS)[number]['id'];

/** /settings — owner only (route guard and security rules). Reuses the setup wizard's screens. */
export function SettingsPage() {
  const { shop } = useSession();
  const [params, setParams] = useSearchParams();
  const tab = (TABS.find((t) => t.id === params.get('tab'))?.id ?? 'shop') as Tab;
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const saved = () => setSavedAt(Date.now());

  return (
    <div>
      <div className="page-head">
        <h1 className="h1">Settings</h1>
        <span className="tag">Plan: {shop?.plan === 'blaze' ? 'Blaze · pay as you go' : 'Spark · free'}</span>
      </div>
      <div className="settings">
        <nav className="settings__nav" aria-label="Settings sections">
          {TABS.map((t) => (
            <button
              key={t.id}
              className="settings__tab"
              aria-current={tab === t.id ? 'page' : undefined}
              onClick={() => {
                setSavedAt(null);
                setParams(t.id === 'shop' ? {} : { tab: t.id }, { replace: true });
              }}
            >
              {t.label}
            </button>
          ))}
        </nav>
        <section className="card setup__card settings__body" key={`${tab}-${savedAt ?? 0}`}>
          {savedAt && (
            <div className="alert alert--ok" role="status" style={{ marginBottom: 16 }}>
              Saved. Everyone in the shop sees the change straight away.
            </div>
          )}
          {tab === 'shop' && <ShopStep shop={shop} go={saved} inSettings />}
          {tab === 'brand' && <BrandStep shop={shop} go={saved} inSettings />}
          {tab === 'tax' && <TaxStep shop={shop} go={saved} inSettings />}
          {tab === 'staff' && <StaffStep shop={shop} go={saved} inSettings />}
          {tab === 'data' && <DataTab />}
        </section>
      </div>
    </div>
  );
}

function DataTab() {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ExportResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const projectId = firebaseApp.options.projectId ?? 'fixbench';

  async function run() {
    setBusy(true);
    setError(null);
    try {
      const r = await exportAll(projectId);
      download(`fixbench-${projectId}-${new Date().toISOString().slice(0, 10)}.json`, r.json);
      setResult(r);
    } catch (e) {
      console.error(e);
      setError('Could not export. Check your connection and try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="stack">
      <div className="setup__intro">
        <h1>Data and backup</h1>
        <p className="muted">Download everything — customers, jobs, invoices, payments, quotes and stock — as one file. Keep a copy somewhere safe, for example once a week.</p>
      </div>
      <ul className="list">
        <li>Device passwords are not included.</li>
        <li>The file contains customer details: store it like any other private record.</li>
        <li>Each export reads every record once, which counts towards the free daily limit (50,000 reads).</li>
      </ul>
      <ErrorAlert error={error} />
      <div>
        <button className="btn btn--primary btn--lg" onClick={() => void run()} disabled={busy}>
          {busy ? 'Exporting…' : 'Export all data'}
        </button>
      </div>
      {result && (
        <div className="alert alert--ok" role="status">
          Downloaded:{' '}
          {Object.entries(result.counts)
            .filter(([, n]) => n > 0)
            .map(([k, n]) => `${n} ${k}`)
            .join(' · ')}
          .
        </div>
      )}
      <p className="muted" style={{ fontSize: 13 }}>
        Nightly automatic backups to Cloud Storage come with the Blaze upgrade. Restoring a backup is done with the setup tools, not from this screen.
      </p>
    </div>
  );
}
