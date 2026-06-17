const state = {
  categories: [],
  products: [],
  banners: [],
  activeCategory: 'breakfast',
  cart: JSON.parse(localStorage.getItem('kykey_cart') || '[]'),
  user: null
};

const money = (value) => `${value.toLocaleString('ru-RU')} ₽`;
const byId = (id) => document.getElementById(id);

function toast(message) {
  const el = byId('toast');
  el.textContent = message;
  el.classList.add('show');
  setTimeout(() => el.classList.remove('show'), 2600);
}

async function api(url, options = {}) {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    ...options
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Ошибка запроса');
  return data;
}

function saveCart() {
  localStorage.setItem('kykey_cart', JSON.stringify(state.cart));
  renderCart();
}

function productById(id) {
  return state.products.find((product) => product.id === Number(id));
}

function addToCart(productId) {
  const product = productById(productId);
  if (!product) return;
  const existing = state.cart.find((item) => item.productId === product.id);
  if (existing) existing.qty += 1;
  else state.cart.push({ productId: product.id, qty: 1 });
  saveCart();
  toast(`${product.name} добавлен в корзину`);
}

function changeQty(productId, delta) {
  const item = state.cart.find((entry) => entry.productId === Number(productId));
  if (!item) return;
  item.qty += delta;
  if (item.qty <= 0) state.cart = state.cart.filter((entry) => entry.productId !== item.productId);
  saveCart();
}

function renderBanners() {
  byId('banners').innerHTML = state.banners.map((banner) => `
    <article class="banner-card ${banner.theme}">
      <div>
        <h3>${banner.title}</h3>
        <p>${banner.subtitle || ''}</p>
      </div>
      ${banner.button_text && banner.button_link ? `<a href="${banner.button_link}">${banner.button_text}</a>` : ''}
    </article>
  `).join('');
}

function renderTabs() {
  byId('tabs').innerHTML = state.categories.map((category) => `
    <button class="tab ${category.slug === state.activeCategory ? 'active' : ''}" type="button" data-slug="${category.slug}">
      ${category.name}
    </button>
  `).join('');
}

function renderProducts() {
  const products = state.products.filter((product) => product.category_slug === state.activeCategory);
  byId('products').innerHTML = products.map((product) => `
    <article class="product-card">
      <div class="product-art ${product.image_tone}" aria-hidden="true"></div>
      <div class="product-body">
        <h3>${product.name}</h3>
        <p>${product.description || ''}</p>
        <div class="product-meta">${product.calories || 'Порция'}${product.is_vegan ? ' · Вегетарианское' : ''}</div>
        <div class="product-footer">
          <span class="price">${money(product.price)}</span>
          <button class="add-button" type="button" data-add="${product.id}">Добавить</button>
        </div>
      </div>
    </article>
  `).join('');
}

function renderConstructor() {
  const items = [
    ['Яйцо пашот', 80],
    ['Авокадо', 120],
    ['Лосось', 180],
    ['Бекон', 130],
    ['Сырный соус', 70],
    ['Круассан', 140],
    ['Грибы', 90],
    ['Тост', 60]
  ];
  byId('constructorItems').innerHTML = items.map(([name, price], index) => `
    <div class="constructor-item">
      <span>${name}<br><small>${money(price)}</small></span>
      <button type="button" data-custom="${index}">+</button>
    </div>
  `).join('');
}

function renderCart() {
  const count = state.cart.reduce((sum, item) => sum + item.qty, 0);
  byId('cartCount').textContent = count;
  const rows = state.cart.map((item) => {
    const product = productById(item.productId);
    if (!product) return '';
    return `
      <div class="cart-line">
        <div>
          <strong>${product.name}</strong>
          <small>${money(product.price)} за шт.</small>
        </div>
        <div class="cart-controls">
          <button type="button" data-qty="${product.id}" data-delta="-1">−</button>
          <span>${item.qty}</span>
          <button type="button" data-qty="${product.id}" data-delta="1">+</button>
        </div>
      </div>
    `;
  }).join('');
  const total = state.cart.reduce((sum, item) => {
    const product = productById(item.productId);
    return sum + (product ? product.price * item.qty : 0);
  }, 0);
  byId('cartItems').innerHTML = rows || '<p>Корзина пуста. Добавьте что-нибудь вкусное из меню.</p>';
  if (rows) byId('cartItems').insertAdjacentHTML('beforeend', `<div class="cart-total">Итого: ${money(total)}</div>`);
}

