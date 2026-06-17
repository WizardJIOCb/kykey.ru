const crypto = require('crypto');
const path = require('path');
const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('./db');

const app = express();
const port = Number(process.env.PORT || 3000);
const cookieName = 'kykey_auth';
const authSecret = process.env.AUTH_SECRET || 'dev-change-me-kykey-secret';
const secureCookie = process.env.COOKIE_SECURE === 'true';

app.disable('x-powered-by');
app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, '..', 'public')));

function parseCookies(req) {
  const header = req.headers.cookie || '';
  return Object.fromEntries(header.split(';').filter(Boolean).map((part) => {
    const index = part.indexOf('=');
    return [part.slice(0, index).trim(), decodeURIComponent(part.slice(index + 1))];
  }));
}

function sign(payload) {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto.createHmac('sha256', authSecret).update(body).digest('base64url');
  return `${body}.${sig}`;
}

function verify(token) {
  if (!token || !token.includes('.')) return null;
  const [body, sig] = token.split('.');
  const expected = crypto.createHmac('sha256', authSecret).update(body).digest('base64url');
  if (sig.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
  if (!payload.exp || payload.exp < Date.now()) return null;
  return payload;
}

function setAuthCookie(res, user) {
  const token = sign({ id: user.id, exp: Date.now() + 1000 * 60 * 60 * 24 * 14 });
  res.cookie(cookieName, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: secureCookie,
    maxAge: 1000 * 60 * 60 * 24 * 14
  });
}

function clearAuthCookie(res) {
  res.clearCookie(cookieName, { httpOnly: true, sameSite: 'lax', secure: secureCookie });
}

function publicUser(row) {
  if (!row) return null;
  return { id: row.id, name: row.name, phone: row.phone, email: row.email, isAdmin: Boolean(row.is_admin) };
}

function getRequestUser(req) {
  try {
    const payload = verify(parseCookies(req)[cookieName]);
    if (!payload) return null;
    return db.prepare('SELECT id, name, phone, email, is_admin FROM users WHERE id = ?').get(payload.id) || null;
  } catch (_error) {
    return null;
  }
}

app.use((req, _res, next) => {
  req.user = getRequestUser(req);
  next();
});

function requireAdmin(req, res, next) {
  if (!req.user || !req.user.is_admin) return res.status(403).json({ error: 'Нужен доступ администратора' });
  next();
}

function cleanString(value, max = 500) {
  return String(value || '').trim().slice(0, max);
}

function requireFields(body, fields) {
  for (const field of fields) {
    if (!cleanString(body[field])) return field;
  }
  return null;
}

app.get('/api/me', (req, res) => {
  res.json({ user: publicUser(req.user) });
});

app.post('/api/register', (req, res) => {
  if (requireFields(req.body, ['name', 'email', 'password'])) {
    return res.status(400).json({ error: 'Заполните имя, email и пароль' });
  }
  const name = cleanString(req.body.name, 120);
  const email = cleanString(req.body.email, 160).toLowerCase();
  const phone = cleanString(req.body.phone, 40);
  const password = String(req.body.password || '');
  if (password.length < 6) return res.status(400).json({ error: 'Пароль должен быть не короче 6 символов' });
  if (db.prepare('SELECT id FROM users WHERE email = ?').get(email)) {
    return res.status(409).json({ error: 'Такой email уже зарегистрирован' });
  }

  const hash = bcrypt.hashSync(password, 12);
  const result = db.prepare('INSERT INTO users (name, phone, email, password_hash) VALUES (?, ?, ?, ?)').run(name, phone, email, hash);
  const user = db.prepare('SELECT id, name, phone, email, is_admin FROM users WHERE id = ?').get(result.lastInsertRowid);
  setAuthCookie(res, user);
  res.status(201).json({ user: publicUser(user) });
});

app.post('/api/login', (req, res) => {
  const email = cleanString(req.body.email, 160).toLowerCase();
  const password = String(req.body.password || '');
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  if (!user || !bcrypt.compareSync(password, user.password_hash)) return res.status(401).json({ error: 'Неверный email или пароль' });
  setAuthCookie(res, user);
  res.json({ user: publicUser(user) });
});

