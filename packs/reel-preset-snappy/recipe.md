# Snappy reel preset: recipe

Cặp với skill `reel-preset-snappy`.

## 1. Nạp preset

| Bước | Tool MCP | Ghi chú |
|---|---|---|
| Đặt feel | `manifest.set` | path `reelFeel`, value = nội dung `presets/reel/snappy.json` không kèm `$schema`, `formatVersion` |
| Lưu | `scene.save` | ghi `{{p:manifest.json}}` |

## 2. Kiểm

- `{{slot}} check --game {{game}} --json` sạch.
- `{{slot}} test --game {{game}}` xanh.

## 3. Hoàn tác

Gọi tool MCP `undo` trước khi `scene.save`, hoặc đặt lại `reelFeel` về giá trị cũ rồi lưu.

## DoD

`manifest.reelFeel` bằng nội dung preset, `{{slot}} check --game {{game}} --json` trả `ok: true`.
