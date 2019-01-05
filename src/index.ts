import puppeteer from 'puppeteer';
import { resolve as pathResolve } from 'path';

(async () => {
  console.info('runing...');
  let headless = false;
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

  console.info('scrolling');
  await autoScroll(page);

  console.info('scroll done');

  await new Promise((resolve) => {
    setTimeout(resolve, 3000);
  });

  console.info('start save pdf');
  if (headless) {
    // Generating a pdf is currently only supported in Chrome headless.
    await page.pdf({
      path: pathResolve(__dirname, '../data/jd.pdf'),
    });
  }

  console.info('start save jpeg');
  await page.screenshot({
    path: pathResolve(__dirname, '../data/jd.jpeg'),
    type: 'jpeg',
    fullPage: true,
  });

  await browser.close();
  console.info('ended');
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
