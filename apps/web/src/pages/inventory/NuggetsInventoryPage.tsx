import { InventoryMgmtPage } from "../InventoryMgmtPage";
import { OrdersPage } from "../OrdersPage";

/** Metal batches + sticker bag orders (legacy sticker economy). */
export function NuggetsInventoryPage() {
  return (
    <>
      <InventoryMgmtPage />
      <OrdersPage />
    </>
  );
}
