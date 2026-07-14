# Frontend image: build the static bundle with Node, serve it with nginx.
# nginx also reverse-proxies /api to the backend so the browser talks to one
# origin (no CORS, no VITE_API_BASE_URL needed at build time).

FROM node:22-alpine AS build
WORKDIR /app

# Install deps as their own cached layer.
COPY package.json package-lock.json ./
RUN npm ci

# Build (tsc -b && vite build → /app/dist).
COPY . .
RUN npm run build

FROM nginx:alpine AS runtime
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
