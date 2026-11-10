import { useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { RequireRole } from '../../app/guards';
import { useSession } from '../../app/session';
import { BrandStep } from './BrandStep';
import { ReadyStep } from './ReadyStep';
import { initials } from './shared';
import { ShopStep } from './ShopStep';
import { StaffStep } from './StaffStep';
import { TaxStep } from './TaxStep';

const STEPS = [
  { title: 'Shop details', Component: ShopStep },
  { title: 'Logo and colours', Component: BrandStep },
  { title: 'Tax and numbering', Component: TaxStep },
  { title: 'Add staff', Component: StaffStep },
  { title: 'Ready', Component: ReadyStep },
];

/**
 * First-run wizard (owner only). Each step saves when you continue, so closing
 * the tab loses nothing. The step lives in the URL (?step=3) so "Edit" links
 * and the browser back button work.
 */
export function SetupPage() {
  const { shop } = useSession();
  const [params, setParams] = useSearchParams();
  const raw = Number(params.get('step'));
  const step = Number.isInteger(raw) && raw >= 1 && raw <= STEPS.length ? raw : 1;
  const headingRef = useRef<HTMLDivElement>(null);

  const go = (n: number) => setParams({ step: String(n) });

  // Move focus to the new step for keyboard and screen-reader users.
  useEffect(() => {
    window.scrollTo({ top: 0 });
    headingRef.current?.querySelector('h1')?.focus();
  }, [step]);

  const { Component } = STEPS[step - 1];
  const name = shop?.name || 'your shop';

  return (
    <RequireRole roles={['owner']}>
      <div className="setup">
        <header className="setup__head">
          <span className="setup__mark" aria-hidden="true">
            {shop?.logo ? <img src={shop.logo} alt="" /> : initials(shop?.name || 'FixBench')}
          </span>
          <div>
            <p className="setup__title">Set up {name}</p>
            <p className="muted" style={{ fontSize: 13 }}>
              About 5 minutes · you can change all of this later in Settings
            </p>
          </div>
        </header>

        <nav style={{ width: '100%', maxWidth: 1040 }} aria-label="Setup steps">
          <ol className="setup__steps">
            {STEPS.map((s, i) => (
              <li key={s.title} aria-current={i + 1 === step ? 'step' : undefined} className={i + 1 < step ? 'is-done' : undefined}>
                <button type="button" className="setup__step-button" onClick={() => go(i + 1)}>
                  <span className="setup__bar" />
                  {i + 1} · {s.title}
                </button>
              </li>
            ))}
          </ol>
        </nav>

        <section className="card setup__card" ref={headingRef} key={step}>
          <Component shop={shop} go={go} />
        </section>
      </div>
    </RequireRole>
  );
}
