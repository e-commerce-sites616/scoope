'use strict';
// Payment provider interface. Checkout only talks to `provider.charge()` and `provider.refund()`.
// To use a real provider later, implement the same two methods and swap `provider` below.
// DemoProvider moves NO money: it just returns a result chosen by the shopper.
const crypto = require('node:crypto');

class DemoProvider {
  constructor() { this.name = 'demo'; this.live = false; }
  async charge({ amount, scenario }) {
    return { status: scenario === 'fail' ? 'failed' : 'succeeded', reference: `DEMO-${crypto.randomBytes(5).toString('hex').toUpperCase()}`, amount, message: scenario === 'fail' ? 'Simulated failure: the demo card was declined.' : 'Simulated payment accepted. No money was collected.' };
  }
  async refund({ amount }) { return { status: 'refunded', reference: `DEMO-RF-${crypto.randomBytes(5).toString('hex').toUpperCase()}`, amount }; }
}
module.exports = { provider: new DemoProvider() };
