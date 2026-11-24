# 树洞镜像 · Android

面向 PKUHoleTUI 兼容镜像的只读 Android 客户端。首次打开会连接预设镜像，也可以在右上角打开「镜像源」，填入其他兼容 API 的基础地址，测试后保存并切换。

## 使用

- **最新** · 下拉或点刷新按钮更新列表，支持标签、悬赏筛选和评论预览。
- **检索** · 输入关键词搜索正文，输入 `#洞号` 或单独输入洞号打开详情。宣告支持时间筛选的 REST 镜像提供起止日期，全文检索语法由镜像决定。
- **树洞详情** · 阅读全文、分页和切换评论顺序，查看引用评论、点开洞号引用，尝试加载镜像提供的图片。更多菜单可以复制洞号、复制正文或分享镜像详情 API 链接。
- **关注与设置** · 按镜像保存本地关注、分组、浏览历史和检索历史。支持屏蔽词折叠、关闭预览、深浅色切换。镜像 V3 接口提供的消息在通知页显示。

发帖、回复、同步关注、点赞、举报、账号认证及校园个人服务需要独立的账号侧接口。应用通过镜像的只读接口浏览，关注与分组在手机本地生效。

## 镜像协议

输入 HTTPS 或 HTTP 基础地址，可包含反向代理的路径前缀。例如 `https://example.org/treehole`。粘贴 `/help`、预设网页入口或 `/chapi/api/v3` 地址时，客户端会提取基础地址。当前支持可匿名读取的 API。

| 能力 | 主要接口 |
| --- | --- |
| V3 帖子与评论 | `/chapi/api/v3/hole/list_comments`、`/hole/one`、`/comment/list`（均在 V3 路径下） |
| 标签与通知 | `/chapi/api/v3/tags/tree`、`/chapi/api/v3/message/index` |
| REST 帖子与评论 | `/posts`、`/post/:pid`、`/comments/:pid`、`/comment` |
| 日期筛选 | `/help` 声明 `begin_time`、`end_time` 时，通过 `/posts` 传入秒级时间戳，按手机时区包含起止日期 |
| 图片 | V3 的 `/media/getThumbnail`、`/media/getImageBinary`，或 REST 的 `/media/image` |

镜像同时支持两种协议时，客户端优先采用 V3。选用日期筛选时，切换到 REST 查询并清除标签和悬赏条件。某些镜像只在详情接口返回完整的点赞等统计。图片可用性取决于当前镜像是否保存图像文件。

## 构建与验证

使用 JDK 17、Android SDK 36、Gradle Wrapper。设备需为 Android 8.0（API 26）或以上，并使用更新后的 Android System WebView。

```powershell
./gradlew.bat :app:assembleDebug :app:lintDebug
```

APK 生成于 `app/build/outputs/apk/debug/app-debug.apk`。SDK 可通过 `ANDROID_HOME` 指定，也可在本地 `local.properties` 填写 `sdk.dir`。

接口测试和浏览器预览使用 Node.js 22 或以上。

```powershell
node --test test/api.test.mjs
node tools/preview.mjs
node test/browser-smoke.mjs 'C:/Program Files/Google/Chrome/Application/chrome.exe'
```

浏览器预览使用合成数据，地址为 `http://127.0.0.1:4173`。镜像配置表单可用 `https://second.example.test` 或 `https://rest.example.test/archive` 模拟切换。Android APK 通过 Kotlin 传输层访问所配置的镜像源。

界面与验证记录见 [`design/index.html`](design/index.html)。
