// Broadcast QR code to all clients with botId
export function broadcastQR(wss, botId, data) {
  wss.clients.forEach((client) => {
    client.send(JSON.stringify({ botId, qr: data }));
  });
}



