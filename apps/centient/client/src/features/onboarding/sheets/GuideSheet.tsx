// The ? sheet: GUIDE (what everything is) and CONTROLS (every key and gesture). Remembers the last tab.
import { useState } from 'react';
import { NightSheet } from '../../../ui/night/NightSheet';
import { NightTabs } from '../../../ui/night/NightTabs';
import { RichText } from '../../../ui/night/RichType';
import { CONTROLS, GUIDE } from '../model/copy';

let lastTab = 0;

export function GuideSheet({ onClose }: { onClose: () => void }) {
  const [tab, setTab] = useState(lastTab);
  const show = (i: number) => { lastTab = i; setTab(i); };
  return (
    <NightSheet label="Guide and controls" place="mid" onClose={onClose}
      onKey={(e, close) => {
        if (e.key === '?') close();
        else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { e.preventDefault(); show(1 - tab); }
        else if (e.key === '1' || e.key === '2') show(+e.key - 1);
      }}>
      <NightTabs tabs={['GUIDE', 'CONTROLS']} index={tab} onChange={show}>
        <div className="h-body">
          {tab === 0
            ? GUIDE.map(([t, p]) => <section key={t}><p className="h-t"><RichText text={t} /></p><p className="h-p"><RichText text={p} /></p></section>)
            : CONTROLS.map(([t, rows]) => (
              <section key={t}>
                <p className="h-t">{t}</p>
                {rows.map(([k, v]) => <div key={k} className="h-row"><span>{v}</span><kbd>{k}</kbd></div>)}
              </section>
            ))}
        </div>
      </NightTabs>
    </NightSheet>
  );
}
