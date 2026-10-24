// Demo content. Replace product photos and episode videos in the admin panel.
const crypto = require('crypto');
const rid = () => crypto.randomBytes(6).toString('hex');
const now = () => new Date().toISOString();

function buildSeed() {
  const p = (slug, en, ru, den, dru, price, category, popular = false, stock = 50) => ({
    id: rid(), slug, name: { en, ru }, description: { en: den, ru: dru },
    price, category, image: `/img/products/${slug}.png`, stock, popular, createdAt: now(),
  });

  const products = [
    p('hoodie-orange', 'Shinobi Hoodie', 'Худи «Шиноби»',
      'Heavyweight 380 g cotton hoodie in signature orange with a full zip and kangaroo pocket.',
      'Плотное худи 380 г/м² в фирменном оранжевом цвете, молния во всю длину и карман-кенгуру.', 59, 'clothing', true),
    p('tshirt-black', 'Shadow Tee', 'Футболка «Тень»',
      'Oversized black tee with a minimal orange swirl print. 100% combed cotton.',
      'Чёрная oversize-футболка с минималистичным оранжевым принтом. 100% хлопок.', 29, 'clothing', true),
    p('storm-cloak', 'Storm Cloak', 'Плащ «Шторм»',
      'Long cosplay cloak with high collar and orange hem. One size fits most.',
      'Длинный косплей-плащ с высоким воротником и оранжевой окантовкой. Универсальный размер.', 89, 'clothing'),
    p('headband', 'Ninja Headband', 'Повязка ниндзя',
      'Navy fabric headband with a brushed metal plate. Adjustable ties.',
      'Тканевая повязка тёмно-синего цвета с металлической пластиной. Регулируемые завязки.', 19, 'accessories', true),
    p('kunai-keychain', 'Kunai Keychain', 'Брелок «Кунай»',
      'Zinc-alloy kunai keychain, 9 cm, with orange cord wrap.',
      'Брелок-кунай из цинкового сплава, 9 см, с оранжевой обмоткой.', 12, 'accessories'),
    p('shuriken-necklace', 'Shuriken Necklace', 'Кулон «Сюрикен»',
      'Stainless steel shuriken pendant on a 60 cm chain.',
      'Кулон-сюрикен из нержавеющей стали на цепочке 60 см.', 24, 'accessories'),
    p('scroll-backpack', 'Scroll Backpack', 'Рюкзак «Свиток»',
      'Water-resistant 22 L backpack with laptop sleeve and scroll-style side pocket.',
      'Водоотталкивающий рюкзак 22 л с отделением для ноутбука и боковым карманом-свитком.', 69, 'accessories', true),
    p('ramen-mug', 'Ramen Bowl Mug', 'Кружка-пиала «Рамен»',
      'Ceramic 600 ml ramen bowl with chopsticks. Dishwasher safe.',
      'Керамическая пиала 600 мл с палочками. Можно мыть в посудомойке.', 22, 'collectibles'),
    p('will-of-fire-poster', 'Will of Fire Poster', 'Постер «Воля огня»',
      'Matte A2 art print on 250 g paper.',
      'Матовый арт-постер A2 на бумаге 250 г/м².', 15, 'collectibles'),
  ];

  const epTitles = [
    ['The Beginning', 'Начало'],
    ['The Academy Test', 'Экзамен академии'],
    ['First Mission', 'Первая миссия'],
    ['The Bridge in the Mist', 'Мост в тумане'],
    ['Team Spirit', 'Командный дух'],
    ['The Promise', 'Обещание'],
  ];
  const episodes = epTitles.map(([en, ru], i) => {
    const n = String(i + 1).padStart(2, '0');
    return {
      id: rid(), number: i + 1, season: 1,
      title: { en, ru },
      description: {
        en: 'Demo clip. Upload the licensed episode file or paste a video link in the admin panel.',
        ru: 'Демо-ролик. Загрузите лицензионный файл серии или вставьте ссылку на видео в админ-панели.',
      },
      thumbnail: `/img/episodes/ep${n}.png`,
      videoUrl: `/media/videos/ep${n}.mp4`,
      duration: '0:08', tgFileId: null, popular: i < 3, createdAt: now(),
    };
  });

  const news = [
    {
      id: rid(), date: now(), image: '/img/episodes/ep01.png',
      title: { en: 'Shinobi Stream is live', ru: 'Shinobi Stream запущен' },
      body: {
        en: 'Our new streaming hub is open: watch on the site or send any episode straight to our Telegram bot.',
        ru: 'Новый стриминг-хаб открыт: смотрите на сайте или отправляйте любую серию прямо в наш Telegram-бот.',
      },
    },
    {
      id: rid(), date: now(), image: '/img/products/hoodie-orange.png',
      title: { en: 'Autumn drop: Shinobi Hoodie', ru: 'Осенний дроп: худи «Шиноби»' },
      body: {
        en: 'The heavyweight orange hoodie is back in all sizes, with free delivery on orders over $80.',
        ru: 'Плотное оранжевое худи снова в наличии во всех размерах. Бесплатная доставка от $80.',
      },
    },
    {
      id: rid(), date: now(), image: '/img/products/scroll-backpack.png',
      title: { en: 'Shop in Telegram', ru: 'Покупайте в Telegram' },
      body: {
        en: 'Browse the full catalog, add to cart and check out without leaving the bot.',
        ru: 'Весь каталог, корзина и оформление заказа — не выходя из бота.',
      },
    },
  ];

  return { products, episodes, news, orders: [], users: [], messages: [], tgUsers: {}, counters: { order: 1000 } };
}

module.exports = { buildSeed };

if (require.main === module && process.argv.includes('--reset')) {
  const fs = require('fs');
  const config = require('./config');
  fs.mkdirSync(require('path').dirname(config.dataFile), { recursive: true });
  fs.writeFileSync(config.dataFile, JSON.stringify(buildSeed(), null, 2));
  console.log('Database reset to demo content:', config.dataFile);
}
