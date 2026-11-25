'use strict';
// Copy for static pages. SCOOPÉ is a fictional brand: policies describe the demo honestly.
const { esc } = require('./pages');
const wrap = (title, lead, body) => `<article class="doc"><h1 class="shop__title">${title}</h1><p class="doc__lead">${lead}</p>${body}</article>`;
const money = (n) => '₦' + String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');

module.exports = {
  'our-story': {
    title: 'Our Story', description: 'The idea behind SCOOPÉ: a little moment of indulgence, made slowly.',
    render: () => wrap('Our Story', 'SCOOPÉ began with a small idea: dessert is worth slowing down for.',
      `<h2>One scoop, no rush</h2><p>The best part of a day is often the few minutes you give to yourself. We wanted ice cream that earns those minutes: soft vanilla that tastes like vanilla, chocolate with a clean finish, fruit that tastes like fruit.</p>
      <h2>Flavours first</h2><p>We start with six classics and build outward: take-home tubs for the freezer, signature sundaes for an occasion, and a sundae builder for the moods in between. Every flavour is described honestly, so you know what you are getting before you order.</p>
      <h2>A note on what this is</h2><p>SCOOPÉ is a fictional brand created as a portfolio project. The shop is fully working, but it is a demonstration: no real payment is collected, nothing is produced and nothing is delivered. Ingredient and allergen details are demonstration copy and are not verified or certified.</p>
      <p><a class="btn" href="/shop">Discover Our Flavours</a></p>`),
  },
  contact: {
    title: 'Contact', description: 'Get in touch with SCOOPÉ.',
    render: ({ settings }) => wrap('Contact', 'Questions, ideas, a flavour you would like to see? Write to us.',
      `<div class="contact"><form class="contact__form" data-contact novalidate>
        <label class="field"><span class="field__label">Your name</span><input name="name" maxlength="80" autocomplete="name" required></label>
        <label class="field"><span class="field__label">Email address</span><input type="email" name="email" maxlength="254" autocomplete="email" required></label>
        <label class="field"><span class="field__label">Message</span><textarea name="message" rows="6" maxlength="2000" required></textarea></label>
        <button class="btn" type="submit">Send message</button><p class="buy__msg" data-contact-msg role="status"></p>
        <p class="pdp__demo">Demo site: your message is stored locally and nobody will reply.</p></form>
        <div class="contact__info"><h2>Details</h2><p>${esc(settings.contact?.email || '')}<br>${esc(settings.contact?.phone || '')}<br>${esc(settings.contact?.address || '')}</p>
        <h2>Hours</h2><p>${esc(settings.operatingHours?.open || '10:00')} to ${esc(settings.operatingHours?.close || '21:00')}, every day.</p><p class="pdp__demo">Fictional contact details.</p></div></div>`),
  },
  privacy: {
    title: 'Privacy Policy', description: 'How the SCOOPÉ demonstration site handles your information.',
    render: () => wrap('Privacy Policy', 'Plain language, because this is a demonstration site.',
      `<h2>What we store</h2><p>If you create an account or place an order we store your name, email, phone number, delivery address and order details so the site can show you your orders. Passwords are never stored: only a salted scrypt hash. If you subscribe to the newsletter or send a message, we store that too.</p>
      <h2>What we do not do</h2><p>No payments are collected, so no card or bank details are ever requested or stored. We do not sell data, run advertising trackers or send email: subscriptions and messages are kept on this demo site only.</p>
      <h2>Cookies and storage</h2><p>One essential cookie keeps you signed in (HTTP-only, not readable by scripts). Your bag, applied discount code and chosen delivery area are kept in your browser's local storage.</p>
      <h2>Your choices</h2><p>You can unsubscribe from the newsletter with the link shown when you subscribe. Because this is a demonstration, data may be reset at any time.</p>`),
  },
  terms: {
    title: 'Terms and Conditions', description: 'Terms of use for the SCOOPÉ demonstration site.',
    render: () => wrap('Terms and Conditions', 'Please read before using the demonstration store.',
      `<h2>A demonstration</h2><p>SCOOPÉ is a fictional brand. Orders placed here are simulated: no money changes hands, no goods are made or delivered, and order statuses advance automatically for demonstration.</p>
      <h2>Pricing</h2><p>Prices are in Nigerian naira (₦) and are shown for demonstration only. Totals are always calculated by the server when you check out; a price you saw earlier may change.</p>
      <h2>Accounts and rewards</h2><p>Rewards points have no cash value and may be reset. You are responsible for keeping your password private.</p>
      <h2>Acceptable use</h2><p>Please do not attempt to disrupt the site or submit harmful content. Reviews should be honest and about the product.</p>`),
  },
  'delivery-and-refunds': {
    title: 'Delivery and Refunds', description: 'Delivery areas, fees and how cancellations and refunds work on the SCOOPÉ demo.',
    render: () => wrap('Delivery and Refunds', 'How a SCOOPÉ order would work, if it were real.',
      `<h2>Delivery areas and fees</h2><p>Delivery is priced by zone (for example ₦1,500, ₦2,500 and ₦3,500) and you choose your area at checkout. A minimum order applies. Estimated delivery windows are shown on your order and are indicative only.</p>
      <h2>Cancellations</h2><p>You can cancel an order from its tracking page until it starts preparing. Unpaid orders are released automatically after 30 minutes.</p>
      <h2>Refunds</h2><p>Cancelling a paid order records a simulated refund and returns any rewards points used. Because no real payment is taken, no money is ever moved.</p>
      <h2>Demonstration notice</h2><p>There is no kitchen, rider or GPS tracking behind this site. Order progress is a timed simulation.</p>`),
  },
};
