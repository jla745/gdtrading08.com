FROM node:18-alpine

# Python과 빌드 도구 설치
RUN apk add --no-cache python3 make g++

WORKDIR /app

# package.json들 복사
COPY gmail-sender-extension/package.json ./
COPY gmail-sender-extension/tracking-server/package.json ./gmail-sender-extension/tracking-server/

# 의존성 설치
WORKDIR /app/gmail-sender-extension/tracking-server
RUN npm install

# 소스 코드 복사
WORKDIR /app
COPY gmail-sender-extension/ ./gmail-sender-extension/

# 작업 디렉토리 설정
WORKDIR /app/gmail-sender-extension/tracking-server

# 포트 노출
EXPOSE 3000

# 서버 실행
CMD ["node", "server.js"]