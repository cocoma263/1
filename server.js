const WebSocket = require('ws');
const http = require('http');
const express = require('express');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// 静态文件服务
app.use(express.static(path.join(__dirname)));

// 健康检查端点
app.get('/health', (req, res) => {
    const roomDetails = Array.from(rooms.entries()).map(([id, room]) => ({
        id,
        players: room.players.length,
        gameState: room.gameState,
        playerNames: room.players.map(p => p.name)
    }));
    
    res.json({ 
        status: 'ok', 
        timestamp: new Date().toISOString(),
        rooms: rooms.size,
        connections: wss.clients.size,
        roomDetails: roomDetails,
        allRoomIds: Array.from(rooms.keys())
    });
});

// 根路径
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// 游戏房间管理
const rooms = new Map();
const players = new Map();

class GameRoom {
    constructor(id) {
        this.id = id;
        this.players = [];
        this.board = Array(15).fill().map(() => Array(15).fill(0));
        this.currentPlayer = 1;
        this.gameState = 'waiting'; // waiting, playing, finished
        this.winner = null;
        this.createdAt = Date.now();
    }

    addPlayer(playerId, playerName, ws) {
        if (this.players.length >= 2) {
            console.log('房间已满，无法添加玩家');
            return false;
        }
        
        const player = {
            id: playerId,
            name: playerName,
            ws: ws,
            playerNumber: this.players.length + 1,
            isReady: false
        };
        
        this.players.push(player);
        console.log(`玩家 ${playerName} 加入房间 ${this.id}，当前玩家数: ${this.players.length}`);
        
        // 通知所有玩家有新玩家加入
        this.broadcast({
            type: 'player_joined',
            playersCount: this.players.length,
            players: this.players.map(p => ({
                id: p.id,
                name: p.name,
                playerNumber: p.playerNumber
            }))
        });
        
        if (this.players.length === 2) {
            console.log(`房间 ${this.id} 玩家已满，开始游戏`);
            this.gameState = 'playing';
            // 稍微延迟一下确保所有玩家都收到了加入通知
            setTimeout(() => {
                this.notifyGameStart();
            }, 500);
        }
        
        return true;
    }

    removePlayer(playerId) {
        const playerIndex = this.players.findIndex(p => p.id === playerId);
        if (playerIndex !== -1) {
            this.players.splice(playerIndex, 1);
            
            if (this.players.length === 0) {
                // 房间为空，标记为删除
                this.gameState = 'empty';
            } else {
                // 通知剩余玩家对手已离线
                this.broadcast({
                    type: 'player_left',
                    message: '对手已离线'
                });
                this.gameState = 'waiting';
            }
        }
    }

    makeMove(playerId, row, col) {
        const player = this.players.find(p => p.id === playerId);
        if (!player || this.gameState !== 'playing') {
            return false;
        }

        // 检查是否轮到该玩家
        if (player.playerNumber !== this.currentPlayer) {
            return false;
        }

        // 检查位置是否有效
        if (row < 0 || row >= 15 || col < 0 || col >= 15 || this.board[row][col] !== 0) {
            return false;
        }

        // 下棋
        this.board[row][col] = this.currentPlayer;
        
        // 检查胜负
        if (this.checkWin(row, col, this.currentPlayer)) {
            this.winner = this.currentPlayer;
            this.gameState = 'finished';
            this.broadcast({
                type: 'game_over',
                winner: this.currentPlayer,
                move: { row, col, player: this.currentPlayer }
            });
            return true;
        }

        // 检查平局
        if (this.isBoardFull()) {
            this.gameState = 'finished';
            this.broadcast({
                type: 'game_over',
                winner: 0,
                move: { row, col, player: this.currentPlayer }
            });
            return true;
        }

        // 切换玩家
        this.currentPlayer = this.currentPlayer === 1 ? 2 : 1;
        
        // 广播移动
        this.broadcast({
            type: 'move',
            move: { row, col, player: player.playerNumber },
            currentPlayer: this.currentPlayer
        });

        return true;
    }

    checkWin(row, col, player) {
        const directions = [
            [0, 1],   // 水平
            [1, 0],   // 垂直
            [1, 1],   // 对角线
            [1, -1]   // 反对角线
        ];
        
        return directions.some(([dx, dy]) => {
            let count = 1;
            
            // 向一个方向计数
            for (let i = 1; i < 5; i++) {
                const newRow = row + dx * i;
                const newCol = col + dy * i;
                if (newRow >= 0 && newRow < 15 && 
                    newCol >= 0 && newCol < 15 && 
                    this.board[newRow][newCol] === player) {
                    count++;
                } else {
                    break;
                }
            }
            
            // 向相反方向计数
            for (let i = 1; i < 5; i++) {
                const newRow = row - dx * i;
                const newCol = col - dy * i;
                if (newRow >= 0 && newRow < 15 && 
                    newCol >= 0 && newCol < 15 && 
                    this.board[newRow][newCol] === player) {
                    count++;
                } else {
                    break;
                }
            }
            
            return count >= 5;
        });
    }

