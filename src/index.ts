import { Context, Schema, Logger, h } from 'koishi'

import { BingImageCreator } from '@timefox/bic-sydney';
import puppeteer from "puppeteer-core"
import find from 'puppeteer-finder'
import { JSDOM } from 'jsdom';
import crypto from 'crypto';

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

        const src = new JSDOM(result).window.document.querySelector('iframe').getAttribute('src');

        const browser = await puppeteer.launch({
          executablePath,
          headless: "new",
          // headless: false,
          args: ['--no-sandbox', '--disable-setuid-sandbox'],
        });
        const page = await browser.newPage();
        await page.goto(src);

        await page.waitForSelector('img.mimg');

        const imageUrls = await page.evaluate(() => {
          const images = Array.from(document.querySelectorAll('img.mimg'));
          return images.map(img => img.getAttribute('src'));
        });

        await browser.close();

        for (let imageUrl of imageUrls) {
          if (imageUrl) {
            await session.send(`${h.at(session.userId)}${h.image(imageUrl)}`);
          }
        }
      } catch (error) {
        console.debug(error);
      }
    });
}