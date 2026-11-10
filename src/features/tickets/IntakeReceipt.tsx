import QRCode from 'qrcode';
import { useEffect, useState } from 'react';
import { formatLKR } from '../../lib/money';
import type { Cents } from '../../lib/money';
import type { ShopSettings } from '../../types';

export interface ReceiptData {
  ticketNo: string | null;
  date: Date;
  takenBy: string;
  customerName: string;
  customerPhone: string;
  deviceLabel: string;
  serial?: string;
  problem: string;
  accessories: string[];
  condition: string[];
  conditionNotes?: string;
  estimate?: Cents | null;
  advance?: Cents | null;
  dueDate?: Date | null;
  statusUrl: string | null;
}

/** QR code as an SVG data URL (prints sharp on thermal printers). */
export function useQr(text: string | null): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!text) return setUrl(null);
    let live = true;
    QRCode.toString(text, { type: 'svg', margin: 0, errorCorrectionLevel: 'M' })
      .then((svg) => live && setUrl(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`))
      .catch(() => live && setUrl(null));
    return () => {
      live = false;
    };
  }, [text]);
  return url;
}

const d2 = (n: number) => String(n).padStart(2, '0');
const dmy = (d: Date) => `${d2(d.getDate())}/${d2(d.getMonth() + 1)}/${d.getFullYear()}`;
const hm = (d: Date) => `${d2(d.getHours())}:${d2(d.getMinutes())}`;

/**
 * Service intake receipt. `variant="print"` is the 80mm thermal layout (black
 * only, see screens.css @media print); "preview" is the on-screen copy.
 */
export function IntakeReceipt({ shop, r, variant }: { shop: ShopSettings | null; r: ReceiptData; variant: 'print' | 'preview' }) {
  const qr = useQr(r.statusUrl);
  const condition = [...r.condition, r.conditionNotes?.trim()].filter(Boolean).join('; ');
  return (
    <div className={variant === 'print' ? 'receipt' : 'receipt-preview'}>
      {shop?.logo && <img className="logo" src={shop.logo} alt="" />}
      <h1 className="c">{shop?.name || 'Your repair shop'}</h1>
      {(shop?.address?.street || shop?.address?.city) && (
        <p className="c">{[shop?.address?.street, shop?.address?.city].filter(Boolean).join(', ')}</p>
      )}
      <p className="c">{[shop?.phone, shop?.whatsapp && `WA ${shop.whatsapp}`].filter(Boolean).join(' · ')}</p>
      <hr />
      <p className="c lbl">SERVICE INTAKE RECEIPT</p>
      <p className="big">{r.ticketNo ?? `${shop?.prefixes.ticket ?? 'T'}-····`}</p>
      {!r.ticketNo && <p className="c">Number is issued when you save</p>}
      <div className="row">
        <span>Date</span>
        <span>
          {dmy(r.date)} {hm(r.date)}
        </span>
      </div>
      <div className="row">
        <span>Taken by</span>
        <span>{r.takenBy.split(' ')[0]}</span>
      </div>
      <hr />
      <p className="lbl">CUSTOMER</p>
      <p>
        {r.customerName || '—'} {r.customerPhone}
      </p>
      <p className="lbl">DEVICE</p>
      <p>
        {r.deviceLabel || '—'}
        {r.serial ? ` S/N ${r.serial}` : ''}
      </p>
      <p className="lbl">PROBLEM</p>
      <p>{r.problem || '—'}</p>
      {r.accessories.length > 0 && (
        <>
          <p className="lbl">RECEIVED WITH</p>
          <p>{r.accessories.join(', ')}</p>
        </>
      )}
      {condition && (
        <>
          <p className="lbl">CONDITION</p>
          <p>{condition}</p>
        </>
      )}
      <hr />
      {r.estimate ? (
        <div className="row">
          <span>Estimate</span>
          <span>{formatLKR(r.estimate)}</span>
        </div>
      ) : null}
      {r.advance ? (
        <div className="row">
          <span>Advance paid</span>
          <span>{formatLKR(r.advance)}</span>
        </div>
      ) : null}
      {r.dueDate && (
        <div className="row">
          <span>Ready by</span>
          <span>{dmy(r.dueDate)}</span>
        </div>
      )}
      {qr ? (
        <>
          <img className="qr" src={qr} alt="QR code for the repair status page" />
          <p className="c">Scan to check your repair status</p>
        </>
      ) : (
        !r.ticketNo && <p className="c">[QR code to check repair status]</p>
      )}
      {shop?.terms && (
        <>
          <hr />
          <p>{shop.terms}</p>
        </>
      )}
      <p className="c">Please keep this receipt.</p>
    </div>
  );
}
