# Thanh toán chuyển khoản tự động (SePay)

Khách bấm **Mua ngay** → hiện mã QR chuyển khoản kèm mã đơn → tiền vào tài khoản → SePay báo về trang của bạn → trang **tự hiện nút Tải về**. Không cần bạn làm gì cho từng đơn.

```
Khách ──QR/chuyển khoản──> Techcombank ──> SePay ──webhook──> /api/sepay-webhook ──> đánh dấu đã trả
Trang ◄──hỏi "đã trả chưa?" mỗi 4 giây── /api/order        File zip lấy từ repo riêng tư qua /api/download
```

Mã máy chủ nằm trong `site/api/`, chạy dạng Vercel Functions cùng trang. Không có thư viện ngoài, mọi bí mật nằm trong **biến môi trường** trên Vercel.

## Tổng quan việc cần làm (khoảng 45 phút, làm một lần)

1. SePay: tạo tài khoản, liên kết Techcombank, tạo webhook.
2. Upstash: tạo cơ sở dữ liệu Redis miễn phí (lưu đơn hàng).
3. GitHub: tạo repo **riêng tư** chứa file zip và một token chỉ đọc.
4. Vercel: điền biến môi trường rồi triển khai lại.
5. Thử bằng một khoản chuyển khoản nhỏ.

## 1. SePay

1. Vào https://my.sepay.vn/register tạo tài khoản.
2. Thêm tài khoản ngân hàng (ví dụ **BIDV**; Techcombank có thể chưa được SePay hỗ trợ cho tài khoản cá nhân, bạn xem danh sách ngân hàng trong SePay) và xác nhận bằng OTP theo hướng dẫn trong SePay. SePay hiển thị cho bạn **số tài khoản dùng để nhận tiền**. Với một số ngân hàng đó là *tài khoản ảo (VA)* do SePay cấp chứ không phải số tài khoản chính. Lấy đúng số mà SePay hướng dẫn nhận tiền (xem mục Tạo QR của SePay) để điền vào `BANK_ACCOUNT` ở bước 4.
3. Vào menu **Tích hợp WebHooks → + Thêm webhook**:
   - Sự kiện: **Có tiền vào**
   - URL: `https://TÊN-MIỀN-CỦA-BẠN/api/sepay-webhook`
   - Xác thực: **API Key**. Tự đặt một chuỗi dài ngẫu nhiên (ví dụ 32 ký tự) và **ghi lại**, đây là `SEPAY_API_KEY`.
4. Gói miễn phí của SePay có thể giới hạn số giao dịch mỗi tháng, bạn xem bảng giá trên trang của họ.

## 2. Upstash Redis (miễn phí)

1. Đăng ký https://upstash.com, tạo một database **Redis**, chọn vùng gần Việt Nam (ví dụ Singapore).
2. Ở trang database, chép hai giá trị trong mục **REST API**: `UPSTASH_REDIS_REST_URL` và `UPSTASH_REDIS_REST_TOKEN`.

(Nếu bạn thêm Upstash qua mục Storage/Marketplace của Vercel thì hai biến này, hoặc `KV_REST_API_URL` và `KV_REST_API_TOKEN`, được Vercel điền sẵn. Mã chấp nhận cả hai tên.)

## 3. Repo riêng tư chứa file bản cài

1. Tạo repo GitHub **Private**, ví dụ `muse-studio-release`.
2. Tạo file bản cài: trong thư mục dự án chạy `node site/build.mjs --zip`, được `site/release/muse-studio.zip`.
3. Đưa file này lên repo riêng tư đó (kéo thả trên GitHub vào thư mục gốc, tên file `muse-studio.zip`).
4. Tạo token chỉ đọc: GitHub → Settings → Developer settings → **Fine-grained tokens** → Generate new token. Chọn **chỉ repo** `muse-studio-release`, quyền **Contents: Read-only**. Chép token, đây là `GITHUB_TOKEN`.

