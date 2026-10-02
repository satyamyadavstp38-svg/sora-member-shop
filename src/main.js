import './style.css';
import './storefront.css';
import { supabase, supabaseReady } from './supabase.js';
import { sampleSellers, sampleProducts, sampleOrders, sampleFeedback, sampleSupportRequests } from './data.js';

const root = document.querySelector('#app');
const state = {
  user: null,
  session: null,
  demo: false,
  isAdmin: false,
  view: 'discover',
  adminTab: 'members',
  adminSellerFilter: 'ALL',
  adminMemberFilter: 'ALL',
  members: [],
  membersError: '',
  products: [...sampleProducts],
  sellers: [...sampleSellers],
  orders: [],
  feedback: [],
  supportRequests: [],
  query: '',
  searchCategory: 'ALL',
  category: 'ALL',
  sellerFilter: 'ALL',
  sortBy: 'featured',
  minPrice: '',
  maxPrice: '',
  priceRange: 'ALL',
  modal: null,
  authMessage: '',
  authEmail: '',
  authStep: 'email',
  authMode: 'member',
  authStatus: '',
  authStatusType: '',
  adminDenied: false,
  pendingProductId: '',
  selectedProductId: '',
  selectedSupportOrderId: '',
  toastTimer: null,
};

function esc(value = '') {
  return String(value).replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[char]));
}

function initials(label = 'S') {
  return label.trim().split(/[\s@._-]+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase() || 'S';
}

function dateLabel(value) {
  if (!value) return '—';
  const date = new Date(`${String(value).slice(0, 10)}T12:00:00`);
  if (Number.isNaN(date.getTime())) return esc(value);
  return new Intl.DateTimeFormat('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }).format(date);
}

function timeLabel(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return esc(value);
  return new Intl.DateTimeFormat('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata',
  }).format(date);
}

function amountLabel(value, currency = 'INR') {
  if (value === null || value === undefined || value === '') return 'Not added';
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 'Not added';
  try {
    return new Intl.NumberFormat('en-IN', { style: 'currency', currency: String(currency || 'INR').trim(), maximumFractionDigits: 2 }).format(numeric);
  } catch {
    return `₹${numeric.toFixed(2)}`;
  }
}

function currentEmail() {
  if (state.demo) return state.isAdmin ? 'Admin preview' : 'Member preview';
  return state.user?.email || 'Guest';
}

function sellerNameFor(id, fallback = '') {
  return state.sellers.find((seller) => seller.id === id)?.name || fallback || 'Seller';
}

function productById(id) {
  return state.products.find((product) => product.id === id);
}

function showToast(message) {
  let toast = document.querySelector('.toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.className = 'toast';
    toast.setAttribute('role', 'status');
    document.body.appendChild(toast);
  }
  toast.textContent = message;
  toast.classList.add('toast-visible');
  window.clearTimeout(state.toastTimer);
  state.toastTimer = window.setTimeout(() => toast.classList.remove('toast-visible'), 3600);
}

function friendlyAuthError(error) {
  const raw = String(error?.message || error || '').trim();
  const message = raw.toLowerCase();
  if (message.includes('invalid path specified') || message.includes('invalid path')) {
    return 'The Supabase Project URL in Vercel includes an extra path. Use only the root URL, like https://your-project.supabase.co, without /rest/v1 or /auth/v1, then redeploy.';
  }
  if (message.includes('otp_expired') || message.includes('invalid token') || message.includes('invalid otp') || message.includes('token has expired')) {
    return 'That code is incorrect or expired. Check the newest email or request a fresh code.';
  }
  if (message.includes('redirect') || message.includes('callback url')) {
    return 'This website address is not approved in Supabase Authentication → URL Configuration. Ask the store owner to check the allowed URLs.';
  }
  if (message.includes('rate limit') || message.includes('too many requests')) {
    return 'Email sign-in is temporarily rate-limited. Try again later; the store owner may need to configure a custom SMTP sender in Supabase.';
  }
  if (message.includes('invalid api key') || message.includes('apikey') || message.includes('unauthorized')) {
    return 'The sign-in connection is misconfigured. The store owner should check the Vercel Supabase URL and public key, then redeploy.';
  }
  if (message.includes('failed to fetch') || message.includes('network')) {
    return 'Could not reach the sign-in service. Check your internet connection and try again.';
  }
  if (message.includes('user not found') || message.includes('signups not allowed')) {
    return 'This email is not registered for Admin access. Use the allow-listed owner account.';
  }
  return raw || 'We could not complete sign-in. Check the details and try again.';
}

function authStatusMarkup(id) {
  const statusClass = state.authStatusType === 'error' ? 'status-error' : state.authStatusType === 'success' ? 'status-success' : '';
  return `<p id="${id}" class="form-status ${statusClass}" data-auth-status role="status" aria-live="polite" aria-atomic="true">${esc(state.authStatus)}</p>`;
}

function renderOtpForm(mode = 'member') {
  const isAdmin = mode === 'admin';
  const prefix = isAdmin ? 'admin' : 'member';
  if (!supabaseReady) {
    if (import.meta.env.DEV && !isAdmin) {
      return `<div class="demo-callout"><span class="demo-pulse"></span><div><strong>Demo preview is active</strong><small>Real email-code sign-in is enabled after Supabase setup.</small></div></div><button type="button" class="button button-dark button-wide" data-demo-entry="member">Continue as demo member ↗</button>`;
    }
    return `<div class="auth-setup-notice" role="status"><span aria-hidden="true">◌</span><div><strong>${isAdmin ? 'Admin sign-in is not configured' : 'Sign-in is not configured yet'}</strong><small>The store owner needs to connect Supabase and deploy the site before email codes can be sent.</small></div></div>`;
  }

  if (state.authMode === mode && state.authStep === 'otp' && state.authEmail) {
    return `<form id="${prefix}-verify-otp-form" class="portal-form signin-form otp-form" data-auth-stage="verify-otp" data-auth-mode="${mode}"><label for="${prefix}-otp-code">Six-digit email code</label><input id="${prefix}-otp-code" name="token" type="text" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{6}" minlength="6" maxlength="6" placeholder="000000" required aria-describedby="${prefix}-auth-status"><p class="otp-destination">Sent to <strong>${esc(state.authEmail)}</strong></p>${authStatusMarkup(`${prefix}-auth-status`)}<button class="button button-dark button-wide" type="submit"><span>Verify code and continue</span><span aria-hidden="true">↗</span></button><div class="otp-secondary-actions"><button type="button" data-resend-otp data-auth-mode="${mode}">Send a new code</button><button type="button" data-change-email data-auth-mode="${mode}">Use a different email</button></div></form>`;
  }

  const emailId = `${prefix}-auth-email`;
  return `<form id="${prefix}-request-otp-form" class="portal-form signin-form" data-auth-stage="request-otp" data-auth-mode="${mode}"><label for="${emailId}">Email address</label><input id="${emailId}" name="email" type="email" inputmode="email" autocomplete="email" autocapitalize="none" spellcheck="false" placeholder="you@example.com" value="${esc(state.authEmail)}" required>${authStatusMarkup(`${prefix}-auth-status`)}<button class="button button-dark button-wide" type="submit"><span>Send one-time code</span><span aria-hidden="true">↗</span></button><p class="auth-footnote">We’ll email you a six-digit code. Enter the code here to sign in—no link click and no password.</p></form>`;
}

async function requestEmailOtp(form) {
  const email = new FormData(form).get('email')?.toString().trim();
  const mode = form.dataset.authMode === 'admin' ? 'admin' : 'member';
  const button = form.querySelector('button[type="submit"]');
  if (!email || !supabase || !button) return;

  state.authMode = mode;
  state.authEmail = email;
  state.authStatus = '';
  state.authStatusType = '';
  button.disabled = true;
  button.setAttribute('aria-busy', 'true');
  button.innerHTML = '<span>Sending code…</span><span aria-hidden="true">·</span>';
  try {
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { shouldCreateUser: mode !== 'admin' },
    });
    if (error) {
      state.authStatus = friendlyAuthError(error);
      state.authStatusType = 'error';
      state.authStep = 'email';
    } else {
      state.authStep = 'otp';
      state.authStatus = `A six-digit code was sent to ${email}. Enter the newest code below.`;
      state.authStatusType = 'success';
    }
  } catch (error) {
    state.authStatus = friendlyAuthError(error);
    state.authStatusType = 'error';
    state.authStep = 'email';
  } finally {
    button.disabled = false;
    button.removeAttribute('aria-busy');
    button.innerHTML = '<span>Send one-time code</span><span aria-hidden="true">↗</span>';
  }
  render();
  if (state.authStep === 'otp') document.querySelector(`#${mode === 'admin' ? 'admin' : 'member'}-otp-code`)?.focus();
}

async function resendEmailOtp(button) {
  const mode = button.dataset.authMode === 'admin' ? 'admin' : 'member';
  if (!supabase || !state.authEmail) return;
  button.disabled = true;
  button.textContent = 'Sending…';
  try {
    const { error } = await supabase.auth.signInWithOtp({
      email: state.authEmail,
      options: { shouldCreateUser: mode !== 'admin' },
    });
    state.authStatus = error ? friendlyAuthError(error) : `A fresh code was sent to ${state.authEmail}. Use that newest code.`;
    state.authStatusType = error ? 'error' : 'success';
  } catch (error) {
    state.authStatus = friendlyAuthError(error);
    state.authStatusType = 'error';
  }
  state.authStep = 'otp';
  render();
  document.querySelector(`#${mode === 'admin' ? 'admin' : 'member'}-otp-code`)?.focus();
}

async function verifyEmailOtp(form) {
  const mode = form.dataset.authMode === 'admin' ? 'admin' : 'member';
  const token = new FormData(form).get('token')?.toString().replace(/\s/g, '') || '';
  const status = form.querySelector('[data-auth-status]');
  const button = form.querySelector('button[type="submit"]');
  if (!supabase || !state.authEmail || !button) return;
  if (!/^\d{6}$/.test(token)) {
    if (status) { status.textContent = 'Enter the six-digit code from your latest email.'; status.classList.add('status-error'); }
    return;
  }

  button.disabled = true;
  button.setAttribute('aria-busy', 'true');
  button.innerHTML = '<span>Checking code…</span><span aria-hidden="true">·</span>';
  if (status) { status.textContent = ''; status.classList.remove('status-error', 'status-success'); }
  try {
    const { data, error } = await supabase.auth.verifyOtp({
      email: state.authEmail,
      token,
      type: 'email',
    });
    if (error) {
      if (status) { status.textContent = friendlyAuthError(error); status.classList.add('status-error'); }
      return;
    }

    state.session = data.session;
    state.user = data.user || data.session?.user || null;
    state.modal = null;
    state.authStep = 'email';
    state.authStatus = '';
    state.authStatusType = '';
    if (state.user) await loadWorkspace();

    if (mode === 'admin' && !state.isAdmin) {
      state.adminDenied = true;
      await supabase.auth.signOut();
      state.user = null;
      state.session = null;
      state.isAdmin = false;
      state.authMode = 'admin';
      state.authEmail = '';
      state.authStep = 'email';
      state.authStatus = 'This email is not allow-listed for Admin. Sign in with the authorized owner account.';
      state.authStatusType = 'error';
    } else {
      state.adminDenied = false;
      state.authEmail = '';
      showToast(mode === 'admin' ? 'Admin access confirmed.' : 'You are signed in.');
    }
    render();
  } catch (error) {
    if (status) { status.textContent = friendlyAuthError(error); status.classList.add('status-error'); }
  } finally {
    button.disabled = false;
    button.removeAttribute('aria-busy');
    button.innerHTML = '<span>Verify code and continue</span><span aria-hidden="true">↗</span>';
  }
}

function isAdminRoute() {
  return window.location.pathname.replace(/\/+$/, '') === '/admin';
}

function openMemberSignIn(message) {
  state.authMessage = message || 'Access your account to continue.';
  state.authMode = 'member';
  state.authStep = 'email';
  state.authEmail = '';
  state.authStatus = '';
  state.authStatusType = '';
  state.modal = { type: 'signin' };
  render();
}

