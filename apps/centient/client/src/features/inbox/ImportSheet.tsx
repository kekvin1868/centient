// Import a spreadsheet (CSV): pick the file (it is read on this device; only the rows you import are sent),
// say which column is what and which account it is, check the first rows, then send them to the Inbox for
// review. The reading rules are models/inbox; this only renders them.
import { Block, Button } from 'konsta/react';
import { useMemo, useRef, useState } from 'react';
import { parseCsv } from '../../lib/csv';
import { formatMoney } from '../../lib/format';
import { active, catalog, everyday, nameOf, selectedAccount } from '../../lib/state';
import {
  FIELDS,
  guessDayOrder,
  guessMapping,
  IMPORT_MAX,
  inboxApi,
  inboxQueries,
  needsPlain,
  toRows,
  type DayOrder,
  type Mapping,
} from '../../models/inbox';
import { persist } from '../../models/query';
import { dateText, PickerRow } from '../../ui/Fields';
import { Group, Row } from '../../ui/List';
import { Sheet } from '../../ui/Sheet';
import { showToast } from '../../ui/Toast';

type Picked = { name: string; headers: string[]; table: string[][] };
const PREVIEW = 5;
// Dates written with slashes or dots can be day-first or month-first; other shapes say it themselves.
const AMBIGUOUS = /^\d{1,2}[/.-]\d{1,2}[/.-]\d/;

export function ImportSheet({
  open,
  onClose,
  onImported,
}: {
  open: boolean;
  onClose: () => void;
  /** Runs after an import, once this sheet is told to close (the parent opens the Inbox). */
  onImported: () => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<Picked | null>(null);
  const [map, setMap] = useState<Mapping | null>(null);
  const [accountId, setAccountId] = useState<string | null>(selectedAccount.value);
  const [order, setOrder] = useState<DayOrder>('DMY');
  const [plain, setPlain] = useState<'out' | 'in'>('out');
  const cat = catalog.value;
  const currency = cat.accounts.find(a => a.id === accountId)?.currency_code ?? 'IDR';

  const read = async (picked: File | undefined) => {
    if (!picked) return;
    const [headers, ...table] = parseCsv(await picked.text());
    if (!headers || !table.length) return showToast('That file has no rows');
    const guess = guessMapping(headers);
    setFile({ name: picked.name, headers, table });
    setMap(guess);
    if (guess.date !== null) setOrder(guessDayOrder(table.map(r => r[guess.date!] ?? '')));
  };

  const parsed = useMemo(
    () =>
      file && map && accountId
        ? toRows(file.table, map, {
            accountId,
            currency,
            order,
            plain,
            categories: active(cat.categories),
          })
        : null,
    [file, map, accountId, currency, order, plain, cat.categories],
  );
  const error = !accountId
    ? 'Pick the account'
    : map?.date == null
      ? 'Pick the date column'
      : map.amount === null
        ? 'Pick the amount column'
        : !parsed?.rows.length
          ? 'No rows could be read'
          : parsed.rows.length > IMPORT_MAX
            ? `Too many rows: ${IMPORT_MAX} at a time`
            : null;

  const send = async () => {
    if (error || !parsed) return;
    let result = { added: 0, skipped: 0 };
    const sent = await persist(async () => {
      result = await inboxApi.import(parsed.rows);
    }, [inboxQueries.all()]);
    if (!sent) return;
    showToast(
      `${result.added} to review${result.skipped ? ` · ${result.skipped} were imported before` : ''}`,
    );
    onClose();
    onImported();
  };

  const columns = file?.headers.map((h, i) => ({
    value: String(i),
    label: h || `Column ${i + 1}`,
  }));
  const firstDate = file && map?.date != null ? (file.table[0][map.date] ?? '') : '';

  return (
    <Sheet open={open} onClose={onClose} title="Import a spreadsheet">
      <input
        ref={input}
        type="file"
        accept=".csv,text/csv,text/plain"
        hidden
        aria-label="CSV file"
        onChange={e => void read(e.target.files?.[0])}
      />
      {!file || !map || !columns ? (
        <Block>
          <p className="text-[15px]">
            Bring in history from another app or your bank as a CSV file. From Excel or Google
            Sheets, save the sheet as CSV first. The file is read on this phone, and every row waits
            in the Inbox for your OK.
          </p>
          <Button large rounded className="mt-4" onClick={() => input.current?.click()}>
            Choose a CSV file
          </Button>
        </Block>
      ) : (
        <>
          <Group label={file.name} foot={`${file.table.length} rows in the file.`}>
            <PickerRow
              label="Into account"
              value={accountId}
              options={everyday().map(a => ({ value: a.id, label: a.name }))}
              onChange={setAccountId}
            />
            {FIELDS.map(f => (
              <PickerRow
                key={`field:${f.key}`}
                label={f.label}
                value={map[f.key] === null ? null : String(map[f.key])}
                placeholder={f.needed ? 'Choose' : 'None'}
                options={columns}
                onChange={v => setMap({ ...map, [f.key]: v === null ? null : Number(v) })}
              />
            ))}
            {AMBIGUOUS.test(firstDate) && (
              <PickerRow
                label={`${firstDate} is`}
                value={order}
                options={[
                  { value: 'DMY', label: 'Day first' },
                  { value: 'MDY', label: 'Month first' },
                ]}
                onChange={v => setOrder(v === 'MDY' ? 'MDY' : 'DMY')}
              />
            )}
            {needsPlain(file.table, map, currency) && (
              <PickerRow
                label="These amounts are"
                value={plain}
                options={[
                  { value: 'out', label: 'Spending' },
                  { value: 'in', label: 'Income' },
                ]}
                onChange={v => setPlain(v === 'in' ? 'in' : 'out')}
              />
            )}
          </Group>
          {parsed && (
            <Group
              label="First rows"
              foot={
                parsed.skipped.length
                  ? `${parsed.skipped.length} row${parsed.skipped.length === 1 ? '' : 's'} skipped. Line ${parsed.skipped[0].line}: ${parsed.skipped[0].why}.`
                  : undefined
              }
            >
              {parsed.rows.slice(0, PREVIEW).map((r, i) => (
                <Row
                  key={`preview:${i}`}
                  title={r.merchant ?? 'No name'}
                  sub={[dateText(r.date), r.categoryId && nameOf(cat.categories, r.categoryId)]
                    .filter(Boolean)
                    .join(' · ')}
                  trail={
                    <span className={`num ${r.amount > 0 ? 'text-primary' : ''}`}>
                      {r.amount > 0 ? '+' : '−'}
                      {formatMoney(Math.abs(r.amount), currency)}
                    </span>
                  }
                />
              ))}
            </Group>
          )}
          <Block className="flex flex-col gap-2.5">
            <Button large rounded disabled={Boolean(error)} onClick={send}>
              {error ?? `Send ${parsed?.rows.length} rows to the Inbox`}
            </Button>
            <Button large rounded tonal onClick={() => input.current?.click()}>
              Choose another file
            </Button>
          </Block>
        </>
      )}
    </Sheet>
  );
}
