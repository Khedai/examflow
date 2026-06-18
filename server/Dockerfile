FROM node:20-alpine

WORKDIR /app

# Copy package files and install (including dev deps for build)
COPY package*.json ./
RUN npm install

# Copy source and build
COPY tsconfig.json ./
COPY src/ ./src/
RUN npm run build

# Remove dev dependencies for production
RUN npm prune --production

EXPOSE 4000
CMD ["node", "dist/index.js"]