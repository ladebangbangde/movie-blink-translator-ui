FROM node:20-bookworm-slim

WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends ffmpeg \
  && rm -rf /var/lib/apt/lists/*

COPY backend/package*.json ./
RUN npm install --omit=dev

COPY backend/ ./

RUN mkdir -p storage/uploads storage/outputs

EXPOSE 3020 33002

CMD ["npm", "run", "start"]
