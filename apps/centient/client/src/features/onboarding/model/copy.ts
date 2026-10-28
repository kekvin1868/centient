// Words for the first run. Markup: {pink|word} {cyan|word} {shake|word} (see ui/night/RichType).

/** One line per account type for the type picker. */
export const KIND_NOTES: Record<string, string> = {
  BANK: 'Salary lands here, big bills leave.',
  DEBIT_CARD: 'A card that spends straight from your money.',
  EWALLET: 'Rides, snacks, top-ups.',
  CASH: 'Notes and coins in a drawer.',
  CREDIT_CARD: 'Spend now, the bill comes later.',
  PAYLATER: 'Buy now, pay in parts.',
  EXCHANGE: 'Coins on an exchange.',
};

/** Shown once each, after 8 quiet seconds in that place. */
export const HINTS = {
  menu: 'Tap a row, tap again to rename. Tap the big balance or a pocket to set it. Complete guide & actions is provided on {cyan|?} symbol up top.',
  pocket: 'Rough is fine. Punch it in, hit {pink|SET}. Not sure? {cyan|LEAVE ???}.',
  move: 'Pick where it goes, punch in how much, hit {pink|MOVE}. More than the balance holds won\'t go.',
  type: 'Pick a type. Tap outside to keep the old one.',
  confirm: "Look it over. {pink|CONFIRM} if it's right, tap outside to keep editing.",
  board: 'Drag the board to look around, pinch to zoom. {cyan|LINK} draws arrows pocket to pocket.',
};

export const GUIDE: [string, string][] = [
  ['START HERE', 'This is your setup. Nothing saves until you hit {pink|CONFIRM}, and you see every change first.'],
  ['ACCOUNTS', 'Where money lives: a bank, an e-wallet, cash. Three are ready. Keep, drop or rename them, or add your own, up to 20.'],
  ['BALANCE', "The big number on an account: money not set aside in a pocket. {cyan|MOVE BALANCES} on it shifts some to another account."],
  ['POCKETS', "Set money aside for savings or bills. An account's total is its balance plus its pockets."],
  ['{pink|???}', "A balance you haven't set. That's fine. It starts at Rp0 and you can set it later."],
  ['TYPES', 'Bank, debit, e-wallet, cash, credit, pay later, crypto. Hold a row or tap {cyan|TYPE} to pick one. For cards and pay later, enter what you owe.'],
  ['FLOW MAP', 'The board button, bottom right, opens a canvas. Draw arrows between pockets to sketch where your money moves.'],
];

export const CONTROLS: [string, [string, string][]][] = [
  ['TOUCH', [['TAP', 'Pick an account'], ['TAP AGAIN', 'Rename it'], ['HOLD', 'Pick its type'], ['SWIPE ←', 'Drop it (swipe → to keep)'], ['TAP OUTSIDE', 'Close any dialog']]],
  ['MENU', [['↑ ↓ · J K', 'Move'], ['⏎ · R', 'Rename (adds on the + row)'], ['N', 'New account'], ['T', 'Pick a type'], ['D · ⌫', 'Drop, keep or delete'], ['P', 'New pocket'], ['0 · 1–9', 'Set the balance · pocket 1–9'], ['C', 'Flow board'], ['⌘/CTRL Z', 'Undo'], ['⌘/CTRL ⏎', 'Confirm'], ['ESC', 'Close the top dialog']]],
  ['KEYPAD', [['0–9 · ⌫', 'Type the amount'], ['K · J', 'Add 000 · 000000'], ['+ - * / ( )', 'Work out a sum'], ['DEL', 'Clear'], ['?', 'Leave it ???'], ['⏎', 'Set']]],
  ['BOARD', [['DRAG BOARD', 'Pan (or SPACE + drag)'], ['PINCH · ⌘/CTRL SCROLL', 'Zoom'], ['+ − · 0 · F', 'Zoom · 100% · Fit'], ['V · L · P · E', 'Move · Link · Pen · Erase'], ['⌘/CTRL Z', 'Undo'], ['C · ESC', 'Close']]],
];
