## 钉钉机器人单聊消息

通过钉钉 OpenAPI Go SDK 向指定钉钉用户发送机器人单聊消息。节点会使用 `app_key` 和 `app_secret` 先换取 access token，workflow 脚本不需要也不应该传 access token。

### Secret

- `app_key` (`string`)：钉钉 OpenAPI 应用 app key。
- `app_secret` (`string`)：钉钉 OpenAPI 应用 app secret。

### 变量

- `robot_code` (`string`)：当前节点实例配置的钉钉机器人编码。

### 输入

- `userIds` (`string[]`)：接收消息的钉钉 userId 列表。
- `msgKey` (`string`)：钉钉机器人消息模板 key。
- `msgParam` (`string|object`)：钉钉机器人消息参数。传对象时节点会先编码为 JSON。

### 输出

- `process_query_key` (`string`)：钉钉异步发送查询 key。
- `filtered_staff_id_list` (`string[]`)：被钉钉过滤的 userId。
- `flow_controlled_staff_id_list` (`string[]`)：被钉钉限流跳过的 userId。
- `invalid_staff_id_list` (`string[]`)：钉钉返回的无效 userId。
- `status_code` (`int`)：HTTP 响应状态码。

### 示例

```js
/**
 * @param {AutableWorkflowDefinitionInfo} info
 * @returns {Record<string, string | AutableWorkflowInstanceDeclaration>}
 */
function instances(info) {
  return { notifier: "dingtalk.robot.oto.batch_send" };
}

/**
 * @param {AutableWorkflowRunInfo} info
 * @returns {Record<string, unknown>}
 */
function run(info) {
  return info.instance("notifier").exec({
    userIds: ["user-a", "user-b"],
    msgKey: "sampleMarkdown",
    msgParam: {
      title: "Autable",
      text: "Workflow finished"
    }
  });
}
```
