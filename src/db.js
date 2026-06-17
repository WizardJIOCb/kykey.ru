const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');

const dataDir = path.join(__dirname, '..', 'data');
fs.mkdirSync(dataDir, { recursive: true });

const dbPath = process.env.DB_PATH || path.join(dataDir, 'kykey.sqlite');
const db = new Database(dbPath);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

function migrate() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      phone TEXT,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      is_admin INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      slug TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      category_id INTEGER NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      description TEXT,
      price INTEGER NOT NULL,
      calories TEXT,
      is_vegan INTEGER NOT NULL DEFAULT 0,
      is_active INTEGER NOT NULL DEFAULT 1,
      image_tone TEXT NOT NULL DEFAULT 'yellow',
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS banners (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      subtitle TEXT,
      button_text TEXT,
      button_link TEXT,
      theme TEXT NOT NULL DEFAULT 'yellow',
      is_active INTEGER NOT NULL DEFAULT 1,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      customer_name TEXT NOT NULL,
      phone TEXT NOT NULL,
      address TEXT,
      comment TEXT,
      total INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'new',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS order_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
      product_id INTEGER REFERENCES products(id) ON DELETE SET NULL,
      name TEXT NOT NULL,
      price INTEGER NOT NULL,
      qty INTEGER NOT NULL
    );
  `);
}

const categories = [
  ['breakfast', 'Завтраки весь день'],
  ['croissants', 'Круассаны'],
  ['snacks', 'Перекус'],
  ['salads', 'Салаты'],
  ['hot', 'Супы и пасты'],
  ['sweet', 'Сладкое'],
  ['kids', 'Детское'],
  ['drinks', 'Напитки'],
  ['lunch', 'Бизнес-ланч']
];

const products = [
  ['breakfast', 'Драники с хрустящим беконом', 'Картофельные драники, яйцо пашот, бекон и сметанный соус.', 420, '520 ккал', 0, 'yellow'],
  ['breakfast', 'Драники с лососем', 'Драники, слабосоленый лосось, яйцо пашот и зелень.', 480, '480 ккал', 0, 'mint'],
  ['breakfast', 'Супер-люкс бутерброд', 'Большой тост с яйцом, сыром, томатами и фирменным соусом.', 560, '610 ккал', 0, 'coral'],
  ['breakfast', 'Бенедикт с беконом', 'Бриошь, бекон, яйцо пашот и голландез.', 440, '470 ккал', 0, 'yellow'],
  ['breakfast', 'Большой английский завтрак', 'Яйца, сосиски, фасоль, тост, грибы и томаты.', 430, '680 ккал', 0, 'black'],
  ['breakfast', 'Тост с креветками и вялеными томатами', 'Хрустящий тост, креветки, авокадо и вяленые томаты.', 560, '430 ккал', 0, 'mint'],
  ['breakfast', 'Злаковая каша с яйцом пашот и пармезаном', 'Теплая соленая каша с пармезаном, яйцом и маслом.', 340, '360 ккал', 0, 'yellow'],
  ['breakfast', 'Нутовый омлет с грибами и авокадо', 'Сытный растительный омлет с грибами, зеленью и авокадо.', 380, '390 ккал', 1, 'mint'],
  ['breakfast', 'Омлет Сицилия', 'Омлет с томатами, сыром, зеленью и пикантным соусом.', 410, '430 ккал', 0, 'coral'],
  ['breakfast', 'Грин-тост', 'Зеленый тост с авокадо, овощами и семенами.', 360, '340 ккал', 1, 'mint'],
  ['breakfast', 'Шакшука с яйцом пашот', 'Томатная шакшука, яйцо пашот, зелень и хрустящий хлеб.', 410, '410 ккал', 1, 'coral'],
  ['croissants', 'Круассан гриль с лососем', 'Круассан с лососем, авокадо и яйцом пашот.', 420, '430 ккал', 0, 'mint'],
  ['croissants', 'Круассан с жульеном: курица и грибы', 'Запеченный круассан с нежным жульеном.', 370, '520 ккал', 0, 'yellow'],
  ['croissants', 'Круассан с жульеном: креветки', 'Сливочный жульен с креветками в хрустящем круассане.', 410, '500 ккал', 0, 'mint'],
  ['croissants', 'Круассан-хачапури', 'Сырная начинка, яйцо и золотистая корочка.', 340, '540 ккал', 0, 'yellow'],
  ['croissants', 'Круассан с яичницей и мортаделлой', 'Горячий круассан с яичницей, мортаделлой и сыром.', 360, '560 ккал', 0, 'coral'],
  ['snacks', 'Сэндвич с курочкой BBQ', 'Курица BBQ, свежие овощи и мягкий хлеб.', 340, '363 ккал', 0, 'black'],
  ['snacks', 'Сэндвич с тунцом и авокадо', 'Тунец, авокадо, салат и легкий соус.', 360, '318 ккал', 0, 'mint'],
  ['snacks', 'Батат фри с пармезаном', 'Батат, пармезан и чесночный соус.', 310, '460 ккал', 1, 'coral'],
  ['snacks', 'Картофельные палочки с моцареллой', 'Тянущаяся моцарелла и хрустящая картофельная корочка.', 290, '520 ккал', 0, 'yellow'],
  ['salads', 'Салат с хамоном, персиками и фетой', 'Сладкие персики, хамон, фета и свежая зелень.', 460, '340 ккал', 0, 'coral'],
  ['salads', 'Цезарь с цыпленком', 'Классический цезарь с цыпленком и пармезаном.', 420, '420 ккал', 0, 'yellow'],
  ['salads', 'Греческий', 'Овощи, оливки, фета и ароматная заправка.', 380, '280 ккал', 1, 'mint'],
  ['salads', 'Салат с хрустящими баклажанами', 'Баклажаны, мягкий сыр, томаты и соус.', 420, '310 ккал', 1, 'coral'],
  ['hot', 'Паста Карбонара', 'Сливочный соус, бекон, пармезан и паста al dente.', 410, '680 ккал', 0, 'black'],
  ['hot', 'Паста с цыпленком и грибами', 'Курица, грибы и сливочный соус.', 420, '590 ккал', 0, 'yellow'],
  ['hot', 'Паста с креветками', 'Креветки, томаты, зелень и легкий соус.', 490, '540 ккал', 0, 'mint'],
  ['hot', 'Крем-суп', 'Сырный, грибной или тыквенный на выбор.', 380, 'от 210 ккал', 1, 'yellow'],
  ['hot', 'Борщ', 'Домашний борщ со сметаной и зеленью.', 390, '310 ккал', 0, 'coral'],
  ['hot', 'Палтус', 'Филе палтуса на гриле с овощами и соусом.', 590, '310 ккал', 0, 'mint'],
  ['sweet', 'Круассан крем-брюле', 'Запеченный круассан с нежным кремом.', 370, '520 ккал', 0, 'yellow'],
  ['sweet', 'Круассан с крем-чизом и ягодами', 'Крем-чиз, ягоды и хрустящий круассан.', 350, '341 ккал', 0, 'coral'],
  ['sweet', 'Круассан с нутеллой или карамелью', 'Сладкий круассан с начинкой на выбор.', 310, '480 ккал', 0, 'black'],
  ['sweet', 'Оладушки по-домашнему', 'Пышные оладьи с ягодным соусом.', 340, '360 ккал', 0, 'yellow'],
  ['kids', 'Картошка фри с соусом', 'Золотистый картофель и соус.', 170, null, 1, 'yellow'],
  ['kids', 'Наггетсы с соусом', '5 или 10 штук, соус на выбор.', 120, null, 0, 'coral'],
  ['kids', 'Макарошки с сыром', 'Нежная паста с сырным соусом.', 180, null, 0, 'yellow'],
  ['kids', 'Молочный коктейль', 'Шоколад, клубника или ваниль.', 190, null, 0, 'mint'],
  ['drinks', 'Эспрессо', '36 мл.', 110, null, 1, 'black'],
  ['drinks', 'Американо', '200 или 300 мл.', 190, null, 1, 'black'],
  ['drinks', 'Капучино', '200 или 300 мл.', 200, null, 1, 'yellow'],
  ['drinks', 'Латте', '300 мл.', 240, null, 1, 'yellow'],
  ['drinks', 'Раф', '300 мл.', 240, null, 1, 'coral'],
  ['drinks', 'Жилэкле лимонад', 'Малина, мята, апельсин. 400 мл.', 290, null, 1, 'mint'],
  ['drinks', 'Салкын чай', 'Холодный чай с брусникой. 400 мл.', 290, null, 1, 'mint'],
  ['lunch', 'Бизнес-ланч: суп + горячее', 'Будничный набор с 12:00 до 16:00.', 390, null, 0, 'black'],
  ['lunch', 'Бизнес-ланч: салат + паста', 'Сытный обед с напитком.', 450, null, 0, 'yellow']
];

function seed() {
  const count = db.prepare('SELECT COUNT(*) AS count FROM categories').get().count;
  if (!count) {
    const insertCategory = db.prepare('INSERT INTO categories (slug, name, sort_order) VALUES (?, ?, ?)');
    const insertProduct = db.prepare(`
      INSERT INTO products (category_id, name, description, price, calories, is_vegan, image_tone, sort_order)
      VALUES ((SELECT id FROM categories WHERE slug = ?), ?, ?, ?, ?, ?, ?, ?)
    `);

    const seedTx = db.transaction(() => {
      categories.forEach(([slug, name], index) => insertCategory.run(slug, name, index + 1));
      products.forEach((item, index) => insertProduct.run(...item, index + 1));
    });
    seedTx();
  }

  const bannersCount = db.prepare('SELECT COUNT(*) AS count FROM banners').get().count;
  if (!bannersCount) {
    const insertBanner = db.prepare(`
      INSERT INTO banners (title, subtitle, button_text, button_link, theme, sort_order)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    insertBanner.run('Завтраки весь день', 'Драники, бенедикты, круассаны и кофе с 09:00 до 21:00.', 'Смотреть меню', '#menu', 'yellow', 1);
    insertBanner.run('Кейтеринг и большие заказы', 'Соберем завтрак, кофе-брейк или сладкий стол для команды.', 'Позвонить', 'tel:+79014782050', 'black', 2);
    insertBanner.run('Фирменные напитки', 'Татарские мотивы, сезонные лимонады и плотный кофе.', 'К напиткам', '#menu', 'mint', 3);
  }

  const adminEmail = (process.env.ADMIN_EMAIL || 'admin@kykey.ru').toLowerCase();
  const adminExists = db.prepare('SELECT id FROM users WHERE email = ?').get(adminEmail);
  if (!adminExists) {
    const password = process.env.ADMIN_PASSWORD || 'KykeyAdmin2026!';
    const hash = bcrypt.hashSync(password, 12);
    db.prepare(`
      INSERT INTO users (name, phone, email, password_hash, is_admin)
      VALUES (?, ?, ?, ?, 1)
    `).run('Администратор Кукей', '+79014782050', adminEmail, hash);
  }
}

migrate();
seed();

module.exports = db;
