'use strict';
// Fictional demonstration data. Prices are NGN integers (whole naira).
// Ingredient and allergen lists are demo copy for a fictional brand: not verified or certified.

const D = (n) => new Date(Date.UTC(2026, 0, 1 + n)).toISOString();
const CATS = [
  ['classic-scoops', 'Classic scoops', 'Six signature flavours, scooped to order.'],
  ['take-home-tubs', 'Take-home tubs', 'Generous tubs for the freezer at home.'],
  ['signature-sundaes', 'Signature sundaes', 'Composed desserts, finished with sauce and crunch.'],
  ['cones-combinations', 'Cones and combinations', 'Choose your cone and how many scoops.'],
  ['gift-collections', 'Gift collections', 'Boxed sets for birthdays, thank-yous and celebrations.'],
];

let n = 0;
function P(slug, name, category, price, description, o = {}) {
  n += 1;
  const nuts = o.nuts ? ['nuts'] : [];
  return {
    id: `prod_${slug}`, slug, name, description, category, price,
    images: [{ assetId: `product-${slug}`, alt: o.alt || name }],
    sizes: o.sizes || [{ id: 'regular', label: 'Regular', priceDelta: 0 }],
    variants: o.variants || [],
    ingredients: o.ingredients || ['Milk', 'Cream', 'Sugar'],
    allergens: [...new Set(['milk', ...(o.allergens || []), ...nuts])],
    flavourNotes: o.notes || [],
    available: o.available !== false,
    featured: Boolean(o.featured), bestseller: Boolean(o.best), archived: false,
    popularity: o.pop ?? 50, related: o.related || [],
    createdAt: D(n), updatedAt: D(n),
  };
}
const coneFirst = [{ id: 'cone', label: 'On a waffle cone', priceDelta: 0 }, { id: 'cup', label: 'In a cup', priceDelta: -500 }];
const scoopVariants = [{ id: 'cup', label: 'In a cup', priceDelta: 0 }, { id: 'cone', label: 'On a waffle cone', priceDelta: 500 }];
const tubSizes = [{ id: '500ml', label: '500 ml', priceDelta: 0 }, { id: '1l', label: '1 litre', priceDelta: 5500 }];

