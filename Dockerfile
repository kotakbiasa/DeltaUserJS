# Gunakan image Node.js berbasis Alpine yang sangat ringan (hanya ~40MB)
FROM node:26-alpine

# Setel direktori kerja di dalam kontainer
WORKDIR /app

# Instal dependensi runtime untuk fitur YouTube Downloader (.ytdl)
RUN apk add --no-cache yt-dlp ffmpeg

# Salin package.json dan package-lock.json (jika ada)
COPY package*.json ./

# Instal dependensi (tanpa kompiler C native dan abaikan skrip opsional demi kecepatan)
RUN npm install --omit=optional --ignore-scripts

# Salin seluruh kode program ke dalam kontainer
COPY . .


# Jalankan DeltaUbotJS saat kontainer dimulai
CMD ["npm", "start"]
