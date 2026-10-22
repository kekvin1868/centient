// Our own confirm prompt (never the browser's), for destructive actions: an iOS action sheet.
import { Actions, ActionsButton, ActionsGroup, ActionsLabel } from 'konsta/react';
import { createPortal } from 'react-dom';

type Props = { open: boolean; message: string; confirmLabel: string; onConfirm: () => void; onCancel: () => void };

export function ConfirmSheet({ open, message, confirmLabel, onConfirm, onCancel }: Props) {
  return createPortal(
    // Stays mounted so it can slide away; inert while closed keeps its buttons out of reach.
    <div inert={!open}>
    <Actions opened={open} onBackdropClick={onCancel}>
      <ActionsGroup>
        <ActionsLabel>{message}</ActionsLabel>
        <ActionsButton className="k-color-brand-red" onClick={onConfirm}>{confirmLabel}</ActionsButton>
      </ActionsGroup>
      <ActionsGroup>
        <ActionsButton bold onClick={onCancel}>Cancel</ActionsButton>
      </ActionsGroup>
    </Actions>
    </div>,
    document.body,
  );
}
