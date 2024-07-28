const WebSocket = require('ws');

let wss;

function setupWebSocketServer(server) {
  wss = new WebSocket.Server({ server });

  // Broadcast function to send data to all connected clients
  wss.broadcast = (data) => {
    wss.clients.forEach(client => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(JSON.stringify(data));
      }
    });
  };

  return wss;
}

function getWebSocketServer() {
  if (!wss) {
    throw new Error('WebSocket server is not set up. Call setupWebSocketServer first.');
  }
  return wss;
}

module.exports = { setupWebSocketServer, getWebSocketServer };
