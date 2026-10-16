# Muse Studio

Công cụ chạy trên máy cá nhân để **tạo video bằng tài khoản Muse (muse.ai), duyệt rồi đăng tự động lên nhiều kênh YouTube**.

- Mỗi kênh YouTube là một project riêng với chủ đề/ngách của nó. Muse tự gợi ý prompt cho từng video, bạn duyệt rồi mới tạo video.
- Đặt lịch hằng ngày: Muse tự nghĩ prompt và tạo video, hoặc dùng prompt/video bạn đã chuẩn bị.
- Video tạo xong vào hộp **Chờ duyệt**; chỉ khi bạn duyệt mới đăng lên YouTube (có tùy chọn tự đăng).
- Theo dõi lượt xem, subscriber, số liệu từng video của mọi kênh trong một bảng điều khiển.

Không cần Docker, Python hay cơ sở dữ liệu. Server chỉ dùng Node.js, không có thư viện nào cần cài để chạy.

## Video demo

[![Xem video demo Muse Studio (1 phút 40 giây)](docs/demo-poster.jpg)](docs/demo.mp4)

Bấm vào ảnh để xem video demo (khoảng 1 phút 40 giây, dùng dữ liệu giả).

## Yêu cầu

| Thứ cần có | Ghi chú |
|---|---|
| **Node.js 22 trở lên** | Kiểm tra bằng `node -v`. Server dùng `fetch` và `WebSocket` có sẵn của Node 22. |
| **Google Chrome hoặc Microsoft Edge** | Tool điều khiển trình duyệt này để làm việc với muse.ai. Windows/macOS/Linux đều được. |
| **Tài khoản Muse** | Đăng nhập được trên muse.ai. |
| **Tài khoản Google quản lý kênh YouTube** | Và một Google OAuth client do bạn tự tạo (làm một lần, có hướng dẫn trong giao diện). |
| Máy bật khi cần chạy lịch | Lịch chạy trên chính máy này. Nếu tắt máy đúng giờ chạy, lịch tự chạy bù khi bật lại trong cùng ngày. |

## Chạy nhanh

```bash
node server.js
```

Mở **http://127.0.0.1:3000** (dùng đúng `127.0.0.1`, không dùng `localhost`, vì địa chỉ này khớp với cấu hình đăng nhập Google).

Giao diện (React + Ant Design) đã được build sẵn trong `web/dist` nên chạy được ngay, không cần `npm install`. Chỉ khi sửa mã giao diện trong `web/src` mới cần build lại (xem mục **Phát triển**).

## Thiết lập lần đầu (khoảng 10 phút)

### 1. Kết nối tài khoản Muse (trang Cài đặt → Tài khoản Muse)

Tool dùng cookie đăng nhập của bạn trên muse.ai.

1. Cài một extension quản lý cookie từ cửa hàng chính thức, ví dụ **Cookie-Editor** (Chrome Web Store / Edge Add-ons).
2. Đăng nhập muse.ai bằng Chrome/Edge như bình thường.
3. Ở trang muse.ai mở extension → **Export → JSON** (tự chép vào clipboard).
4. Quay lại Cài đặt, bấm **Dán từ clipboard**. Cần đủ 4 cookie: `hatch_sess`, `hatch_gw`, `hatch_vml`, `hatch_native_auth_device`. Bấm **Lưu cookie** rồi **Kiểm tra kết nối**.

Không muốn dùng extension: mở DevTools (F12) → tab Network → bấm một request tới muse.ai → sao chép giá trị dòng `cookie` ở Request Headers, dán nguyên chuỗi vào ô.

Lần chạy thật đầu tiên nên tắt tùy chọn "Ẩn cửa sổ trình duyệt" (Cài đặt → Trình duyệt tạo video) để quan sát cửa sổ Chrome/Edge tool mở ra.

> Cookie cho phép vào tài khoản Muse của bạn. Chỉ dán vào Cài đặt, không gửi qua chat hay email. Cookie hết hạn thì job dừng ở trạng thái **Cần cookie**; dán cookie mới là chạy tiếp.

### 2. Kết nối Google OAuth (trang Kênh YouTube, làm một lần)

Mở trang **Kênh YouTube**; nếu chưa cấu hình, trang hiện hướng dẫn 5 bước có link mở thẳng từng trang của Google. Tóm tắt:

