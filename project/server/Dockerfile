FROM node:20-bookworm-slim

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY . .

ENV NODE_ENV=production
ENV PORT=3001
ENV REPORTS_DIR=/app/reports
ENV PYTHON_API_BASE_URL=http://python-api:8000

EXPOSE 3001

CMD ["npm", "run", "dev"]
