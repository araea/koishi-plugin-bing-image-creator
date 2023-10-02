import { Context, Schema, Logger, h } from 'koishi'

import axios from 'axios';
import crypto from 'crypto';
import { JSDOM } from 'jsdom';
import find from 'puppeteer-finder';
import { ProxyAgent } from 'undici';
import puppeteer from "puppeteer-core";
import { fetch as fetchUndici } from 'fetch-undici';

export const name = 'bing-image-creator'
export const logger = new Logger('bingImageCreator')
export const usage = `## 🎮 使用

- 填写必选配置项。
- 建议为指令添加指令别名。

## 🔑 如何获取 Bing.com 的 _U Cookies

- 以下是获取 \`Bing.com\` 的 \`_U\` Cookies 的步骤：

1. 打开 Bing.com：在你的浏览器中，输入 \`www.bing.com\` 并回车打开 Bing 的主页。
2. 打开开发者工具：在浏览器中，按 \`F12\` 键打开开发者工具。你也可以通过浏览器菜单找到这个选项。例如，在 Chrome 中，点击右上角的三个点，然后选择 \`更多工具\` -> \`开发者工具\`。
3. 找到 Cookies：在开发者工具的顶部菜单中，选择 \`Application(应用程序)\`。在左侧的 \`Storage(存储)\` 下，找到 \`Cookies\` 选项，并展开，然后选择 \`http://www.bing.com\`。
4. 寻找 _U Cookies：在右侧的 Cookies 列表中，找到名称为 \`_U\` 的 Cookies。
5. 复制 _U Cookies：双击 \`_U\` Cookies 的 \`Value(值)\` 字段，全选后右键，选择 \`复制\`。

- 注意：Cookies 包含敏感信息，不应该与他人分享，也不应该在不安全的环境中使用。

## 📝 指令说明

- \`bingImageCreator\`：基础命令，用于显示帮助信息。
- \`bingImageCreator.draw <prompt:text>\`：生成 Bing 图片。需要提供一个 \`prompt\` 参数。`

export interface Config {
  proxy: string
  userToken: string
  cookies?: string
  host?: string
  userAgent?: string
  debug?: boolean
}

export const Config: Schema<Config> = Schema.object({
  proxy: Schema.string().default('http://127.0.0.1:7890').description(`一个代理字符串，如 "http://[ip]:[port]"`),
  userToken: Schema.string().default('').description('来自 bing.com 的 "_U" cookie值'),
  cookies: Schema.string().default('').description('(可选) 如果上述不起作用，提供所有的 cookies 作为一个字符串'),
  host: Schema.string().default('').description('(可选) 必要的对于一些人在不同的国家，例如中国 (https://cn.bing.com)'),
  userAgent: Schema.string().default('').description('(可选) 网络请求的用户代理'),
  debug: Schema.boolean().default(false).description('(可选) 设置为true以启用 `console.debug()` 日志'),
})

const executablePath = find();

export function apply(ctx: Context, config: Config) {
  const options = config;

  ctx.command('bingImageCreator', '查看bingImageCreator指令帮助')
    .action(async ({ session }) => {
      await session.execute(`bingImageCreator -h`)
    })
  ctx.command('bingImageCreator.draw <prompt:text>', 'BingAI绘画')
    .action(async ({ session }, prompt) => {
      if (!prompt) {
        return '请提供一个 prompt 参数！';
      }

      const messageId = crypto.randomUUID();
      await session.send('嗯~');

      try {
        const result = await new BingImageCreator(options).genImageIframeCsr(prompt, messageId);
        if (options.debug) {
          console.debug(result);
        }

        const src = new JSDOM(result).window.document.querySelector('iframe').getAttribute('srcdoc');

        const browser = await puppeteer.launch({
          executablePath,
          headless: "new",
          // headless: false,
          args: ['--no-sandbox', '--disable-setuid-sandbox'],
        });
        const page = await browser.newPage();
        await page.goto(src);

        await page.waitForSelector('img.mimg', { timeout: 300000 });  // Extend timeout to 5 minutes

        const imageUrls = await page.evaluate(() => {
          const images = Array.from(document.querySelectorAll('img.mimg'));
          return images.map(img => img.getAttribute('src'));
        });

        await browser.close();

        for (let imageUrl of imageUrls) {
          if (imageUrl) {
            const cleanedUrl = cleanUrl(imageUrl); // clean the url before downloading
            const buffer = await downloadImage(cleanedUrl);

            // Send image as buffer
            await session.send(`${h.at(session.userId)}${h.image(buffer, 'image/png')}`);
          }
        }
      } catch (error) {
        console.debug(error);
      }
    });
}

