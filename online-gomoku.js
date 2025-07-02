class OnlineGomoku {
    constructor() {
        this.canvas = document.getElementById('game-board');
        this.ctx = this.canvas.getContext('2d');
        this.ws = null;
        this.gameMode = 'pvp';
        this.playerId = null;
        this.playerNumber = null;
        this.roomId = null;
        this.currentPlayer = 1;
        this.gameState = 'menu'; // menu, waiting, playing, finished
        this.board = [];
        this.boardSize = 15;
        this.cellSize = 38;
        
        this.initBoard();
        this.initEventListeners();
        this.drawBoard();
        this.updateUI();
    }

    initBoard() {
        this.board = [];
        for (let i = 0; i < this.boardSize; i++) {
            this.board[i] = [];
            for (let j = 0; j < this.boardSize; j++) {
                this.board[i][j] = 0;
            }
        }
    }

    initEventListeners() {
        // 游戏模式切换
        document.getElementById('pvp-mode').addEventListener('click', () => {
            this.setGameMode('pvp');
        });

        document.getElementById('pve-mode').addEventListener('click', () => {
            this.setGameMode('pve');
        });

        // 在线房间控制
        document.getElementById('create-room-btn').addEventListener('click', () => {
            this.createRoom();
        });

        document.getElementById('join-room-btn').addEventListener('click', () => {
            this.joinRoom();
        });

        document.getElementById('copy-room-link').addEventListener('click', () => {
            this.copyRoomLink();
        });

        // 重置游戏
        document.getElementById('reset-btn').addEventListener('click', () => {
            this.resetGame();
        });

        // 棋盘点击
        this.canvas.addEventListener('click', (e) => {
            this.handleCanvasClick(e);
        });

        // 回车键快捷操作
        document.getElementById('player-name').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.createRoom();
            }
        });

        document.getElementById('room-id-input').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.joinRoom();
            }
        });

        // 检查URL参数是否包含房间ID
        this.checkUrlParams();
    }

    checkUrlParams() {
        const urlParams = new URLSearchParams(window.location.search);
        const roomId = urlParams.get('room');
        if (roomId) {
            document.getElementById('room-id-input').value = roomId.toUpperCase();
        }
    }

    setGameMode(mode) {
        this.gameMode = mode;
        document.querySelectorAll('.mode-btn').forEach(btn => btn.classList.remove('active'));
        document.getElementById(mode + '-mode').classList.add('active');

        if (mode === 'pvp') {
            document.getElementById('online-controls').classList.remove('hidden');
            this.gameState = 'menu';
        } else {
            document.getElementById('online-controls').classList.add('hidden');
            this.gameState = 'pve';
            this.startAIGame();
        }

        this.updateUI();
    }

    startAIGame() {
        // 启动AI游戏模式（保留原有的AI逻辑）
        this.gameState = 'playing';
        this.currentPlayer = 1;
        this.initBoard();
        this.drawBoard();
        this.updateUI();
    }

    createRoom() {
        const playerName = document.getElementById('player-name').value.trim();
        if (!playerName) {
            alert('请输入你的昵称');
            return;
        }

        console.log(`=== 客户端创建房间 ===`);
        console.log(`玩家昵称: ${playerName}`);
        console.log(`WebSocket状态: ${this.ws ? this.ws.readyState : 'null'}`);

        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            // 如果WebSocket已经连接，直接发送请求
            console.log('WebSocket已连接，直接创建房间');
            const message = {
                type: 'create_room',
                playerName: playerName
            };
            console.log('发送创建房间消息:', message);
            this.ws.send(JSON.stringify(message));
        } else {
            // 否则先连接WebSocket
            console.log('WebSocket未连接，正在连接...');
            this.connectWebSocket();
            this.updateConnectionStatus('connecting', '连接服务器...');
            
            // WebSocket连接成功后会发送创建房间请求
            this.pendingAction = { type: 'create', playerName };
            console.log('设置等待操作:', this.pendingAction);
        }
    }

    joinRoom() {
        const playerName = document.getElementById('player-name').value.trim();
        const roomId = document.getElementById('room-id-input').value.trim().toUpperCase();
        
        console.log(`=== 客户端加入房间 ===`);
        console.log(`玩家昵称: ${playerName}`);
        console.log(`房间ID: ${roomId}`);
        console.log(`WebSocket状态: ${this.ws ? this.ws.readyState : 'null'}`);
        
        if (!playerName) {
            alert('请输入你的昵称');
            return;
        }
        
        if (!roomId) {
            alert('请输入房间ID');
            return;
        }

        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            // 如果WebSocket已经连接，直接发送请求
            console.log('WebSocket已连接，直接加入房间');
            const message = {
                type: 'join_room',
                roomId: roomId,
                playerName: playerName
            };
            console.log('发送加入房间消息:', message);
            this.ws.send(JSON.stringify(message));
        } else {
            // 否则先连接WebSocket
            console.log('WebSocket未连接，正在连接...');
            this.connectWebSocket();
            this.updateConnectionStatus('connecting', '连接服务器...');
            
            // WebSocket连接成功后会发送加入房间请求
            this.pendingAction = { type: 'join', playerName, roomId };
            console.log('设置等待操作:', this.pendingAction);
        }
    }

    connectWebSocket() {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            return;
        }

        // 生产环境使用安全协议，开发环境使用普通协议
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${protocol}//${window.location.host}`;
        
        console.log('尝试连接WebSocket:', wsUrl);
        console.log('当前协议:', window.location.protocol);
        console.log('当前主机:', window.location.host);
        
        this.ws = new WebSocket(wsUrl);

        this.ws.onopen = () => {
            console.log('WebSocket连接已建立');
            this.updateConnectionStatus('connected', '已连接');
            
            // 执行等待的操作
            if (this.pendingAction) {
                console.log('执行等待的操作:', this.pendingAction);
                setTimeout(() => {
                    if (this.pendingAction.type === 'create') {
                        console.log('发送创建房间请求');
                        this.ws.send(JSON.stringify({
                            type: 'create_room',
                            playerName: this.pendingAction.playerName
                        }));
                    } else if (this.pendingAction.type === 'join') {
                        console.log('发送加入房间请求');
                        this.ws.send(JSON.stringify({
                            type: 'join_room',
                            roomId: this.pendingAction.roomId,
                            playerName: this.pendingAction.playerName
                        }));
                    }
                    this.pendingAction = null;
                }, 100); // 稍等片刻确保连接稳定
            }
        };

        this.ws.onmessage = (event) => {
            try {
                console.log('收到WebSocket消息:', event.data);
                const data = JSON.parse(event.data);
                console.log('解析后的数据:', data);
                
                // 使用setTimeout避免阻塞UI
                setTimeout(() => {
                    this.handleWebSocketMessage(data);
                }, 0);
            } catch (error) {
                console.error('消息解析失败:', error, '原始数据:', event.data);
            }
        };

        this.ws.onclose = (event) => {
            console.log('WebSocket连接已关闭，代码:', event.code, '原因:', event.reason);
            this.updateConnectionStatus('disconnected', '连接已断开');
            
            // 尝试重连
            if (this.gameState === 'waiting' || this.gameState === 'playing') {
                setTimeout(() => {
                    this.updateConnectionStatus('connecting', '重新连接中...');
                    this.connectWebSocket();
                }, 3000);
            }
        };

        this.ws.onerror = (error) => {
            console.error('WebSocket错误:', error);
            console.error('WebSocket状态:', this.ws.readyState);
            this.updateConnectionStatus('disconnected', 'WebSocket连接失败');
        };
    }

    handleWebSocketMessage(data) {
        console.log('收到服务器消息:', data.type, data);
        
        switch (data.type) {
            case 'connection_established':
                console.log('WebSocket连接确认:', data.message);
                break;
            case 'room_created':
                this.handleRoomCreated(data);
                break;
            case 'room_joined':
                this.handleRoomJoined(data);
                break;
            case 'player_joined':
                this.handlePlayerJoined(data);
                break;
            case 'game_start':
                this.handleGameStart(data);
                break;
            case 'move':
                this.handleOpponentMove(data);
                break;
            case 'game_over':
                this.handleGameOver(data);
                break;
            case 'game_reset':
                this.handleGameReset(data);
                break;
            case 'player_left':
                this.handlePlayerLeft(data);
                break;
            case 'error':
                console.error('服务器错误:', data.message);
                alert(data.message);
                break;
            default:
                console.log('未知消息类型:', data);
        }
    }

    handleRoomCreated(data) {
        console.log('=== 房间创建成功 ===');
        console.log('房间数据:', data);
        
        this.playerId = data.playerId;
        this.playerNumber = data.playerNumber;
        this.roomId = data.roomId;
        this.gameState = 'waiting';
        
        console.log(`房间ID: ${this.roomId}`);
        console.log(`玩家ID: ${this.playerId}`);
        console.log(`玩家编号: ${this.playerNumber}`);
        
        this.showRoomStatus();
        this.updatePlayerInfo();
        this.updateConnectionStatus('waiting', '等待对手加入...');
        this.updateUI();
    }

    handleRoomJoined(data) {
        this.playerId = data.playerId;
        this.playerNumber = data.playerNumber;
        this.roomId = data.roomId;
        this.gameState = data.gameState === 'playing' ? 'playing' : 'waiting';
        
        this.showRoomStatus();
        this.updatePlayerInfo();
        
        if (this.gameState === 'playing') {
            this.updateConnectionStatus('connected', '游戏进行中');
        } else {
            this.updateConnectionStatus('waiting', '等待游戏开始...');
        }
        
        this.updateUI();
    }

    handlePlayerJoined(data) {
        console.log('玩家加入通知:', data);
        
        // 更新玩家信息显示
        if (data.players && data.players.length > 0) {
            data.players.forEach((player, index) => {
                const playerInfo = document.getElementById(`player${index + 1}-info`);
                if (playerInfo) {
                    const nameSpan = playerInfo.querySelector('.player-name');
                    nameSpan.textContent = player.name;
                }
            });
        }
        
        if (data.playersCount === 2) {
            this.updateConnectionStatus('waiting', '玩家已满，即将开始游戏...');
        } else {
            this.updateConnectionStatus('waiting', `等待玩家... (${data.playersCount}/2)`);
        }
    }

    handleGameStart(data) {
        this.gameState = 'playing';
        this.currentPlayer = data.currentPlayer;
        this.initBoard();
        this.drawBoard();
        
        // 更新玩家信息
        data.players.forEach((player, index) => {
            const playerInfo = document.getElementById(`player${index + 1}-info`);
            const nameSpan = playerInfo.querySelector('.player-name');
            nameSpan.textContent = player.name;
        });
        
        this.updateConnectionStatus('connected', '游戏进行中');
        this.updateUI();
    }

    handleOpponentMove(data) {
        const { row, col, player } = data.move;
        this.board[row][col] = player;
        this.drawPiece(row, col, player);
        this.currentPlayer = data.currentPlayer;
        this.updateUI();
    }

    handleGameOver(data) {
        this.gameState = 'finished';
        const { row, col, player } = data.move;
        this.board[row][col] = player;
        this.drawPiece(row, col, player);
        
        const winnerDisplay = document.getElementById('winner-display');
        if (data.winner === 0) {
            winnerDisplay.textContent = '平局！';
        } else if (data.winner === this.playerNumber) {
            winnerDisplay.textContent = '你赢了！';
        } else {
            winnerDisplay.textContent = '对手获胜！';
        }
        
        winnerDisplay.classList.add('show');
        document.getElementById('reset-btn').style.display = 'inline-block';
        this.updateUI();
    }

    handleGameReset(data) {
        this.gameState = 'playing';
        this.currentPlayer = data.currentPlayer;
        this.initBoard();
        this.drawBoard();
        
        const winnerDisplay = document.getElementById('winner-display');
        winnerDisplay.classList.remove('show');
        winnerDisplay.textContent = '';
        
        this.updateUI();
    }

    handlePlayerLeft(data) {
        this.gameState = 'waiting';
        this.updateConnectionStatus('waiting', data.message);
        this.updatePlayerInfo(); // 重置玩家信息显示
        this.updateUI();
    }

    showRoomStatus() {
        document.getElementById('room-status').style.display = 'block';
        document.getElementById('room-id-display').textContent = `房间ID: ${this.roomId}`;
    }

    updatePlayerInfo() {
        const player1Info = document.getElementById('player1-info');
        const player2Info = document.getElementById('player2-info');
        
        if (this.playerNumber === 1) {
            player1Info.querySelector('.player-name').textContent = document.getElementById('player-name').value;
            player2Info.querySelector('.player-name').textContent = this.gameState === 'playing' ? '对手' : '等待玩家...';
        } else if (this.playerNumber === 2) {
            player1Info.querySelector('.player-name').textContent = '对手';
            player2Info.querySelector('.player-name').textContent = document.getElementById('player-name').value;
        }
    }

    updateConnectionStatus(status, text) {
        const indicator = document.querySelector('.status-indicator');
        const statusText = document.getElementById('status-text');
        
        indicator.className = `status-indicator ${status}`;
        statusText.textContent = text;
    }

    copyRoomLink() {
        const roomLink = `${window.location.origin}${window.location.pathname}?room=${this.roomId}`;
        
        if (navigator.clipboard) {
            navigator.clipboard.writeText(roomLink).then(() => {
                const copyBtn = document.getElementById('copy-room-link');
                const originalText = copyBtn.textContent;
                copyBtn.textContent = '已复制！';
                setTimeout(() => {
                    copyBtn.textContent = originalText;
                }, 2000);
            });
        } else {
            // 降级方案
            const textArea = document.createElement('textarea');
            textArea.value = roomLink;
            document.body.appendChild(textArea);
            textArea.select();
            document.execCommand('copy');
            document.body.removeChild(textArea);
            alert('邀请链接已复制到剪贴板');
        }
    }

    handleCanvasClick(e) {
        if (this.gameState !== 'playing') return;
        
        if (this.gameMode === 'pvp') {
            // 在线对战模式
            if (this.currentPlayer !== this.playerNumber) return;
            
            const rect = this.canvas.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;
            
            const col = Math.round((x - this.cellSize / 2) / this.cellSize);
            const row = Math.round((y - this.cellSize / 2) / this.cellSize);
            
            if (this.isValidMove(row, col)) {
                // 发送移动到服务器
                this.ws.send(JSON.stringify({
                    type: 'make_move',
                    row: row,
                    col: col
                }));
            }
        } else {
            // AI对战模式（保留原有逻辑）
            this.handleAIGameClick(e);
        }
    }

    handleAIGameClick(e) {
        const rect = this.canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        
        const col = Math.round((x - this.cellSize / 2) / this.cellSize);
        const row = Math.round((y - this.cellSize / 2) / this.cellSize);
        
        if (this.isValidMove(row, col)) {
            this.makeMove(row, col, this.currentPlayer);
            
            if (this.checkWin(row, col, this.currentPlayer)) {
                this.endAIGame(this.currentPlayer);
                return;
            }
            
            if (this.isBoardFull()) {
                this.endAIGame(0);
                return;
            }
            
            this.currentPlayer = this.currentPlayer === 1 ? 2 : 1;
            this.updateUI();
            
            // AI回合
            if (this.currentPlayer === 2) {
                setTimeout(() => {
                    this.makeAIMove();
                }, 500);
            }
        }
    }

    makeAIMove() {
        const bestMove = this.getBestMove();
        if (bestMove) {
            this.makeMove(bestMove.row, bestMove.col, 2);
            
            if (this.checkWin(bestMove.row, bestMove.col, 2)) {
                this.endAIGame(2);
                return;
            }
            
            if (this.isBoardFull()) {
                this.endAIGame(0);
                return;
            }
            
            this.currentPlayer = 1;
            this.updateUI();
        }
    }

    getBestMove() {
        // AI逻辑（保留原有的AI算法）
        let bestMove = null;
        let maxScore = -Infinity;
        
        for (let row = 0; row < this.boardSize; row++) {
            for (let col = 0; col < this.boardSize; col++) {
                if (this.board[row][col] === 0) {
                    let score = this.evaluatePosition(row, col);
                    if (score > maxScore) {
                        maxScore = score;
                        bestMove = { row, col };
                    }
                }
            }
        }
        
        return bestMove;
    }

    evaluatePosition(row, col) {
        let score = 0;
        
        const directions = [
            [0, 1], [1, 0], [1, 1], [1, -1]
        ];
        
        directions.forEach(([dx, dy]) => {
            const playerThreat = this.countConsecutive(row, col, dx, dy, 1);
            if (playerThreat >= 4) score += 10000;
            else if (playerThreat === 3) score += 500;
            else if (playerThreat === 2) score += 50;
            
            const aiOpportunity = this.countConsecutive(row, col, dx, dy, 2);
            if (aiOpportunity >= 4) score += 50000;
            else if (aiOpportunity === 3) score += 1000;
            else if (aiOpportunity === 2) score += 100;
        });
        
        const center = Math.floor(this.boardSize / 2);
        const distanceFromCenter = Math.abs(row - center) + Math.abs(col - center);
        score += (this.boardSize - distanceFromCenter) * 2;
        
        return score;
    }

    countConsecutive(row, col, dx, dy, player) {
        let count = 1;
        
        for (let i = 1; i < 5; i++) {
            const newRow = row + dx * i;
            const newCol = col + dy * i;
            if (newRow >= 0 && newRow < this.boardSize && 
                newCol >= 0 && newCol < this.boardSize && 
                this.board[newRow][newCol] === player) {
                count++;
            } else {
                break;
            }
        }
        
        for (let i = 1; i < 5; i++) {
            const newRow = row - dx * i;
            const newCol = col - dy * i;
            if (newRow >= 0 && newRow < this.boardSize && 
                newCol >= 0 && newCol < this.boardSize && 
                this.board[newRow][newCol] === player) {
                count++;
            } else {
                break;
            }
        }
        
        return count - 1;
    }

    isValidMove(row, col) {
        return row >= 0 && row < this.boardSize && col >= 0 && col < this.boardSize && this.board[row][col] === 0;
    }

    makeMove(row, col, player) {
        this.board[row][col] = player;
        this.drawPiece(row, col, player);
    }

    checkWin(row, col, player) {
        const directions = [
            [0, 1], [1, 0], [1, 1], [1, -1]
        ];
        
        return directions.some(([dx, dy]) => {
            let count = 1;
            
            for (let i = 1; i < 5; i++) {
                const newRow = row + dx * i;
                const newCol = col + dy * i;
                if (newRow >= 0 && newRow < this.boardSize && 
                    newCol >= 0 && newCol < this.boardSize && 
                    this.board[newRow][newCol] === player) {
                    count++;
                } else {
                    break;
                }
            }
            
            for (let i = 1; i < 5; i++) {
                const newRow = row - dx * i;
                const newCol = col - dy * i;
                if (newRow >= 0 && newRow < this.boardSize && 
                    newCol >= 0 && newCol < this.boardSize && 
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

    endAIGame(winner) {
        this.gameState = 'finished';
        const winnerDisplay = document.getElementById('winner-display');
        
        if (winner === 0) {
            winnerDisplay.textContent = '平局！';
        } else if (winner === 1) {
            winnerDisplay.textContent = '你赢了！';
        } else {
            winnerDisplay.textContent = '电脑获胜！';
        }
        
        winnerDisplay.classList.add('show');
        document.getElementById('reset-btn').style.display = 'inline-block';
        this.updateUI();
    }

    resetGame() {
        if (this.gameMode === 'pvp' && this.ws && this.ws.readyState === WebSocket.OPEN) {
            // 在线游戏重置
            this.ws.send(JSON.stringify({ type: 'reset_game' }));
        } else {
            // AI游戏重置
            this.gameState = 'playing';
            this.currentPlayer = 1;
            this.initBoard();
            this.drawBoard();
            
            const winnerDisplay = document.getElementById('winner-display');
            winnerDisplay.classList.remove('show');
            winnerDisplay.textContent = '';
            
            document.getElementById('reset-btn').style.display = 'none';
            this.updateUI();
        }
    }

    updateUI() {
        const statusElement = document.getElementById('current-player');
        const resetBtn = document.getElementById('reset-btn');
        
        if (this.gameState === 'menu') {
            statusElement.textContent = '选择游戏模式';
            resetBtn.style.display = 'none';
        } else if (this.gameState === 'waiting') {
            statusElement.textContent = '等待对手...';
            resetBtn.style.display = 'none';
        } else if (this.gameState === 'playing') {
            if (this.gameMode === 'pvp') {
                if (this.currentPlayer === this.playerNumber) {
                    statusElement.textContent = '你的回合';
                } else {
                    statusElement.textContent = '对手回合';
                }
            } else {
                statusElement.textContent = this.currentPlayer === 1 ? '你的回合' : '电脑思考中...';
            }
            resetBtn.style.display = this.gameMode === 'pve' ? 'inline-block' : 'none';
        } else if (this.gameState === 'finished') {
            statusElement.textContent = '游戏结束';
            resetBtn.style.display = 'inline-block';
        } else if (this.gameState === 'pve') {
            statusElement.textContent = '人机对战模式';
            resetBtn.style.display = 'none';
        }
    }

    drawBoard() {
        this.ctx.fillStyle = '#deb887';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        
        this.ctx.strokeStyle = '#8b4513';
        this.ctx.lineWidth = 1;
        
        for (let i = 0; i < this.boardSize; i++) {
            const pos = this.cellSize / 2 + i * this.cellSize;
            
            this.ctx.beginPath();
            this.ctx.moveTo(pos, this.cellSize / 2);
            this.ctx.lineTo(pos, this.canvas.height - this.cellSize / 2);
            this.ctx.stroke();
            
            this.ctx.beginPath();
            this.ctx.moveTo(this.cellSize / 2, pos);
            this.ctx.lineTo(this.canvas.width - this.cellSize / 2, pos);
            this.ctx.stroke();
        }
        
        this.drawStarPoints();
    }

    drawStarPoints() {
        const points = [
            [3, 3], [3, 11], [7, 7], [11, 3], [11, 11]
        ];
        
        this.ctx.fillStyle = '#8b4513';
        points.forEach(([row, col]) => {
            const x = this.cellSize / 2 + col * this.cellSize;
            const y = this.cellSize / 2 + row * this.cellSize;
            
            this.ctx.beginPath();
            this.ctx.arc(x, y, 4, 0, 2 * Math.PI);
            this.ctx.fill();
        });
    }

    drawPiece(row, col, player) {
        const x = this.cellSize / 2 + col * this.cellSize;
        const y = this.cellSize / 2 + row * this.cellSize;
        const radius = this.cellSize * 0.4;
        
        this.ctx.beginPath();
        this.ctx.arc(x, y, radius, 0, 2 * Math.PI);
        
        if (player === 1) {
            this.ctx.fillStyle = '#000';
            this.ctx.fill();
            this.ctx.strokeStyle = '#333';
            this.ctx.lineWidth = 2;
            this.ctx.stroke();
        } else {
            this.ctx.fillStyle = '#fff';
            this.ctx.fill();
            this.ctx.strokeStyle = '#666';
            this.ctx.lineWidth = 2;
            this.ctx.stroke();
        }
    }
}

// 游戏初始化
document.addEventListener('DOMContentLoaded', () => {
    new OnlineGomoku();
});