function filteredProducts() {
  const query = state.query.trim().toLowerCase();
  const min = state.minPrice === '' ? null : Number(state.minPrice);
  const max = state.maxPrice === '' ? null : Number(state.maxPrice);
  const products = state.products.filter((product) => {
    if (product.is_active === false || state.sellers.find((seller) => seller.id === product.seller_id)?.is_active === false) return false;
    const category = (product.category || 'GENERAL').toUpperCase();
    const categoryMatch = state.category === 'ALL' || category === state.category;
    const searchCategoryMatch = state.searchCategory === 'ALL' || category === state.searchCategory;
    const seller = sellerNameFor(product.seller_id, product.seller_name);
    const sellerMatch = state.sellerFilter === 'ALL' || product.seller_id === state.sellerFilter;
    const queryMatch = !query || `${product.name} ${category} ${product.description} ${seller}`.toLowerCase().includes(query);
    const price = product.price_amount === null || product.price_amount === undefined || product.price_amount === '' ? Number.NaN : Number(product.price_amount);
    const minMatch = min === null || (!Number.isNaN(price) && price >= min);
    const maxMatch = max === null || (!Number.isNaN(price) && price <= max);
    return categoryMatch && searchCategoryMatch && sellerMatch && queryMatch && minMatch && maxMatch;
  });
  if (state.sortBy === 'name') products.sort((a,b) => a.name.localeCompare(b.name));
  else if (state.sortBy === 'price-low') products.sort((a,b) => (Number(a.price_amount) || Infinity) - (Number(b.price_amount) || Infinity));
  else if (state.sortBy === 'price-high') products.sort((a,b) => (Number(b.price_amount) || 0) - (Number(a.price_amount) || 0));
  else if (state.sortBy === 'seller') products.sort((a,b) => sellerNameFor(a.seller_id, a.seller_name).localeCompare(sellerNameFor(b.seller_id, b.seller_name)));
  else products.sort((a,b) => Number(Boolean(b.featured)) - Number(Boolean(a.featured)) || Number(a.sort_order || 0) - Number(b.sort_order || 0));
  return products;
}

function safeHttps(value) {
  if (!value) return '';
  try {
    const url = new URL(value);
    return url.protocol === 'https:' ? url.href : '';
  } catch { return ''; }
}

function safeImageSrc(value) {
  if (value && value.startsWith('/') && !value.startsWith('//')) return value;
  return safeHttps(value || '');
}

function artMarkup(product, index) {
  const image = safeImageSrc(product.image_url || '');
  if (image) return `<div class="product-art product-photo"><img src="${esc(image)}" alt="${esc(product.name)}" loading="lazy"><span class="art-number">S / ${String(index + 1).padStart(2, '0')}</span></div>`;
  const variants = ['lamp', 'bottle', 'mat', 'audio', 'ceramic', 'tote'];
  const variant = variants.includes(product.art_variant) ? product.art_variant : variants[index % variants.length];
  return `<div class="product-art art-${esc(variant)}" aria-hidden="true"><div class="art-sheen"></div><div class="art-orbit"></div><div class="art-object"><i></i><b></b></div><span class="art-number">S / ${String(index + 1).padStart(2, '0')}</span><span class="art-tag">SORA SELECT</span></div>`;
}

function renderProductCards(products = filteredProducts()) {
  if (!products.length) return `<div class="empty-state empty-search"><span class="empty-icon">⌕</span><h3>No products match those filters.</h3><p>Try changing your category, seller, or price range.</p><button type="button" class="button button-outline" data-clear-filters>Clear filters</button></div>`;
  return products.map((product, index) => {
    const seller = sellerNameFor(product.seller_id, product.seller_name);
    const soldOut = product.stock_status === 'sold_out';
    const badge = soldOut ? 'SOLD OUT' : product.featured ? 'FEATURED' : (product.category || 'SELECTED');
    const purchaseAction = soldOut
      ? `<button type="button" class="buy-button sold-out-button" disabled aria-disabled="true">Sold out</button>`
      : `<button type="button" class="buy-button" data-product-link="${esc(product.id)}">Buy now <span aria-hidden="true">↗</span></button>`;
    return `<article class="market-product-card"><div class="market-product-media">${artMarkup(product,index)}<span class="market-product-badge ${soldOut ? 'sold-out' : ''}">${esc(badge)}</span></div><div class="market-product-info"><div class="market-seller-line"><span class="seller-avatar-mini">${esc(initials(seller))}</span><span>${esc(seller)}</span></div><h3>${esc(product.name)}</h3><p class="market-product-description">${esc(product.description || 'A carefully selected product from one of our sellers.')}</p><div class="market-price-row"><strong>${esc(product.price_label || 'See seller for current price')}</strong><span>${soldOut ? 'Currently unavailable' : 'Price may change'}</span></div><div class="market-product-actions">${purchaseAction}<button type="button" class="record-order-link" data-add-order="${esc(product.id)}">Already bought? Add order details</button></div></div></article>`;
  }).join('');
}

function renderDiscover() {
  const activeProducts = state.products.filter((product) => product.is_active !== false && state.sellers.find((seller) => seller.id === product.seller_id)?.is_active !== false);
  const categories = ['ALL', ...new Set(activeProducts.map((product) => (product.category || 'GENERAL').toUpperCase()))];
  const sellers = state.sellers.filter((seller) => seller.is_active !== false);
  const visibleProducts = filteredProducts();
  const categoryIcons = { ALL: '✦', HOME: '⌂', TECH: '◉', EVERYDAY: '◇', WORKSPACE: '▤' };
  const categoryTiles = categories.filter((category) => category !== 'ALL').slice(0, 6).map((category) => `<button type="button" class="category-tile ${state.category === category ? 'selected' : ''}" data-category="${esc(category)}"><span class="category-tile-icon">${categoryIcons[category] || '✦'}</span><strong>${esc(category)}</strong><small>Explore collection</small></button>`).join('');
  const previewNote = state.demo ? `<div class="preview-store-note"><span>DEMO STORE</span><p>Sample catalogue and prices for preview only. Replace them with your real seller listings before launch.</p></div>` : '';
  const categoryOptions = categories.map((category) => `<option value="${esc(category)}" ${state.category === category ? 'selected' : ''}>${esc(category === 'ALL' ? 'All categories' : category)}</option>`).join('');
  const sellerOptions = `<option value="ALL" ${state.sellerFilter === 'ALL' ? 'selected' : ''}>All sellers</option>${sellers.map((seller) => `<option value="${esc(seller.id)}" ${state.sellerFilter === seller.id ? 'selected' : ''}>${esc(seller.name)}</option>`).join('')}`;
  const priceOptions = [
    ['ALL', 'Any price'], ['0-499', 'Under ₹500'], ['500-999', '₹500–₹999'], ['1000-2499', '₹1,000–₹2,499'], ['2500-', '₹2,500 and up'], ['CUSTOM', 'Custom range'],
  ].map(([value, label]) => `<option value="${value}" ${state.priceRange === value ? 'selected' : ''}>${label}</option>`).join('');
  const customPrice = state.priceRange === 'CUSTOM' ? `<div class="custom-price-row"><label><span>Min ₹</span><input type="number" min="0" id="min-price" value="${esc(state.minPrice)}" placeholder="No min"></label><label><span>Max ₹</span><input type="number" min="0" id="max-price" value="${esc(state.maxPrice)}" placeholder="No max"></label><button type="button" class="apply-filter" data-apply-price>Apply</button></div>` : '';
  return `${previewNote}
    <section class="shop-section catalog-first" id="catalog-section">
      <div class="catalog-topline"><div><span class="market-eyebrow">SORA MARKET / DISCOVER</span><h1>Shop all products</h1><p>Thoughtful finds from independent sellers. Choose a product to continue to its seller’s own checkout.</p></div><div class="catalog-trust"><span>↗</span><div><strong>Checkout direct with sellers</strong><small>Order details stay in your private account</small></div></div></div>
      <div class="catalog-filter-row"><div class="filter-results-count"><strong id="result-count">${visibleProducts.length}</strong><span>products</span></div><label class="compact-filter">Category<select id="filter-category">${categoryOptions}</select></label><label class="compact-filter">Seller<select id="filter-seller">${sellerOptions}</select></label><label class="compact-filter">Price range<select id="filter-price">${priceOptions}</select></label><label class="compact-filter compact-sort">Sort<select id="sort-products"><option value="featured" ${state.sortBy==='featured'?'selected':''}>Recommended</option><option value="name" ${state.sortBy==='name'?'selected':''}>Name A–Z</option><option value="price-low" ${state.sortBy==='price-low'?'selected':''}>Price: low to high</option><option value="price-high" ${state.sortBy==='price-high'?'selected':''}>Price: high to low</option><option value="seller" ${state.sortBy==='seller'?'selected':''}>Seller</option></select></label><button type="button" class="catalog-clear-button" data-clear-filters>Reset</button></div>
      ${customPrice}<div class="product-grid market-product-grid" id="product-grid">${renderProductCards(visibleProducts)}</div><div class="shop-disclaimer">Prices and stock can change. Confirm the current details, delivery, and returns on the seller’s website. SORA does not process payment.</div>
    </section>
    <div class="shop-benefits"><div><span class="benefit-icon">↗</span><span><strong>Shop direct</strong><small>Checkout on each seller’s site</small></span></div><div><span class="benefit-icon">⌑</span><span><strong>Your own account</strong><small>Private order and support history</small></span></div><div><span class="benefit-icon">✳</span><span><strong>Member support</strong><small>Help for order questions</small></span></div></div>
    <section class="category-section"><div class="market-section-heading"><div><span class="market-eyebrow">SHOP BY CATEGORY</span><h2>Explore a collection</h2></div><button type="button" class="market-text-button" data-shop-tab>View all products <span>→</span></button></div><div class="category-tiles">${categoryTiles || `<div class="category-empty">Product categories will appear here.</div>`}</div></section>
    <section class="market-hero"><div class="market-hero-content"><span class="market-hero-eyebrow"><i></i> SORA MARKET · INDEPENDENT FINDS</span><h2>Good finds for<br><em>everyday living.</em></h2><p>Discover thoughtfully selected products from independent sellers, all in one place.</p><button class="market-hero-button" type="button" data-shop-tab>Explore the collection <span>→</span></button><div class="market-hero-foot">DIRECT TO SELLER &nbsp;·&nbsp; YOUR ORDER HISTORY &nbsp;·&nbsp; MEMBER SUPPORT</div></div><div class="market-hero-side"><span class="hero-side-label">THE SORA EDIT</span><strong>Good design<br>for real life.</strong><span class="hero-side-small">A new way to discover independent sellers.</span></div></section>
    <section class="how-it-works"><div><span class="market-eyebrow">HOW SORA WORKS</span><h2>One place to discover.<br><em>Your seller for checkout.</em></h2></div><div class="how-step"><span>01</span><strong>Discover</strong><p>Explore products from sellers in one mixed catalogue.</p></div><div class="how-step"><span>02</span><strong>Buy direct</strong><p>Continue to the assigned seller’s own website to purchase.</p></div><div class="how-step"><span>03</span><strong>Your account</strong><p>Keep your order details and support activity in one place.</p></div></section>`;
}

function orderHasFeedback(orderId) { return state.feedback.some((item) => item.order_record_id === orderId); }

function renderOrderCard(order) {
  const seller = order.seller_name_snapshot || sellerNameFor(order.seller_id);
  const name = order.product_name || productById(order.product_id)?.name || 'Order record';
  const feedback = state.feedback.find((item) => item.order_record_id === order.id);
  const feedbackSent = Boolean(feedback);
  const feedbackStatus = feedbackSent ? `Sent ${timeLabel(feedback.submitted_at)}` : 'Not submitted yet';
  return `<article class="order-card"><div class="order-icon" aria-hidden="true">${esc((name[0] || 'S').toUpperCase())}</div><div class="order-main"><div class="order-title-row"><h3>${esc(name)}</h3><span class="status-pill">ORDER DETAILS SAVED</span></div><p>Seller <strong>${esc(seller)}</strong> &nbsp; · &nbsp; Reference <strong>${esc(order.order_reference || 'Not added')}</strong></p><div class="order-meta"><span><small>ORDER DATE</small>${dateLabel(order.order_date)}</span><span><small>AMOUNT YOU REPORTED</small>${amountLabel(order.amount, order.currency)}</span><span><small>FORM SUBMITTED</small>${timeLabel(order.created_at)}</span></div><div class="order-workflow"><span class="workflow-step is-complete"><i></i><span><strong>Order details</strong><small>Submitted</small></span></span><span class="workflow-step ${feedbackSent ? 'is-complete' : 'is-pending'}"><i></i><span><strong>Product feedback</strong><small>${esc(feedbackStatus)}</small></span></span></div></div><div class="order-actions"><button type="button" class="order-action-primary" ${feedbackSent ? 'disabled' : ''} data-open-feedback="${esc(order.id)}">${feedbackSent ? 'Feedback submitted ✓' : 'Complete feedback form ↗'}</button><button type="button" class="order-help-link" data-order-support="${esc(order.id)}">Order support <span aria-hidden="true">↗</span></button></div></article>`;
}