function cleanUrl(url: string): string {
  let cleanedUrl = new URL(url);
  cleanedUrl.searchParams.delete('w');
  cleanedUrl.searchParams.delete('h');
  cleanedUrl.searchParams.delete('c');
  cleanedUrl.searchParams.delete('r');
  cleanedUrl.searchParams.delete('o');
  return cleanedUrl.toString();
}

async function downloadImage(url: string): Promise<Buffer> {
  const { data } = await axios.get(url, { responseType: 'arraybuffer' });
  const buffer = Buffer.from(data, 'binary');
  return buffer;
}


type BicCreationResult = {
  contentUrl: string,
  pollingUrl: string,
  contentHtml: string,
  prompt: string,
  iframeid: string
};

type BicProgressContext = {
  contentIframe?: string,
  pollingStartTime?: number
};

type TelemetryOptions = {
  eventID: string,
  instrumentedLinkName: string,
  externalLinkName: string,
  kSeedBase: number,
  kSeedIncrement: number,
  instSuffix: number,
  instSuffixIncrement: number
};

type Options = {
  host?: string,
  apipath?: string,
  ua?: string,
  xForwardedFor?: string,
  features?: { enableAnsCardSfx: boolean },
  enableTelemetry?: boolean,
  telemetry?: TelemetryOptions,
  userToken?: string,
  cookies?: string,
  proxy?: string,
  debug?: boolean,
  fetch?: (input: RequestInfo, init?: RequestInit) => Promise<Response>,
  fetchOptions?: RequestInit,
  replaceOptions?: boolean
};

let fetch: (input: RequestInfo, init?: RequestInit) => Promise<Response>;

class BingImageCreator {
  private options?: Options;
  private apiurl?: string;
  private telemetry?: any; // This can be replaced with an appropriate interface.
  private debug?: boolean;

  constructor(options: Options) {
    this.setOptions(options);
  }

  setOptions(options: Options) {
    if (this.options && !this.options.replaceOptions) {
      this.options = {
        ...this.options,
        ...options,
      };
    } else {
      this.options = {
        ...options,
        host: options.host || 'https://www.bing.com',
        apipath: options.apipath || '/images/create?partner=sydney&re=1&showselective=1&sude=1',
        ua: options.ua || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/113.0.0.0 Safari/537.36 Edg/113.0.1774.35',
        xForwardedFor: BingImageCreator.getValidIPv4(options.xForwardedFor),
        features: {
          enableAnsCardSfx: true,
        },
        enableTelemetry: true,
        telemetry: {
          eventID: 'Codex',
          instrumentedLinkName: 'CodexInstLink',
          externalLinkName: 'CodexInstExtLink',
          kSeedBase: 6500,
          kSeedIncrement: 500,
          instSuffix: 0,
          instSuffixIncrement: 1,
        },
      };
    }
    fetch = typeof options.fetch === 'function' ? options.fetch : fetchUndici;
    this.apiurl = `${this.options.host}${this.options.apipath}`;
    this.telemetry = {
      config: this.options,
      currentKSeed: this.options.telemetry.kSeedBase,
      instSuffix: this.options.telemetry.instSuffix,
      getNextKSeed() {
        // eslint-disable-next-line no-return-assign, no-sequences
        return this.currentKSeed += this.config.telemetry.kSeedIncrement,
          this.currentKSeed;
      },
      getNextInstSuffix() {
        // eslint-disable-next-line no-return-assign
        return this.config.features.enableAnsCardSfx ? (this.instSuffix += this.config.telemetry.instSuffixIncrement,
          this.instSuffix > 1 ? `${this.instSuffix}` : '') : '';
      },
    };
    this.debug = this.options.debug;
  }

