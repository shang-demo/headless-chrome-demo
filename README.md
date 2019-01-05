# headless chrome demo

## examples

- [zhihu-login](https://github.com/shang-demo/headless-chrome-demo/tree/zhihu-login)
- [jd-screenshot](https://github.com/shang-demo/headless-chrome-demo/tree/jd-screenshot)

## `headless` 简介

- `Headless browser`
  `Headless browser` 是没有图形界面的浏览器

- [`Headless Chrome/Headless Chromium`](https://chromium.googlesource.com/chromium/src/+/lkgr/headless/README.md)
  允许 `Chrome/Chromium` 在 `headless/server` 的环境中使用

- [`Headless Firefox`](https://developer.mozilla.org/en-US/docs/Mozilla/Firefox/Headless_mode)
  允许 `Firefox` 在 `headless/server` 的环境中使用

- [`GoogleChrome/puppeteer`](https://github.com/GoogleChrome/puppeteer)
  `Google` 开源的 `headless nodejs API`

## `pptr(puppeteer)` 使用

- 安装 && 启动
- pdf && 截图
- 隐藏 headless chrome 特有的属性来屏蔽检测
- 自动化测试 (键入字符 && 拦截请求)

### 安装 && 启动

需要手动安装 chrome
`npm i puppeteer-core`
自动下载 chrome
`npm i puppeteer`

```js
const browser = await puppeteer.launch({
  // Chromium 安装路径
  executablePath: process.env.CHROME_BIN,
  // 是否以 headless 模式启动
  headless: true,
  // 是否开启 devtools
  devtools: true,
  args: ['--no-sandbox', '--disable-gpu', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
});

// 隐身模式
const context = await browser.createIncognitoBrowserContext();
// 创建一个 标签页
const page = await context.newPage();
// 转到哪个网址, 并且等待网页load
await page.goto('https://www.jd.com', { waitUntil: 'load' });
```

### pdf && 截图

```js
await page.pdf({
  path: pathResolve(__dirname, '../data/jd.pdf'),
});
```

```js
await page.screenshot({
  path: pathResolve(__dirname, '../data/jd.png'),
  fullPage: true,
});
```

### [隐藏 headless chrome 特有的属性来屏蔽检测](https://intoli.com/blog/not-possible-to-block-chrome-headless/)

```ts
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
```

### 自动化测试 (键入字符 && 拦截请求 等)

```ts
// 键入字符
await page.type('input[name="username"]', 'XXXXX', { delay: 10 });
// 鼠标点击
await page.mouse.click();

// 拦截请求
await page.setRequestInterception(true);
page.on('request', (request) => {});
page.on('response', (response) => {});
```

## dockerfile

```dockerfile
FROM node:10-alpine as build

WORKDIR /app

COPY package.json package.json
COPY yarn.lock yarn.lock
RUN yarnpkg

COPY . .

RUN npm run build


FROM keymetrics/pm2:10-alpine

RUN set -x \
      && apk update \
      && apk upgrade \
      && apk add --no-cache \
      wget \
      dumb-init \
      udev \
      ttf-freefont \
      chromium \
      # install chinese font
      && wget -qO- https://raw.githubusercontent.com/yakumioto/YaHei-Consolas-Hybrid-1.12/master/install.sh | sh \
      # Cleanup
      && apk del --no-cache make gcc g++ python binutils-gold gnupg libstdc++ \
      && rm -rf /usr/include \
      && rm -rf /var/cache/apk/* /root/.node-gyp /usr/share/man /tmp/* \
      && echo

ENTRYPOINT ["/usr/bin/dumb-init"]

# node project
WORKDIR /app

# cache package
COPY --from=build /app/dist/package.json package.json
RUN yarnpkg

# copy project dist files
COPY --from=build /app/dist/ .

ENV CHROME_BIN "/usr/bin/chromium-browser"
ENV NODE_ENV "production"

CMD ["node", "index.js"]
```

## 参考文档

- [IT IS _NOT_ POSSIBLE TO DETECT AND BLOCK CHROME HEADLESS](https://intoli.com/blog/not-possible-to-block-chrome-headless/)
- [Puppeteer as a service](https://pptraas.com/)
- [截图的诱惑](https://juejin.im/post/5bbc96785188255c72286403)
- [puppeteer api](https://github.com/GoogleChrome/puppeteer/blob/v1.11.0/docs/api.md)