function renderHistory() {
  const reportedTotal = state.orders.reduce((sum, order) => sum + (Number(order.amount) || 0), 0);
  const orderRows = state.orders.length ? state.orders.map(renderOrderCard).join('') : `<div class="empty-state"><span class="empty-icon">↗</span><h3>Your order activity starts here.</h3><p>After using a seller’s checkout page, submit the order details form to create your private record. Purchases on seller sites cannot be detected automatically.</p><button class="button button-dark" type="button" data-open-order-modal>Add order details <span aria-hidden="true">＋</span></button></div>`;
  const feedbackRows = state.feedback.length ? state.feedback.map((item) => `<article class="feedback-history-row"><span class="support-row-icon">✳</span><div><strong>${esc(item.product_name)} <span>· ${esc(item.seller_name_snapshot || sellerNameFor(item.seller_id))}</span></strong><p>${esc(item.what_worked)}</p><small>Submitted ${timeLabel(item.submitted_at)} · Product feedback · private to you and the seller</small></div><span class="status-pill">SENT · PRIVATE</span></article>`).join('') : `<p class="no-support">No product feedback submitted yet. Use the feedback button on an order above when you’re ready.</p>`;
  const supportRows = state.supportRequests.length ? state.supportRequests.map((request) => `<article class="support-history-row"><span class="support-row-icon">⌑</span><div><strong>${esc(request.topic)} <span>· ${esc(request.seller_id ? sellerNameFor(request.seller_id) : 'General support')}</span></strong><p>${esc(request.details)}</p><small>Submitted ${timeLabel(request.created_at)}</small></div><span class="status-pill">${esc(request.status || 'Received')}</span></article>`).join('') : `<p class="no-support">No support requests submitted yet.</p>`;
  const email = state.user?.email || currentEmail();
  return `<section class="page-intro history-intro"><div><p class="eyebrow">YOUR ACCOUNT / PROFILE</p><h1>Your profile,<br><em>your activity.</em></h1><p class="page-lede">A private dashboard for your submitted order details, feedback forms, and support requests. Only records linked to your signed-in account appear here.</p></div><div class="profile-account-chip"><span>${esc(initials(email))}</span><div><strong>${esc(email)}</strong><small>PRIVATE MEMBER ACCOUNT</small></div></div></section>
    <div class="privacy-banner"><span class="privacy-lock">⌑</span><div><strong>Your activity is private</strong><p>This page shows only records attached to your account. Seller purchases are not verified or processed by SORA; reported order amounts are based on the details you submit.</p></div><span class="privacy-status">ACCOUNT-SCOPED</span></div>
    <nav class="profile-shortcuts" aria-label="Profile activity sections"><a href="#member-orders">Orders <span>${state.orders.length}</span></a><a href="#member-feedback">Private feedback <span>${state.feedback.length}</span></a><a href="#member-support">Support <span>${state.supportRequests.length}</span></a></nav>
    <div class="summary-grid member-summary-grid"><div class="summary-card"><span>ORDER DETAILS</span><strong>${String(state.orders.length).padStart(2, '0')}</strong><small>Forms submitted</small></div><div class="summary-card"><span>REPORTED ORDER AMOUNT</span><strong>${esc(amountLabel(reportedTotal, 'INR'))}</strong><small>Self-reported, not verified</small></div><div class="summary-card"><span>PRIVATE FEEDBACK</span><strong>${String(state.feedback.length).padStart(2, '0')}</strong><small>Forms submitted</small></div><div class="summary-card"><span>SUPPORT REQUESTS</span><strong>${String(state.supportRequests.length).padStart(2, '0')}</strong><small>Separate from testing</small></div></div>
    <section id="member-orders" class="member-activity-section"><div class="list-heading"><div><p class="eyebrow">YOUR ORDER HISTORY</p><h2>Order detail forms</h2><p class="section-note">Each card confirms the order form is saved and shows whether its private feedback form is still pending.</p></div><button class="button button-outline" type="button" data-open-order-modal>＋ <span>Add order details</span></button></div><div class="order-list">${orderRows}</div></section>
    <section id="member-feedback" class="member-activity-section"><div class="list-heading support-list-heading"><div><p class="eyebrow">PRODUCT FEEDBACK</p><h2>Feedback forms</h2><p class="section-note">Feedback is private; it is not a public retailer review or rating.</p></div></div><div class="feedback-history-list">${feedbackRows}</div></section>
    <section id="member-support" class="member-activity-section"><div class="list-heading support-list-heading"><div><p class="eyebrow">MEMBER CARE</p><h2>Support activity</h2><p class="section-note">Delivery, return, and refund questions stay separate from private feedback.</p></div><button type="button" class="button button-outline" data-view="support">＋ <span>New support request</span></button></div><div class="support-history-list">${supportRows}</div></section>`;
}

function renderSupport() {
  const orderOptions = state.orders.map((order) => `<option value="${esc(order.id)}" ${state.selectedSupportOrderId === order.id ? 'selected' : ''}>${esc(order.product_name)} — ${esc(order.seller_name_snapshot || sellerNameFor(order.seller_id))}</option>`).join('');
  const previous = state.supportRequests.length ? state.supportRequests.map((request) => `<div class="support-previous"><div><strong>${esc(request.topic)}</strong><span>${timeLabel(request.created_at)} · ${esc(request.status || 'Received')}</span></div><p>${esc(request.details)}</p></div>`).join('') : `<p class="support-empty">Your submitted support requests will appear here.</p>`;
  return `<section class="page-intro support-intro"><div><p class="eyebrow">SORA / MEMBER CARE</p><h1>Here when<br><em>you need us.</em></h1><p class="page-lede">Send a question about an order, delivery, product, return, or refund follow-up. This support route is separate from product feedback.</p></div><div class="support-open-badge"><span class="support-open-dot"></span> SUPPORT REQUESTS OPEN</div></section>
    <div class="support-layout"><section class="support-form-card"><div class="card-topline"><span>01 — NEW REQUEST</span><span>PRIVATE TO YOUR ACCOUNT</span></div><h2>How can we help?</h2><p class="support-form-lede">Share only the details needed to help with your order. Never include a retailer password or payment-card details.</p>
      <form id="support-form" class="portal-form"><label for="support-order">Link an order <span>OPTIONAL</span></label><select id="support-order" name="order_record_id"><option value="">Choose an order, or leave blank</option>${orderOptions}</select><label for="support-topic">What do you need help with?</label><select id="support-topic" name="topic" required><option value="" disabled selected>Select a topic</option><option>Delivery question</option><option>Damaged or defective item</option><option>Return question</option><option>Refund follow-up</option><option>Product question</option><option>Other</option></select><label for="support-details">A few details <span>8–1,200 CHARACTERS</span></label><textarea id="support-details" name="details" rows="5" minlength="8" maxlength="1200" placeholder="Tell us what happened and what help you need…" required></textarea><div class="form-privacy"><span aria-hidden="true">⌑</span><p>Returns and refunds are handled under the seller’s normal policies. This form does not ask for or depend on public reviews.</p></div><button class="button button-dark button-wide" type="submit"><span>Send support request</span><span aria-hidden="true">↗</span></button></form></section>
      <aside class="support-aside"><div class="aside-mark">S<span>.</span></div><p class="eyebrow">A BETTER WAY TO GET HELP</p><h3>Clear, considered<br>support.</h3><p>For checkout, delivery status, and the seller’s return policy, the seller’s own website is the source of truth. This portal stores only the support details you submit to us.</p><div class="aside-rule"></div><div class="previous-heading"><span>YOUR REQUESTS</span><span>${String(state.supportRequests.length).padStart(2, '0')}</span></div>${previous}</aside></div>`;
}

function renderEvidenceButton(path, label, id) {
  return path ? `<button type="button" class="evidence-button" data-evidence="${esc(path)}" data-evidence-id="${esc(id)}">${esc(label)} ↗</button>` : `<span class="evidence-none">—</span>`;
}

function filterAdminRows(rows) {
  return rows.filter((row) => {
    const sellerMatch = state.adminSellerFilter === 'ALL' || row.seller_id === state.adminSellerFilter;
    const ownerId = row.user_id || state.orders.find((order) => order.id === row.order_record_id)?.user_id;
    const memberMatch = state.adminMemberFilter === 'ALL' || ownerId === state.adminMemberFilter;
    return sellerMatch && memberMatch;
  });
}

function buildAdminMemberSummaries() {
  const people = new Map();
  const ensureMember = (id, email = '', extra = {}) => {
    if (!id) return null;
    if (!people.has(id)) people.set(id, { user_id: id, email: '', customer_name: '', account_created_at: '', last_sign_in_at: '', orders: [], feedback: [], support: [] });
    const member = people.get(id);
    if (email && !member.email) member.email = email;
    if (extra.account_created_at && !member.account_created_at) member.account_created_at = extra.account_created_at;
    if (extra.last_sign_in_at) member.last_sign_in_at = extra.last_sign_in_at;
    return member;
  };
  for (const member of state.members) ensureMember(member.member_id || member.user_id || member.id, member.email, member);
  for (const order of state.orders) {
    const member = ensureMember(order.user_id, order.contact_email);
    if (!member) continue;
    member.orders.push(order);
    if (!member.customer_name) member.customer_name = order.customer_name || '';
  }
  for (const request of state.supportRequests) {
    const member = ensureMember(request.user_id, request.contact_email);
    if (member) member.support.push(request);
  }
  for (const feedback of state.feedback) {
    const linkedOrder = state.orders.find((order) => order.id === feedback.order_record_id);
    const member = ensureMember(feedback.user_id || linkedOrder?.user_id, linkedOrder?.contact_email);
    if (member) member.feedback.push(feedback);
  }
  return [...people.values()].map((member) => {
    const activities = [
      ...member.orders.map((item) => item.created_at),
      ...member.feedback.map((item) => item.submitted_at),
      ...member.support.map((item) => item.created_at),
      member.last_sign_in_at,
    ].filter(Boolean).map((value) => new Date(value).getTime()).filter(Number.isFinite);
    const latestActivity = activities.length ? new Date(Math.max(...activities)).toISOString() : '';
    const orderAmount = member.orders.reduce((sum, order) => sum + (Number(order.amount) || 0), 0);
    const latestOrder = [...member.orders].sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0))[0];
    return { ...member, customer_name: latestOrder?.customer_name || member.customer_name, order_count: member.orders.length, order_amount: orderAmount, feedback_count: member.feedback.length, support_count: member.support.length, latest_activity: latestActivity };
  }).sort((a, b) => b.order_amount - a.order_amount || new Date(b.latest_activity || b.account_created_at || 0) - new Date(a.latest_activity || a.account_created_at || 0));
}

function filteredAdminMembers() {
  let members = buildAdminMemberSummaries();
  if (state.adminSellerFilter !== 'ALL') {
    const sellerUserIds = new Set([
      ...state.orders.filter((row) => row.seller_id === state.adminSellerFilter).map((row) => row.user_id),
      ...state.feedback.filter((row) => row.seller_id === state.adminSellerFilter).map((row) => row.user_id || state.orders.find((order) => order.id === row.order_record_id)?.user_id),
      ...state.supportRequests.filter((row) => row.seller_id === state.adminSellerFilter).map((row) => row.user_id),
    ].filter(Boolean));
    members = members.filter((member) => sellerUserIds.has(member.user_id));
  }
  return state.adminMemberFilter === 'ALL' ? members : members.filter((member) => member.user_id === state.adminMemberFilter);
}

function memberFilterControl() {
  const members = buildAdminMemberSummaries();
  return `<label class="admin-select-label">MEMBER <select id="admin-member-filter"><option value="ALL" ${state.adminMemberFilter === 'ALL' ? 'selected' : ''}>All members</option>${members.map((member) => `<option value="${esc(member.user_id)}" ${state.adminMemberFilter === member.user_id ? 'selected' : ''}>${esc(member.email || member.user_id)}</option>`).join('')}</select></label>`;
}

function sellerFilterControl() {
  return `<label class="admin-select-label">SELLER <select id="admin-seller-filter"><option value="ALL" ${state.adminSellerFilter === 'ALL' ? 'selected' : ''}>All sellers</option>${state.sellers.map((seller) => `<option value="${esc(seller.id)}" ${state.adminSellerFilter === seller.id ? 'selected' : ''}>${esc(seller.name)}</option>`).join('')}</select></label>`;
}

