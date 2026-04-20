FROM node:20-alpine AS build
WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

FROM node:20-alpine AS runtime
WORKDIR /app
RUN npm install --location=global serve@14.2.4
COPY --from=build /app/dist ./dist

ENV PORT=8080
ENV HOST=0.0.0.0
EXPOSE 8080
CMD ["sh", "-c", "echo \"[startup] PORT=${PORT} HOST=${HOST}\" && exec serve -s dist -l tcp://${HOST}:${PORT}"]
