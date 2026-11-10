import { Field } from '../../components/Form';
import { DEVICE_TYPES } from '../../types';
import type { DeviceInput } from './data';

export const EMPTY_DEVICE: DeviceInput = { type: 'Laptop', brand: '', model: '', serial: '', notes: '' };

export function deviceErrors(d: DeviceInput) {
  return { brand: d.brand.trim() || d.model.trim() ? null : 'Enter at least the brand or model.' };
}

/** Type, brand, model, serial — used on the customer page and at intake. */
export function DeviceFields({
  value,
  onChange,
  showErrors,
  idPrefix = 'dev',
}: {
  value: DeviceInput;
  onChange: (d: DeviceInput) => void;
  showErrors: boolean;
  idPrefix?: string;
}) {
  const set = (k: keyof DeviceInput) => (e: { target: { value: string } }) => onChange({ ...value, [k]: e.target.value });
  const err = showErrors ? deviceErrors(value).brand : null;
  return (
    <div className="form-grid">
      <Field id={`${idPrefix}-type`} label="Type">
        <select id={`${idPrefix}-type`} value={value.type} onChange={set('type')}>
          {DEVICE_TYPES.map((t) => (
            <option key={t}>{t}</option>
          ))}
        </select>
      </Field>
      <Field id={`${idPrefix}-brand`} label="Brand" error={err}>
        <input id={`${idPrefix}-brand`} value={value.brand} onChange={set('brand')} placeholder="Dell, HP, Lenovo…" aria-invalid={!!err} />
      </Field>
      <Field id={`${idPrefix}-model`} label="Model" optional>
        <input id={`${idPrefix}-model`} value={value.model} onChange={set('model')} placeholder="Inspiron 15 3520" />
      </Field>
      <Field id={`${idPrefix}-serial`} label="Serial number" optional>
        <input id={`${idPrefix}-serial`} value={value.serial} onChange={set('serial')} className="mono" spellCheck={false} />
      </Field>
    </div>
  );
}
