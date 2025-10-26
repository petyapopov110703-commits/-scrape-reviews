import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const REVIEWS_DIR = path.join(__dirname, 'reviews');

if (!fs.existsSync(REVIEWS_DIR)) {
  fs.mkdirSync(REVIEWS_DIR, { recursive: true });
}

// Функция для скачивания аватарок (временно закомментирована)
// async function downloadImage(url, filename) {
//   if (!url) return null;
//   try {
//     const response = await fetch(url);
//     if (!response.ok) throw new Error(`Failed to fetch image: ${response.statusText}`);
//     const buffer = Buffer.from(await response.arrayBuffer());
//     const filepath = path.join(AVATARS_DIR, filename);
//     await fs.promises.writeFile(filepath, buffer);
//     return filepath;
//   } catch (e) {
//     console.error('Error downloading avatar:', e.message);
//     return null;
//   }
// }

async function scrapeReviews() {
   const browser = await chromium.launch({
    headless: true // ← без executablePath
  });
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'
  });
  const page = await context.newPage();

  await page.goto('https://travel.yandex.ru/hotels/nizhny-novgorod-oblast/seraphim-grad/?adults=2&checkinDate=2025-10-03&checkoutDate=2025-10-06&childrenAges=&searchPagePollingId=70a7e05752d9c15a97f175e268c7e69f-0-newsearch&seed=portal-hotels-search', {
    waitUntil: 'domcontentloaded',
    timeout: 60000
  });

  await page.waitForTimeout(5000);

  // Кликнуть на "Отзывы"
  await page.waitForSelector('button:has-text("Отзывы")');
  await page.click('button:has-text("Отзывы")');
  await page.waitForTimeout(3000);

  // Скролл + клик по "Еще отзывы"
  let lastHeight = await page.evaluate('document.body.scrollHeight');
  while (true) {
    await page.evaluate('window.scrollTo(0, document.body.scrollHeight)');
    await page.waitForTimeout(2000);

    const showMoreButton = await page.$('button:has-text("Еще отзывы")');
    if (showMoreButton) {
      console.log('Найдена кнопка "Еще отзывы" — кликаем...');
      await showMoreButton.click();
      await page.waitForTimeout(3000);
    }

    const newHeight = await page.evaluate('document.body.scrollHeight');
    if (newHeight === lastHeight) {
      break;
    }
    lastHeight = newHeight;
  }

  const totalReviews = await page.$$eval('section.root.mQbD7.esfDh.xa7LR', els => els.length);
  console.log(`Общее количество отзывов: ${totalReviews}`);

  const reviews = await page.evaluate(() => {
    const items = document.querySelectorAll('section.root.mQbD7.esfDh.xa7LR');
    return Array.from(items).map(el => {
      const avatarEl = el.querySelector('img.u91mj');
      const nameEl = el.querySelector('span._3iE2j.BUTjn.b9-76');
      const dateEl = el.querySelector('span.Eqn7e.dNANh');

      // Извлечение текста отзыва
      let text = '';
      const textContainer = el.querySelector('div.lpglK.Eqn7e.b9-76 > div[style*="word-wrap"]');
      if (textContainer) {
        text = textContainer.textContent.trim();
      }

      // Извлечение оценки по aria-selected
      let rating = 0;
      const ratingContainer = el.querySelector('div.Ia-4D.vdDWU.KNw-o.tzdr8');
      if (ratingContainer) {
        const stars = ratingContainer.querySelectorAll('[aria-selected="true"]');
        rating = stars.length;
      }

      const name = nameEl?.textContent?.trim() || 'Аноним';
      const date = dateEl?.textContent?.trim() || '';
      const avatarSrc = avatarEl?.src || null;

      return { rating, text, name, date, avatarSrc };
    });
  });

  console.log('Все оценки:', reviews.map(r => r.rating));

  const filteredReviews = reviews.filter(r => r.rating >= 3); // Теперь >= 3
  const count3 = filteredReviews.filter(r => r.rating === 3).length;
  const count4 = filteredReviews.filter(r => r.rating === 4).length;
  const count5 = filteredReviews.filter(r => r.rating === 5).length;

  console.log(`Количество отзывов с оценкой 3: ${count3}`);
  console.log(`Количество отзывов с оценкой 4: ${count4}`);
  console.log(`Количество отзывов с оценкой 5: ${count5}`);
  console.log(`Всего отзывов с оценкой 3, 4 или 5: ${filteredReviews.length}`);

  // Собираем результаты без скачивания аватарок
  const results = filteredReviews.map(review => ({
    ...review,
    // avatarPath: null // не сохраняем локальный путь
  }));

  const outputPath = path.join(REVIEWS_DIR, 'reviews.json');
  await fs.promises.writeFile(outputPath, JSON.stringify(results, null, 2), 'utf8');
  console.log(`Сохранено в ${outputPath}`);

  await browser.close();
}

scrapeReviews();

// Интервал обновления: 24 часа (в миллисекундах)
const REFRESH_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 часа

async function runScraping() {
  console.log('Запуск сбора отзывов...');
  try {
    await scrapeReviews();
    console.log('Сбор завершён.');
  } catch (error) {
    console.error('Ошибка при сборе отзывов:', error);
  }
}

// Запускаем сразу при старте
runScraping();

// Устанавливаем интервал для автоматического обновления

setInterval(runScraping, REFRESH_INTERVAL_MS);


