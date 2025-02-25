// require('dotenv').config(); // .env 파일의 내용을 process.env에 로드
const fs = require("fs");
const https = require("https");
const WebSocket = require("ws");
const Y = require("yjs");

const optionsUrl = process.env.OPTION_URL
const port = process.env.PORT
// const port = 4444
// SSL 옵션 (Let's Encrypt 인증서)
const options = {
  key: fs.readFileSync(`${optionsUrl}privkey.pem`),
  cert: fs.readFileSync(`${optionsUrl}fullchain.pem`),
};

// HTTPS 서버 생성 (SSL 적용)
const httpsServer = https.createServer(options);
// const httpsServer = https.createServer();

// 웹소켓 서버 생성 (HTTPS 서버를 기반으로 실행)
const wss = new WebSocket.Server({ server: httpsServer });
// const wss = new WebSocket.Server({ port });

// **Yjs 문서 저장소**
const docs = new Map(); // {room: doc}
const roomClients = new Map(); // {room: [client...]}

wss.on("connection", (socket) => {
  socket.on("message", (message) => {
    try {
      const data = JSON.parse(message);
      if (data?.userName == undefined) return;
      
      switch (data.type) {
          // 서버 코드에 커서 위치 공유를 위한 case 추가
          case "cursor-update": {
            const room = data.room;
            if (roomClients.has(room)) {
              roomClients.get(room).forEach((client) => {
                if (client !== socket && client.readyState === WebSocket.OPEN) {
                  client.send(JSON.stringify({
                    type: "cursor-update",
                    userName: data.userName,
                    position: data.position
                  }));                
                }
              });
            }
            break;
          }
        case "subscribe": {
          const room = data.topics?.[0];
          console.log(`📢 ${data.userName}님이 방에 구독: ${room}`);

          // 해당 방에 클라이언트 등록
          if (!roomClients.has(room)) {
            roomClients.set(room, new Set());
          }
          roomClients.get(room).add(socket);

          // Yjs 문서 동기화 처리
          if (docs.has(room)) {
            const doc = docs.get(room);
            const fullStateUpdate = Y.encodeStateAsUpdate(doc);
            if (fullStateUpdate) {
              
              socket.send(fullStateUpdate);
            }
          } else {
            // 처음 yjs 통신
            const doc = new Y.Doc();
            docs.set(room, doc);
            socket.send("new");
          }
          if (!docs.has(room)) {
            const doc = new Y.Doc();
            docs.set(room, doc);
          }
          break;
        }
        case "yjs-update": {
          const room = data.room || "room-name";
          if (!docs.has(room)) {
            docs.set(room, new Y.Doc());
          }
          const doc = docs.get(room);
          const update = Buffer.from(data.content.data);
          Y.applyUpdate(doc, update);

          // 해당 방의 모든 클라이언트에게 브로드캐스트 (자신 제외)
          if (roomClients.has(room)) {
            roomClients.get(room).forEach((client) => {
              if (client !== socket && client.readyState === WebSocket.OPEN) {
                client.send(update);
              }
            });
          }
          break;
        }
        // 기타 메시지 타입에 대한 처리...
      }
    } catch (error) {
      console.error("⚠ WebSocket 메시지 처리 오류:", error);
    }
  });

  socket.on("close", () => {
    console.log("❌ 클라이언트 연결 종료");
    // 모든 룸에서 해당 소켓 제거
    roomClients.forEach((clientsSet, room) => {
      if (clientsSet.has(socket)) {
        clientsSet.delete(socket);
        // 필요시, 방에 연결된 클라이언트가 없으면 방 관련 자원도 정리
        if (clientsSet.size === 0) {
          roomClients.delete(room);
          docs.delete(room);
          console.log(`빈 방 삭제: ${room}`);
        }
      }
    });
  });
});


// HTTPS + WSS 서버 실행 
httpsServer.listen(port, () => {
console.log("yjs pading server is running on");
});
