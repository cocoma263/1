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
        
        if (this.players.length === 2) {
            this.gameState = 'playing';
            this.notifyGameStart();
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
        this.broadcast({
            type: 'game_start',
            players: this.players.map(p => ({
                id: p.id,
                name: p.name,
                playerNumber: p.playerNumber
            })),
            currentPlayer: this.currentPlayer
        });
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
wss.on('connection', (ws) => {
    console.log('新的WebSocket连接');

    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);
            handleMessage(ws, data);
        } catch (error) {
            console.error('消息解析错误:', error);
        }
    });

    ws.on('close', () => {
        // 处理断开连接
        const playerId = players.get(ws);
        if (playerId) {
            handlePlayerDisconnect(playerId);
            players.delete(ws);
        }
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
        default:
            console.log('未知消息类型:', data.type);
    }
}

function handleCreateRoom(ws, data) {
    const roomId = uuidv4().substring(0, 8);
    const playerId = uuidv4();
    const playerName = data.playerName || '玩家1';
    
    const room = new GameRoom(roomId);
    rooms.set(roomId, room);
    
    room.addPlayer(playerId, playerName, ws);
    players.set(ws, playerId);
    
    ws.send(JSON.stringify({
        type: 'room_created',
        roomId: roomId,
        playerId: playerId,
        playerNumber: 1,
        gameState: 'waiting'
    }));
}

function handleJoinRoom(ws, data) {
    const { roomId, playerName } = data;
    const room = rooms.get(roomId);
    
    if (!room) {
        ws.send(JSON.stringify({
            type: 'error',
            message: '房间不存在'
        }));
        return;
    }
    
    if (room.players.length >= 2) {
        ws.send(JSON.stringify({
            type: 'error',
            message: '房间已满'
        }));
        return;
    }
    
    const playerId = uuidv4();
    const success = room.addPlayer(playerId, playerName || '玩家2', ws);
    
    if (success) {
        players.set(ws, playerId);
        
        ws.send(JSON.stringify({
            type: 'room_joined',
            roomId: roomId,
            playerId: playerId,
            playerNumber: room.players.length,
            gameState: room.gameState
        }));
    } else {
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

server.listen(PORT, HOST, () => {
    console.log(`服务器运行在 ${HOST}:${PORT}`);
    if (process.env.NODE_ENV !== 'production') {
        console.log(`本地访问: http://localhost:${PORT}`);
    }
});