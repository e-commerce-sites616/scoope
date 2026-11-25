import { initNav } from './nav.js';
import { initBag } from './bag.js';
import { initImages } from './images.js';
import { initFlavours } from './flavours.js';
import { hydrateArt } from './art.js';
import { initShop } from './shop.js';
import { initProduct } from './product.js';
import { initScrub } from './scrub.js';
import { initCart } from './cart.js';
import { initBuilder } from './builder.js';
import { initAccount } from './account.js';
import { initCheckout } from './checkout.js';
import { initPay } from './pay.js';
import { initTrack } from './track.js';
import { initGift, initReviews, initForms } from './engage.js';
import { initMotion } from './reveal.js';

initNav(); initBag(); hydrateArt(); initImages(); initFlavours(); initShop(); initProduct();
initScrub(); initCart(); initBuilder(); initAccount(); initCheckout(); initPay(); initTrack();
initGift(); initReviews(); initForms(); initMotion();

// Trigger the hero entrance once layout has settled.
requestAnimationFrame(() => requestAnimationFrame(() => document.documentElement.classList.add('is-ready')));
