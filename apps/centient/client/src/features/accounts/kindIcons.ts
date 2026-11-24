// Each account kind's icon (the "All" card is the joker): the hand of cards and the limits box draw the same ones.
import {
  Bank,
  Cardholder,
  Cards,
  ClockCountdown,
  CreditCard,
  CurrencyBtc,
  DeviceMobile,
  Handshake,
  Money,
  type Icon,
} from '@phosphor-icons/react';

export const ICON: Record<string, Icon> = {
  BANK: Bank,
  DEBIT_CARD: Cardholder,
  EWALLET: DeviceMobile,
  CASH: Money,
  CREDIT_CARD: CreditCard,
  PAYLATER: ClockCountdown,
  EXCHANGE: CurrencyBtc,
  IOU: Handshake,
  ALL: Cards,
};