app.post('/api/logout', (_req, res) => {
  clearAuthCookie(res);
  res.json({ ok: true });
});

app.get('/api/menu', (_req, res) => {
  const categories = db.prepare('SELECT id, slug, name FROM categories ORDER BY sort_order, id').all();
  const products = db.prepare(`
    SELECT p.*, c.slug AS category_slug
    FROM products p
    JOIN categories c ON c.id = p.category_id
    WHERE p.is_active = 1
    ORDER BY c.sort_order, p.sort_order, p.id
  `).all();
  const banners = db.prepare('SELECT * FROM banners WHERE is_active = 1 ORDER BY sort_order, id').all();
  res.json({ categories, products, banners });
});

app.post('/api/orders', (req, res) => {
  const customerName = cleanString(req.body.customerName || req.body.name, 120) || req.user?.name;
  const phone = cleanString(req.body.phone, 40) || req.user?.phone;
  const address = cleanString(req.body.address, 240);
  const comment = cleanString(req.body.comment, 500);
  const items = Array.isArray(req.body.items) ? req.body.items : [];
  if (!customerName || !phone) return res.status(400).json({ error: 'Заполните имя и телефон' });
  if (!items.length) return res.status(400).json({ error: 'Корзина пуста' });

  const productStmt = db.prepare('SELECT id, name, price FROM products WHERE id = ? AND is_active = 1');
  const normalized = [];
  for (const item of items) {
    const product = productStmt.get(Number(item.productId));
    const qty = Math.max(1, Math.min(20, Number(item.qty || 1)));
    if (product) normalized.push({ ...product, qty });
  }
  if (!normalized.length) return res.status(400).json({ error: 'В корзине нет доступных товаров' });
  const total = normalized.reduce((sum, item) => sum + item.price * item.qty, 0);

  const createOrder = db.transaction(() => {
    const result = db.prepare(`
      INSERT INTO orders (user_id, customer_name, phone, address, comment, total)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(req.user?.id || null, customerName, phone, address, comment, total);
    const insertItem = db.prepare('INSERT INTO order_items (order_id, product_id, name, price, qty) VALUES (?, ?, ?, ?, ?)');
    normalized.forEach((item) => insertItem.run(result.lastInsertRowid, item.id, item.name, item.price, item.qty));
    return result.lastInsertRowid;
  });

  const orderId = createOrder();
  res.status(201).json({ id: orderId, total, status: 'new' });
});

app.get('/api/admin/products', requireAdmin, (_req, res) => {
  const categories = db.prepare('SELECT * FROM categories ORDER BY sort_order, id').all();
  const products = db.prepare(`
    SELECT p.*, c.slug AS category_slug, c.name AS category_name
    FROM products p
    JOIN categories c ON c.id = p.category_id
    ORDER BY p.is_active DESC, c.sort_order, p.sort_order, p.id
  `).all();
  res.json({ categories, products });
});

app.post('/api/admin/products', requireAdmin, (req, res) => {
  if (requireFields(req.body, ['name', 'categoryId', 'price'])) return res.status(400).json({ error: 'Заполните название, категорию и цену' });
  const result = db.prepare(`
    INSERT INTO products (category_id, name, description, price, calories, is_vegan, is_active, image_tone, sort_order)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    Number(req.body.categoryId),
    cleanString(req.body.name, 160),
    cleanString(req.body.description, 500),
    Number(req.body.price),
    cleanString(req.body.calories, 80),
    req.body.isVegan ? 1 : 0,
    req.body.isActive === false ? 0 : 1,
    cleanString(req.body.imageTone, 40) || 'yellow',
    Number(req.body.sortOrder || 100)
  );
  res.status(201).json({ id: result.lastInsertRowid });
});

app.put('/api/admin/products/:id', requireAdmin, (req, res) => {
  db.prepare(`
    UPDATE products
    SET category_id = ?, name = ?, description = ?, price = ?, calories = ?, is_vegan = ?, is_active = ?, image_tone = ?, sort_order = ?
    WHERE id = ?
  `).run(
    Number(req.body.categoryId),
    cleanString(req.body.name, 160),
    cleanString(req.body.description, 500),
    Number(req.body.price),
    cleanString(req.body.calories, 80),
    req.body.isVegan ? 1 : 0,
    req.body.isActive ? 1 : 0,
    cleanString(req.body.imageTone, 40) || 'yellow',
    Number(req.body.sortOrder || 100),
    Number(req.params.id)
  );
  res.json({ ok: true });
});

app.delete('/api/admin/products/:id', requireAdmin, (req, res) => {
  db.prepare('UPDATE products SET is_active = 0 WHERE id = ?').run(Number(req.params.id));
  res.json({ ok: true });
});

app.get('/api/admin/banners', requireAdmin, (_req, res) => {
  const banners = db.prepare('SELECT * FROM banners ORDER BY is_active DESC, sort_order, id').all();
  res.json({ banners });
});

app.post('/api/admin/banners', requireAdmin, (req, res) => {
  if (!cleanString(req.body.title, 160)) return res.status(400).json({ error: 'Заполните заголовок баннера' });
  const result = db.prepare(`
    INSERT INTO banners (title, subtitle, button_text, button_link, theme, is_active, sort_order)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    cleanString(req.body.title, 160),
    cleanString(req.body.subtitle, 300),
    cleanString(req.body.buttonText, 80),
    cleanString(req.body.buttonLink, 160),
    cleanString(req.body.theme, 40) || 'yellow',
    req.body.isActive === false ? 0 : 1,
    Number(req.body.sortOrder || 100)
  );
  res.status(201).json({ id: result.lastInsertRowid });
});

app.put('/api/admin/banners/:id', requireAdmin, (req, res) => {
  db.prepare(`
    UPDATE banners
    SET title = ?, subtitle = ?, button_text = ?, button_link = ?, theme = ?, is_active = ?, sort_order = ?
    WHERE id = ?
  `).run(
    cleanString(req.body.title, 160),
    cleanString(req.body.subtitle, 300),
    cleanString(req.body.buttonText, 80),
    cleanString(req.body.buttonLink, 160),
    cleanString(req.body.theme, 40) || 'yellow',
    req.body.isActive ? 1 : 0,
    Number(req.body.sortOrder || 100),
    Number(req.params.id)
  );
  res.json({ ok: true });
});

app.delete('/api/admin/banners/:id', requireAdmin, (req, res) => {
  db.prepare('UPDATE banners SET is_active = 0 WHERE id = ?').run(Number(req.params.id));
  res.json({ ok: true });
});

app.get('/api/admin/orders', requireAdmin, (_req, res) => {
  const orders = db.prepare('SELECT * FROM orders ORDER BY id DESC LIMIT 100').all();
  const items = db.prepare('SELECT * FROM order_items WHERE order_id = ? ORDER BY id');
  res.json({ orders: orders.map((order) => ({ ...order, items: items.all(order.id) })) });
});

app.patch('/api/admin/orders/:id', requireAdmin, (req, res) => {
  const status = cleanString(req.body.status, 40);
  if (!['new', 'accepted', 'cooking', 'ready', 'done', 'cancelled'].includes(status)) {
    return res.status(400).json({ error: 'Неизвестный статус' });
  }
  db.prepare('UPDATE orders SET status = ? WHERE id = ?').run(status, Number(req.params.id));
  res.json({ ok: true });
});

app.get('/admin', (_req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'admin', 'index.html'));
});

app.use((_req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

app.listen(port, () => {
  console.log(`Kykey app is running on http://localhost:${port}`);
  console.log(`Admin login: ${process.env.ADMIN_EMAIL || 'admin@kykey.ru'} / ${process.env.ADMIN_PASSWORD || 'KykeyAdmin2026!'}`);
});