  static getValidIPv4(ip: string): string | undefined {
    const match = !ip
      || ip.match(/^((25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)(\/([0-9]|[1-2][0-9]|3[0-2]))?$/);
    if (match) {
      if (match[5]) {
        const mask = parseInt(match[5], 10);
        let [a, b, c, d] = ip.split('.').map(x => parseInt(x, 10));
        // eslint-disable-next-line no-bitwise
        const max = (1 << (32 - mask)) - 1;
        const rand = Math.floor(Math.random() * max);
        d += rand;
        c += Math.floor(d / 256);
        d %= 256;
        b += Math.floor(c / 256);
        c %= 256;
        a += Math.floor(b / 256);
        b %= 256;
        return `${a}.${b}.${c}.${d}`;
      }
      return ip;
    }
    return undefined;
  }

  get fetchOptions(): RequestInit {
    let fetchOptions;
    return this.options.fetchOptions ?? (() => {
      if (!fetchOptions) {
        fetchOptions = {
          headers: {
            accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
            'accept-language': 'en-US,en;q=0.9',
            'cache-control': 'no-cache',
            'sec-ch-ua': '"Microsoft Edge";v="113", "Chromium";v="113", "Not-A.Brand";v="24"',
            'sec-ch-ua-arch': '"x86"',
            'sec-ch-ua-bitness': '"64"',
            'sec-ch-ua-full-version': '"113.0.1774.35"',
            'sec-ch-ua-full-version-list': '"Microsoft Edge";v="113.0.1774.35", "Chromium";v="113.0.5672.63", "Not-A.Brand";v="24.0.0.0"',
            'sec-ch-ua-mobile': '?0',
            'sec-ch-ua-model': '""',
            'sec-ch-ua-platform': '"Windows"',
            'sec-ch-ua-platform-version': '"11.0.0"',
            'sec-fetch-dest': 'iframe',
            'sec-fetch-mode': 'navigate',
            'sec-fetch-site': 'same-origin',
            cookie: this.options.cookies || (this.options.userToken ? `_U=${this.options.userToken}` : undefined),
            pragma: 'no-cache',
            referer: 'https://www.bing.com/search?q=Bing+AI&showconv=1&FORM=hpcodx',
            'Referrer-Policy': 'origin-when-cross-origin',
            // Workaround for request being blocked due to geolocation
            ...(this.options.xForwardedFor ? { 'x-forwarded-for': this.options.xForwardedFor } : {}),
            'upgrade-insecure-requests': '1',
            'user-agent': this.options.ua,
            'x-edge-shopping-flag': '1',
          },
        };

        if (this.options.proxy) {
          fetchOptions.dispatcher = new ProxyAgent(this.options.proxy);
        }
      }

      return fetchOptions;
    })();
  }

  static decodeHtmlLite(html: string): string {
    const entities = {
      '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&nbsp;': String.fromCharCode(160),
    };
    return html.replace(/&[a-z]+;/g, match => entities[match] || match);
  }

  static removeHtmlTagLite(html: string, tag: string, tagId: string): string {
    // Create a regex, matches <tag id="tagId">, id can be at any available position.
    const regex = new RegExp(`<${tag}[^>]*id="${tagId}"[^>]*>`);

    // Find out the start and end position of <tag id="tagId">.
    const match = regex.exec(html);

    // return the original html if nothing matches.
    if (!match) {
      return html;
    }

    const start = match.index;
    let end = match.index + match[0].length;

    // Count the nested tags, the initial value is 0.
    let nested = 0;
    let i = end;
    let s = i - 1;
    let e = s;
    const tagStart = `<${tag} `;
    const tagEnd = `</${tag}>`;

    // loop the string, until find out its matched '</tag>'.
    while (e > 0) {
      if (e < i) {
        e = html.indexOf(tagEnd, i);
      }
      if (e > 0) {
        if (s > 0 && s < i) {
          s = html.indexOf(tagStart, i);
        }
        if (s > 0) {
          i = Math.min(s, e);
          nested += (i === s)
            ? (i += tagStart.length, 1)
            : (i += tagEnd.length, -1);
        } else {
          i = e + tagEnd.length;
          nested -= 1;
        }
        // If nested is -1, the matched '</tag>' is found.
        if (nested === -1) {
          // Update the end position, make it point to the position after </tag>.
          end = i;
          // Break the loop;
          break;
        }
      }
    }

    // Remove the strings between the '<tag id="tagId">' and the matched '</tag>'.
    return html.slice(0, start) + html.slice(end);
  }

  static sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async genImagePage(prompt: string, messageId: string): Promise<BicCreationResult> {
    let telemetryData = '';
    if (this.options.enableTelemetry) {
      telemetryData = `&kseed=${this.telemetry.getNextKSeed()}&SFX=${this.telemetry.getNextInstSuffix()}`;
    }

    // https://www.bing.com/images/create?partner=sydney&re=1&showselective=1&sude=1&kseed=8000&SFX=3&q=${encodeURIComponent(prompt)}&iframeid=${messageId}
    const url = `${this.apiurl}${telemetryData}&q=${encodeURIComponent(prompt)}${messageId ? `&iframeid=${messageId}` : ''}`;

    if (this.debug) {
      console.debug(`The url of the request for image creation: ${url}`);
      console.debug();
    }

    const response = await fetch(url, this.fetchOptions);
    const { status } = response;
    if (this.debug) {
      console.debug('The response of the request for image creation:');
      console.debug(response);
      console.debug();
    }

    if (status !== 200) {
      throw new Error(`Bing Image Creator Error: response status = ${status}`);
    }

    const body = await response.text();
    let regex = /<div id="gir" data-c="([^"]*)"/;
    const pollingUrl = regex.exec(body)?.[1];

