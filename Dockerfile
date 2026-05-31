# Gunakan image Node.js berbasis Alpine yang sangat ringan (hanya ~40MB)
FROM node:20-alpine

# Setel direktori kerja di dalam kontainer
WORKDIR /app

# Salin package.json dan package-lock.json (jika ada)
COPY package*.json ./

# Instal dependensi (tanpa kompiler C native dan abaikan skrip opsional demi kecepatan)
RUN npm install --omit=optional --ignore-scripts

# Salin seluruh kode program ke dalam kontainer
COPY . .


# Jalankan DeltaUbotJS saat kontainer dimulai
CMD ["npm", "start"]
