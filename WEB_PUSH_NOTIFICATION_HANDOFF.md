# Web Push / Native Push Bridge Handoff

本文档给浏览器壳开发者使用，说明我们在前端里接入 Web Push 是为了实现什么、当前已有能力是什么、以及如果浏览器壳提供原生常驻通知桥，需要和前端约定哪些能力。

## 1. 我们要实现的最终效果

我们希望用户在网页不在前台时，仍然能收到角色消息通知：

- 普通聊天：用户发出一条消息后切到后台，AI 回复完成时进入系统通知栏。
- 自律代理：页面关闭、手机锁屏、浏览器在后台时，后端主动生成角色消息后仍能进入系统通知栏。
- 点击通知后，能重新打开网页，并跳转到对应角色的聊天页。
- 多条气泡消息尽量不要被浏览器合并成一条，通知应保留“连续来消息”的感觉。

关键边界：

- “页面还活着时短后台能继续跑”只能覆盖短时间后台。
- “长期可靠通知”不能依赖网页 JS runtime 继续存活。
- 页面被系统挂起、浏览器被杀、手机锁屏较久以后，必须依赖标准 Web Push 或浏览器壳原生常驻能力。

## 2. 当前前端已经有的能力

### 2.1 短后台通知兜底

当前前端已经有短后台能力：

- 普通聊天回复流程在页面隐藏时，如果回复已经完成，会调用本地浏览器通知。
- 自律代理在页面隐藏后有约 5 分钟短后台窗口，期间仍允许前端 tick。
- 如果页面 JS runtime 被系统暂停或杀掉，这套能力就不再可靠。

相关文件：

- `hooks/useChatAI.ts`：普通聊天后台回复完成后尝试发本地通知。
- `utils/localNotification.ts`：优先用 Service Worker registration.showNotification，失败后退回 new Notification。
- `utils/autonomousAgent.ts`：`SHORT_BACKGROUND_TICK_GRACE_MS = 5 * 60_000`，隐藏后短时间仍允许 tick。
- `context/AgentContext.tsx`：收到后端消息保存事件后，在页面隐藏且 Web Push 不可用时用本地通知兜底。

### 2.2 标准 Web Push 前端骨架

当前前端已有标准 Web Push 订阅骨架：

- 注册 `/push-sw.js`
- 调用 `registration.pushManager.subscribe(...)`
- 获取浏览器返回的 PushSubscription
- 上传 subscription 到后端
- Service Worker 收到 push event 后展示系统通知
- 用户点击通知后，Service Worker 将 `charId` 回传给已打开页面，或打开新窗口 `/?notif_charId=...`

相关文件：

- `utils/pushSubscription.ts`
- `public/push-sw.js`
- `apps/settings/AgentSettings.tsx`

## 3. 标准 Web Push 方案需要浏览器/后端支持什么

如果走标准 Web Push，浏览器需要支持：

- Secure Context 下的 `navigator.serviceWorker`
- `PushManager`
- `Notification`
- `ServiceWorkerRegistration.showNotification`
- 后台 Service Worker 能收到 push event
- Android Chrome/兼容浏览器一般走 FCM endpoint
- iOS Safari/PWA 一般走 APNs endpoint，且通常需要安装到主屏幕

前端会调用后端这些接口：

- `GET /api/push/vapid-key`
- `POST /api/push/subscribe`
- `POST /api/push/unsubscribe`
- `POST /api/push/test`

`POST /api/push/subscribe` 请求体示例：

```json
{
  "subscription": {
    "endpoint": "https://fcm.googleapis.com/fcm/send/...",
    "expirationTime": null,
    "keys": {
      "p256dh": "...",
      "auth": "..."
    }
  }
}
```

后端保存 subscription 后，当角色有新消息时，用 Web Push 协议向该 endpoint 投递 payload。

建议 push payload：

```json
{
  "title": "角色名",
  "body": "消息预览",
  "icon": "/icons/icon-192.webp",
  "badge": "/icons/icon-96.webp",
  "data": {
    "charId": "角色ID",
    "messageId": "后端消息ID",
    "bubbleIndex": 0
  }
}
```

## 4. 为什么“给网页开长期端口”不能直接替代 Web Push

如果所谓长期端口依赖网页 JS 连接，例如 WebSocket、SSE、轮询、页面内定时器，那么它只能在页面还活着时工作。

移动端常见限制：

- 页面切后台后 JS 定时器会被降频或暂停。
- 页面可能被系统挂起。
- 浏览器进程可能被系统回收。
- 手机锁屏较久后，网页连接不应被假设仍然可靠。

所以它可以增强“短后台”，但不能保证“长期离线通知”。

真正能替代标准 Web Push 的，必须是浏览器壳的原生层常驻能力，而不是网页层长连接。

## 5. 如果浏览器壳提供原生常驻 Push Bridge

如果你们能提供原生常驻通知桥，对前端会更容易接入。前端可以优先检测桥，桥可用则走原生桥；桥不可用再走标准 Web Push；都不可用时保留当前短后台兜底。

