// Each account kind's icon (the "All" card is the joker): the hand of cards and the limits box draw the same ones.
import { type Icon } from '@phosphor-icons/react';
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
} from '../../ui/icons';

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