function renderAdminOrders() {
  const rows = filterAdminRows(state.orders);
  if (!rows.length) return `<div class="admin-empty">No order submissions for this seller/member filter yet.</div>`;
  return `<div class="admin-table-wrap"><table class="admin-table"><thead><tr><th scope="col">SUBMITTED (IST)</th><th scope="col">SELLER / PRODUCT</th><th scope="col">MEMBER ACCOUNT</th><th scope="col">ORDER REFERENCE</th><th scope="col">ORDER DATE</th><th scope="col">AMOUNT</th><th scope="col">FILES</th></tr></thead><tbody>${rows.map((row) => `<tr><td data-label="Submitted">${timeLabel(row.created_at)}</td><td data-label="Seller / product"><strong>${esc(row.product_name)}</strong><small>${esc(row.seller_name_snapshot || sellerNameFor(row.seller_id))}</small></td><td data-label="Member account"><strong>${esc(row.customer_name)}</strong><small>${esc(row.contact_email)}</small><small class="admin-member-id">${esc(row.user_id)}</small></td><td class="ref-cell" data-label="Order reference">${esc(row.order_reference)}</td><td data-label="Order date">${dateLabel(row.order_date)}</td><td data-label="Reported amount">${amountLabel(row.amount,row.currency)}</td><td class="files-cell" data-label="Evidence">${renderEvidenceButton(row.order_screenshot_path,'Order',row.id)} ${renderEvidenceButton(row.delivery_screenshot_path,'Delivery',row.id)}</td></tr>`).join('')}</tbody></table></div>`;
}


function renderAdminFeedback() {
  const rows = filterAdminRows(state.feedback);
  if (!rows.length) return `<div class="admin-empty">No product feedback for this seller/member filter yet.</div>`;
  return `<div class="admin-table-wrap"><table class="admin-table"><thead><tr><th scope="col">SUBMITTED (IST)</th><th scope="col">SELLER / PRODUCT</th><th scope="col">MEMBER ACCOUNT</th><th scope="col">ORDER REFERENCE</th><th scope="col">USAGE PERIOD</th><th scope="col">WHAT WORKED</th><th scope="col">WHAT TO IMPROVE</th><th scope="col">PRIVATE NOTES</th></tr></thead><tbody>${rows.map((row) => { const order = state.orders.find((item) => item.id === row.order_record_id); return `<tr><td data-label="Submitted">${timeLabel(row.submitted_at)}</td><td data-label="Seller / product"><strong>${esc(row.product_name)}</strong><small>${esc(row.seller_name_snapshot || sellerNameFor(row.seller_id))}</small></td><td data-label="Member account"><strong>${esc(order?.customer_name || '—')}</strong><small>${esc(order?.contact_email || '—')}</small><small class="admin-member-id">${esc(row.user_id || order?.user_id || '')}</small></td><td class="ref-cell" data-label="Order reference">${esc(order?.order_reference || '—')}</td><td data-label="Usage period">${esc(row.usage_period)}</td><td class="admin-long-text" data-label="What worked">${esc(row.what_worked)}</td><td class="admin-long-text" data-label="What to improve">${esc(row.improvements)}</td><td class="admin-long-text" data-label="Private notes">${esc(row.private_notes || '—')}</td></tr>`; }).join('')}</tbody></table></div>`;
}


function renderAdminSupport() {
  const rows = filterAdminRows(state.supportRequests);
  if (!rows.length) return `<div class="admin-empty">No support requests for this seller/member filter yet.</div>`;
  return `<div class="admin-table-wrap"><table class="admin-table"><thead><tr><th scope="col">SUBMITTED (IST)</th><th scope="col">SELLER / PRODUCT</th><th scope="col">MEMBER ACCOUNT</th><th scope="col">ORDER REFERENCE</th><th scope="col">TOPIC</th><th scope="col">DETAILS</th><th scope="col">STATUS</th></tr></thead><tbody>${rows.map((row) => { const order = state.orders.find((item) => item.id === row.order_record_id); const seller = row.seller_name_snapshot || (row.seller_id ? sellerNameFor(row.seller_id) : 'General support'); return `<tr><td data-label="Submitted">${timeLabel(row.created_at)}</td><td data-label="Seller / product"><strong>${esc(order?.product_name || (row.seller_id ? 'Seller support' : 'General support'))}</strong><small>${esc(seller)}</small></td><td data-label="Member account"><strong>${esc(order?.customer_name || '—')}</strong><small>${esc(row.contact_email || '—')}</small><small class="admin-member-id">${esc(row.user_id || '')}</small></td><td class="ref-cell" data-label="Order reference">${esc(order?.order_reference || '—')}</td><td data-label="Topic">${esc(row.topic)}</td><td class="admin-long-text" data-label="Details">${esc(row.details)}</td><td data-label="Status"><select class="status-select" data-support-status="${esc(row.id)}"><option ${row.status==='Received'?'selected':''}>Received</option><option ${row.status==='In progress'?'selected':''}>In progress</option><option ${row.status==='Resolved'?'selected':''}>Resolved</option></select></td></tr>`; }).join('')}</tbody></table></div>`;
}


function renderAdminCatalog() {
  const products = state.adminSellerFilter === 'ALL' ? state.products : state.products.filter((item) => item.seller_id === state.adminSellerFilter);
  const sellers = state.adminSellerFilter === 'ALL' ? state.sellers : state.sellers.filter((item) => item.id === state.adminSellerFilter);
  const sellerRows = sellers.map((seller) => `<div class="admin-manage-row"><div class="admin-manage-info"><strong>${esc(seller.name)}</strong><small>${esc(seller.website_url || 'Website not set')}</small><span class="status-pill">${seller.is_active === false ? 'HIDDEN FROM SHOP' : 'VISIBLE IN SHOP'}</span></div><div class="admin-row-controls"><button type="button" class="admin-small-action" data-edit-seller="${esc(seller.id)}">Edit</button><button type="button" class="admin-small-action ${seller.is_active === false ? 'restore-action' : 'hide-action'}" data-toggle-seller="${esc(seller.id)}">${seller.is_active === false ? 'Show in shop' : 'Hide from shop'}</button></div></div>`).join('');
  const productRows = products.map((product) => {
    const sellerActive = state.sellers.find((seller) => seller.id === product.seller_id)?.is_active !== false;
    const hidden = product.is_active === false || !sellerActive;
    const status = hidden ? 'HIDDEN' : product.stock_status === 'sold_out' ? 'SOLD OUT' : 'AVAILABLE';
    return `<div class="admin-manage-row"><div class="admin-manage-info"><strong>${esc(product.name)}</strong><small>${esc(sellerNameFor(product.seller_id, product.seller_name))} · ${esc(product.category || 'GENERAL')} · ${esc(product.price_label || 'Price not set')}</small><span class="status-pill ${status === 'SOLD OUT' ? 'soldout-pill' : ''}">${status}</span></div><div class="admin-row-controls product-row-controls"><button type="button" class="admin-small-action" data-edit-product="${esc(product.id)}">Edit</button><button type="button" class="admin-small-action stock-action" data-toggle-product-stock="${esc(product.id)}">${product.stock_status === 'sold_out' ? 'Mark available' : 'Mark sold out'}</button><button type="button" class="admin-small-action ${hidden ? 'restore-action' : 'hide-action'}" data-toggle-product-visibility="${esc(product.id)}">${product.is_active === false ? 'Restore listing' : 'Hide listing'}</button></div></div>`;
  }).join('');
  return `<div class="admin-catalog-actions"><p>Changes update the storefront immediately. Hiding keeps old order records intact.</p><div><button class="button button-outline" type="button" data-admin-modal="seller">＋ Add seller</button><button class="button button-dark" type="button" data-admin-modal="product">＋ Add product</button></div></div><div class="admin-catalog-grid"><section class="admin-catalog-card"><div class="card-topline"><span>SELLERS</span><span>${String(sellers.length).padStart(2,'0')}</span></div><h3>Seller directory</h3>${sellerRows || '<p class="admin-empty">No sellers match this filter.</p>'}</section><section class="admin-catalog-card"><div class="card-topline"><span>PRODUCTS</span><span>${String(products.length).padStart(2,'0')}</span></div><h3>Product listings</h3>${productRows || '<p class="admin-empty">No products for this seller yet. Add a product and assign its seller.</p>'}</section></div>`;
}

function renderAdminMembers() {
  const members = filteredAdminMembers();
  const directoryWarning = state.membersError ? `<div class="admin-rpc-warning"><strong>Secure account directory unavailable.</strong><span>Run the latest <code>supabase/schema.sql</code> in the project SQL editor. ${esc(state.membersError)}</span></div>` : '';
  if (!members.length) return `${directoryWarning}<div class="admin-empty">No member accounts or activity found for the current seller filter.</div>`;
  return `${directoryWarning}<div class="admin-members-intro"><span class="market-eyebrow">PRIVATE MEMBER DIRECTORY</span><p>Account details are shown only to the allow-listed site admin. “Reported order amount” is entered by members and is not a verified seller transaction or SORA revenue.</p></div><div class="admin-table-wrap"><table class="admin-table admin-member-table"><thead><tr><th scope="col">ACCOUNT</th><th scope="col">USER ID</th><th scope="col">ACCOUNT CREATED</th><th scope="col">LAST SIGN-IN</th><th scope="col">ORDER FORMS</th><th scope="col">REPORTED ORDER AMOUNT</th><th scope="col">PRIVATE FEEDBACK</th><th scope="col">SUPPORT FORMS</th><th scope="col">LATEST ACTIVITY</th><th scope="col">RECORDS</th></tr></thead><tbody>${members.map((member) => `<tr><td data-label="Account"><strong>${esc(member.email || 'Email not available')}</strong><small>${esc(member.customer_name || 'Name not provided in an order form')}</small></td><td class="member-id-cell" data-label="User ID">${esc(member.user_id)}</td><td data-label="Account created">${member.account_created_at ? timeLabel(member.account_created_at) : 'Preview account'}</td><td data-label="Last sign-in">${member.last_sign_in_at ? timeLabel(member.last_sign_in_at) : '—'}</td><td data-label="Order forms">${member.order_count}</td><td data-label="Reported amount"><strong>${esc(amountLabel(member.order_amount, 'INR'))}</strong><small>Self-reported total</small></td><td data-label="Private feedback">${member.feedback_count} ${member.feedback_count ? 'submitted' : 'not submitted'}</td><td data-label="Support forms">${member.support_count}</td><td data-label="Latest activity">${member.latest_activity ? timeLabel(member.latest_activity) : 'No activity yet'}</td><td data-label="Records"><button type="button" class="member-record-link" data-admin-member-view="${esc(member.user_id)}">View activity →</button></td></tr>`).join('')}</tbody></table></div>`;
}


function adminContent() {
  const members = buildAdminMemberSummaries();
  const tabs = [['members', `Members <span>${members.length}</span>`], ['orders', `Order forms <span>${state.orders.length}</span>`], ['feedback', `Product feedback <span>${state.feedback.length}</span>`], ['support', `Support <span>${state.supportRequests.length}</span>`], ['catalog', 'Sellers & products']];
  let title = 'Member directory';
  let body = renderAdminMembers();
  if (state.adminTab === 'orders') { title = 'Order submissions'; body = renderAdminOrders(); }
  if (state.adminTab === 'feedback') { title = 'Product feedback'; body = renderAdminFeedback(); }
  if (state.adminTab === 'support') { title = 'Order support'; body = renderAdminSupport(); }
  if (state.adminTab === 'catalog') { title = 'Seller catalogue'; body = renderAdminCatalog(); }
  const controls = `<div class="admin-data-controls">${sellerFilterControl()}${memberFilterControl()}<button type="button" class="button button-outline export-button" data-export-csv>Export this view <span aria-hidden="true">↓</span></button></div>`;
  return `<section class="admin-panel"><div class="admin-header"><div><p class="eyebrow">SORA / SITE ADMIN</p><h2>${title}</h2><p>Cross-member records are restricted to this signed-in, allow-listed admin. Seller assignments remain attached to every order, feedback, support request, and product.</p></div><div class="admin-shield"><span>⌑</span> ADMIN ONLY</div></div><div class="admin-tabs">${tabs.map(([id,label]) => `<button type="button" data-admin-tab="${id}" class="admin-tab ${state.adminTab===id?'active':''}">${label}</button>`).join('')}</div>${controls}${body}<div class="admin-privacy-note"><span>⌑</span><p>Keep exported member information and order evidence private. Share only the specific details a seller needs for a stated support or research purpose.</p></div></section>`;
}

