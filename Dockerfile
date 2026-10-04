# Works on Railway, Fly.io, a VPS, or anywhere that runs containers.
FROM node:22-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build && npm prune --omit=dev

FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production PORT=3001 DATA_DIR=/data
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package.json ./
COPY server ./server
COPY shared ./shared
# Mount a persistent volume here — it holds the database and uploads.
VOLUME /data
EXPOSE 3001
CMD ["node", "--no-warnings", "server/index.ts"]
