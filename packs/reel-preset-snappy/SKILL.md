# Snappy reel preset

Nạp preset reel `snappy` (quay nhanh, dừng gọn) vào game. Pack chép `presets/reel/snappy.json` vào project; skill này chỉ cách nạp nó vào `{{p:manifest.json}}` qua MCP và cách kiểm. Bản gốc của pack nằm ở `skills/reel-preset-snappy/skill.json`.

## Điều kiện tiên quyết

| Cần | Kiểm |
|---|---|
| Project hợp lệ trước khi sửa | `{{slot}} check --game {{game}} --json` |
| Preset đã có trong project | `ls presets/reel/snappy.json` |
| Server MCP `slot` đã nối (tool `manifest.set`, `scene.save`) | `{{slot}} docs scene-edit` |

## Các bước

1. Đọc `presets/reel/snappy.json`: đó là object feel đầy đủ, không phải id preset.
2. Gọi tool MCP `manifest.set` với path là mảng một phần tử `reelFeel` và value là object vừa đọc (bỏ `$schema` và `formatVersion`).
3. Gọi tool MCP `scene.save` để ghi `{{p:manifest.json}}`.
4. Chạy `{{slot}} check --game {{game}} --json`: `ok: true`.

<!-- agent:claude -->
Trong Claude Code, tool có tên wire `manifest_set` và `scene_save` của server `slot`.
<!-- /agent:claude -->

Chi tiết và cách hoàn tác: recipe `reel-preset-snappy`.
