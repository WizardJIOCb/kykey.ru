const $ = (id) => document.getElementById(id);
const money = (value) => `${Number(value).toLocaleString('ru-RU')} ₽`;
let categories = [];
let products = [];
let banners = [];

function toast(message) {
  const el = $('toast');
  el.textContent = message;
  el.classList.add('show');
  setTimeout(() => el.classList.remove('show'), 2400);
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

function formObject(form) {
  const data = Object.fromEntries(new FormData(form).entries());
  data.isVegan = form.elements.isVegan?.checked || false;
  data.isActive = form.elements.isActive?.checked || false;
  return data;
}

async function checkAuth() {
  const { user } = await api('/api/me');
  if (!user?.isAdmin) {
    $('loginView').classList.remove('hidden');
    $('adminView').classList.add('hidden');
    return;
  }
  $('loginView').classList.add('hidden');
  $('adminView').classList.remove('hidden');
  await Promise.all([loadProducts(), loadBanners(), loadOrders()]);
}

async function loadProducts() {
  const data = await api('/api/admin/products');
  categories = data.categories;
  products = data.products;
  const select = $('productForm').elements.categoryId;
  select.innerHTML = categories.map((cat) => `<option value="${cat.id}">${cat.name}</option>`).join('');
  renderProducts();
}

function renderProducts() {
  $('productList').innerHTML = products.map((product) => `
    <div class="admin-row">
      <div>
        <strong>${product.name}</strong>
        <small>${product.category_name} · ${money(product.price)} · ${product.is_active ? 'активен' : 'скрыт'}</small>
      </div>
      <div class="row-actions">
        <button type="button" data-edit-product="${product.id}">Править</button>
        <button type="button" data-hide-product="${product.id}">Скрыть</button>
      </div>
    </div>
  `).join('');
}

function fillProduct(product = {}) {
  const form = $('productForm');
  form.elements.id.value = product.id || '';
  form.elements.name.value = product.name || '';
  form.elements.categoryId.value = product.category_id || categories[0]?.id || '';
  form.elements.price.value = product.price || '';
  form.elements.calories.value = product.calories || '';
  form.elements.imageTone.value = product.image_tone || 'yellow';
  form.elements.description.value = product.description || '';
  form.elements.isVegan.checked = Boolean(product.is_vegan);
  form.elements.isActive.checked = product.id ? Boolean(product.is_active) : true;
}

async function loadBanners() {
  const data = await api('/api/admin/banners');
  banners = data.banners;
  renderBanners();
}

function renderBanners() {
  $('bannerList').innerHTML = banners.map((banner) => `
    <div class="admin-row">
      <div>
        <strong>${banner.title}</strong>
        <small>${banner.theme} · ${banner.is_active ? 'активен' : 'скрыт'}</small>
      </div>
      <div class="row-actions">
        <button type="button" data-edit-banner="${banner.id}">Править</button>
        <button type="button" data-hide-banner="${banner.id}">Скрыть</button>
      </div>
    </div>
  `).join('');
}

function fillBanner(banner = {}) {
  const form = $('bannerForm');
  form.elements.id.value = banner.id || '';
  form.elements.title.value = banner.title || '';
  form.elements.subtitle.value = banner.subtitle || '';
  form.elements.buttonText.value = banner.button_text || '';
  form.elements.buttonLink.value = banner.button_link || '';
  form.elements.theme.value = banner.theme || 'yellow';
  form.elements.isActive.checked = banner.id ? Boolean(banner.is_active) : true;
}

async function loadOrders() {
  const { orders } = await api('/api/admin/orders');
  $('ordersList').innerHTML = orders.map((order) => `
    <div class="order-row">
      <div>
        <strong>#${order.id} · ${order.customer_name} · ${money(order.total)}</strong>
        <small>${order.phone} · ${order.address || 'самовывоз'} · ${order.created_at}</small>
      </div>
      <div class="row-actions">
        <select class="status-select" data-order-status="${order.id}">
          ${['new','accepted','cooking','ready','done','cancelled'].map((status) => `<option value="${status}" ${status === order.status ? 'selected' : ''}>${status}</option>`).join('')}
        </select>
      </div>
      <div class="order-items">${order.items.map((item) => `${item.name} x ${item.qty}`).join(', ')}</div>
    </div>
  `).join('') || '<p>Заказов пока нет.</p>';
}

$('adminLogin').addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  try {
    await api('/api/login', {
      method: 'POST',
      body: JSON.stringify({ email: form.get('email'), password: form.get('password') })
    });
    toast('Вход выполнен');
    await checkAuth();
  } catch (error) {
    toast(error.message);
  }
});

$('logout').addEventListener('click', async () => {
  await api('/api/logout', { method: 'POST' });
  location.reload();
});

$('newProduct').addEventListener('click', () => fillProduct());
$('newBanner').addEventListener('click', () => fillBanner());
$('refreshOrders').addEventListener('click', loadOrders);

$('productForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  const data = formObject(event.currentTarget);
  const id = data.id;
  const payload = {
    name: data.name,
    categoryId: Number(data.categoryId),
    price: Number(data.price),
    calories: data.calories,
    imageTone: data.imageTone,
    description: data.description,
    isVegan: data.isVegan,
    isActive: data.isActive
  };
  try {
    await api(id ? `/api/admin/products/${id}` : '/api/admin/products', {
      method: id ? 'PUT' : 'POST',
      body: JSON.stringify(payload)
    });
    fillProduct();
    await loadProducts();
    toast('Товар сохранен');
  } catch (error) {
    toast(error.message);
  }
});

$('bannerForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  const data = formObject(event.currentTarget);
  const id = data.id;
  try {
    await api(id ? `/api/admin/banners/${id}` : '/api/admin/banners', {
      method: id ? 'PUT' : 'POST',
      body: JSON.stringify(data)
    });
    fillBanner();
    await loadBanners();
    toast('Баннер сохранен');
  } catch (error) {
    toast(error.message);
  }
});

document.addEventListener('click', async (event) => {
  const editProduct = event.target.closest('[data-edit-product]');
  if (editProduct) fillProduct(products.find((product) => product.id === Number(editProduct.dataset.editProduct)));
  const hideProduct = event.target.closest('[data-hide-product]');
  if (hideProduct) {
    await api(`/api/admin/products/${hideProduct.dataset.hideProduct}`, { method: 'DELETE' });
    await loadProducts();
    toast('Товар скрыт');
  }
  const editBanner = event.target.closest('[data-edit-banner]');
  if (editBanner) fillBanner(banners.find((banner) => banner.id === Number(editBanner.dataset.editBanner)));
  const hideBanner = event.target.closest('[data-hide-banner]');
  if (hideBanner) {
    await api(`/api/admin/banners/${hideBanner.dataset.hideBanner}`, { method: 'DELETE' });
    await loadBanners();
    toast('Баннер скрыт');
  }
});

document.addEventListener('change', async (event) => {
  const select = event.target.closest('[data-order-status]');
  if (!select) return;
  await api(`/api/admin/orders/${select.dataset.orderStatus}`, {
    method: 'PATCH',
    body: JSON.stringify({ status: select.value })
  });
  toast('Статус обновлен');
});

checkAuth().catch(() => {
  $('loginView').classList.remove('hidden');
  $('adminView').classList.add('hidden');
});
