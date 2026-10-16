FROM node:22-alpine AS web
WORKDIR /app/web
COPY web/package*.json ./
RUN npm ci
COPY web ./
RUN npm run build

FROM node:22-alpine
WORKDIR /app
COPY package.json server.js ./
COPY lib ./lib
COPY --from=web /app/web/dist ./web/dist
ENV NODE_ENV=production PORT=3000
EXPOSE 3000
# Lưu ý: tạo video cần Chrome/Edge và chạy trên máy cá nhân; image này chỉ phục vụ giao diện/API.
CMD ["node", "server.js"]
