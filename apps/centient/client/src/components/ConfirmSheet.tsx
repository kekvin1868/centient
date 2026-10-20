// Our own confirm prompt (never the browser's), for destructive actions.
import { Sheet } from './Sheet';

type Props = { open: boolean; message: string; confirmLabel: string; onConfirm: () => void; onCancel: () => void };

export function ConfirmSheet({ open, message, confirmLabel, onConfirm, onCancel }: Props) {
  return (
    <Sheet open={open} onClose={onCancel}>
      <p style="text-align:center;margin:8px 8px 20px" class="muted">{message}</p>
      <div style="display:grid;gap:10px">
        <button class="btn btn-secondary btn-block danger-text" onClick={onConfirm}>{confirmLabel}</button>
        <button class="btn btn-secondary btn-block" onClick={onCancel}>Cancel</button>
      </div>
    </Sheet>
  );
}
