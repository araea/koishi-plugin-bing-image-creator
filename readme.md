# koishi-plugin-bing-image-creator

[![npm](https://img.shields.io/npm/v/koishi-plugin-bing-image-creator?style=flat-square)](https://www.npmjs.com/package/koishi-plugin-bing-image-creator)

`koishi-plugin-bing-image-creator` 是一个基于 Koishi 框架的 AI 绘图插件。它允许你生成来自 Bing Image Creator 的图片。🖼️🎨

## 目录

- [koishi-plugin-bing-image-creator](#koishi-plugin-bing-image-creator)
  - [目录](#目录)
  - [📦 安装](#-安装)
  - [🎮 使用](#-使用)
  - [🔑 如何获取 Bing.com 的 \_U Cookies](#-如何获取-bingcom-的-_u-cookies)
  - [📝 指令说明](#-指令说明)
  - [🙏 致谢](#-致谢)
  - [📄 许可证](#-许可证)

## 📦 安装

前往 Koishi 插件市场添加该插件即可。

## 🎮 使用

- 确保你能够正常使用 [Image Creator from Microsoft Bing](https://www.bing.com/create)。
- 填写必选配置项。
- 建议为指令添加指令别名。

## 🔑 如何获取 Bing.com 的 _U Cookies

- 以下是获取 `Bing.com` 的 `_U` Cookies 的步骤：

1. 打开 Bing.com：在你的浏览器中，输入 `www.bing.com` 并回车打开 Bing 的主页。
2. 打开开发者工具：在浏览器中，按 `F12` 键打开开发者工具。你也可以通过浏览器菜单找到这个选项。例如，在 Chrome 中，点击右上角的三个点，然后选择 `更多工具` -> `开发者工具`。
3. 找到 Cookies：在开发者工具的顶部菜单中，选择 `Application(应用程序)`。在左侧的 `Storage(存储)` 下，找到 `Cookies` 选项，并展开，然后选择 `http://www.bing.com`。
4. 寻找 _U Cookies：在右侧的 Cookies 列表中，找到名称为 `_U` 的 Cookies。
5. 复制 _U Cookies：双击 `_U` Cookies 的 `Value(值)` 字段，全选后右键，选择 `复制`。

- 注意：Cookies 包含敏感信息，不应该与他人分享，也不应该在不安全的环境中使用。

## 📝 指令说明

- `bingImageCreator`：基础命令，用于显示帮助信息。
- `bingImageCreator.draw <prompt:text>`：生成 Bing 图片。需要提供一个 `prompt` 参数。

## 🙏 致谢

- [Bing](https://www.bing.com) - 提供了图片资源。
- [Koishi](https://koishi.chat/) - 提供了机器人框架的支持。
- [Puppeteer](https://pptr.dev/) - 用于控制无头浏览器的库，使我们能够获取图片。
- [@timefox/bic-sydney](https://www.npmjs.com/package/@timefox/bic-sydney) - 核心支持。

## 📄 许可证

MIT License © 2023