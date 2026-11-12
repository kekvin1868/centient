// Deleting a pocket that holds money: back to the account's balance (the total stays) or remove the money with it.
import { formatMoney } from '../../../lib/format';
import { NightSheet } from '../../../ui/night/NightSheet';

export function DeletePocket({
  name,
  amount,
  onPick,
  onClose,
}: {
  name: string;
  amount: number;
  onPick: (back: boolean) => void;
  onClose: () => void;
}) {
  return (
    <NightSheet label={`Delete ${name}`} title="DELETE POCKET" place="mid" onClose={onClose}>
      {close => {
        const pick = async (back: boolean) => {
          await close();
          onPick(back);
        };
        return (
          <>
            <p className="c-msg">
              Delete <em>{name}</em> ({formatMoney(amount)})?
            </p>
            <div className="k-stack">
              <button type="button" className="n-go wide" onClick={() => pick(true)}>
                BACK TO BALANCE
              </button>
              <button type="button" className="n-btn" onClick={() => pick(false)}>
                REMOVE MONEY
              </button>
              <button type="button" className="n-btn" onClick={close}>
                CANCEL
              </button>
            </div>
          </>
        );
      }}
    </NightSheet>
  );
}
