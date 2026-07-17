// Computes the total price of a cart, applying a percentage discount.
// Example: totalPrice([{price: 10, qty: 2}], 10) === 18
function totalPrice(items, discountPercent) {
  let subtotal = 0;
  for (const item of items) {
    subtotal += item.price * item.qty;
  }
  // Fix: apply discount as a percentage of the subtotal, not a flat subtraction.
  return subtotal * (1 - discountPercent / 100);
}

module.exports = { totalPrice };
