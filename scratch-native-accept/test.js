const assert = require('assert');
const { totalPrice } = require('./price');

assert.strictEqual(totalPrice([{ price: 10, qty: 2 }], 10), 18, '10% off 20 should be 18');
assert.strictEqual(totalPrice([{ price: 5, qty: 1 }], 0), 5, 'no discount');
assert.strictEqual(totalPrice([{ price: 100, qty: 1 }], 25), 75, '25% off 100 should be 75');

console.log('All tests passed.');