function renderAdmin() {
  const members = buildAdminMemberSummaries();
  const reportedTotal = state.orders.reduce((sum, order) => sum + (Number(order.amount) || 0), 0);
  return `<section class="page-intro admin-intro"><div><p class="eyebrow">SORA / SITE ADMIN</p><h1>Admin<br><em>workspace.</em></h1><p class="page-lede">A private place to manage members, seller-linked forms, support, and product listings.</p></div><div class="admin-intro-mark" aria-hidden="true">S<span>.</span></div></section><div class="admin-metrics-grid" aria-label="Store operations summary"><div><span>MEMBER ACCOUNTS</span><strong>${members.length}</strong><small>Visible only to site admin</small></div><div><span>ORDER FORMS</span><strong>${state.orders.length}</strong><small>Member-submitted records</small></div><div><span>REPORTED ORDER AMOUNT</span><strong>${esc(amountLabel(reportedTotal, 'INR'))}</strong><small>Self-reported; not verified spend</small></div><div><span>PRIVATE FEEDBACK</span><strong>${state.feedback.length}</strong><small>Not public reviews</small></div></div><div class="privacy-banner"><span class="privacy-lock">⌑</span><div><strong>Admin-only member data</strong><p>Row-level security protects member records. Amount totals come from user-reported forms; checkout and payment happen with external sellers.</p></div><span class="privacy-status">ACCESS CONTROLLED</span></div>${adminContent()}`;
}


function renderAdminAccessRoute() {
  state.authMode = 'admin';
  if (state.user && state.isAdmin) {
    return `<div class="admin-portal-page"><header class="admin-portal-header"><a class="market-logo" href="/" aria-label="SORA Market home"><span class="market-logo-symbol">S</span><span class="market-logo-word">SORA<small>MARKET</small></span></a><div class="admin-portal-actions"><span class="admin-portal-badge">ADMIN ONLY</span><span class="admin-portal-email">${esc(state.user.email || 'Authorized admin')}</span><a href="/" class="admin-return-shop">Return to shop</a><button type="button" class="header-signin" data-sign-out>Sign out</button></div></header><main class="market-page admin-portal-content">${renderAdmin()}</main>${renderModal()}</div>`;
  }

  const signedInNonAdmin = Boolean(state.user && !state.isAdmin && !state.demo);
  const body = signedInNonAdmin
    ? `<div class="admin-access-denied" role="alert"><span aria-hidden="true">⌑</span><div><strong>This account is not authorized for Admin.</strong><p>Sign out and use the allow-listed owner account. Admin data is protected by Supabase authorization, not this page alone.</p></div><button type="button" class="button button-outline" data-sign-out>Sign out and switch account</button></div>`
    : renderOtpForm('admin');
  return `<main class="admin-access-shell"><header class="admin-access-top"><a class="market-logo" href="/" aria-label="SORA Market home"><span class="market-logo-symbol">S</span><span class="market-logo-word">SORA<small>MARKET</small></span></a><span class="admin-portal-badge">RESTRICTED ADMIN ACCESS</span></header><section class="admin-access-card"><span class="admin-access-kicker">SORA / OPERATIONS</span><h1>Admin<br><em>sign-in.</em></h1><p class="admin-access-intro">Enter the email for the allow-listed owner account. We’ll send a one-time code; only an authorized Supabase admin account can open this workspace.</p>${body}<a class="admin-access-back" href="/">← Return to the shop</a></section><footer class="admin-access-foot">Protected by email verification and Supabase row-level security.</footer></main>`;
}


function renderOrderModal() {
  const orderableProducts = state.products.filter((product) => product.is_active !== false && state.sellers.find((seller) => seller.id === product.seller_id)?.is_active !== false);
  const chosenId = state.selectedProductId || orderableProducts[0]?.id || '';
  const options = orderableProducts.map((product) => `<option value="${esc(product.id)}" ${chosenId===product.id?'selected':''}>${esc(product.name)} — ${esc(sellerNameFor(product.seller_id, product.seller_name))}</option>`).join('');
  const selected = productById(chosenId);
  const seller = selected ? sellerNameFor(selected.seller_id, selected.seller_name) : 'Choose a product';
  return `<div class="modal-backdrop" data-close-modal role="presentation"><section class="modal-card modal-wide" role="dialog" aria-modal="true" aria-labelledby="order-modal-title" data-modal-card><button class="modal-close" type="button" data-close-modal aria-label="Close">×</button><p class="eyebrow">YOUR ACCOUNT / ORDER SUBMISSION</p><h2 id="order-modal-title">Add order<br><em>details.</em></h2><p class="modal-intro">This submission is linked to your account and the product’s assigned seller. The seller site does not send purchase confirmation back automatically.</p>
    <form id="order-form" class="portal-form modal-form"><label for="order-product">Product and seller</label><select id="order-product" name="product_id" required>${options}</select><div class="auto-seller-line">ASSIGNED SELLER <strong id="order-seller-name">${esc(seller)}</strong></div>
      <div class="form-two"><div><label for="customer-name">Customer name</label><input id="customer-name" name="customer_name" type="text" maxlength="120" autocomplete="name" placeholder="Your name" required></div><div><label for="contact-email">Contact email</label><input id="contact-email" name="contact_email" type="email" value="${esc(state.user?.email || 'member@preview.local')}" readonly required></div></div>
      <div class="form-two"><div><label for="order-reference">Order ID / reference</label><input id="order-reference" name="order_reference" type="text" maxlength="100" autocomplete="off" placeholder="Enter the seller order reference" required></div><div><label for="order-date">Order date</label><input id="order-date" name="order_date" type="date" max="${new Date().toISOString().slice(0,10)}" required></div></div>
      <label for="order-amount">Order amount <span>INR</span></label><input id="order-amount" name="amount" type="number" min="0" step="0.01" placeholder="e.g. 1,299" required>
      <label for="order-screenshot">Order screenshot <span>REQUIRED · JPG, PNG, WEBP OR PDF · MAX 10 MB</span></label><input id="order-screenshot" name="order_screenshot" type="file" accept="image/jpeg,image/png,image/webp,application/pdf" required>
      <label for="delivery-screenshot">Delivered order screenshot <span>OPTIONAL · SAME FILE TYPES</span></label><input id="delivery-screenshot" name="delivery_screenshot" type="file" accept="image/jpeg,image/png,image/webp,application/pdf">
      <label class="check-row"><input name="confirm_self_reported" type="checkbox" required><span>I confirm these order details are accurate and understand they are self-reported.</span></label><div class="form-privacy"><span aria-hidden="true">⌑</span><p>Files are stored privately with this account’s order record. Do not include payment-card details or a retailer password.</p></div><button class="button button-dark button-wide" type="submit"><span>Submit order details</span><span aria-hidden="true">↗</span></button>
    </form></section></div>`;
}

function renderFeedbackModal(orderId) {
  const order = state.orders.find((item) => item.id === orderId);
  if (!order) return '';
  return `<div class="modal-backdrop" data-close-modal role="presentation"><section class="modal-card" role="dialog" aria-modal="true" aria-labelledby="feedback-modal-title" data-modal-card><button class="modal-close" type="button" data-close-modal aria-label="Close">×</button><p class="eyebrow">PRODUCT FEEDBACK</p><h2 id="feedback-modal-title">Share what<br><em>you noticed.</em></h2><p class="modal-intro">For <strong>${esc(order.product_name)}</strong> · ${esc(order.seller_name_snapshot || sellerNameFor(order.seller_id))}. This is private feedback for the assigned seller, not a public review or rating.</p>
    <form id="feedback-form" class="portal-form modal-form" data-order-id="${esc(order.id)}"><label for="usage-period">How long have you used the product?</label><select id="usage-period" name="usage_period" required><option value="" disabled selected>Choose a timeframe</option><option>Not used yet</option><option>1–3 days</option><option>About one week</option><option>Two weeks or more</option><option>Other</option></select><label for="what-worked">What worked well? <span>8–1,500 CHARACTERS</span></label><textarea id="what-worked" name="what_worked" rows="4" minlength="8" maxlength="1500" placeholder="Describe your own experience…" required></textarea><label for="improvements">What could be improved? <span>8–1,500 CHARACTERS</span></label><textarea id="improvements" name="improvements" rows="4" minlength="8" maxlength="1500" placeholder="Share any issues or suggestions…" required></textarea><label for="private-notes">Anything else for the product team? <span>OPTIONAL</span></label><textarea id="private-notes" name="private_notes" rows="3" maxlength="1500" placeholder="Additional private context…"></textarea><div class="form-privacy"><span aria-hidden="true">⌑</span><p>Feedback is private and shared with the assigned seller for product research. It is not published or converted into a public star rating.</p></div><button class="button button-dark button-wide" type="submit"><span>Send private feedback</span><span aria-hidden="true">↗</span></button></form></section></div>`;
}

function renderSellerModal(sellerId = '') {
  const seller = state.sellers.find((item) => item.id === sellerId);
  const editing = Boolean(seller);
  return `<div class="modal-backdrop" data-close-modal role="presentation"><section class="modal-card" role="dialog" aria-modal="true" aria-labelledby="seller-modal-title" data-modal-card><button class="modal-close" type="button" data-close-modal aria-label="Close">×</button><p class="eyebrow">ADMIN / SELLER DIRECTORY</p><h2 id="seller-modal-title">${editing ? 'Edit this<br><em>seller.</em>' : 'Add a<br><em>seller.</em>'}</h2><p class="modal-intro">Seller details are used for the shop listing and product links.</p><form id="seller-form" class="portal-form modal-form" ${editing ? `data-seller-id="${esc(seller.id)}"` : ''}><label for="seller-name">Seller / brand name</label><input id="seller-name" name="name" type="text" maxlength="120" required value="${esc(seller?.name || '')}" placeholder="e.g. Northline Objects"><label for="seller-website">Seller website</label><input id="seller-website" name="website_url" type="url" required value="${esc(seller?.website_url || '')}" placeholder="https://seller.example"><button class="button button-dark button-wide" type="submit"><span>${editing ? 'Save seller changes' : 'Add seller'}</span><span aria-hidden="true">↗</span></button></form></section></div>`;
}

function renderProductModal(productId = '') {
  const product = state.products.find((item) => item.id === productId);
  const editing = Boolean(product);
  const sellers = state.sellers.filter((seller) => seller.is_active !== false || seller.id === product?.seller_id);
  const sellerHasOrders = product && state.orders.some((order) => order.product_id === product.id);
  const options = sellers.map((seller) => `<option value="${esc(seller.id)}" ${product?.seller_id === seller.id ? 'selected' : ''}>${esc(seller.name)}</option>`).join('');
  const assignedSeller = product ? sellerNameFor(product.seller_id, product.seller_name) : '';
  const sellerField = sellerHasOrders
    ? `<label>Assigned seller <span>LOCKED AFTER ORDER ACTIVITY</span></label><div class="auto-seller-line"><strong>${esc(assignedSeller)}</strong></div><input type="hidden" name="seller_id" value="${esc(product.seller_id)}">`
    : `<label for="product-seller">Assigned seller</label><select id="product-seller" name="seller_id" required>${options}</select>`;
  return `<div class="modal-backdrop" data-close-modal role="presentation"><section class="modal-card modal-wide" role="dialog" aria-modal="true" aria-labelledby="product-modal-title" data-modal-card><button class="modal-close" type="button" data-close-modal aria-label="Close">×</button><p class="eyebrow">ADMIN / SHOP CATALOGUE</p><h2 id="product-modal-title">${editing ? 'Edit this<br><em>product.</em>' : 'Add a<br><em>product.</em>'}</h2><p class="modal-intro">Keep the seller, price, stock status, and checkout link accurate. Hiding a listing never deletes its order history.</p>${sellers.length ? `<form id="product-form" class="portal-form modal-form" ${editing ? `data-product-id="${esc(product.id)}"` : ''}>${sellerField}<label for="product-name">Product name</label><input id="product-name" name="name" type="text" maxlength="180" required value="${esc(product?.name || '')}" placeholder="Product listing name"><div class="form-two"><div><label for="product-category">Category</label><input id="product-category" name="category" type="text" maxlength="60" required value="${esc(product?.category || '')}" placeholder="HOME, TECH, etc."></div><div><label for="product-price-amount">Price amount <span>INR · OPTIONAL</span></label><input id="product-price-amount" name="price_amount" type="number" min="0" step="0.01" value="${product?.price_amount ?? ''}" placeholder="e.g. 2499"></div></div><label for="product-price">Price label</label><input id="product-price" name="price_label" type="text" maxlength="100" value="${esc(product?.price_label || '')}" placeholder="₹2,499 or See seller for current price"><label for="product-description">Short description</label><textarea id="product-description" name="description" rows="3" maxlength="500" placeholder="A brief, factual product description">${esc(product?.description || '')}</textarea><label for="product-buy-url">Seller product page URL</label><input id="product-buy-url" name="buy_url" type="url" required value="${esc(product?.buy_url || '')}" placeholder="https://seller.example/product"><label for="product-image-url">Product image URL <span>OPTIONAL · HTTPS</span></label><input id="product-image-url" name="image_url" type="url" value="${esc(product?.image_url || '')}" placeholder="https://…"><div class="form-two"><div><label for="product-art">Artwork style</label><select id="product-art" name="art_variant"><option value="lamp" ${product?.art_variant==='lamp'?'selected':''}>Lamp</option><option value="bottle" ${product?.art_variant==='bottle'?'selected':''}>Bottle</option><option value="mat" ${product?.art_variant==='mat'?'selected':''}>Desk mat</option><option value="audio" ${product?.art_variant==='audio'?'selected':''}>Audio</option><option value="ceramic" ${product?.art_variant==='ceramic'?'selected':''}>Ceramic</option><option value="tote" ${product?.art_variant==='tote'?'selected':''}>Tote</option></select></div><div><label for="product-sort">Display order</label><input id="product-sort" name="sort_order" type="number" value="${esc(product?.sort_order ?? 0)}" step="1"></div></div><div class="form-two"><div><label for="product-stock-status">Availability</label><select id="product-stock-status" name="stock_status"><option value="available" ${product?.stock_status !== 'sold_out' ? 'selected' : ''}>Available</option><option value="sold_out" ${product?.stock_status === 'sold_out' ? 'selected' : ''}>Sold out</option></select></div><div><label for="product-featured">Homepage placement</label><select id="product-featured" name="featured"><option value="false" ${!product?.featured ? 'selected' : ''}>Standard</option><option value="true" ${product?.featured ? 'selected' : ''}>Featured</option></select></div></div><button class="button button-dark button-wide" type="submit"><span>${editing ? 'Save product changes' : 'Add product to shop'}</span><span aria-hidden="true">↗</span></button></form>` : `<div class="empty-state"><h3>Add a seller first</h3><p>A product needs a seller before it can be listed.</p><button class="button button-dark" type="button" data-admin-modal="seller">＋ Add seller</button></div>`}</section></div>`;
}

