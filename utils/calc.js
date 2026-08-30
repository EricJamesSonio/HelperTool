import { taxRate } from './config';
import { formatCurrency } from './helpers';
import { logger } from './logger';

const CURRENCY_SYMBOL = "$";
function calculateTotal(items) {
  logger.debug("calculating total");
  return items.reduce((sum, item) => sum + item.price, 0);
}

function formatCurrency(amount) {
  return `$${amount.toFixed(2)}`;
}

export { calculateTotal, , formatCurrency };