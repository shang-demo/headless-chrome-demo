import puppeteer from 'puppeteer';
import rp from 'request-promise';
import { writeJson } from 'fs-extra';
import { resolve as pathResolve } from 'path';

(async () => {
  const browser = await puppeteer.launch({
    headless: false,
  });
  const context = await browser.createIncognitoBrowserContext();
  const page = await context.newPage();
  await setPageLikeHuman(page);

  console.info('using account: ', process.env.USERNAME);

  await page.goto('https://www.zhihu.com/signup');

  await page.waitForSelector('.SignContainer-switch span');
  await page.click('.SignContainer-switch span');

  await page.waitForSelector('input[name="username"]');
  await page.type('input[name="username"]', process.env.USERNAME || '', { delay: 10 });
  await page.type('input[name="password"]', process.env.PASSWORD || '', { delay: 10 });

  await Promise.all([checkNeedCapture(page), page.click('.SignFlow-submitButton')]);

  let content = await page.$$eval('.ContentItem-title a', (eles) => {
    return eles.map((item) => {
      let ele = item as HTMLLinkElement;
      return {
        text: ele.innerText,
        href: ele.href,
      };
    });
  });

  await writeJson(pathResolve(__dirname, `../data/${Date.now()}.json`), content);
  await browser.close();
})();

// from https://intoli.com/blog/not-possible-to-block-chrome-headless/
async function setPageLikeHuman(page: puppeteer.Page) {
  await page.setUserAgent(
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_14_0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/71.0.3578.98 Safari/537.36'
  );

  await page.evaluateOnNewDocument(() => {
    // overwrite the `languages` property to use a custom getter
    Object.defineProperty(navigator, 'languages', {
      get() {
        return ['zh-CN', 'zh', 'zh-TW', 'en-US', 'en'];
      },
    });

    // Overwrite the `plugins` property to use a custom getter.
    Object.defineProperty(navigator, 'plugins', {
      get: () => {
        return [1, 2, 3, 4, 5];
      },
    });

    // Pass the Webdriver test
    Object.defineProperty(navigator, 'webdriver', {
      get: () => {
        return false;
      },
    });

    // Pass the Chrome Test.
    // We can mock this in as much depth as we need for the test.
    // @ts-ignore
    window.navigator.chrome = {
      runtime: {},
      // etc.
    };

    // Pass the Permissions Test.
    // @ts-ignore
    const originalQuery = window.navigator.permissions.query;
    // @ts-ignore
    window.navigator.permissions.query = (parameters) => {
      return parameters.name === 'notifications'
        ? Promise.resolve({ state: Notification.permission })
        : originalQuery(parameters);
    };
  });
}

async function checkNeedCapture(page: puppeteer.Page) {
  try {
    await page.waitForNavigation({
      timeout: 10000,
    });
    console.info('navigate success');
  } catch (e) {
    console.info('navigate failed');

    await page.waitForSelector('.Captcha-chineseImg', { timeout: 1000 });
    await captureCrack(page);
  }
}

async function captureCrack(page: puppeteer.Page) {
  console.info('=====captureCrack====');

  await page.waitForSelector('.Captcha-chineseImg', { timeout: 1000 });
  await delay();

  let base64Str = await page.$eval('.Captcha-chineseImg', (e) => {
    return (e as HTMLImageElement).src;
  });

  let points = await getPos(base64Str.replace(/%0A/gi, ''));

  await page.$eval('.SignFlowHomepage', (ele) => {
    ele.scrollTo(0, 0);
  });

  await delay();
  let pos = await getElementBounding(page, '.Captcha-chineseImg');

  console.info('pos1: ', pos.left + points[0][1] / 2, pos.top + points[0][0] / 2);

  await page.mouse.click(pos.left + points[0][1] / 2, pos.top + points[0][0] / 2);

  await delay(1000);

  if (points[1]) {
    console.info('pos2: ', pos.left + points[1][1] / 2, pos.top + points[1][0] / 2);
    await page.mouse.click(pos.left + points[1][1] / 2, pos.top + points[1][0] / 2);
  }

  console.info('points:', JSON.stringify(points));

  await page.click('.SignFlow-submitButton');
}

async function delay(time = 1000) {
  return new Promise((resolve) => {
    setTimeout(resolve, time);
  });
}

// from https://github.com/muchrooms/zheye
async function getPos(base64Str: string) {
  let { msg } = await rp({
    method: 'POST',
    url: 'http://127.0.0.1:6060/image',
    headers: {
      'content-type': 'multipart/form-data;',
    },
    formData: { content: base64Str },
    json: true,
  });

  return msg;
}

async function getElementBounding(page: puppeteer.Page, selector: string) {
  const pos = await page.$eval(selector, (e) => {
    const {
      left, top, width, height,
    } = e.getBoundingClientRect();
    return {
      left,
      top,
      width,
      height,
    };
  });
  return pos;
}