function products() {
  n = 0;
  return [
    P('vanilla-bean', 'Vanilla Bean', 'classic-scoops', 2800, 'Slow-infused vanilla in a soft, floral cream base. The one every other flavour is measured against.', { asset: 'flavour-vanilla', variants: scoopVariants, notes: ['Floral', 'Creamy', 'Warm'], ingredients: ['Milk', 'Cream', 'Sugar', 'Vanilla beans'], pop: 90, best: true, featured: true }),
    P('belgian-chocolate', 'Belgian Chocolate', 'classic-scoops', 3200, 'Deep, bittersweet cocoa with a clean finish and no cloying edge.', { asset: 'flavour-chocolate', variants: scoopVariants, notes: ['Bittersweet', 'Cocoa', 'Smooth'], ingredients: ['Milk', 'Cream', 'Sugar', 'Dark chocolate', 'Cocoa'], pop: 95, best: true, featured: true }),
    P('strawberry-bliss', 'Strawberry Bliss', 'classic-scoops', 3000, 'Bright strawberries folded into cold cream, tasting of the fruit and not the sweet.', { asset: 'flavour-strawberry', variants: scoopVariants, notes: ['Bright', 'Fruity', 'Fresh'], ingredients: ['Milk', 'Cream', 'Sugar', 'Strawberries'], pop: 80, featured: true }),
    P('salted-caramel', 'Salted Caramel', 'classic-scoops', 3200, 'Burnt-sugar caramel ribboned through cream with a pinch of sea salt.', { asset: 'flavour-salted-caramel', variants: scoopVariants, notes: ['Toasty', 'Salty-sweet', 'Rich'], ingredients: ['Milk', 'Cream', 'Sugar', 'Sea salt'], pop: 85, best: true }),
    P('cookies-and-cream', 'Cookies & Cream', 'classic-scoops', 3000, 'Crisp chocolate biscuit crushed through sweet vanilla cream.', { asset: 'flavour-cookies-cream', variants: scoopVariants, allergens: ['gluten'], notes: ['Crunchy', 'Sweet', 'Nostalgic'], ingredients: ['Milk', 'Cream', 'Sugar', 'Chocolate biscuit (wheat)'], pop: 75 }),
    P('pistachio-dream', 'Pistachio Dream', 'classic-scoops', 3500, 'Gentle, nutty and a little green: pistachio taken seriously.', { asset: 'flavour-pistachio', variants: scoopVariants, nuts: true, notes: ['Nutty', 'Gentle', 'Silky'], ingredients: ['Milk', 'Cream', 'Sugar', 'Pistachios'], pop: 70, featured: true }),

    P('vanilla-family-tub', 'Vanilla Family Tub', 'take-home-tubs', 9500, 'Our Vanilla Bean, packed for sharing and for the second helping.', { asset: 'tubs', sizes: tubSizes, notes: ['Floral', 'Creamy'], pop: 65 }),
    P('chocolate-lovers-tub', 'Chocolate Lovers Tub', 'take-home-tubs', 11000, 'Belgian Chocolate with chocolate chips, for people who mean it.', { asset: 'tubs', sizes: tubSizes, notes: ['Bittersweet', 'Chunky'], ingredients: ['Milk', 'Cream', 'Sugar', 'Dark chocolate', 'Cocoa'], pop: 72, best: true }),
    P('strawberry-collection', 'Strawberry Collection', 'take-home-tubs', 10500, 'Strawberry Bliss with a swirl of strawberry sauce through the middle.', { asset: 'tubs', sizes: tubSizes, notes: ['Fruity', 'Swirled'], pop: 55 }),
    P('signature-mixed-tub', 'Signature Mixed Tub', 'take-home-tubs', 14500, 'Three of our best flavours side by side: vanilla, chocolate and strawberry.', { asset: 'tubs', sizes: tubSizes, notes: ['Variety', 'Crowd-pleaser'], pop: 78, featured: true }),

    P('chocolate-obsession', 'Chocolate Obsession', 'signature-sundaes', 7500, 'Chocolate ice cream, warm chocolate sauce, brownie pieces and whipped cream in a tall glass.', { asset: 'sundae', allergens: ['gluten'], notes: ['Decadent', 'Warm and cold'], pop: 88, best: true, featured: true }),
    P('berry-dream', 'Berry Dream', 'signature-sundaes', 6800, 'Strawberry and vanilla scoops under berry sauce and fresh strawberries.', { asset: 'sundae', notes: ['Fresh', 'Tart-sweet'], pop: 68 }),
    P('caramel-crunch', 'Caramel Crunch', 'signature-sundaes', 7000, 'Salted caramel ice cream, caramel sauce and a crunch of toasted nuts.', { asset: 'sundae', nuts: true, notes: ['Crunchy', 'Buttery'], pop: 74 }),
    P('pistachio-indulgence', 'Pistachio Indulgence', 'signature-sundaes', 8200, 'Pistachio ice cream with vanilla, chopped pistachios and a ribbon of cream.', { asset: 'sundae', nuts: true, notes: ['Nutty', 'Elegant'], pop: 60 }),

    P('classic-waffle-cone', 'Classic Waffle Cone', 'cones-combinations', 3300, 'One scoop of any classic flavour on a freshly crisped waffle cone.', { asset: 'waffle-cones', allergens: ['gluten'], variants: [{ id: 'vanilla', label: 'Vanilla Bean', priceDelta: 0 }, { id: 'chocolate', label: 'Belgian Chocolate', priceDelta: 400 }, { id: 'strawberry', label: 'Strawberry Bliss', priceDelta: 200 }], pop: 82 }),
    P('double-scoop', 'Double Scoop', 'cones-combinations', 5900, 'Two scoops, two flavours, in a cup or on a cone.', { asset: 'waffle-cones', variants: coneFirst, pop: 79 }),
    P('triple-scoop', 'Triple Scoop', 'cones-combinations', 7900, 'Three scoops for the undecided. Cone or cup.', { asset: 'waffle-cones', variants: coneFirst, pop: 58 }),

    P('the-sweet-box', 'The Sweet Box', 'gift-collections', 18000, 'Four 150 ml pots of our favourite flavours in an insulated gift box.', { asset: 'gift-box', notes: ['Giftable', 'Variety'], pop: 62 }),
    P('celebration-collection', 'Celebration Collection', 'gift-collections', 32000, 'Two tubs, six scoops of sundae toppings and a handwritten-style card.', { asset: 'gift-box', available: true, notes: ['Celebratory'], pop: 66 }),
    P('the-scoope-experience', 'The SCOOPÉ Experience', 'gift-collections', 55000, 'Our fullest gift: tubs, sundae kit, sauces and a message card, packed for a proper occasion.', { asset: 'gift-box', notes: ['Premium', 'Complete'], pop: 52, featured: true }),
  ];
}

