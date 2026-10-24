// Payment layer.
// demo   — the browser validates the card (Luhn/expiry/CVC) and sends ONLY brand + last 4 digits.
//          Full card numbers and CVC never reach this server, the database or Telegram.
// stripe — real charges through Stripe PaymentIntents; card data goes straight from the browser to Stripe.
const config = require('./config');

let stripe = null;
function getStripe() {
  if (stripe) return stripe;
  if (config.paymentMode !== 'stripe' || !config.stripeSecret) return null;
  try {
    stripe = require('stripe')(config.stripeSecret);
  } catch {
    console.error('[payments] PAYMENT_MODE=stripe but the "stripe" package is not installed. Run: npm i stripe');
  }
  return stripe;
}

const toMinor = (amount) => Math.round(amount * 100);

async function createIntent(amount, meta = {}) {
  const s = getStripe();
  if (!s) throw new Error('stripe_not_configured');
  const intent = await s.paymentIntents.create({
    amount: toMinor(amount),
    currency: config.currency.toLowerCase(),
    automatic_payment_methods: { enabled: true, allow_redirects: 'never' },
    metadata: meta,
  });
  return { clientSecret: intent.client_secret, id: intent.id };
}

async function verifyIntent(intentId, expectedAmount) {
  const s = getStripe();
  if (!s) throw new Error('stripe_not_configured');
  const intent = await s.paymentIntents.retrieve(intentId, { expand: ['payment_method'] });
  if (intent.status !== 'succeeded') throw new Error('payment_not_completed');
  if (intent.amount !== toMinor(expectedAmount)) throw new Error('amount_mismatch');
  const card = intent.payment_method && intent.payment_method.card;
  return { ref: intent.id, brand: card ? card.brand : 'card', last4: card ? card.last4 : '' };
}

function validateDemoPayment(p) {
  if (!p || typeof p !== 'object') return 'payment_required';
  if (!/^\d{4}$/.test(String(p.last4 || ''))) return 'invalid_card';
  if (!p.cardholder || String(p.cardholder).trim().length < 2) return 'invalid_cardholder';
  return null;
}

module.exports = { getStripe, createIntent, verifyIntent, validateDemoPayment, toMinor };