Mỗi khi ra bản mới: tạo lại zip và thay file trong repo này, khách mới sẽ nhận bản mới ngay.

## 4. Biến môi trường trên Vercel

Vào dự án `muse-studio-landing` trên Vercel → **Settings → Environment Variables**, thêm:

| Biến | Giá trị | Bắt buộc |
|---|---|---|
| `SEPAY_API_KEY` | chuỗi bạn đặt ở bước 1.3 | có |
| `BANK_NAME` | tên ngân hàng như trong SePay, ví dụ `BIDV` | có (mặc định `BIDV`) |
| `BANK_ACCOUNT` | số tài khoản nhận tiền; với BIDV là **số tài khoản ảo (VA)** do SePay cấp, ví dụ `96247NJ49C` (xem bước 1.2) | có |
| `BANK_HOLDER` | tên chủ tài khoản, không dấu, viết hoa | nên có |
| `PRICE_VND` | giá bán bằng đồng, ví dụ `125000` | mặc định 125000 |
| `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` | từ bước 2 | có |
| `RELEASE_REPO` | `tên-github/muse-studio-release` | có |
| `GITHUB_TOKEN` | token từ bước 3.4 | có |
| `RELEASE_PATH` | tên file trong repo, mặc định `muse-studio.zip` | không |
| `DOWNLOAD_LIMIT` | số lần tải tối đa mỗi đơn, mặc định `5` | không |
| `SITE_URL` | địa chỉ trang, ví dụ `https://muse-studio.vercel.app` | khi gửi email |
| `RESEND_API_KEY`, `MAIL_FROM` | để gửi link tải qua email (xem dưới) | không |

Sau khi thêm biến phải **Redeploy** (Deployments → ba chấm → Redeploy) thì mới có hiệu lực.

**Gửi email (tùy chọn):** tạo tài khoản https://resend.com, xác minh tên miền gửi thư, lấy API key. `MAIL_FROM` có dạng `Muse Studio <no-reply@tenmien-cua-ban.com>`. Không cấu hình thì tool vẫn chạy bình thường, chỉ là không gửi email (trang không ghi "đã gửi email" khi chưa gửi được).

## Trang quản trị và thống kê

Trang `/admin/` (ví dụ `https://muse-studio-landing.vercel.app/admin/`) cho bạn theo dõi: lượt xem, khách duy nhất, số lần bấm Mua, đơn đã tạo, đơn đã thanh toán, doanh thu, lượt tải, phễu mua hàng, biểu đồ theo ngày, nguồn truy cập, quốc gia, thiết bị và danh sách đơn gần đây. Tự làm mới mỗi 30 giây.

1. Trên Vercel thêm biến **`ADMIN_PASSWORD`** (loại Secret), đặt mật khẩu dài và khó đoán, rồi **Redeploy**. Chưa đặt thì trang quản trị báo "Chưa đặt ADMIN_PASSWORD" và không ai vào được.
2. (Tùy chọn) thêm `ADMIN_SECRET` là một chuỗi ngẫu nhiên khác để ký phiên đăng nhập. Không đặt thì mã tự suy ra từ mật khẩu.
3. Vào `/admin/`, nhập mật khẩu. Phiên đăng nhập 12 giờ; nhập sai quá 8 lần trong 15 phút sẽ bị khóa tạm.

Ghi chú về số liệu:
- Thống kê **không dùng cookie** và không lưu địa chỉ IP: khách duy nhất chỉ được ước tính bằng một mã băm (IP + trình duyệt + ngày) tồn tại 2 ngày. Số này có thể thấp hơn thực tế khi nhiều người dùng chung mạng.
- Bộ đếm tính theo giờ Việt Nam. Các trình thu thập (bot) và request lạ bị bỏ qua.
- Muốn lượt xem của chính bạn không bị tính, mở trang chủ **một lần** trên mỗi trình duyệt với `?notrack=1` (ví dụ `https://muse-studio-landing.vercel.app/?notrack=1`). Muốn tính lại dùng `?notrack=0`.
- Số liệu chỉ bắt đầu từ lúc bạn đưa bản này lên; dữ liệu giữ khoảng 400 ngày trong Upstash.
- Trang chủ nên có dòng thông báo ngắn về thống kê ẩn danh nếu bạn muốn minh bạch với khách.

