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
EXPOSE 8080
CMD ["sh", "-c", "echo \"Starting serve on 0.0.0.0:${PORT}\" && serve -s dist --listen ${PORT} --no-clipboard"]
