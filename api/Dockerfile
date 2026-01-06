# Stage 1: Build the application
FROM node:20.19-alpine AS builder

WORKDIR /usr/src/app

COPY package*.json ./
COPY prisma ./prisma
RUN npm install

COPY . .
RUN npm run build

# Stage 2: Create the production image
FROM node:20.19-alpine

WORKDIR /usr/src/app

# Install OpenSSL for Prisma
RUN apk add --no-cache openssl

COPY package*.json ./
COPY prisma ./prisma

RUN npm install --only=production

COPY --from=builder /usr/src/app/dist ./dist

EXPOSE 3001

CMD [ "node", "dist/index.js" ]