## 5. Đưa bản cập nhật của trang lên

Trang cần có các file mới (`api/`, `pay.js`, `pay.css`). Trong thư mục dự án:

```bash
npm run site:build
cd site/dist
git add -A
git commit -m "Bật thanh toán chuyển khoản"
git push
```

Vercel tự triển khai. **Chỉ làm bước này sau khi đã điền xong biến môi trường**, nếu không khách bấm Mua sẽ thấy thông báo "Cửa hàng chưa mở thanh toán".

## 6. Thử trước khi bán

1. Trong SePay, mở webhook vừa tạo, bấm **Gửi thử**: phải thấy trạng thái thành công (trang trả `{"success":true}`).
2. Đặt tạm `PRICE_VND` thành số nhỏ (ví dụ `2000`), redeploy, rồi vào trang tự mua một đơn bằng app ngân hàng của bạn. Kiểm tra: mã QR hiện đúng, chuyển xong trong vài giây nút **Tải về** hiện ra, file tải được và giải nén chạy được.
3. Đặt lại `PRICE_VND` về giá thật rồi redeploy.

## Chạy thử trên máy (không đụng dịch vụ thật)

```bash
npm run site:build
node site/build.mjs --zip      # tạo file bản cài dùng khi thử
node site/api/selftest.mjs     # tự kiểm thử toàn bộ luồng thanh toán và trang quản trị bằng SePay giả
node site/dev.mjs              # mở http://127.0.0.1:3700 với dữ liệu giả; webhook dùng khóa dev-key; quản trị tại /admin/ mật khẩu dev-admin
```

## Khi khách gặp vấn đề

| Tình huống | Cách xử lý |
|---|---|
| Khách chuyển nhưng nút tải không hiện | Thường do nội dung chuyển khoản sai hoặc thiếu. Hỏi khách mã đơn, kiểm tra giao dịch trong SePay. Nếu khoản đã nhận đúng số tiền, gửi file thủ công qua Zalo hoặc email. |
| Khách chuyển thiếu tiền | Trang tự báo "đã nhận ... nhưng chưa đủ", khách chuyển thêm với cùng nội dung. |
| Khách chuyển thừa | Vẫn mở khóa, hoàn lại phần thừa nếu cần. |
| Khách mất link tải | Link nằm trong email (nếu có gửi) và lưu trên trình duyệt của họ. Hết lượt tải thì tăng `DOWNLOAD_LIMIT` hoặc gửi file tay. |
| SePay không gọi webhook | Xem nhật ký trong my.sepay.vn → Webhooks. SePay tự thử lại tối đa 7 lần, với mỗi lần thất bại cần trang trả `200` và `{"success":true}`. |

## Giới hạn cần biết

- Mã đơn và token là thứ duy nhất chứng minh đã mua: ai có link tải thì tải được (tối đa `DOWNLOAD_LIMIT` lần). Không thể chặn tuyệt đối việc khách chia sẻ file sau khi tải.
- Số tiền khớp theo đồng Việt Nam. Tỷ giá so với $5 do bạn đặt qua `PRICE_VND`.
- Mã QR do dịch vụ vietqr.app tạo. Nếu dịch vụ đó ngừng, trang báo "Không tải được mã QR" và khách vẫn chuyển khoản theo thông tin hiển thị. Có thể đổi sang dịch vụ khác bằng biến `QR_BASE`.
- Gói miễn phí của Vercel (Hobby) theo điều khoản dành cho dùng cá nhân, phi thương mại. Bán hàng thì nên xem lại điều khoản hoặc dùng gói trả phí/nền tảng khác.
