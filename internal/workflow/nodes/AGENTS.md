# Node Development Notes

- Use `github.com/alibabacloud-go/dingtalk` for DingTalk OpenAPI integrations. Do not hand-roll raw HTTP calls for DingTalk OpenAPI endpoints; wrap the SDK behind small node-local interfaces when tests need fakes.
- Keep workflow node inputs and outputs plain JSON-compatible values so workflow scripts do not depend on SDK types.
