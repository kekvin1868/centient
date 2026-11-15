// Ticket codes both sides must agree on (see middleware/ticket.ts). Kept apart from the rest of the domain so the
// app's first download takes only this.

/** Mark paid for one due date of a bill: a double tap or a retry pays it once. Forgotten when that payment is deleted. */
export const paidTicket = (billId: string, due: string) => `paid:${billId}:${due}`;