1. Tạo project trên [Google Cloud Console](https://console.cloud.google.com/projectcreate).
2. Bật **YouTube Data API v3**.
3. Cấu hình màn hình đồng ý OAuth: loại **External**, thêm email các tài khoản quản lý kênh vào **Test users**, rồi chuyển sang **In production** (nếu để *Testing*, phiên đăng nhập YouTube hết hạn sau 7 ngày). Scope cần: `youtube.upload`, `youtube.readonly`.
4. Tạo **OAuth client ID** loại **Web application**, thêm vào *Authorized redirect URIs* đúng địa chỉ:
   `http://127.0.0.1:3000/oauth/youtube/callback`
   (đổi cổng nếu bạn chạy cổng khác).
5. Dán **Client ID** và **Client Secret** vào form trong giao diện.

Khi bấm **Kết nối YouTube** lần đầu, Google cảnh báo "ứng dụng chưa được xác minh" vì đây là ứng dụng của riêng bạn: chọn **Nâng cao → Tiếp tục**. Tài khoản có nhiều kênh sẽ hiện màn hình chọn đúng kênh cần kết nối.

Lỗi thường gặp: `redirect_uri_mismatch` (địa chỉ ở bước 4 chưa khớp từng ký tự), `access_denied` (email chưa nằm trong Test users).

### 3. Thêm kênh và điền chủ đề

1. **Kênh YouTube → Thêm kênh** → chọn tài khoản/kênh trên Google. Tên và avatar kênh tự lấy từ YouTube.
2. Tool chuyển thẳng sang trang kênh, tab **Hồ sơ kênh**: điền ngách, chủ đề, đối tượng, giọng điệu, điều cần tránh, khung hình và thời lượng mặc định. Muse dựa vào hồ sơ này để gợi ý prompt và đặt tiêu đề.

## Cách dùng hằng ngày

Trang của mỗi kênh có 5 tab: **Hồ sơ kênh · Prompt · Video · Lịch tự động · Bài đăng**.

**Làm tay:**
1. Tab **Prompt → Muse gợi ý prompt** (1–10 prompt, có thể kèm yêu cầu riêng). Prompt do Muse sinh ở trạng thái *Chờ duyệt*.
2. Sửa nội dung nếu muốn, bấm **Duyệt**. Prompt bạn tự viết hoặc nhập nhiều dòng thì đã duyệt sẵn.
3. Chọn các prompt đã duyệt → **Tạo video**. Khung hình/thời lượng lấy theo hồ sơ kênh. Hàng đợi chạy lần lượt từng video.
4. Video tạo xong vào mục **Chờ duyệt**, đã điền sẵn tiêu đề/mô tả/tag. Xem lại, sửa, chọn giờ đăng công khai rồi **Duyệt và upload**.

**Tự động bằng lịch (tab Lịch tự động → Thêm lịch):** chọn nguồn nội dung cho mỗi ngày:

| Nguồn | Hoạt động |
|---|---|
| **Muse tự nghĩ mỗi ngày** | Đến giờ, Muse nghĩ prompt mới theo hồ sơ kênh rồi tạo video. Không cần chuẩn bị gì. |
| **Prompt đã duyệt trong project** | Lấy lần lượt prompt đã duyệt. Tùy chọn Muse tự sinh thêm khi hết. |
| **Video đã tạo sẵn** | Chọn nhiều video có sẵn; mỗi ngày đưa một video vào duyệt/đăng. Hết video thì lịch tự tắt. |

Mặc định video do lịch tạo vẫn chờ bạn duyệt; có thể chọn *Tự đăng*. Nếu Muse lỗi, lịch thử lại sau 10 phút, tối đa 3 lần mỗi ngày, và báo lý do trong danh sách lịch.

## Lưu ý quan trọng

- **Hạn mức YouTube:** mỗi project Google có 10.000 đơn vị/ngày, mỗi lần upload tốn 1.600, tức khoảng 6 video mỗi ngày cho toàn bộ kênh. Trang Kênh hiển thị mức đã dùng.
- **Ứng dụng chưa được Google kiểm duyệt:** YouTube có thể khóa video upload ở chế độ riêng tư. Tool cảnh báo khi video đã đến giờ công khai mà vẫn riêng tư.
- **Quota Muse:** mỗi video và mỗi lần gợi ý prompt/tiêu đề tốn lượt dùng tài khoản Muse của bạn.
- **Dữ liệu và bảo mật:** mọi thứ nằm trong thư mục `data/` trên máy bạn, gồm cookie Muse, token YouTube và video. Server chỉ nhận kết nối từ máy này (`127.0.0.1`). **Không chia sẻ hoặc đưa `data/` lên git**; đã có sẵn trong `.gitignore`. Cookie và token lưu dạng văn bản trong thư mục này, hãy bảo vệ máy như bảo vệ tài khoản.
- Tool dùng giao diện web của Muse (tự động hóa trình duyệt), nên khi Muse đổi giao diện có thể cần chỉnh lại selector trong `lib/muse.js`. Hãy kiểm tra điều khoản của Muse và YouTube trước khi dùng thương mại.

## Cấu trúc

| Đường dẫn | Nội dung |
|---|---|
| `server.js` | HTTP server, API, hàng đợi, bộ lập lịch, đồng bộ số liệu YouTube |
| `lib/muse.js` | Điều khiển Chrome/Edge qua CDP để tạo video và chat với Muse |
| `lib/youtube.js` | OAuth nhiều kênh, upload, thống kê, theo dõi quota |
| `lib/ai.js` | Nhờ Muse gợi ý prompt theo hồ sơ kênh và tiêu đề/mô tả/tag |
| `web/` | Giao diện React + Ant Design (Vite). `web/src` là mã nguồn, `web/dist` là bản build |
| `data/` | Dữ liệu cục bộ, tự tạo khi chạy (không đưa vào git) |
| `Dockerfile` | Chỉ để phục vụ giao diện/API; tạo video cần Chrome/Edge nên chạy trực tiếp trên máy |

## Biến môi trường (tùy chọn)

| Biến | Mặc định | Ý nghĩa |
|---|---|---|
| `PORT` | `3000` | Cổng web. Đổi cổng thì phải đổi cả redirect URI trong Google Cloud |
| `HOST` | `127.0.0.1` | Địa chỉ lắng nghe |
| `DATA_DIR` | `./data` | Nơi lưu dữ liệu |
| `MUSE_BROWSER_PATH` | tự tìm | Đường dẫn Chrome/Edge nếu tool không tự tìm thấy |
| `OAUTH_REDIRECT_BASE` | `http://127.0.0.1:<PORT>` | Địa chỉ gốc của redirect OAuth (khi chạy sau proxy) |
| `ALLOWED_HOSTS` | | Thêm tên host được phép truy cập (phân tách bằng dấu phẩy) |
| `MUSE_CDP_PORT` | `19210` | Cổng gỡ lỗi của trình duyệt do tool mở |
| `MUSE_CHAT_THREAD_LIMIT` | `14` | Số tin tối đa trong một cuộc chat Muse trước khi mở cuộc mới |
| `SCHEDULE_TICK_MS` | `30000` | Chu kỳ kiểm tra lịch |

Các biến còn lại (`MUSE_SITE_URL`, `GOOGLE_*`, `YT_*`, `AVATAR_EXTRA_HOSTS`, `MUSE_THREAD_LOAD_TIMEOUT_MS`) chỉ dùng cho kiểm thử với dịch vụ giả.

## Phát triển

```bash
npm run setup     # lần đầu: cài thư viện giao diện và build
npm run build     # build lại sau khi sửa web/src
npm run dev:web   # giao diện hot reload ở cổng 5173 (cần server đang chạy ở cổng 3000)
npm run check     # kiểm tra cú pháp phần server
```


## Xử lý sự cố

| Hiện tượng | Cách xử lý |
|---|---|
| `Không tìm thấy Chrome/Edge` | Cài Chrome hoặc Edge, hoặc đặt `MUSE_BROWSER_PATH` |
| Job báo **Cần cookie** | Cookie Muse hết hạn: dán cookie mới ở Cài đặt |
| Mở trang bị 403 | Dùng đúng `http://127.0.0.1:3000`, hoặc thêm host vào `ALLOWED_HOSTS` |
| Kết nối YouTube báo `redirect_uri_mismatch` | Redirect URI trong Google Cloud phải khớp từng ký tự (http, 127.0.0.1, đúng cổng) |
| Kênh báo "Cần kết nối lại" | Token YouTube hết hạn hoặc bị thu hồi: bấm **Kết nối lại** |
| Lịch không chạy | Máy phải bật, có cookie Muse và kênh đã kết nối YouTube; xem dòng lỗi dưới tên lịch |
| Cổng 3000 bị chiếm | Chạy `PORT=3100 node server.js` (PowerShell: `$env:PORT=3100; node server.js`) và đổi redirect URI tương ứng |
