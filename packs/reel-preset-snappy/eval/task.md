# Task

Game `evalGame` đang dùng feel reel mặc định, quay và dừng chậm. Hãy làm cho reel quay và dừng nhanh, gọn, với đúng các số sau:

- tốc độ quay: thường 5, turbo 8;
- các reel dừng cách nhau 120 ms (reel đầu ở 0 ms), mỗi lượt quay tối thiểu 400 ms;
- khi đáp, reel vượt 12 px rồi về chỗ trong 110 ms.

Ghi feel vào manifest qua MCP, không sửa JSON tay, rồi bảo đảm `slot check --game . --json` sạch.
