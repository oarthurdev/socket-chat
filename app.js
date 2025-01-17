const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');
const cors = require('cors');
const winston = require('winston');

// Configuração do logger
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.printf(({ level, message, timestamp }) => `${timestamp} [${level.toUpperCase()}]: ${message}`)
  ),
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({ filename: 'server.log' })
  ],
});

const app = express();
const server = http.createServer(app);

// Configuração do Socket.IO
const io = new Server(server);

const connectedUsers = {}; // Armazena usuários conectados por socket.id

const generateRandomName = () => {
  const adjectives = ['Happy', 'Fast', 'Clever', 'Brave', 'Witty', 'Bright'];
  const nouns = ['Tiger', 'Panda', 'Fox', 'Eagle', 'Bear', 'Lion'];
  const adjective = adjectives[Math.floor(Math.random() * adjectives.length)];
  const noun = nouns[Math.floor(Math.random() * nouns.length)];
  return `${adjective}${noun}`;
};

// Middleware para logs de requisições
app.use((req, res, next) => {
  logger.info(`HTTP ${req.method} ${req.url}`);
  next();
});

// Configuração de CORS
app.use(cors({
  origin: '*',
}));

// Servindo arquivos estáticos
const publicPath = path.join(__dirname, 'public');
app.use(express.static(publicPath));

// Gerenciamento de conexões WebSocket
// Gerenciamento de conexões WebSocket
io.on('connection', (socket) => {
  logger.info(`Cliente conectado: ${socket.id}`);

  if (!connectedUsers[socket.id]) {
    const randomName = generateRandomName();
    connectedUsers[socket.id] = randomName;
    socket.emit('assignName', randomName);
    console.log(`${randomName} connected.`);
  }

  socket.on('joinRoom', (room) => {
    socket.join(room);
    const randomName = connectedUsers[socket.id];
    logger.info(`Cliente ${socket.id} entrou na sala ${room}`);
    io.to(room).emit('systemMessage', `Bem-vindo(a), ${randomName}.`);
  });

  // Evento de digitação para sugerir menções enquanto o usuário digita
  socket.on('typing', (message) => {
    if (!message) return;

    // Detectando menções de usuários no formato @nome
    const mentionPattern = /@([a-zA-Z0-9_]+)/g; // Regex para encontrar @nome
    const partialMention = message.split('@').pop();

    if (partialMention) {
      // Encontrar usuários que começam com o texto após o @
      const suggestions = Object.values(connectedUsers).filter((name) =>
        name.toLowerCase().startsWith(partialMention.toLowerCase())
      );
      // Enviar sugestões para o cliente que está digitando
      socket.emit('mentionSuggestions', suggestions);
    }
  });

  socket.on('chatMessage', ({ room, message }) => {
    if (!room || !message) {
      logger.error(`Mensagem inválida recebida de ${socket.id}`);
      return;
    }

    const sender = connectedUsers[socket.id];

    // Detectando menções de usuários no formato @nome
    const mentionedUsers = [];
    const mentionPattern = /@([a-zA-Z0-9_]+)/g; // Regex para encontrar @nome

    let match;
    while ((match = mentionPattern.exec(message)) !== null) {
      const mentionedName = match[1];
      // Verifica se o nome mencionado está em connectedUsers
      if (Object.values(connectedUsers).includes(mentionedName)) {
        mentionedUsers.push(mentionedName);
      }
    }

    // Se houver menções, substituir @nome pelo nome real do usuário
    mentionedUsers.forEach((mentionedName) => {
      message = message.replace(`@${mentionedName}`, `<b>@${mentionedName}</b>`); // Você pode formatar como quiser
    });

    logger.info(`Mensagem de ${socket.id} para sala ${room}: ${message}`);
    io.to(room).emit('chatMessage', { sender, message });
  });

  socket.on('disconnect', (reason) => {
    logger.info(`Cliente desconectado: ${socket.id} (Razão: ${reason})`);
    const disconnectedUser = connectedUsers[socket.id];
    console.log(`${disconnectedUser} disconnected.`);
    delete connectedUsers[socket.id];
  });

  socket.on('error', (err) => {
    logger.error(`Erro no socket ${socket.id}: ${err.message}`);
  });
});

// Endpoint principal (opcional)
app.get('/', (req, res) => {
  res.sendFile(path.join(publicPath, 'index.html'));
});

// Inicialização do servidor
const PORT = 3000;
server.listen(PORT, () => {
  logger.info(`Servidor iniciado na porta ${PORT}`);
});

