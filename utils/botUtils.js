// Save bots info to file
export function saveBotsToFile(bots, BOTS_FILE, fs, path) {
  const arr = Array.from(bots.entries()).map(([botId, bot]) => ({
    botId,
    chatbotName: bot.chatbotName || "Default Bot",
  }));
  fs.ensureDirSync(path.dirname(BOTS_FILE));
  fs.writeFileSync(BOTS_FILE, JSON.stringify(arr, null, 2));
}

// Broadcast QR code to all clients with botId
export function broadcastQR(wss, botId, data) {
  wss.clients.forEach((client) => {
    client.send(JSON.stringify({ botId, qr: data }));
  });
}