    if (!pollingUrl) {
      regex = /<div class="gil_err_mt">(.*?)<\/div>/;
      const err = regex.exec(body)?.[1];
      throw new Error(`Bing Image Creator Error: ${err}`);
    }

    return {
      contentUrl: `${response.url}`,
      pollingUrl: `${this.options.host}${BingImageCreator.decodeHtmlLite(pollingUrl)}`,
      contentHtml: body,
      prompt: `${prompt}`,
      iframeid: `${messageId}`,
    };
  }

  async pollingImgRequest(pollingUrl: string, onProgress: (context: BicProgressContext) => boolean): Promise<string> {
    let polling = true;
    let body;

    if (typeof onProgress !== 'function') {
      onProgress = () => false;
    }

    const pollingStartTime = new Date().getTime();

    while (polling) {
      if (this.debug) {
        console.debug(`polling the image request: ${pollingUrl}`);
      }

      // eslint-disable-next-line no-await-in-loop
      const response = await fetch(pollingUrl, this.fetchOptions);
      const { status } = response;

      if (status !== 200) {
        throw new Error(`Bing Image Creator Error: response status = ${status}`);
      }

      // eslint-disable-next-line no-await-in-loop
      body = await response.text();

      if (body && body.indexOf('errorMessage') === -1) {
        polling = false;
      } else {
        const cancelRequest = onProgress({ pollingStartTime });
        if (cancelRequest) {
          throw new Error('Bing Image Creator Error: cancelled');
        }

        // eslint-disable-next-line no-await-in-loop
        await BingImageCreator.sleep(1000);
      }
    }

    return body;
  }

  async genImageList(prompt: string, messageId: string, removeSizeLimit: boolean, onProgress: (context: BicProgressContext) => boolean): Promise<string[]> {
    const { pollingUrl } = await this.genImagePage(prompt, messageId);
    const resultHtml = await this.pollingImgRequest(pollingUrl, onProgress);
    if (this.debug) {
      console.debug('The result of the request for image creation:');
      console.debug(resultHtml);
      console.debug();
    }

    const regex = /(?<=src=")[^"]+(?=")/g;
    return Array.from(
      resultHtml.matchAll(regex),
      match => (() => {
        const l = BingImageCreator.decodeHtmlLite(match[0]);
        return removeSizeLimit ? l.split('?w=')[0] : l;
      })(),
    );
  }

  createImageIframe(src: string, isDoc: boolean): string {
    return '<iframe role="presentation" style="position:relative;overflow:hidden;width:475px;height:520px;'
      + 'border:none;outline:none;padding:0px;margin:0px;display:flex;align-self:flex-start;border-radius:12px;'
      + 'box-shadow:0px 0.3px 0.9px rgba(0, 0, 0, 0.12), 0px 1.6px 3.6px rgba(0, 0, 0, 0.16);z-index: 1;" '
      + `${isDoc ? `srcdoc='${this.rewriteHtml(src)}'` : `src="${src}"`} />`;
  }

  rewriteHtml(html: string): string {
    return html.replace(/'/g, '&#39;').replace(/="\//g, `="${this.options.host}/`);
  }

  renderImageIframe(containerHtml: string, resultHtml: string): string {
    // "Render" it fastly.
    // Note: It is heavily hard-coded and may break in future upgrades of the BingAI.
    const renderedHtml = BingImageCreator.removeHtmlTagLite(containerHtml, 'div', 'giloader')
      .replace(/<div([^>]*)id="giric"([^>]*)>/, (match, group1, group2) => {
        if (group1.indexOf(' style="') === -1 && group2.indexOf(' style="') === -1) {
          return `<div${group1}id="giric"${group2} style="display: block;">`;
        }
        return match;
      }).replace(/(?<=<div[^>]*?id="giric"[^>]*?>)[\s\S]*?(?=<\/div>)/, `${resultHtml}`);
    return this.createImageIframe(renderedHtml, true);
  }

  async genImageIframeSsr(prompt: string, messageId: string, onProgress: (context: BicProgressContext) => boolean): Promise<string> {
    const { contentUrl, pollingUrl, contentHtml } = await this.genImagePage(prompt, messageId);
    if (typeof onProgress === 'function') {
      const cancelRequest = onProgress({ contentIframe: this.createImageIframe(contentUrl, true) });
      if (cancelRequest) {
        throw new Error('Bing Image Creator Error: cancelled');
      }
    }
    const resultHtml = await this.pollingImgRequest(pollingUrl, onProgress);
    return this.renderImageIframe(contentHtml, resultHtml);
  }

  async genImageIframeSsrLite(prompt: string, messageId: string, onProgress: (context: BicProgressContext) => boolean): Promise<string> {
    const { pollingUrl } = await this.genImagePage(prompt, messageId);
    const resultHtml = await this.pollingImgRequest(pollingUrl, onProgress);
    return this.createImageIframe(resultHtml, true);
  }

  async genImageIframeCsr(prompt: string, messageId: string): Promise<string> {
    const { contentUrl } = await this.genImagePage(prompt, messageId);
    return this.createImageIframe(contentUrl, true);
  }

  static inlineImagePattern(): RegExp {
    return /!\[(.*?)\]\(#generative_image\)/g;
  }

  static parseInlineGenerativeImage(message: string | { text: string }): string | undefined {
    if (typeof message !== 'string') {
      message = message.text;
    }

    const match = BingImageCreator.inlineImagePattern().exec(message);
    if (match) {
      return match[1];
    }

    return undefined;
  }
}