function render() {
  if (isAdminRoute()) {
    root.innerHTML = renderAdminAccessRoute();
    return;
  }
  if (state.view === 'admin' && (!state.user || !state.isAdmin)) state.view = 'discover';
  if (!state.user && ['history','support'].includes(state.view)) state.view = 'discover';
  const categories = ['ALL', ...new Set(state.products.filter((product) => product.is_active !== false && state.sellers.find((seller) => seller.id === product.seller_id)?.is_active !== false).map((product) => (product.category || 'GENERAL').toUpperCase()))];
  const userLabel = currentEmail();
  const viewContent = state.view === 'history' ? renderHistory() : state.view === 'support' ? renderSupport() : state.view === 'admin' ? renderAdmin() : renderDiscover();
  const accountActions = state.user
    ? `<button type="button" class="header-action account-action" data-view="history"><span class="account-icon">⌑</span><span><small>MY PROFILE</small><strong>My profile</strong></span></button>${state.demo ? (state.isAdmin ? `<button type="button" class="header-signin demo-switch" data-demo-entry="member">Return to shop preview</button>` : `<span class="header-preview-label">DEMO MEMBER</span>`) : `<button type="button" class="header-signin" data-sign-out>Sign out</button>`}`
    : `<button type="button" class="header-action account-action" data-open-auth><span class="account-icon">♙</span><span><small>WELCOME</small><strong>Sign in / Join</strong></span></button>`;
  root.innerHTML = `<div class="app-shell market-app">
    ${state.demo ? `<div class="preview-ribbon"><span class="preview-dot"></span>DEMO STOREFRONT <span class="ribbon-divider">/</span> SAMPLE PRODUCTS & PRICES</div>` : ''}
    <header class="market-header"><div class="market-header-main">
      <a href="#" class="market-logo" data-view="discover" aria-label="SORA Market home"><span class="market-logo-symbol">S</span><span class="market-logo-word">SORA<small>MARKET</small></span></a>
      <form id="header-search-form" class="header-search"><select id="search-category" name="category" aria-label="Search category">${categories.map((category)=>`<option value="${esc(category)}" ${state.searchCategory===category?'selected':''}>${esc(category==='ALL'?'All categories':category)}</option>`).join('')}</select><input id="shop-search" name="query" type="search" value="${esc(state.query)}" placeholder="Search for products, categories or sellers" aria-label="Search products, categories or sellers"><button type="submit" aria-label="Search">⌕ <span>Search</span></button></form>
      <div class="market-header-actions">${accountActions}${state.isAdmin?`<a class="header-admin-link" href="/admin">Admin panel <span>↗</span></a>`:''}</div>
    </div><nav class="market-category-nav" aria-label="Main shop navigation"><button type="button" class="market-category-link market-shop-tab ${state.view==='discover'?'active':''}" data-shop-tab>Shop all</button>${categories.filter((category)=>category!=='ALL').map((category)=>`<button type="button" class="market-category-link ${state.category===category?'active':''}" data-category="${esc(category)}">${esc(category)}</button>`).join('')}<span class="category-nav-spacer"></span><button type="button" class="market-category-link category-support" data-view="support">Help & support</button></nav></header>
    <main class="market-page">${viewContent}</main>
    <footer class="market-footer"><div class="market-footer-inner"><a href="#" class="market-logo footer-logo" data-view="discover"><span class="market-logo-symbol">S</span><span class="market-logo-word">SORA<small>MARKET</small></span></a><span>Independent sellers · direct checkout · private member history</span><div><button type="button" data-view="support">Customer support</button><small>© 2026 SORA Market</small></div></div></footer>${renderModal()}</div>`;
}

function renderSignInModal() {
  return `<div class="modal-backdrop sign-in-backdrop" data-close-modal role="presentation"><section class="modal-card sign-in-modal" role="dialog" aria-modal="true" aria-labelledby="signin-title" data-modal-card><button class="modal-close" type="button" data-close-modal aria-label="Close sign-in dialog">×</button><div class="signin-mark" aria-hidden="true">S</div><p class="market-eyebrow">SORA MARKET ACCOUNT</p><h2 id="signin-title">Sign in to<br><em>continue.</em></h2><p class="modal-intro">${esc(state.authMessage || 'Access your account to continue to a seller, submit order details, and view your private history.')}</p>${renderOtpForm('member')}<div class="signin-policy"><span aria-hidden="true">⌑</span><p>Your account is private. We never ask for a retailer password or publish your product feedback.</p></div></section></div>`;
}

function renderModal() {
  if (!state.modal) return '';
  if (state.modal.type === 'signin') return renderSignInModal();
  if (state.modal.type === 'order') return renderOrderModal();
  if (state.modal.type === 'feedback') return renderFeedbackModal(state.modal.orderId);
  if (state.modal.type === 'seller') return renderSellerModal(state.modal.sellerId || '');
  if (state.modal.type === 'product') return renderProductModal(state.modal.productId || '');
  return '';
}

async function loadPublicCatalog() {
  if (!supabase) return;
  const [sellerResult, productResult] = await Promise.all([
    supabase.from('sellers').select('id,name,website_url,is_active').order('name'),
    supabase.from('catalog_products').select('id,seller_id,name,category,description,price_label,price_amount,currency,stock_status,buy_url,image_url,art_variant,sort_order,is_active,featured,created_at').order('sort_order'),
  ]);
  state.sellers = sellerResult.data || [];
  state.products = productResult.data || [];
  render();
}

async function loadWorkspace() {
  if (!supabase || !state.user || state.demo) return;
  const { data: adminValue, error: adminError } = await supabase.rpc('is_site_admin');
  state.isAdmin = !adminError && adminValue === true;
  const [sellerResult, productResult, orderResult, feedbackResult, supportResult, memberResult] = await Promise.all([
    supabase.from('sellers').select('id,name,website_url,is_active,created_at').order('name'),
    supabase.from('catalog_products').select('id,seller_id,name,category,description,price_label,price_amount,currency,stock_status,buy_url,image_url,art_variant,sort_order,is_active,featured,created_at').order('sort_order'),
    supabase.from('order_submissions').select('id,user_id,seller_id,product_id,seller_name_snapshot,product_name,customer_name,contact_email,order_reference,order_date,amount,currency,order_screenshot_path,delivery_screenshot_path,status,created_at').order('created_at', { ascending: false }),
    supabase.from('testing_feedback').select('id,user_id,order_record_id,seller_id,seller_name_snapshot,product_name,usage_period,what_worked,improvements,private_notes,submitted_at').order('submitted_at', { ascending: false }),
    supabase.from('member_support_requests').select('id,user_id,order_record_id,seller_id,contact_email,topic,details,status,created_at').order('created_at', { ascending: false }),
    state.isAdmin ? supabase.rpc('admin_list_members') : Promise.resolve({ data: [] }),
  ]);
  state.members = state.isAdmin ? (memberResult.data || []) : [];
  state.membersError = state.isAdmin && memberResult.error ? memberResult.error.message : '';
  state.adminMemberFilter = 'ALL';
  if (sellerResult.data) state.sellers = sellerResult.data;
  state.products = productResult.data || [];
  state.orders = orderResult.data || [];
  state.feedback = feedbackResult.data || [];
  state.supportRequests = supportResult.data || [];
  if (state.pendingProductId && productById(state.pendingProductId)) {
    state.selectedProductId = state.pendingProductId;
    state.modal = { type: 'order' };
    state.pendingProductId = '';
  }
  render();
}

function setDemoUser(role) {
  if (!import.meta.env.DEV || supabase) return;
  if (role === 'admin' && new URLSearchParams(window.location.search).get('preview') !== 'admin') return;
  state.demo = true;
  state.isAdmin = role === 'admin';
  state.user = { id: role === 'admin' ? 'preview-admin' : 'preview-member', email: role === 'admin' ? 'admin@preview.local' : 'member@preview.local' };
  state.sellers = sampleSellers.map((item) => ({ ...item }));
  state.products = sampleProducts.map((item) => ({ ...item }));
  state.orders = sampleOrders.map((item) => ({ ...item }));
  state.feedback = sampleFeedback.map((item) => ({ ...item }));
  state.supportRequests = sampleSupportRequests.map((item) => ({ ...item }));
  state.view = role === 'admin' ? 'admin' : 'discover';
  state.adminTab = 'members'; state.adminSellerFilter = 'ALL'; state.adminMemberFilter = 'ALL'; state.priceRange = 'ALL';
  state.members = role === 'admin' ? [{ member_id: 'preview-member', email: 'member@preview.local' }] : [];
  state.membersError = '';
  render();
}

async function uploadEvidence(file, userId, folderToken) {
  if (!file) return null;
  const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
  if (!allowedTypes.includes(file.type)) throw new Error('Upload a JPG, PNG, WEBP, or PDF file.');
  if (file.size > 10 * 1024 * 1024) throw new Error('Each uploaded file must be 10 MB or smaller.');
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '-').slice(-90) || 'evidence';
  const path = `${userId}/${folderToken}/${crypto.randomUUID()}-${safeName}`;
  const { error } = await supabase.storage.from('order-evidence').upload(path, file, { upsert: false, contentType: file.type });
  if (error) throw error;
  return path;
}

async function submitOrder(form) {
  const formData = new FormData(form);
  const product = productById(formData.get('product_id'));
  if (!product) return;
  const orderFile = formData.get('order_screenshot');
  const deliveryFile = formData.get('delivery_screenshot');
  const amount = Number(formData.get('amount'));
  const order = {
    product_id: product.id, seller_id: product.seller_id,
    seller_name_snapshot: sellerNameFor(product.seller_id, product.seller_name), product_name: product.name,
    customer_name: formData.get('customer_name').toString().trim(),
    contact_email: state.user?.email || formData.get('contact_email').toString().trim(),
    order_reference: formData.get('order_reference').toString().trim(), order_date: formData.get('order_date'),
    amount, currency: 'INR',
  };
  if (!order.customer_name || !order.order_reference || !order.order_date || !Number.isFinite(amount) || amount < 0 || !orderFile?.size) return;
  const button = form.querySelector('button[type="submit"]');
  button.disabled = true; button.innerHTML = '<span>Submitting securely…</span><span aria-hidden="true">·</span>';
  let uploadedPaths = [];
  try {
    if (state.demo) {
      state.orders.unshift({ ...order, id: `demo-record-${Date.now()}`, status: 'Submitted', order_screenshot_path: `demo-file:${orderFile.name}`, delivery_screenshot_path: deliveryFile?.size ? `demo-file:${deliveryFile.name}` : '', created_at: new Date().toISOString() });
    } else {
      const folderToken = crypto.randomUUID();
      const orderPath = await uploadEvidence(orderFile, state.user.id, folderToken); uploadedPaths.push(orderPath);
      const deliveryPath = deliveryFile?.size ? await uploadEvidence(deliveryFile, state.user.id, folderToken) : null;
      if (deliveryPath) uploadedPaths.push(deliveryPath);
      const { data, error } = await supabase.from('order_submissions').insert({ ...order, user_id: state.user.id, order_screenshot_path: orderPath, delivery_screenshot_path: deliveryPath }).select().single();
      if (error) throw error;
      state.orders.unshift(data);
    }
    state.modal = null; state.selectedProductId = ''; state.view = 'history'; render(); showToast('Order details added to your account.');
  } catch (error) {
    if (!state.demo && uploadedPaths.length) await supabase.storage.from('order-evidence').remove(uploadedPaths).catch(() => {});
    button.disabled = false; button.innerHTML = '<span>Submit order details</span><span aria-hidden="true">↗</span>';
    showToast(error.message || 'Could not submit those details. Please try again.');
  }
}

