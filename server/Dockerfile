FROM node:20-alpine

WORKDIR /app

COPY package*.json ./

RUN npm ci --production

COPY src/ ./src/
# Security: seed.js intentionally excluded from production image
COPY .env.example ./.env

EXPOSE 5000

CMD ["node", "src/server.js"]
