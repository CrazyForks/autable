## DingTalk robot OTO message

Sends robot one-to-one messages to specified DingTalk users through the DingTalk OpenAPI Go SDK. The node exchanges `app_key` and `app_secret` for an access token before calling the robot API; workflow scripts do not provide an access token.

### Secrets

- `app_key` (`string`): DingTalk OpenAPI app key.
- `app_secret` (`string`): DingTalk OpenAPI app secret.

### Variables

- `robot_code` (`string`): DingTalk robot code configured for this node instance.

### Inputs

- `userIds` (`string[]`): DingTalk user IDs to receive the message.
- `msgKey` (`string`): DingTalk robot message template key.
- `msgParam` (`string|object`): DingTalk robot message parameters. Objects are encoded as JSON before calling DingTalk.

### Outputs

- `process_query_key` (`string`): DingTalk async send query key.
- `filtered_staff_id_list` (`string[]`): User IDs filtered by DingTalk.
- `flow_controlled_staff_id_list` (`string[]`): User IDs skipped by DingTalk flow control.
- `invalid_staff_id_list` (`string[]`): Invalid user IDs returned by DingTalk.
- `status_code` (`int`): HTTP response status.

### Example

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
