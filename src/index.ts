import { writeJson } from 'fs-extra';
import { resolve as pathResolve } from 'path';
import puppeteer from 'puppeteer';
import rp from 'request-promise';

(async () => {
  let options: puppeteer.LaunchOptions = {
    ignoreHTTPSErrors: true,
    headless: false,
    devtools: true,
  };

  if (process.env.NODE_ENV === 'production') {
    options = {
      executablePath: '/usr/bin/chromium-browser',
      headless: true,
      ignoreHTTPSErrors: true,
      args: ['--no-sandbox', '--disable-dev-shm-usage'],
    };
  }

  const browser = await puppeteer.launch(options);

  const len = 1;
  try {
    const context = await browser.createIncognitoBrowserContext();
    await Promise.all(
      new Array(len).fill(0).map((item, index) => {
        return newZhihuPage(context, index === len - 1);
      })
    );
    await browser.close();
  } catch (e) {
    console.warn(e);
    await browser.close();
  }
})();

async function newZhihuPage(context: puppeteer.BrowserContext, isCheck = false) {
  const page = await context.newPage();
  await setPageLikeNormal(page);

  console.info('using account: ', process.env.USERNAME);

  await page.setRequestInterception(true);
  page.on('request', (request) => {
    let url = request.url();
    // this is pptr bug, redirect with setRequestInterception will block
    if (/sentry-script@latest/.test(url)) {
      request.continue({
        url: 'https://unpkg.zhimg.com/@cfe/sentry-script@0.0.9/dist/init.js',
      });
    } else {
      request.continue();
    }
  });

  await delay();
  await page.goto('https://www.zhihu.com/signup');

  if (!isCheck) {
    return;
  }

  await page.waitForSelector('.SignContainer-switch span');
  await page.click('.SignContainer-switch span');

  await page.waitForSelector('input[name="username"]');
  await page.type('input[name="username"]', process.env.USERNAME || '', { delay: 10 });
  await page.type('input[name="password"]', process.env.PASSWORD || '', { delay: 10 });

  let { language } = await loginClick(page);

  if (language === 'cn') {
    let data = await getCaptchaStr(page, 5000);
    await captchaChinese(page, data);
  } else if (language === 'en') {
    // TODO: https://github.com/lonnyzhang423/zhihu-captcha
    throw new Error("TODO, I don't love python, u can search github to fill it");
  } else {
    console.info('navigate success');
  }

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
}

async function checkEnglishCaptcha(
  page: puppeteer.Page,
  timeout: number
): Promise<{ language?: 'en' }> {
  await page.waitForSelector('.Captcha-englishImg', { timeout });
  return {
    language: 'en',
  };
}

async function loginClick(page: puppeteer.Page): Promise<{ language?: 'en' | 'cn' | undefined }> {
  let navigationTimeout = 30 * 1000;

  return Promise.race([
    // 登录成功并且跳转
    Promise.all([
      page.waitForNavigation({
        timeout: navigationTimeout,
        waitUntil: 'networkidle2',
      }),
      page.click('.SignFlow-submitButton'),
    ]).then(() => {
      return {};
    }),
    // 检测到验证码
    delay(1000).then(() => {
      return Promise.race([
        checkChineseCaptcha(page, navigationTimeout),
        checkEnglishCaptcha(page, navigationTimeout),
      ]);
    }),
  ]);
}

async function checkChineseCaptcha(
  page: puppeteer.Page,
  timeout: number
): Promise<{ language?: 'cn' }> {
  await page.waitForSelector('.Captcha-chineseImg', { timeout });

  console.info('captchaChinese');
  return { language: 'cn' };
}

async function getCaptchaStr(page: puppeteer.Page, timeout: number) {
  await page.waitForSelector('.Captcha-chineseRefreshButton', { timeout });

  return new Promise<string>((resolve, reject) => {
    const captchaReg = /captcha\?lang=cn/;

    page.on('response', async (response) => {
      let request = response.request();
      let requestUrl = request.url();

      if (captchaReg.test(requestUrl) && request.method().toUpperCase() === 'PUT') {
        let { img_base64: base64Str } = await response.json();
        resolve(base64Str);
      }
    });

    console.info('click Captcha-chineseRefreshButton');
    page.click('.Captcha-chineseRefreshButton');

    setTimeout(() => {
      reject(new Error('timeout'));
    }, timeout).unref();
  });
}

// from https://intoli.com/blog/not-possible-to-block-chrome-headless/
async function setPageLikeNormal(page: puppeteer.Page) {
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

async function captchaChinese(page: puppeteer.Page, base64Str: string) {
  console.info('=====captchaChinese====');
  let points = await getPos(base64Str.replace(/%0A/gi, ''));

  await page.$eval('.SignFlowHomepage', (ele) => {
    ele.scrollTo(0, 0);
  });

  let pos = await getElementBounding(page, '.Captcha-chineseImg');

  console.info('pos1: ', pos.left + points[0][1] / 2, pos.top + points[0][0] / 2);

  await page.mouse.click(pos.left + points[0][1] / 2, pos.top + points[0][0] / 2);

  // delay like human
  await delay(800);

  if (points[1]) {
    console.info('pos2: ', pos.left + points[1][1] / 2, pos.top + points[1][0] / 2);
    await page.mouse.click(pos.left + points[1][1] / 2, pos.top + points[1][0] / 2);
  }

  console.info('points:', JSON.stringify(points));

  await loginClick(page);
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
