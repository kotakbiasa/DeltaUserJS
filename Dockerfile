# Gunakan image Node.js berbasis Alpine yang sangat ringan (hanya ~40MB)
FROM node:26-alpine

# Setel direktori kerja di dalam kontainer
WORKDIR /app

# Instal dependensi runtime untuk fitur YouTube Downloader (.ytdl) dan build tools untuk modul native (seperti lzma-native)
RUN apk add --no-cache yt-dlp ffmpeg build-base xz-dev libc6-compat

# Salin package.json dan package-lock.json (jika ada)
COPY package*.json ./

# Instal dependensi (tanpa --ignore-scripts agar modul native seperti lzma-native dapat dikompilasi)
RUN npm install --omit=optional

# Salin seluruh kode program ke dalam kontainer
COPY . .


# Jalankan DeltaUbotJS saat kontainer dimulai
CMD ["npm", "start"]
