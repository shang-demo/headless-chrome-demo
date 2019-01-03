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

# EXPOSE 80
# CMD ["pm2-runtime", "start", "index.js"]

CMD ["node", "index.js"]
