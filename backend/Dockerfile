FROM node:20-bookworm-slim

WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends ffmpeg \
  && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm install --omit=dev

COPY . ./

RUN mkdir -p storage/uploads storage/outputs

EXPOSE 3000

CMD ["npm", "run", "start"]
