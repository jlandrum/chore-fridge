FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY index.html vite.config.js ./
COPY src ./src
COPY public ./public
RUN npm run build

FROM python:3.12-alpine
WORKDIR /app
COPY server.py ./
COPY --from=build /app/dist ./dist
RUN mkdir -p /data
ENV PORT=8080 DATA_FILE=/data/state.json
EXPOSE 8080
CMD ["python", "-u", "server.py"]
