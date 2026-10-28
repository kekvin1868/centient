// The board's dock: four tools, then undo, clear and zoom (the middle button fits everything).
export type Tool = 'move' | 'link' | 'pen' | 'erase';
const TOOLS: [Tool, string, string][] = [['move', '✥', 'MOVE'], ['link', '↗', 'LINK'], ['pen', '✎', 'PEN'], ['erase', '⌫', 'ERASE']];

type Props = { tool: Tool; onTool: (t: Tool) => void; zoom: number; onUndo: () => void; onClear: () => void; onZoom: (f: number) => void; onFit: () => void };

export function Toolbar({ tool, onTool, zoom, onUndo, onClear, onZoom, onFit }: Props) {
  return (
    <div className="cv-dock">
      <div className="cv-bar" role="toolbar" aria-label="Tools">
        {TOOLS.map(([t, icon, label]) => (
          <button key={t} type="button" className="cv-tool" aria-pressed={tool === t} onClick={() => onTool(t)}><i aria-hidden="true">{icon}</i>{label}</button>
        ))}
      </div>
      <div className="cv-bar2">
        <button type="button" className="cv-tool" onClick={onUndo}>UNDO</button>
        <button type="button" className="cv-tool" onClick={onClear}>CLEAR</button>
        <button type="button" className="cv-tool" aria-label="Zoom out" onClick={() => onZoom(0.8)}>−</button>
        <button type="button" className="cv-tool" aria-label="Fit everything" onClick={onFit}>{Math.round(zoom * 100)}%</button>
        <button type="button" className="cv-tool" aria-label="Zoom in" onClick={() => onZoom(1.25)}>+</button>
      </div>
    </div>
  );
}