async function submitFeedback(form) {
  const formData = new FormData(form);
  const order = state.orders.find((item) => item.id === form.dataset.orderId);
  if (!order) return;
  const feedback = { order_record_id: order.id, seller_id: order.seller_id, seller_name_snapshot: order.seller_name_snapshot || sellerNameFor(order.seller_id), product_name: order.product_name, usage_period: formData.get('usage_period'), what_worked: formData.get('what_worked').toString().trim(), improvements: formData.get('improvements').toString().trim(), private_notes: formData.get('private_notes').toString().trim() };
  const button = form.querySelector('button[type="submit"]'); button.disabled = true; button.innerHTML = '<span>Sending privately…</span><span aria-hidden="true">·</span>';
  try {
    if (state.demo) state.feedback.unshift({ ...feedback, id: `demo-feedback-${Date.now()}`, user_id: state.user.id, submitted_at: new Date().toISOString() });
    else {
      const { data, error } = await supabase.from('testing_feedback').insert({ ...feedback, user_id: state.user.id }).select().single();
      if (error) throw error;
      state.feedback.unshift(data);
    }
    state.modal = null; state.view = 'history'; render(); showToast('Product feedback submitted privately.');
  } catch (error) {
    button.disabled = false; button.innerHTML = '<span>Send private feedback</span><span aria-hidden="true">↗</span>';
    showToast(error.message || 'Could not submit feedback. Please try again.');
  }
}

async function submitSupport(form) {
  const formData = new FormData(form);
  const orderId = formData.get('order_record_id') || null;
  const order = state.orders.find((item) => item.id === orderId);
  const request = { order_record_id: order?.id || null, seller_id: order?.seller_id || null, seller_name_snapshot: order?.seller_name_snapshot || sellerNameFor(order?.seller_id), contact_email: state.user?.email || '', topic: formData.get('topic'), details: formData.get('details').toString().trim() };
  if (!request.topic || request.details.length < 8) return;
  const button = form.querySelector('button[type="submit"]'); button.disabled = true; button.innerHTML = '<span>Sending…</span><span aria-hidden="true">·</span>';
  try {
    if (state.demo) state.supportRequests.unshift({ ...request, id: `demo-support-${Date.now()}`, user_id: state.user.id, status: 'Received', created_at: new Date().toISOString() });
    else {
      const { seller_name_snapshot, ...dbRequest } = request;
      const { data, error } = await supabase.from('member_support_requests').insert({ ...dbRequest, user_id: state.user.id }).select().single();
      if (error) throw error;
      state.supportRequests.unshift({ ...data, seller_name_snapshot });
    }
    state.selectedSupportOrderId = ''; render(); showToast('Support request saved.');
  } catch (error) {
    button.disabled = false; button.innerHTML = '<span>Send support request</span><span aria-hidden="true">↗</span>';
    showToast(error.message || 'Could not send your request. Please try again.');
  }
}

async function submitSeller(form) {
  if (!state.user || !state.isAdmin) return;
  const formData = new FormData(form);
  const sellerId = form.dataset.sellerId || '';
  const payload = { name: formData.get('name').toString().trim(), website_url: formData.get('website_url').toString().trim() };
  if (!safeHttps(payload.website_url)) { showToast('Enter a secure seller website beginning with https://'); return; }
  const button = form.querySelector('button[type="submit"]'); button.disabled = true;
  try {
    if (state.demo) {
      if (sellerId) {
        const seller = state.sellers.find((item) => item.id === sellerId);
        if (seller) Object.assign(seller, payload);
      } else state.sellers.unshift({ ...payload, is_active: true, id: `demo-seller-${Date.now()}` });
    } else if (sellerId) {
      const { data, error } = await supabase.from('sellers').update(payload).eq('id', sellerId).select().single();
      if (error) throw error;
      state.sellers = state.sellers.map((item) => item.id === sellerId ? { ...item, ...data } : item);
    } else {
      const { data, error } = await supabase.from('sellers').insert({ ...payload, is_active: true }).select().single();
      if (error) throw error;
      state.sellers.unshift(data);
    }
    state.modal = null; render(); showToast(sellerId ? 'Seller details updated.' : 'Seller added to the directory.');
  } catch (error) { button.disabled = false; showToast(error.message || 'Could not save this seller.'); }
}

async function submitProduct(form) {
  if (!state.user || !state.isAdmin) return;
  const formData = new FormData(form);
  const productId = form.dataset.productId || '';
  const existing = state.products.find((item) => item.id === productId);
  const amountRaw = formData.get('price_amount').toString().trim();
  const priceAmount = amountRaw === '' ? null : Number(amountRaw);
  const payload = {
    seller_id: formData.get('seller_id'),
    name: formData.get('name').toString().trim(),
    category: formData.get('category').toString().trim().toUpperCase(),
    description: formData.get('description').toString().trim(),
    price_label: formData.get('price_label').toString().trim() || (priceAmount === null ? 'See seller for current price' : amountLabel(priceAmount, 'INR')),
    price_amount: priceAmount, currency: 'INR',
    stock_status: formData.get('stock_status') === 'sold_out' ? 'sold_out' : 'available',
    buy_url: formData.get('buy_url').toString().trim(),
    image_url: formData.get('image_url').toString().trim() || null,
    art_variant: formData.get('art_variant').toString(),
    sort_order: Number(formData.get('sort_order') || 0),
    featured: formData.get('featured') === 'true',
    is_active: existing ? existing.is_active !== false : true,
  };
  if (!payload.seller_id || !payload.name || !payload.category) { showToast('Add a product name, category, and seller.'); return; }
  if (!safeHttps(payload.buy_url) || (payload.image_url && !safeHttps(payload.image_url))) { showToast('Product and image links must use https:// URLs.'); return; }
  if (payload.price_amount !== null && (!Number.isFinite(payload.price_amount) || payload.price_amount < 0)) { showToast('Enter a valid non-negative price.'); return; }
  const button = form.querySelector('button[type="submit"]'); button.disabled = true;
  try {
    if (state.demo) {
      if (productId) {
        const index = state.products.findIndex((item) => item.id === productId);
        if (index >= 0) state.products[index] = { ...state.products[index], ...payload, id: productId, seller_name: sellerNameFor(payload.seller_id) };
      } else {
        payload.id = `demo-product-${Date.now()}`;
        payload.seller_name = sellerNameFor(payload.seller_id);
        state.products.unshift(payload);
      }
    } else if (productId) {
      const { data, error } = await supabase.from('catalog_products').update(payload).eq('id', productId).select().single();
      if (error) throw error;
      state.products = state.products.map((item) => item.id === productId ? { ...item, ...data } : item);
    } else {
      const { data, error } = await supabase.from('catalog_products').insert(payload).select().single();
      if (error) throw error;
      state.products.unshift(data);
    }
    state.modal = null; render(); showToast(productId ? 'Product details updated.' : 'Product added to the shop.');
  } catch (error) { button.disabled = false; showToast(error.message || 'Could not save this product.'); }
}

async function setSellerVisibility(sellerId) {
  if (!state.user || !state.isAdmin) return;
  const seller = state.sellers.find((item) => item.id === sellerId);
  if (!seller) return;
  const next = seller.is_active === false;
  if (!state.demo) {
    const { error } = await supabase.from('sellers').update({ is_active: next }).eq('id', sellerId);
    if (error) { showToast(error.message || 'Could not update seller visibility.'); return; }
  }
  seller.is_active = next;
  render();
  showToast(next ? 'Seller is visible in the shop.' : 'Seller hidden from the shop. Existing order history is preserved.');
}

async function setProductVisibility(productId) {
  if (!state.user || !state.isAdmin) return;
  const product = state.products.find((item) => item.id === productId);
  if (!product) return;
  const next = product.is_active === false;
  if (!state.demo) {
    const { error } = await supabase.from('catalog_products').update({ is_active: next }).eq('id', productId);
    if (error) { showToast(error.message || 'Could not update listing visibility.'); return; }
  }
  product.is_active = next;
  render();
  showToast(next ? 'Product listing restored.' : 'Product hidden from the shop. Order history is preserved.');
}

async function setProductStockStatus(productId) {
  if (!state.user || !state.isAdmin) return;
  const product = state.products.find((item) => item.id === productId);
  if (!product) return;
  const next = product.stock_status === 'sold_out' ? 'available' : 'sold_out';
  if (!state.demo) {
    const { error } = await supabase.from('catalog_products').update({ stock_status: next }).eq('id', productId);
    if (error) { showToast(error.message || 'Could not update stock status. Apply the latest database schema.'); return; }
  }
  product.stock_status = next;
  render();
  showToast(next === 'sold_out' ? 'Product marked sold out.' : 'Product marked available.');
}

function csvValue(value) {
  const text = String(value ?? '').replace(/[\r\n]+/g, ' ').trim();
  const guarded = /^[=+\-@\t]/.test(text) ? `'${text}` : text;
  return `"${guarded.replace(/"/g, '""')}"`;
}