### 5.1 原生桥必须满足的能力

原生层需要做到：

- 页面关闭、后台、锁屏后仍能接收后端消息，或接收系统推送。
- 能弹系统通知。
- 能请求/查询通知权限。
- 能返回当前设备的 push token 或设备标识。
- 能把 token/设备信息绑定到当前用户或当前客户端。
- 用户点击通知后能重新打开网页。
- 打开网页时能把 `charId`、`messageId` 等参数传回前端。
- 能取消订阅或解绑当前设备。

注意：如果 bridge 只有页面打开时能调用，那它只是短后台增强，不能替代 Web Push。

### 5.2 建议的 JS Bridge API

建议暴露一个稳定对象，例如：

```ts
window.SullyPushBridge = {
  isAvailable(): Promise<boolean>;
  getStatus(): Promise<{
    permission: 'granted' | 'denied' | 'prompt' | 'unknown';
    registered: boolean;
    provider: 'native' | 'webpush' | 'unknown';
    deviceId?: string;
    token?: string;
  }>;
  requestPermission(): Promise<{
    permission: 'granted' | 'denied' | 'prompt' | 'unknown';
  }>;
  register(payload: {
    clientId: string;
    authToken?: string;
    backendUrl?: string;
  }): Promise<{
    ok: boolean;
    deviceId?: string;
    token?: string;
    error?: string;
  }>;
  unregister(payload: {
    clientId: string;
    deviceId?: string;
  }): Promise<{ ok: boolean; error?: string }>;
  onNotificationClick(callback: (payload: {
    charId?: string;
    messageId?: string;
    url?: string;
    raw?: unknown;
  }) => void): void;
};
```

前端也可以兼容 Android/iOS 常见形式，例如：

- Android: `window.AndroidInterface.postMessage(...)`
- iOS WKWebView: `window.webkit.messageHandlers.xxx.postMessage(...)`

但建议最后封装成一个统一的 `window.SullyPushBridge`，避免业务层分平台处理。

### 5.3 原生桥通知点击回传

通知点击后，至少要能给前端以下任一形式：

方式 A：打开 URL：

```text
https://example.com/?notif_charId=xxx&notif_messageId=yyy
```

方式 B：网页加载后调用回调：

```ts
window.dispatchEvent(new CustomEvent('sully-push-notification-click', {
  detail: {
    charId: 'xxx',
    messageId: 'yyy'
  }
}));
```

方式 C：通过 `SullyPushBridge.onNotificationClick(...)` 主动回放最近一次点击 payload。

## 6. 前端期望的接入策略

建议最终前端策略：

1. 检测 `window.SullyPushBridge` 是否存在。
2. 如果存在，优先使用原生桥注册通知。
3. 如果不存在，走标准 Web Push：Service Worker + PushManager + VAPID。
4. 如果标准 Web Push 不可用，保留当前短后台本地通知兜底。

伪代码：

```ts
if (await nativePushBridge.isAvailable()) {
  await nativePushBridge.register({ clientId, backendUrl, authToken });
} else if ('serviceWorker' in navigator && 'PushManager' in window) {
  await initStandardWebPush();
} else {
  enableShortBackgroundNotificationFallback();
}
```

## 7. 验收标准

### 7.1 标准 Web Push 验收

- 设置页能显示通知权限为“已允许”。
- 设置页 Web Push 状态能显示“推送通知已就绪”。
- 后端 `/api/push/test` 能触发系统通知。
- 页面在后台时，通知仍能到达。
- 点击通知后能打开网页并进入对应角色聊天页。
- 页面关闭后，后端主动消息仍能触发通知。

### 7.2 原生常驻 Bridge 验收

- 页面打开时能注册 bridge 并拿到 `deviceId` 或 `token`。
- 页面关闭后，原生层仍能收到后端消息或系统推送。
- 手机锁屏一段时间后仍能收到通知。
- 浏览器壳被系统保活时，通知点击能重新打开网页并传回 `charId`。
- 取消订阅后，不再收到该设备通知。
- 权限被拒绝时，前端能拿到明确状态和错误原因。

## 8. 安全和数据注意事项

- bridge 注册请求必须绑定当前用户或当前客户端，避免把消息推给错误设备。
- 后端保存 token/subscription 时需要支持更新和删除。
- 通知 payload 只放必要预览和路由参数，不放敏感长文本。
- 如果存在多设备，需要按用户/客户端维度管理 token。
- 如果用户退出登录或清空数据，需要调用 unsubscribe/unregister。

## 9. 一句话总结

我们要的不是“网页还活着时保持连接”，而是“网页不活着时，角色消息仍能进入系统通知栏”。标准 Web Push 可以做到这件事；如果浏览器壳提供原生常驻 Push Bridge，也可以做到，而且前端会更好接。但 bridge 必须由原生层常驻，不依赖页面 JS runtime 存活。