function renderAccount() {
  const accountState = byId('accountState');
  const accountOpen = byId('accountOpen');
  if (!state.user) {
    accountState.innerHTML = '<div class="account-box">Войдите или зарегистрируйтесь, чтобы данные подставлялись в заказ.</div>';
    accountOpen.textContent = 'Войти';
    return;
  }
  accountOpen.textContent = state.user.name.split(' ')[0];
  accountState.innerHTML = `
    <div class="account-box">
      <strong>${state.user.name}</strong><br>
      <small>${state.user.email}</small>
      ${state.user.isAdmin ? '<p><a href="/admin">Открыть админку</a></p>' : ''}
      <button class="secondary-button" type="button" id="logoutButton">Выйти</button>
    </div>
  `;
  byId('logoutButton')?.addEventListener('click', async () => {
    await api('/api/logout', { method: 'POST' });
    state.user = null;
    renderAccount();
    toast('Вы вышли из аккаунта');
  });
}

function openDrawer(id) {
  byId(id).classList.add('open');
  byId(id).setAttribute('aria-hidden', 'false');
}

function closeDrawer(id) {
  byId(id).classList.remove('open');
  byId(id).setAttribute('aria-hidden', 'true');
}

async function load() {
  const [menu, me] = await Promise.all([api('/api/menu'), api('/api/me')]);
  Object.assign(state, menu);
  state.user = me.user;
  renderBanners();
  renderTabs();
  renderProducts();
  renderConstructor();
  renderCart();
  renderAccount();
}

document.addEventListener('click', (event) => {
  const tab = event.target.closest('[data-slug]');
  if (tab) {
    state.activeCategory = tab.dataset.slug;
    renderTabs();
    renderProducts();
  }
  const add = event.target.closest('[data-add]');
  if (add) addToCart(add.dataset.add);
  const qty = event.target.closest('[data-qty]');
  if (qty) changeQty(qty.dataset.qty, Number(qty.dataset.delta));
  if (event.target.closest('[data-custom]')) toast('Добавки конструктора скоро попадут в меню как отдельные товары');
});

byId('cartOpen').addEventListener('click', () => openDrawer('cartDrawer'));
byId('cartClose').addEventListener('click', () => closeDrawer('cartDrawer'));
byId('accountOpen').addEventListener('click', () => openDrawer('accountDrawer'));
byId('accountClose').addEventListener('click', () => closeDrawer('accountDrawer'));
byId('mobileMenuOpen').addEventListener('click', () => byId('mobileNav').classList.add('open'));
byId('mobileMenuClose').addEventListener('click', () => byId('mobileNav').classList.remove('open'));
byId('mobileNav').addEventListener('click', (event) => {
  if (event.target.matches('a')) byId('mobileNav').classList.remove('open');
});

byId('orderForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  try {
    const order = await api('/api/orders', {
      method: 'POST',
      body: JSON.stringify({
        customerName: form.get('customerName'),
        phone: form.get('phone'),
        address: form.get('address'),
        comment: form.get('comment'),
        items: state.cart
      })
    });
    state.cart = [];
    saveCart();
    closeDrawer('cartDrawer');
    event.currentTarget.reset();
    toast(`Заказ #${order.id} принят`);
  } catch (error) {
    toast(error.message);
  }
});

byId('loginForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  try {
    const data = await api('/api/login', {
      method: 'POST',
      body: JSON.stringify({ email: form.get('email'), password: form.get('password') })
    });
    state.user = data.user;
    renderAccount();
    toast('Вы вошли');
  } catch (error) {
    toast(error.message);
  }
});

byId('registerForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  try {
    const data = await api('/api/register', {
      method: 'POST',
      body: JSON.stringify({
        name: form.get('name'),
        phone: form.get('phone'),
        email: form.get('email'),
        password: form.get('password')
      })
    });
    state.user = data.user;
    renderAccount();
    toast('Аккаунт создан');
  } catch (error) {
    toast(error.message);
  }
});

load().catch((error) => toast(error.message));