function exportAdminCsv() {
  if (!state.user || !state.isAdmin) return;
  const filteredOrders = filterAdminRows(state.orders);
  const filteredFeedback = filterAdminRows(state.feedback);
  const filteredSupport = filterAdminRows(state.supportRequests);
  let headers = []; let rows = [];
  if (state.adminTab === 'orders') {
    headers = ['Submitted IST','User ID','Seller','Product','Customer name','Contact email','Order reference','Order date','Amount','Currency','Order screenshot path','Delivery screenshot path','Status'];
    rows = filteredOrders.map((r) => [timeLabel(r.created_at), r.user_id, r.seller_name_snapshot || sellerNameFor(r.seller_id), r.product_name, r.customer_name, r.contact_email, r.order_reference, r.order_date, r.amount, r.currency, r.order_screenshot_path, r.delivery_screenshot_path, r.status]);
  } else if (state.adminTab === 'feedback') {
    headers = ['Submitted IST','User ID','Seller','Product','Customer name','Member email','Order reference','Usage period','What worked','Improvements','Private notes'];
    rows = filteredFeedback.map((r) => { const order = state.orders.find((o) => o.id === r.order_record_id); return [timeLabel(r.submitted_at), r.user_id || order?.user_id, r.seller_name_snapshot || sellerNameFor(r.seller_id), r.product_name, order?.customer_name, order?.contact_email, order?.order_reference, r.usage_period, r.what_worked, r.improvements, r.private_notes]; });
  } else if (state.adminTab === 'support') {
    headers = ['Submitted IST','User ID','Seller','Product','Customer name','Member email','Order reference','Topic','Details','Status'];
    rows = filteredSupport.map((r) => { const order = state.orders.find((o) => o.id === r.order_record_id); return [timeLabel(r.created_at), r.user_id, r.seller_name_snapshot || (r.seller_id ? sellerNameFor(r.seller_id) : 'General support'), order?.product_name, order?.customer_name, r.contact_email, order?.order_reference, r.topic, r.details, r.status]; });
  } else if (state.adminTab === 'members') {
    headers = ['User ID','Member email','Customer name on order','Account created IST','Last sign-in IST','Order forms','Reported order amount INR (self-reported)','Private feedback forms','Support forms','Latest activity IST'];
    rows = filteredAdminMembers().map((member) => [member.user_id, member.email, member.customer_name, member.account_created_at ? timeLabel(member.account_created_at) : '', member.last_sign_in_at ? timeLabel(member.last_sign_in_at) : '', member.order_count, member.order_amount, member.feedback_count, member.support_count, member.latest_activity ? timeLabel(member.latest_activity) : '']);
  } else {
    const products = state.adminSellerFilter === 'ALL' ? state.products : state.products.filter((p) => p.seller_id === state.adminSellerFilter);
    headers = ['Seller','Product','Category','Description','Price label','Price amount','Currency','Availability','Seller page URL','Image URL','Visible in shop','Featured'];
    rows = products.map((p) => [sellerNameFor(p.seller_id,p.seller_name),p.name,p.category,p.description,p.price_label,p.price_amount,p.currency,p.stock_status || 'available',p.buy_url,p.image_url,p.is_active,p.featured]);
  }
  const csv = [headers, ...rows].map((row) => row.map(csvValue).join(',')).join('\r\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob); const anchor = document.createElement('a');
  const sellerSlug = state.adminSellerFilter === 'ALL' ? 'all-sellers' : sellerNameFor(state.adminSellerFilter).toLowerCase().replace(/[^a-z0-9]+/g, '-');
  anchor.href = url; anchor.download = `sora-${state.adminTab}-${sellerSlug}-${new Date().toISOString().slice(0,10)}.csv`;
  document.body.appendChild(anchor); anchor.click(); anchor.remove(); URL.revokeObjectURL(url);
  showToast('Private admin CSV downloaded. Keep it secure.');
}

async function openEvidence(path) {
  if (!state.user || !state.isAdmin || !path) return;
  if (state.demo || path.startsWith('demo-file:')) { showToast('Demo evidence only — no file is stored in preview mode.'); return; }
  const { data, error } = await supabase.storage.from('order-evidence').createSignedUrl(path, 300);
  if (error || !data?.signedUrl) { showToast(error?.message || 'Could not open this private file.'); return; }
  window.open(data.signedUrl, '_blank', 'noopener,noreferrer');
}

async function updateSupportStatus(id, status) {
  if (!state.user || !state.isAdmin) return;
  const request = state.supportRequests.find((item) => item.id === id);
  if (!request) return;
  if (state.demo) { request.status = status; render(); showToast('Demo status updated.'); return; }
  const { error } = await supabase.from('member_support_requests').update({ status }).eq('id', id);
  if (error) showToast(error.message || 'Could not update status.');
  else { request.status = status; render(); showToast('Request status updated.'); }
}

root.addEventListener('click', async (event) => {
  const target = event.target.closest('button, a');
  if (!target) return;
  if (target.matches('[data-demo-entry]')) { setDemoUser(target.dataset.demoEntry); return; }
  if (target.matches('[data-resend-otp]')) { await resendEmailOtp(target); return; }
  if (target.matches('[data-change-email]')) { state.authMode = target.dataset.authMode === 'admin' ? 'admin' : 'member'; state.authStep = 'email'; state.authStatus = ''; state.authStatusType = ''; render(); document.querySelector(state.authMode === 'admin' ? '#admin-auth-email' : '#member-auth-email')?.focus(); return; }
  if (target.matches('[data-open-auth]')) { openMemberSignIn('Sign in to place an order or view your account.'); return; }
  if (target.matches('[data-view]')) {
    event.preventDefault();
    const nextView = target.dataset.view;
    if (!state.user && ['history','support','admin'].includes(nextView)) {
      openMemberSignIn('Sign in to view your account and continue.');
      return;
    }
    if (nextView === 'admin' && !state.isAdmin) { showToast('Admin access is restricted.'); return; }
    state.view = nextView; state.modal = null; render(); window.scrollTo({ top: 0, behavior: 'smooth' }); return;
  }
  if (target.matches('[data-sign-out]')) {
    if (state.demo) { setDemoUser('member'); return; }
    if (supabase) {
      await supabase.auth.signOut();
      state.user = null; state.session = null; state.isAdmin = false; state.view = 'discover';
state.orders = []; state.feedback = []; state.supportRequests = []; state.members = []; state.membersError = ''; state.adminMemberFilter = 'ALL';
      if (!isAdminRoute()) await loadPublicCatalog();
      render();
    }
    return;
  }
  if (target.matches('[data-shop-tab]')) { state.view = 'discover'; state.modal = null; state.category = 'ALL'; state.searchCategory = 'ALL'; state.sellerFilter = 'ALL'; state.query = ''; state.minPrice = ''; state.maxPrice = ''; state.priceRange = 'ALL'; state.sortBy = 'featured'; render(); document.querySelector('#catalog-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); return; }
  if (target.matches('[data-scroll-catalog]')) { state.view = 'discover'; render(); document.querySelector('#catalog-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); return; }
  if (target.matches('[data-category]')) {
    state.view = 'discover';
    state.category = target.dataset.category;
    state.searchCategory = 'ALL';
    render();
    document.querySelector('#catalog-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    return;
  }
  if (target.matches('[data-seller-filter]')) { state.sellerFilter = target.dataset.sellerFilter; render(); return; }
  if (target.matches('[data-clear-filters]')) { state.category = 'ALL'; state.searchCategory = 'ALL'; state.sellerFilter = 'ALL'; state.query = ''; state.minPrice = ''; state.maxPrice = ''; state.priceRange = 'ALL'; state.sortBy = 'featured'; render(); return; }
  if (target.matches('[data-apply-price]')) { state.priceRange = 'CUSTOM'; state.minPrice = document.querySelector('#min-price')?.value || ''; state.maxPrice = document.querySelector('#max-price')?.value || ''; render(); return; }
  if (target.matches('[data-product-link]')) {
    if (!state.user) { openMemberSignIn('Enter your email and verify the one-time code to continue to this seller.'); return; }
    const product = productById(target.dataset.productLink); const url = safeHttps(product?.buy_url || '');
    if (!url) { showToast('This seller link is not available yet. Please check back soon.'); return; }
    window.open(url, '_blank', 'noopener,noreferrer'); showToast('Opening the seller’s website. Checkout happens there.'); return;
  }
  if (target.matches('[data-add-order]')) {
    if (!state.user) { state.pendingProductId = target.dataset.addOrder; openMemberSignIn('Verify your email to attach order details to your account.'); return; }
    state.selectedProductId = target.dataset.addOrder; state.modal = { type: 'order' }; render(); document.querySelector('#customer-name')?.focus(); return;
  }
  if (target.matches('[data-open-order-modal]')) {
    if (!state.user) { openMemberSignIn('Verify your email to create an order record.'); return; }
    state.selectedProductId = ''; state.modal = { type: 'order' }; render(); return;
  }
  if (target.matches('[data-open-feedback]')) { state.modal = { type: 'feedback', orderId: target.dataset.openFeedback }; render(); document.querySelector('#usage-period')?.focus(); return; }
  if (target.matches('[data-order-support]')) { state.selectedSupportOrderId = target.dataset.orderSupport; state.view = 'support'; state.modal = null; render(); window.scrollTo({ top: 0, behavior: 'smooth' }); return; }
  if (target.matches('[data-admin-member-view]')) { if (!state.isAdmin) return; state.adminMemberFilter = target.dataset.adminMemberView; state.adminTab = 'orders'; render(); document.querySelector('.admin-panel')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); return; }
  if (target.matches('[data-admin-tab]')) { if (!state.isAdmin) return; state.adminTab = target.dataset.adminTab; render(); return; }
  if (target.matches('[data-edit-seller]')) { if (!state.isAdmin) return; state.modal = { type: 'seller', sellerId: target.dataset.editSeller }; render(); return; }
  if (target.matches('[data-edit-product]')) { if (!state.isAdmin) return; state.modal = { type: 'product', productId: target.dataset.editProduct }; render(); return; }
  if (target.matches('[data-toggle-seller]')) { if (!state.isAdmin) return; await setSellerVisibility(target.dataset.toggleSeller); return; }
  if (target.matches('[data-toggle-product-stock]')) { if (!state.isAdmin) return; await setProductStockStatus(target.dataset.toggleProductStock); return; }
  if (target.matches('[data-toggle-product-visibility]')) { if (!state.isAdmin) return; await setProductVisibility(target.dataset.toggleProductVisibility); return; }
  if (target.matches('[data-admin-modal]')) { if (!state.user || !state.isAdmin) return; state.modal = { type: target.dataset.adminModal }; render(); return; }
  if (target.matches('[data-export-csv]')) { if (!state.user || !state.isAdmin) return; exportAdminCsv(); return; }
  if (target.matches('[data-evidence]')) { if (!state.user || !state.isAdmin) return; await openEvidence(target.dataset.evidence); return; }
  if (target.matches('[data-close-modal]')) { state.modal = null; render(); return; }
});

root.addEventListener('click', (event) => {
  if (event.target.classList.contains('modal-backdrop')) { state.modal = null; render(); }
});

root.addEventListener('input', (event) => {
  if (event.target.id === 'shop-search') {
    state.query = event.target.value;
    const grid = document.querySelector('#product-grid');
    if (grid) grid.innerHTML = renderProductCards();
    const count = document.querySelector('#result-count');
    if (count) count.textContent = `${filteredProducts().length} products`;
  }
});

root.addEventListener('change', (event) => {
  if (event.target.id === 'admin-seller-filter') { if (!state.isAdmin) return; state.adminSellerFilter = event.target.value; render(); }
  if (event.target.id === 'admin-member-filter') { if (!state.isAdmin) return; state.adminMemberFilter = event.target.value; render(); }
  if (event.target.id === 'search-category') { state.searchCategory = event.target.value; state.category = 'ALL'; state.view = 'discover'; render(); }
  if (event.target.id === 'filter-category') { state.category = event.target.value; state.searchCategory = 'ALL'; render(); }
  if (event.target.id === 'filter-seller') { state.sellerFilter = event.target.value; render(); }
  if (event.target.id === 'filter-price') {
    state.priceRange = event.target.value;
    const bounds = { '0-499': ['0', '499'], '500-999': ['500', '999'], '1000-2499': ['1000', '2499'], '2500-': ['2500', ''] }[state.priceRange];
    if (bounds) { state.minPrice = bounds[0]; state.maxPrice = bounds[1]; }
    else if (state.priceRange !== 'CUSTOM') { state.minPrice = ''; state.maxPrice = ''; }
    render();
  }
  if (event.target.id === 'sort-products') { state.sortBy = event.target.value; render(); }
  if (event.target.id === 'order-product') { const product = productById(event.target.value); const label = document.querySelector('#order-seller-name'); if (label) label.textContent = sellerNameFor(product?.seller_id, product?.seller_name); }
  if (event.target.matches('[data-support-status]') && state.user && state.isAdmin) void updateSupportStatus(event.target.dataset.supportStatus, event.target.value);
});

root.addEventListener('submit', async (event) => {
  const form = event.target; event.preventDefault();
  if (form.id === 'header-search-form') {
    state.query = new FormData(form).get('query')?.toString() || '';
    state.searchCategory = new FormData(form).get('category')?.toString() || 'ALL';
    state.category = 'ALL'; state.view = 'discover'; render();
    document.querySelector('#catalog-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    return;
  }
  if (form.matches('[data-auth-stage="request-otp"]')) { await requestEmailOtp(form); return; }
  if (form.matches('[data-auth-stage="verify-otp"]')) { await verifyEmailOtp(form); return; }
  if (form.id === 'order-form') await submitOrder(form);
  if (form.id === 'feedback-form') await submitFeedback(form);
  if (form.id === 'support-form') await submitSupport(form);
  if (form.id === 'seller-form') await submitSeller(form);
  if (form.id === 'product-form') await submitProduct(form);
});

async function start() {
  if (isAdminRoute()) state.authMode = 'admin';
  if (!supabase) {
    if (import.meta.env.DEV) {
      const requestedAdminPreview = new URLSearchParams(window.location.search).get('preview') === 'admin';
      if (requestedAdminPreview) setDemoUser('admin');
      else if (isAdminRoute()) render();
      else setDemoUser('member');
      return;
    }
    state.user = null; state.demo = false; state.isAdmin = false; state.sellers = []; state.products = [];
    render();
    return;
  }
  const { data } = await supabase.auth.getSession();
  state.session = data.session;
  state.user = data.session?.user || null;
  if (state.user) await loadWorkspace();
  else if (isAdminRoute()) render();
  else await loadPublicCatalog();

  supabase.auth.onAuthStateChange((_event, session) => {
    state.session = session;
    state.user = session?.user || null;
    state.demo = false;
    if (state.user) {
      state.modal = null;
      state.authStep = 'email';
      state.authEmail = '';
      state.authStatus = '';
      state.authStatusType = '';
      void loadWorkspace();
    } else {
      state.isAdmin = false;
      state.modal = null;
      state.orders = [];
      state.feedback = [];
      state.supportRequests = [];
      state.members = [];
      state.membersError = '';
      state.adminMemberFilter = 'ALL';
      if (isAdminRoute()) render();
      else void loadPublicCatalog();
    }
  });
}
start();
