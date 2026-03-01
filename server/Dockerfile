FROM node:20-alpine

WORKDIR /app

COPY package*.json ./

RUN npm ci --production

COPY src/ ./src/
COPY seed.js ./
COPY .env.example ./.env

EXPOSE 5000

CMD ["node", "src/server.js"]