    isBoardFull() {
        return this.board.every(row => row.every(cell => cell !== 0));
    }

    notifyGameStart() {
        console.log(`通知游戏开始，房间 ${this.id}，玩家数: ${this.players.length}`);
        
        const gameStartMessage = {
            type: 'game_start',
            players: this.players.map(p => ({
                id: p.id,
                name: p.name,
                playerNumber: p.playerNumber
            })),
            currentPlayer: this.currentPlayer
        };
        
        console.log('发送游戏开始消息:', gameStartMessage);
        this.broadcast(gameStartMessage);
    }

    broadcast(message) {
        this.players.forEach(player => {
            if (player.ws.readyState === WebSocket.OPEN) {
                player.ws.send(JSON.stringify(message));
            }
        });
    }

    resetGame() {
        this.board = Array(15).fill().map(() => Array(15).fill(0));
        this.currentPlayer = 1;
        this.gameState = 'playing';
        this.winner = null;
        
        this.broadcast({
            type: 'game_reset',
            currentPlayer: this.currentPlayer
        });
    }
}

// WebSocket连接处理
wss.on('connection', (ws, req) => {
    console.log('新的WebSocket连接，来源:', req.socket.remoteAddress);
    
    // 发送连接确认
    ws.send(JSON.stringify({
        type: 'connection_established',
        message: '连接成功'
    }));

    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);
            console.log('收到消息:', data.type);
            handleMessage(ws, data);
        } catch (error) {
            console.error('消息解析错误:', error);
            ws.send(JSON.stringify({
                type: 'error',
                message: '消息格式错误'
            }));
        }
    });

    ws.on('close', (code, reason) => {
        console.log('WebSocket连接关闭，代码:', code, '原因:', reason.toString());
        // 处理断开连接
        const playerId = players.get(ws);
        if (playerId) {
            handlePlayerDisconnect(playerId);
            players.delete(ws);
        }
    });
    
    ws.on('error', (error) => {
        console.error('WebSocket错误:', error);
    });
});

function handleMessage(ws, data) {
    switch (data.type) {
        case 'create_room':
            handleCreateRoom(ws, data);
            break;
        case 'join_room':
            handleJoinRoom(ws, data);
            break;
        case 'make_move':
            handleMakeMove(ws, data);
            break;
        case 'reset_game':
            handleResetGame(ws, data);
            break;
        case 'send_message':
            handleSendMessage(ws, data);
            break;
        default:
            console.log('未知消息类型:', data.type);
    }
}

function handleCreateRoom(ws, data) {
    const roomId = uuidv4().substring(0, 8).toUpperCase();
    const playerId = uuidv4();
    const playerName = data.playerName || '玩家1';
    
    console.log(`=== 创建房间 ===`);
    console.log(`房间ID: ${roomId}`);
    console.log(`玩家ID: ${playerId}`);
    console.log(`玩家昵称: ${playerName}`);
    
    const room = new GameRoom(roomId);
    rooms.set(roomId, room);
    console.log(`房间已添加到Map，当前房间总数: ${rooms.size}`);
    console.log(`当前所有房间ID:`, Array.from(rooms.keys()));
    
    room.addPlayer(playerId, playerName, ws);
    players.set(ws, playerId);
    
    const response = {
        type: 'room_created',
        roomId: roomId,
        playerId: playerId,
        playerNumber: 1,
        gameState: 'waiting'
    };
    
    console.log(`发送房间创建响应:`, response);
    ws.send(JSON.stringify(response));
}

