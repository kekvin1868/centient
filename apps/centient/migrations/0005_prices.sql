-- Crypto prices: the last known rupiah price of one whole coin, shared by every workspace (prices are
-- public). Refreshed at most every 10 minutes; when the price service is unreachable the last row is
-- served as is, with its time, so balances still show a value.
CREATE TABLE prices (
  currency_code TEXT PRIMARY KEY REFERENCES currencies(code),
  idr_per_unit  INTEGER NOT NULL CHECK (idr_per_unit > 0),
  fetched_at    TEXT NOT NULL
);
