import puppeteer from 'puppeteer';
import { resolve as pathResolve } from 'path';

(async () => {
  let headless = true;
  const browser = await puppeteer.launch({
    headless,
  });
  const context = await browser.createIncognitoBrowserContext();
  const page = await context.newPage();
  await page.goto('https://www.jd.com');
  await page.setViewport({
    width: 1200,
    height: 800,
  });

  await autoScroll(page);

  if (headless) {
    // Generating a pdf is currently only supported in Chrome headless.
    await page.pdf({
      path: pathResolve(__dirname, '../data/jd.pdf'),
    });
  }

  await page.screenshot({
    path: pathResolve(__dirname, '../data/jd.jpeg'),
    type: 'jpeg',
    fullPage: true,
  });

  await browser.close();
})();

async function autoScroll(page: puppeteer.Page) {
  await page.evaluate(async () => {
    await new Promise((resolve) => {
      let totalHeight = 0;
      let distance = 200;
      let timer = setInterval(() => {
        let { scrollHeight } = document.body;
        window.scrollBy(0, distance);
        totalHeight += distance;

        if (totalHeight >= scrollHeight) {
          clearInterval(timer);
          resolve();
        }
      }, 100);
    });
  });
}