function buildSeeds() {
  const prods = products();
  const stock = { 'pistachio-indulgence': 6, 'celebration-collection': 0 };
  return {
    categories: CATS.map(([slug, name, description], i) => ({ id: `cat_${slug}`, slug, name, description, sort: i })),
    products: prods,
    inventory: prods.map((p) => ({
      id: `inv_${p.slug}`, productId: p.id,
      onHand: stock[p.slug] ?? 40, reserved: 0, lowStockThreshold: 8,
    })),
    'delivery-zones': [
      { id: 'zone_a', name: 'Zone A', fee: 1500, etaMinutes: 20, areas: ['Victoria Island', 'Ikoyi', 'Lekki Phase 1'], active: true },
      { id: 'zone_b', name: 'Zone B', fee: 2500, etaMinutes: 35, areas: ['Yaba', 'Surulere', 'Ikeja GRA', 'Maryland'], active: true },
      { id: 'zone_c', name: 'Zone C', fee: 3500, etaMinutes: 50, areas: ['Ajah', 'Ikorodu', 'Festac'], active: true },
    ],
    coupons: [
      { id: 'cpn_welcome10', code: 'WELCOME10', type: 'percent', value: 10, active: true, minOrder: 5000, maxUses: 500, used: 0, expiresAt: null, createdAt: D(0), updatedAt: D(0) },
    ],
    settings: {
      storeName: 'SCOOPÉ', currency: 'NGN', tagline: 'A little moment of indulgence.',
      announcement: 'Demonstration store. No real payments are taken.',
      contact: { email: 'hello@scoope.example', phone: '+234 000 000 0000', address: 'Lagos, Nigeria (fictional)' },
      seasonal: { visible: true, label: 'Flavour of the Month', headline: 'Pistachio season', blurb: 'Two ways into our gentlest green flavour: the scoop on its own, or the full sundae.', productSlugs: ['pistachio-dream', 'pistachio-indulgence'], expiresAt: null },
      deliveryEnabled: true, minimumOrder: 3000, prepMinutes: 25, dailyOrderLimit: 150,
      operatingHours: { open: '10:00', close: '21:00' },
      builder: {
        maxScoops: 4, scoopPrice: 2800,
        bases: [{ id: 'cup', label: 'Cup', price: 0 }, { id: 'waffle-cone', label: 'Waffle cone', price: 500 }, { id: 'sundae-glass', label: 'Sundae glass', price: 1000 }],
        toppings: [{ id: 'chocolate-chips', label: 'Chocolate chips', price: 400 }, { id: 'crushed-biscuits', label: 'Crushed biscuits', price: 400 }, { id: 'sprinkles', label: 'Sprinkles', price: 300 }, { id: 'chopped-nuts', label: 'Chopped nuts', price: 500 }, { id: 'fresh-strawberries', label: 'Fresh strawberries', price: 600 }, { id: 'whipped-cream', label: 'Whipped cream', price: 400 }],
        sauces: [{ id: 'chocolate', label: 'Chocolate', price: 400 }, { id: 'caramel', label: 'Caramel', price: 400 }, { id: 'strawberry', label: 'Strawberry', price: 400 }, { id: 'berry', label: 'Berry', price: 450 }],
        extras: [{ id: 'brownie-bites', label: 'Brownie bites', price: 700 }, { id: 'cookie-crumb', label: 'Cookie crumb', price: 500 }],
      },
    },
  };
}

module.exports = { buildSeeds };
