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
        
        // 新增功能相关属性
        this.lastMove = null; // 记录最新落子位置 {row, col, player}
        this.gameStartTime = null; // 游戏开始时间
        this.gameEndTime = null; // 游戏结束时间
        this.moveHistory = []; // 移动历史记录
        
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

        // 退出房间
        document.getElementById('exit-room-btn').addEventListener('click', () => {
            this.exitRoom();
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
        // 启动AI游戏模式
        this.gameState = 'playing';
        this.currentPlayer = 1;
        this.initBoard();
        this.drawBoard();
        
        // 记录游戏开始时间
        this.gameStartTime = Date.now();
        this.gameEndTime = null;
        this.lastMove = null;
        this.moveHistory = [];
        
        this.updateGameTimer();
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
            
            // 如果是手动断开连接，不需要重连
            if (event.code === 1000 || this.gameState === 'menu') {
                this.updateConnectionStatus('disconnected', '已断开连接');
                return;
            }
            
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
        
        // 记录游戏开始时间
        this.gameStartTime = Date.now();
        this.gameEndTime = null;
        this.lastMove = null;
        this.moveHistory = [];
        
        // 更新玩家信息
        data.players.forEach((player, index) => {
            const playerInfo = document.getElementById(`player${index + 1}-info`);
            const nameSpan = playerInfo.querySelector('.player-name');
            nameSpan.textContent = player.name;
        });
        
        this.updateConnectionStatus('connected', '游戏进行中');
        this.updateGameTimer();
        this.updateUI();
    }

    handleOpponentMove(data) {
        const { row, col, player } = data.move;
        this.board[row][col] = player;
        
        // 记录最新落子
        this.lastMove = { row, col, player };
        this.moveHistory.push({ row, col, player, timestamp: Date.now() });
        
        // 重新绘制棋盘以更新最新落子标记
        this.redrawBoard();
        
        this.currentPlayer = data.currentPlayer;
        this.showMoveNotification(row, col, player);
        this.updateUI();
    }

    handleGameOver(data) {
        this.gameState = 'finished';
        this.gameEndTime = Date.now();
        
        const { row, col, player } = data.move;
        this.board[row][col] = player;
        
        // 记录最后一步
        this.lastMove = { row, col, player };
        this.moveHistory.push({ row, col, player, timestamp: Date.now() });
        
        // 重新绘制棋盘
        this.redrawBoard();
        
        const winnerDisplay = document.getElementById('winner-display');
        let winnerText = '';
        let isWinner = false;
        
        if (data.winner === 0) {
            winnerText = '平局！';
        } else if (data.winner === this.playerNumber) {
            winnerText = '你赢了！';
            isWinner = true;
        } else {
            winnerText = '对手获胜！';
        }
        
        winnerDisplay.textContent = winnerText;
        winnerDisplay.classList.add('show');
        
        // 显示游戏总时长
        if (this.gameStartTime && this.gameEndTime) {
            const totalTime = Math.floor((this.gameEndTime - this.gameStartTime) / 1000);
            const minutes = Math.floor(totalTime / 60);
            const seconds = totalTime % 60;
            const timeString = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
            
            setTimeout(() => {
                this.showToast(`游戏总时长: ${timeString}`, 4000);
            }, 1000);
        }
        
        // 显示庆祝弹窗
        if (isWinner) {
            this.showCelebrationModal();
        }
        
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
        
        // 隐藏房间控制面板
        const roomControls = document.querySelector('.room-controls');
        roomControls.style.display = 'none';
    }

    hideRoomStatus() {
        document.getElementById('room-status').style.display = 'none';
        
        // 显示房间控制面板
        const roomControls = document.querySelector('.room-controls');
        roomControls.style.display = 'flex';
    }

    exitRoom() {
        // 断开WebSocket连接
        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }
        
        // 重置游戏状态
        this.gameState = 'menu';
        this.playerId = null;
        this.playerNumber = null;
        this.roomId = null;
        this.currentPlayer = 1;
        this.lastMove = null;
        this.gameStartTime = null;
        this.gameEndTime = null;
        this.moveHistory = [];
        
        // 重置棋盘
        this.initBoard();
        this.drawBoard();
        
        // 隐藏房间状态，显示控制面板
        this.hideRoomStatus();
        
        // 清空输入框
        document.getElementById('player-name').value = '';
        document.getElementById('room-id-input').value = '';
        
        // 重置UI
        this.updateConnectionStatus('disconnected', '已断开连接');
        this.updateUI();
        
        // 清除计时器
        const timerElement = document.getElementById('game-timer');
        if (timerElement) {
            timerElement.remove();
        }
        
        // 清除获胜显示
        const winnerDisplay = document.getElementById('winner-display');
        winnerDisplay.classList.remove('show');
        winnerDisplay.textContent = '';
        
        this.showToast('已退出房间', 2000);
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
            // 记录玩家移动
            this.lastMove = { row, col, player: this.currentPlayer };
            this.moveHistory.push({ row, col, player: this.currentPlayer, timestamp: Date.now() });
            
            this.makeMove(row, col, this.currentPlayer);
            this.redrawBoard(); // 使用新的重绘方法
            
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
            // 记录AI移动
            this.lastMove = { row: bestMove.row, col: bestMove.col, player: 2 };
            this.moveHistory.push({ row: bestMove.row, col: bestMove.col, player: 2, timestamp: Date.now() });
            
            this.makeMove(bestMove.row, bestMove.col, 2);
            this.redrawBoard(); // 使用新的重绘方法
            this.showMoveNotification(bestMove.row, bestMove.col, 2);
            
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

    showCelebrationModal() {
        // 创建庆祝弹窗
        const modal = document.createElement('div');
        modal.className = 'celebration-modal';
        modal.innerHTML = `
            <div class="celebration-content">
                <div class="celebration-icon">🎉</div>
                <div class="celebration-text">恭喜获胜！</div>
                <div class="celebration-subtext">太棒了！</div>
            </div>
        `;
        
        document.body.appendChild(modal);
        
        // 显示动画
        setTimeout(() => modal.classList.add('show'), 100);
        
        // 3秒后自动消失
        setTimeout(() => {
            modal.classList.remove('show');
            setTimeout(() => modal.remove(), 500);
        }, 3000);
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
        this.gameEndTime = Date.now();
        
        const winnerDisplay = document.getElementById('winner-display');
        let isWinner = false;
        
        if (winner === 0) {
            winnerDisplay.textContent = '平局！';
        } else if (winner === 1) {
            winnerDisplay.textContent = '你赢了！';
            isWinner = true;
        } else {
            winnerDisplay.textContent = '电脑获胜！';
        }
        
        winnerDisplay.classList.add('show');
        
        // 显示游戏总时长
        if (this.gameStartTime && this.gameEndTime) {
            const totalTime = Math.floor((this.gameEndTime - this.gameStartTime) / 1000);
            const minutes = Math.floor(totalTime / 60);
            const seconds = totalTime % 60;
            const timeString = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
            
            setTimeout(() => {
                this.showToast(`游戏总时长: ${timeString}`, 4000);
            }, 1000);
        }
        
        // 显示庆祝弹窗
        if (isWinner) {
            this.showCelebrationModal();
        }
        
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

    updateGameTimer() {
        if (this.gameState === 'playing' && this.gameStartTime) {
            const currentTime = Date.now();
            const elapsedTime = Math.floor((currentTime - this.gameStartTime) / 1000);
            const minutes = Math.floor(elapsedTime / 60);
            const seconds = elapsedTime % 60;
            const timeString = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
            
            // 更新计时器显示
            let timerElement = document.getElementById('game-timer');
            if (!timerElement) {
                timerElement = document.createElement('div');
                timerElement.id = 'game-timer';
                timerElement.className = 'game-timer';
                document.querySelector('.game-info').appendChild(timerElement);
            }
            timerElement.textContent = `用时: ${timeString}`;
            
            // 如果游戏还在进行，继续更新计时器
            if (this.gameState === 'playing') {
                setTimeout(() => this.updateGameTimer(), 1000);
            }
        }
    }

    showMoveNotification(row, col, player) {
        const playerName = this.gameMode === 'pvp' 
            ? (player === this.playerNumber ? '你' : '对手')
            : (player === 1 ? '你' : '电脑');
        
        const notation = String.fromCharCode(65 + col) + (15 - row); // A1, B2 等格式
        const message = `${playerName}下在了 ${notation}`;
        
        this.showToast(message, 2000);
    }

    showToast(message, duration = 3000) {
        // 移除已存在的toast
        const existingToast = document.querySelector('.game-toast');
        if (existingToast) {
            existingToast.remove();
        }
        
        const toast = document.createElement('div');
        toast.className = 'game-toast';
        toast.textContent = message;
        document.body.appendChild(toast);
        
        // 显示动画
        setTimeout(() => toast.classList.add('show'), 100);
        
        // 自动消失
        setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => toast.remove(), 300);
        }, duration);
    }

    redrawBoard() {
        this.drawBoard();
        
        // 重新绘制所有棋子
        for (let row = 0; row < this.boardSize; row++) {
            for (let col = 0; col < this.boardSize; col++) {
                if (this.board[row][col] !== 0) {
                    const isLatest = this.lastMove && 
                        this.lastMove.row === row && 
                        this.lastMove.col === col;
                    this.drawPiece(row, col, this.board[row][col], isLatest);
                }
            }
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
        // 绘制棋盘背景 - 木纹渐变效果
        const bgGradient = this.ctx.createRadialGradient(
            this.canvas.width / 2, this.canvas.height / 2, 0,
            this.canvas.width / 2, this.canvas.height / 2, this.canvas.width / 2
        );
        bgGradient.addColorStop(0, '#f4e4bc');
        bgGradient.addColorStop(0.5, '#deb887');
        bgGradient.addColorStop(1, '#d2a679');
        
        this.ctx.fillStyle = bgGradient;
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        
        // 添加木纹纹理效果
        this.ctx.globalAlpha = 0.08;
        for (let i = 0; i < 15; i++) {
            this.ctx.strokeStyle = i % 2 === 0 ? '#8b4513' : '#a0522d';
            this.ctx.lineWidth = Math.random() * 1.5 + 0.3;
            this.ctx.beginPath();
            this.ctx.moveTo(0, i * this.canvas.height / 15);
            this.ctx.lineTo(this.canvas.width, i * this.canvas.height / 15 + Math.random() * 8 - 4);
            this.ctx.stroke();
        }
        this.ctx.globalAlpha = 1;
        
        // 绘制网格线 - 更精细的样式
        for (let i = 0; i < this.boardSize; i++) {
            const pos = this.cellSize / 2 + i * this.cellSize;
            
            // 外围边框线更粗
            const isEdge = (i === 0 || i === this.boardSize - 1);
            this.ctx.lineWidth = isEdge ? 2.5 : 1.2;
            this.ctx.strokeStyle = isEdge ? '#654321' : '#8b4513';
            
            // 垂直线
            this.ctx.beginPath();
            this.ctx.moveTo(pos, this.cellSize / 2);
            this.ctx.lineTo(pos, this.canvas.height - this.cellSize / 2);
            this.ctx.stroke();
            
            // 水平线
            this.ctx.beginPath();
            this.ctx.moveTo(this.cellSize / 2, pos);
            this.ctx.lineTo(this.canvas.width - this.cellSize / 2, pos);
            this.ctx.stroke();
        }
        
        // 绘制网格交叉点的小圆点（增强精致感）
        this.ctx.fillStyle = 'rgba(139, 69, 19, 0.3)';
        for (let i = 0; i < this.boardSize; i++) {
            for (let j = 0; j < this.boardSize; j++) {
                const x = this.cellSize / 2 + j * this.cellSize;
                const y = this.cellSize / 2 + i * this.cellSize;
                
                this.ctx.beginPath();
                this.ctx.arc(x, y, 0.8, 0, 2 * Math.PI);
                this.ctx.fill();
            }
        }
        
        // 绘制天元和星位
        this.drawStarPoints();
        
        // 添加棋盘边框阴影
        this.ctx.shadowColor = 'rgba(0, 0, 0, 0.25)';
        this.ctx.shadowBlur = 6;
        this.ctx.shadowOffsetX = 2;
        this.ctx.shadowOffsetY = 2;
        this.ctx.strokeStyle = '#654321';
        this.ctx.lineWidth = 3;
        this.ctx.strokeRect(1.5, 1.5, this.canvas.width - 3, this.canvas.height - 3);
        
        // 重置阴影
        this.ctx.shadowColor = 'transparent';
        this.ctx.shadowBlur = 0;
        this.ctx.shadowOffsetX = 0;
        this.ctx.shadowOffsetY = 0;
    }

    drawStarPoints() {
        const points = [
            [3, 3], [3, 11], [7, 7], [11, 3], [11, 11]
        ];
        
        points.forEach(([row, col]) => {
            const x = this.cellSize / 2 + col * this.cellSize;
            const y = this.cellSize / 2 + row * this.cellSize;
            const radius = row === 7 && col === 7 ? 5 : 4; // 天元稍大
            
            // 星位外圈 - 深色
            this.ctx.fillStyle = '#654321';
            this.ctx.beginPath();
            this.ctx.arc(x, y, radius + 0.5, 0, 2 * Math.PI);
            this.ctx.fill();
            
            // 星位内圈 - 浅色
            this.ctx.fillStyle = '#8b4513';
            this.ctx.beginPath();
            this.ctx.arc(x, y, radius, 0, 2 * Math.PI);
            this.ctx.fill();
            
            // 星位高光
            const gradient = this.ctx.createRadialGradient(
                x - radius * 0.3, y - radius * 0.3, 0,
                x, y, radius
            );
            gradient.addColorStop(0, 'rgba(160, 82, 45, 0.8)');
            gradient.addColorStop(1, 'rgba(160, 82, 45, 0)');
            
            this.ctx.fillStyle = gradient;
            this.ctx.beginPath();
            this.ctx.arc(x, y, radius, 0, 2 * Math.PI);
            this.ctx.fill();
        });
    }

    drawPiece(row, col, player, isLatest = false) {
        const x = this.cellSize / 2 + col * this.cellSize;
        const y = this.cellSize / 2 + row * this.cellSize;
        const radius = this.cellSize * 0.42;
        
        // 保存当前上下文
        this.ctx.save();
        
        if (player === 1) {
            // 黑子 - 渐变效果
            const gradient = this.ctx.createRadialGradient(
                x - radius * 0.3, y - radius * 0.3, 0,
                x, y, radius
            );
            gradient.addColorStop(0, '#333');
            gradient.addColorStop(0.7, '#111');
            gradient.addColorStop(1, '#000');
            
            this.ctx.fillStyle = gradient;
            this.ctx.beginPath();
            this.ctx.arc(x, y, radius, 0, 2 * Math.PI);
            this.ctx.fill();
            
            // 高光效果
            const highlight = this.ctx.createRadialGradient(
                x - radius * 0.4, y - radius * 0.4, 0,
                x - radius * 0.4, y - radius * 0.4, radius * 0.3
            );
            highlight.addColorStop(0, 'rgba(255, 255, 255, 0.4)');
            highlight.addColorStop(1, 'rgba(255, 255, 255, 0)');
            
            this.ctx.fillStyle = highlight;
            this.ctx.beginPath();
            this.ctx.arc(x - radius * 0.2, y - radius * 0.2, radius * 0.3, 0, 2 * Math.PI);
            this.ctx.fill();
            
            // 边框
            this.ctx.strokeStyle = '#222';
            this.ctx.lineWidth = 1;
            this.ctx.beginPath();
            this.ctx.arc(x, y, radius, 0, 2 * Math.PI);
            this.ctx.stroke();
            
        } else {
            // 白子 - 白灰渐变效果，增强立体感
            const gradient = this.ctx.createRadialGradient(
                x - radius * 0.3, y - radius * 0.3, 0,
                x + radius * 0.2, y + radius * 0.2, radius * 1.2
            );
            gradient.addColorStop(0, '#ffffff');
            gradient.addColorStop(0.3, '#f5f5f5');
            gradient.addColorStop(0.7, '#e0e0e0');
            gradient.addColorStop(0.9, '#d0d0d0');
            gradient.addColorStop(1, '#b8b8b8');
            
            this.ctx.fillStyle = gradient;
            this.ctx.beginPath();
            this.ctx.arc(x, y, radius, 0, 2 * Math.PI);
            this.ctx.fill();
            
            // 强烈的高光效果
            const highlight = this.ctx.createRadialGradient(
                x - radius * 0.4, y - radius * 0.4, 0,
                x - radius * 0.4, y - radius * 0.4, radius * 0.5
            );
            highlight.addColorStop(0, 'rgba(255, 255, 255, 0.9)');
            highlight.addColorStop(0.6, 'rgba(255, 255, 255, 0.3)');
            highlight.addColorStop(1, 'rgba(255, 255, 255, 0)');
            
            this.ctx.fillStyle = highlight;
            this.ctx.beginPath();
            this.ctx.arc(x - radius * 0.25, y - radius * 0.25, radius * 0.45, 0, 2 * Math.PI);
            this.ctx.fill();
            
            // 增加阴影效果
            const shadow = this.ctx.createRadialGradient(
                x + radius * 0.3, y + radius * 0.3, 0,
                x + radius * 0.3, y + radius * 0.3, radius * 0.6
            );
            shadow.addColorStop(0, 'rgba(0, 0, 0, 0.15)');
            shadow.addColorStop(1, 'rgba(0, 0, 0, 0)');
            
            this.ctx.fillStyle = shadow;
            this.ctx.beginPath();
            this.ctx.arc(x + radius * 0.15, y + radius * 0.15, radius * 0.4, 0, 2 * Math.PI);
            this.ctx.fill();
            
            // 精细边框
            this.ctx.strokeStyle = '#888';
            this.ctx.lineWidth = 1.2;
            this.ctx.beginPath();
            this.ctx.arc(x, y, radius, 0, 2 * Math.PI);
            this.ctx.stroke();
            
            // 内层细边框增强立体感
            this.ctx.strokeStyle = '#ccc';
            this.ctx.lineWidth = 0.8;
            this.ctx.beginPath();
            this.ctx.arc(x, y, radius - 1, 0, 2 * Math.PI);
            this.ctx.stroke();
        }
        
        // 如果是最新落子，添加特殊标记
        if (isLatest) {
            this.ctx.strokeStyle = player === 1 ? '#ff6b6b' : '#4ecdc4';
            this.ctx.lineWidth = 3;
            this.ctx.beginPath();
            this.ctx.arc(x, y, radius + 2, 0, 2 * Math.PI);
            this.ctx.stroke();
            
            // 添加小圆点标记
            this.ctx.fillStyle = player === 1 ? '#ff6b6b' : '#4ecdc4';
            this.ctx.beginPath();
            this.ctx.arc(x, y, 3, 0, 2 * Math.PI);
            this.ctx.fill();
        }
        
        // 恢复上下文
        this.ctx.restore();
    }
}

// 游戏初始化
document.addEventListener('DOMContentLoaded', () => {
    new OnlineGomoku();
});