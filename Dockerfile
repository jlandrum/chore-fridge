FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/web/package.json ./apps/web/package.json
COPY apps/server/package.json ./apps/server/package.json
COPY packages/domain/package.json ./packages/domain/package.json
COPY packages/contracts/package.json ./packages/contracts/package.json
RUN npm ci
COPY apps ./apps
COPY packages ./packages
RUN npm run build && npm prune --omit=dev

FROM node:22-alpine
WORKDIR /app
COPY --from=build /app/package.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/apps/server ./apps/server
COPY --from=build /app/apps/web/package.json ./apps/web/package.json
COPY --from=build /app/apps/web/dist ./apps/web/dist
COPY --from=build /app/packages ./packages
RUN mkdir -p /data
ENV PORT=8080 DATA_FILE=/data/state.json DATABASE_FILE=/data/chore-fridge.sqlite
EXPOSE 8080
CMD ["node", "apps/server/src/index.js"]
