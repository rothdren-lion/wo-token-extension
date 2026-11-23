# openlist一键刷新联通盘token

同一个功能，四个独立目录，各自用目标浏览器的接口和清单格式，互不依赖。

| 目录 | 适用浏览器 | 用什么接口 |
| --- | --- | --- |
| `chrome/` | Chrome、Edge、Opera、Brave、Vivaldi、360 极速等 Chromium 内核 | `chrome.*`，Manifest V3 |
| `firefox-mv3/` | Firefox 116+ | `browser.*`（Promise），Manifest V3 |
| `firefox-mv2/` | Firefox 78–115 | `browser.*`（Promise），Manifest V2 |
| `safari/` | Safari 16.4+（macOS / iOS） | `browser.*`（Promise），Manifest V3 |

`legacy/chrome-mv2.1/` 是改造前的原始文件，只在本地保留，不入库。

打包：

```bash
node zip.mjs    # dist/ 下得到 4 个 zip，火狐另外各有一份 .xpi
```

## 火狐装不上、重开就没了

**原因：火狐（含 ESR）只允许永久安装已签名的扩展。** `about:debugging` 载入的是临时扩展，重启浏览器就消失；直接把 zip 拖进火狐也会报「文件无效」，火狐认 `.xpi`。

三条路，选一条：

**1. 装到 Developer Edition / Nightly（本地自用，最省事）**

1. 关闭签名校验：`about:config` → `xpinstall.signatures.required` 设为 `false`
2. `about:addons` → 齿轮 → 「从文件安装附加组件」→ 选 `dist/firefox-mv3.xpi`

正式版和 ESR 无法关闭签名校验，只能用下面两种。

**2. 官方免费签名（正式版 / ESR 可用）**

1. 在 https://addons.mozilla.org/developers/addon/api/key/ 生成 API key 和 secret
2. 签名，产物在 `web-ext-artifacts/`：

   ```bash
   npx web-ext sign --source-dir firefox-mv3 --channel unlisted \
     --api-key <KEY> --api-secret <SECRET>
   ```

3. `about:addons` → 齿轮 → 「从文件安装附加组件」→ 选生成的 `.xpi`

`--channel unlisted` 表示不上架商店、仅自己安装，仍然要通过 Mozilla 的自动审核（一般几分钟）。清单里的 `browser_specific_settings.gecko.id` 必须保持不变，否则升级会被当成另一个扩展。

**3. 临时用（重启失效）**

`about:debugging#/runtime/this-firefox` → 「临时载入附加组件」→ 选 `firefox-mv3/manifest.json`。

Firefox 116 以下要装 `firefox-mv2` 那份。

## 其它浏览器安装

**Chrome / Edge / Opera / Brave / Vivaldi**

1. 打开 `chrome://extensions`（Edge 是 `edge://extensions`，Opera 是 `opera://extensions`）
2. 打开「开发者模式」
3. 「加载已解压的扩展程序」→ 选 `chrome/`

**Safari（需要 macOS + Xcode）**

```bash
xcrun safari-web-extension-converter safari \
  --project-location build/safari-xcode \
  --app-name "openlist一键刷新联通盘token" \
  --bundle-identifier dev.godsun.wo-token \
  --force
```

打开生成的 Xcode 工程运行一次，之后在 Safari → 设置 → 扩展 里启用。iOS 需在工程里加 iOS target 后真机安装。这一步只能在 macOS 上完成。

## 使用

1. 点扩展图标，填手机号 → 「发送验证码」
2. 填 6 位验证码 → 「登录并提取」
3. 填 OpenList 地址、账号密码、挂载路径，点「保存设置」
4. 「写入 OpenList」：不存在就创建 WoPan 存储，存在就更新 token

根目录 ID 固定 `0`，Family ID 留空（挂个人云）。

## 各目录的差别

功能代码相同，只有这几处按浏览器改写：

| 差异 | chrome/ | firefox-* | safari/ |
| --- | --- | --- | --- |
| 扩展 API | `chrome.*` | `browser.*` 的 Promise 写法 | `browser.*` 的 Promise 写法 |
| 消息发送 | `chrome.tabs.sendMessage(id, msg, 回调)` | `await browser.tabs.sendMessage(id, msg)` | 同 Firefox |
| OpenList 主机权限 | 可选权限，运行时按地址申请 | 可选权限，点击时立刻申请（Firefox 要求用户手势） | 清单里静态写死（Safari 不支持按需申请） |
| 清单入口 | `action` + `optional_host_permissions` | MV3 `action` / MV2 `browser_action`，主机写进 `permissions` | `action`，主机全部写进 `host_permissions` |
| 签名标识 | 无 | `browser_specific_settings.gecko.id` | Xcode 工程自动生成 |

## 权限

| 权限 | 用途 |
| --- | --- |
| `storage` | 保存 OpenList 地址、账号、挂载路径 |
| `https://panservice.mail.wo.cn/*` | 在联通云盘页面填手机号/验证码、读 token |
| `http(s)://*/*`（可选，Safari 为静态） | 访问你填写的 OpenList 地址 |

## 验证状态

- 已用 Chromium 的 `--pack-extension` 校验 `chrome/` 和 `safari/` 清单，均被接受
- 三份 `popup.html` 在无头 Chrome 里跑通：设置回填、token 提取、OpenList 登录/列表/创建、WoPan 写入
- 本机 Firefox 为 153 ESR，未做永久安装实测：未签名扩展在 ESR 上必然被拒，需先按上文签名
- 未验证 Safari：转换与签名需要 macOS + Xcode