function handleJoinRoom(ws, data) {
    const { roomId, playerName } = data;
    
    console.log(`=== 加入房间请求 ===`);
    console.log(`请求加入房间ID: ${roomId}`);
    console.log(`玩家昵称: ${playerName}`);
    console.log(`当前房间总数: ${rooms.size}`);
    console.log(`当前所有房间ID:`, Array.from(rooms.keys()));
    
    const room = rooms.get(roomId);
    console.log(`查找房间结果:`, room ? '找到房间' : '房间不存在');
    
    if (!room) {
        console.log(`❌ 房间 ${roomId} 不存在`);
        console.log(`可用房间列表:`, Array.from(rooms.keys()));
        console.log(`rooms.size: ${rooms.size}`);
        console.log(`尝试精确匹配:`, rooms.has(roomId));
        
        const availableRooms = Array.from(rooms.keys());
        const errorMessage = availableRooms.length > 0 
            ? `房间 ${roomId} 不存在。当前可用房间: ${availableRooms.join(', ')}`
            : `房间 ${roomId} 不存在。当前没有活跃房间，请先创建房间。`;
            
        ws.send(JSON.stringify({
            type: 'error',
            message: errorMessage
        }));
        return;
    }
    
    console.log(`房间 ${roomId} 当前玩家数: ${room.players.length}`);
    
    if (room.players.length >= 2) {
        console.log(`❌ 房间 ${roomId} 已满`);
        ws.send(JSON.stringify({
            type: 'error',
            message: '房间已满'
        }));
        return;
    }
    
    const playerId = uuidv4();
    console.log(`尝试添加玩家到房间，玩家ID: ${playerId}`);
    const success = room.addPlayer(playerId, playerName || '玩家2', ws);
    
    if (success) {
        players.set(ws, playerId);
        
        const response = {
            type: 'room_joined',
            roomId: roomId,
            playerId: playerId,
            playerNumber: room.players.length,
            gameState: room.gameState
        };
        
        console.log(`✅ 玩家成功加入房间，发送响应:`, response);
        ws.send(JSON.stringify(response));
    } else {
        console.log(`❌ 添加玩家到房间失败`);
        ws.send(JSON.stringify({
            type: 'error',
            message: '加入房间失败'
        }));
    }
}

function handleMakeMove(ws, data) {
    const playerId = players.get(ws);
    if (!playerId) return;
    
    // 找到玩家所在的房间
    const room = findPlayerRoom(playerId);
    if (!room) return;
    
    const { row, col } = data;
    room.makeMove(playerId, row, col);
}

function handleResetGame(ws, data) {
    const playerId = players.get(ws);
    if (!playerId) return;
    
    const room = findPlayerRoom(playerId);
    if (!room) return;
    
    room.resetGame();
}

function handleSendMessage(ws, data) {
    const playerId = players.get(ws);
    if (!playerId) return;
    
    const room = findPlayerRoom(playerId);
    if (!room) return;
    
    const player = room.players.find(p => p.id === playerId);
    if (!player) return;
    
    const { message } = data;
    if (!message || message.trim().length === 0) return;
    
    // 广播聊天消息给房间内所有玩家
    const chatMessage = {
        type: 'chat_message',
        playerId: playerId,
        playerName: player.name,
        message: message.trim(),
        timestamp: Date.now()
    };
    
    console.log(`聊天消息 - 房间 ${room.id}, 玩家 ${player.name}: ${message}`);
    room.broadcast(chatMessage);
}

function handlePlayerDisconnect(playerId) {
    const room = findPlayerRoom(playerId);
    if (room) {
        room.removePlayer(playerId);
        
        // 如果房间为空，删除房间
        if (room.gameState === 'empty') {
            rooms.delete(room.id);
        }
    }
}

function findPlayerRoom(playerId) {
    for (const room of rooms.values()) {
        if (room.players.some(p => p.id === playerId)) {
            return room;
        }
    }
    return null;
}

// 定期清理空房间
setInterval(() => {
    const now = Date.now();
    for (const [roomId, room] of rooms.entries()) {
        // 清理超过1小时的空房间
        if (room.players.length === 0 && now - room.createdAt > 3600000) {
            rooms.delete(roomId);
        }
    }
}, 300000); // 每5分钟检查一次

const PORT = process.env.PORT || 3000;
const HOST = process.env.NODE_ENV === 'production' ? '0.0.0.0' : 'localhost';

console.log('=== 服务器启动信息 ===');
console.log('Node版本:', process.version);
console.log('环境:', process.env.NODE_ENV);
console.log('端口:', PORT);
console.log('主机:', HOST);
console.log('当前目录:', __dirname);

server.listen(PORT, HOST, () => {
    console.log(`✅ 服务器成功启动在 ${HOST}:${PORT}`);
    if (process.env.NODE_ENV === 'production') {
        console.log(`生产环境访问地址: https://your-domain.com`);
    } else {
        console.log(`本地访问: http://localhost:${PORT}`);
    }
    console.log('WebSocket服务器已启动');
});

server.on('error', (error) => {
    console.error('❌ 服务器启动失败:', error);
    process.exit(1);
});

process.on('uncaughtException', (error) => {
    console.error('❌ 未捕获的异常:', error);
    process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('❌ 未处理的Promise拒绝:', reason);
    process.exit(1);
});