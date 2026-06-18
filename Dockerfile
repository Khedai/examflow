FROM node:20-alpine

WORKDIR /app

# Copy package files from server/ and install (including dev deps for build)
COPY server/package*.json ./
RUN npm install

# Copy source from server/ and build
COPY server/tsconfig.json ./
COPY server/src/ ./src/
RUN npm run build

# Remove dev dependencies for production
RUN npm prune --production

EXPOSE 4000
CMD ["node", "dist/index.js"]