// The export row at the bottom of Insights (Q41): "Report PDF" and "CSV" for the period and currency on screen; both
// are off when the period has no spending or income in that currency (Q45). CSV asks "IDR only" or "All currencies". Both files go to the share sheet, else download (Q42). When iOS
// refuses to share because making the file took too long, the button turns into "Share PDF" / "Share CSV" and the
// next tap shares the file already made (Q40).
import { Button } from 'konsta/react';
import { useState } from 'react';
import { createPortal } from 'react-dom';
import { client, OfflineError } from '../../lib/api';
import { attempt } from '../../lib/run';
import { shareFile } from '../../lib/share';
import { Group, Row } from '../../ui/List';
import { Sheet } from '../../ui/Sheet';
import { exportName, periodLabel, type Span } from './insights';
import { makeReport } from './report';

type Job = { busy: boolean; ready: File | null };
const idle: Job = { busy: false, ready: null };

export function ExportRow({
  period,
  currency,
  report,
  empty,
}: {
  period: Span & { from: string; to: string };
  currency: string;
  report: () => HTMLElement | null;
  empty: boolean;
}) {
  const [pdf, setPdf] = useState<Job>(idle);
  const [csv, setCsv] = useState<Job>(idle);
  const [asking, setAsking] = useState(false);
  const label = periodLabel(period);

  const run = (set: (j: Job) => void, make: () => Promise<File>) =>
    attempt(async () => {
      set({ busy: true, ready: null });
      try {
        const file = await make();
        set({ busy: false, ready: (await shareFile(file)) === 'needs-tap' ? file : null });
      } catch (e) {
        set(idle);
        throw e;
      }
    });
  // The second tap: the file is ready, so the share sheet opens straight from it.
  const again = (job: Job, set: (j: Job) => void) =>
    attempt(async () => {
      set({ busy: false, ready: (await shareFile(job.ready!)) === 'needs-tap' ? job.ready : null });
    });

  const makePdf = () => {
    const root = report();
    if (!root) return Promise.reject(new Error('Nothing to export yet'));
    const made = new Date().toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      timeZone: 'Asia/Jakarta',
    });
    return makeReport(root, {
      title: `Insights · ${label} · ${currency}`,
      made,
      name: exportName(period, currency, 'pdf'),
    });
  };
  const makeCsv = async (only: string | null) => {
    let res: { ok: boolean; text(): Promise<string>; json(): Promise<unknown> };
    try {
      res = await client.api['export.csv'].$get({
        query: { from: period.from, to: period.to, currency: only ?? undefined },
      });
    } catch {
      throw new OfflineError();
    }
    if (!res.ok)
      throw new Error(
        ((await res.json().catch(() => null)) as { message?: string } | null)?.message ??
          'Something went wrong',
      );
    return new File([await res.text()], exportName(period, only, 'csv'), { type: 'text/csv' });
  };

  return (
    <div className="mx-4 mt-6 flex items-center gap-2">
      <Button
        inline
        rounded
        tonal
        disabled={empty || pdf.busy}
        onClick={() => (pdf.ready ? again(pdf, setPdf) : run(setPdf, makePdf))}
      >
        {pdf.busy ? 'Making PDF…' : pdf.ready ? 'Share PDF' : 'Report PDF'}
      </Button>
      <Button
        inline
        rounded
        tonal
        disabled={empty || csv.busy}
        onClick={() => (csv.ready ? again(csv, setCsv) : setAsking(true))}
      >
        {csv.busy ? 'Making CSV…' : csv.ready ? 'Share CSV' : 'CSV'}
      </Button>
      <Sheet
        open={asking}
        onClose={() => setAsking(false)}
        title={`Export CSV · ${label.replace(/ cycle$/, '')}`}
      >
        <Group>
          <Row
            title={`${currency} only`}
            chevron
            onClick={() => {
              setAsking(false);
              run(setCsv, () => makeCsv(currency));
            }}
          />
          <Row
            title="All currencies"
            chevron
            onClick={() => {
              setAsking(false);
              run(setCsv, () => makeCsv(null));
            }}
          />
        </Group>
      </Sheet>
      {/* While the report is drawn the screen switches to the light look for a moment; this covers it. */}
      {pdf.busy &&
        createPortal(
          <div
            className="fixed inset-0 z-[200] grid place-items-center bg-ios-light-surface text-[19px] dark:bg-ios-dark-surface"
            role="status"
          >
            Making PDF…
          </div>,
          document.body,
        )}
    </div>
  );
}
