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
        
        // 新增功能相关属性
        this.lastMove = null; // 记录最新落子位置 {row, col, player}
        this.gameStartTime = null; // 游戏开始时间
        this.gameEndTime = null; // 游戏结束时间
        this.moveHistory = []; // 移动历史记录
        
        this.initCanvasSize();
        this.initBoard();
        this.initEventListeners();
        this.drawBoard();
        this.updateUI();
    }

    initCanvasSize() {
        // 获取棋盘容器的实际宽度，确保与上面的模块完全对齐
        const boardContainer = this.canvas.parentElement;
        const containerRect = boardContainer.getBoundingClientRect();
        const boardWidth = containerRect.width;
        
        // 设置canvas尺寸为容器的实际宽度（正方形）
        this.canvas.width = boardWidth;
        this.canvas.height = boardWidth;
        
        // 计算格子大小，留出适当边距
        const boardMargin = 30; // 棋盘内边距
        const availableSpace = boardWidth - boardMargin * 2;
        this.cellSize = availableSpace / (this.boardSize - 1);
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

        // 窗口大小变化时重新调整棋盘尺寸
        window.addEventListener('resize', () => {
            this.initCanvasSize();
            this.drawBoard();
            this.redrawBoard();
        });
    }

    checkUrlParams() {
        const urlParams = new URLSearchParams(window.location.search);
        const roomId = urlParams.get('room');
        if (roomId) {
            document.getElementById('room-id-input').value = roomId.toUpperCase();
        }
    }

    async setGameMode(mode) {
        // 只有当前棋局真正开始了（playing状态）才需要确认离开
        if (this.gameState === 'playing' && this.gameMode !== mode) {
            const currentModeName = this.gameMode === 'pvp' ? '在线对战' : '人机对战';
            const targetModeName = mode === 'pvp' ? '在线对战' : '人机对战';
            
            const confirmed = await this.showCustomConfirm(
                '切换游戏模式',
                `您正在进行${currentModeName}，确定要离开本局游戏切换到${targetModeName}模式吗？`
            );
            
            if (!confirmed) {
                // 用户选择不离开，恢复之前的按钮状态
                document.querySelectorAll('.mode-btn').forEach(btn => btn.classList.remove('active'));
                document.getElementById(this.gameMode + '-mode').classList.add('active');
                return;
            }
        }

        // 如果从在线对战模式切换到其他模式，需要断开WebSocket连接
        if (this.gameMode === 'pvp' && mode !== 'pvp' && this.ws) {
            this.ws.close();
            this.ws = null;
        }

        this.gameMode = mode;
        document.querySelectorAll('.mode-btn').forEach(btn => btn.classList.remove('active'));
        document.getElementById(mode + '-mode').classList.add('active');

        // 清理游戏状态
        this.cleanupGameState();

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

    cleanupGameState() {
        // 清除计时器
        const timerElement = document.getElementById('game-timer');
        if (timerElement) {
            timerElement.remove();
        }

        // 清空棋盘
        this.initBoard();
        this.drawBoard();

        // 重置游戏状态
        this.currentPlayer = 1;
        this.lastMove = null;
        this.gameStartTime = null;
        this.gameEndTime = null;
        this.moveHistory = [];

        // 清除获胜显示
        const winnerDisplay = document.getElementById('winner-display');
        winnerDisplay.classList.remove('show');
        winnerDisplay.textContent = '';

        // 隐藏重置按钮
        document.getElementById('reset-btn').style.display = 'none';
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
            statusElement.style.display = 'none'; // 隐藏空的状态显示区域
            resetBtn.style.display = 'none';
        } else if (this.gameState === 'waiting') {
            statusElement.style.display = 'block'; // 确保显示状态区域
            statusElement.textContent = '等待对手...';
            resetBtn.style.display = 'none';
        } else if (this.gameState === 'playing') {
            statusElement.style.display = 'block'; // 确保显示状态区域
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
            statusElement.style.display = 'block'; // 确保显示状态区域
            statusElement.textContent = '游戏结束';
            resetBtn.style.display = 'inline-block';
        } else if (this.gameState === 'pve') {
            statusElement.style.display = 'block'; // 确保显示状态区域
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
        
        // 添加逼真的木纹纹理效果
        this.drawWoodTexture();
        
        // 绘制网格线 - 确保所有线条都完整显示
        this.ctx.lineCap = 'round';
        this.ctx.lineJoin = 'round';
        
        // 先绘制所有内部细线
        this.ctx.lineWidth = 1.5;
        this.ctx.strokeStyle = '#8b4513';
        
        for (let i = 0; i < this.boardSize; i++) {
            const pos = Math.round(this.cellSize / 2 + i * this.cellSize) + 0.5; // 添加0.5避免模糊
            
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
        
        // 然后绘制外边框，确保清晰可见
        this.ctx.lineWidth = 3;
        this.ctx.strokeStyle = '#654321';
        
        const borderOffset = this.cellSize / 2;
        const boardWidth = this.canvas.width - this.cellSize;
        const boardHeight = this.canvas.height - this.cellSize;
        
        this.ctx.beginPath();
        this.ctx.rect(borderOffset, borderOffset, boardWidth, boardHeight);
        this.ctx.stroke();
        
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
            // 白子 - 真实立体棋子效果，正确的光影关系
            
            // 假设光源从左上方45度角照射
            const lightX = x - radius * 0.4;
            const lightY = y - radius * 0.4;
            
            // 1. 棋盘上的投影（棋子底部阴影）
            const dropShadow = this.ctx.createRadialGradient(
                x + radius * 0.15, y + radius * 0.15, 0,
                x + radius * 0.15, y + radius * 0.15, radius * 1.2
            );
            dropShadow.addColorStop(0, 'rgba(101, 67, 33, 0.3)');
            dropShadow.addColorStop(0.7, 'rgba(101, 67, 33, 0.1)');
            dropShadow.addColorStop(1, 'rgba(101, 67, 33, 0)');
            
            this.ctx.fillStyle = dropShadow;
            this.ctx.beginPath();
            this.ctx.arc(x + radius * 0.1, y + radius * 0.1, radius + 3, 0, 2 * Math.PI);
            this.ctx.fill();
            
            // 2. 棋子底面（较暗的基础色）
            const baseTone = this.ctx.createRadialGradient(
                x, y, 0,
                x, y, radius
            );
            baseTone.addColorStop(0, '#f8f8f8');
            baseTone.addColorStop(0.6, '#e8e8e8');
            baseTone.addColorStop(1, '#d0d0d0');
            
            this.ctx.fillStyle = baseTone;
            this.ctx.beginPath();
            this.ctx.arc(x, y, radius, 0, 2 * Math.PI);
            this.ctx.fill();
            
            // 3. 立体感渐变（从光照面到阴影面）
            const volumeGradient = this.ctx.createRadialGradient(
                lightX, lightY, 0,
                x + radius * 0.3, y + radius * 0.3, radius * 1.4
            );
            volumeGradient.addColorStop(0, 'rgba(255, 255, 255, 0.8)');
            volumeGradient.addColorStop(0.3, 'rgba(255, 255, 255, 0.4)');
            volumeGradient.addColorStop(0.7, 'rgba(255, 255, 255, 0)');
            volumeGradient.addColorStop(1, 'rgba(0, 0, 0, 0.15)');
            
            this.ctx.fillStyle = volumeGradient;
            this.ctx.beginPath();
            this.ctx.arc(x, y, radius, 0, 2 * Math.PI);
            this.ctx.fill();
            
            // 4. 主高光（镜面反射）
            const specularHighlight = this.ctx.createRadialGradient(
                lightX, lightY, 0,
                lightX, lightY, radius * 0.3
            );
            specularHighlight.addColorStop(0, 'rgba(255, 255, 255, 0.95)');
            specularHighlight.addColorStop(0.3, 'rgba(255, 255, 255, 0.7)');
            specularHighlight.addColorStop(0.8, 'rgba(255, 255, 255, 0.2)');
            specularHighlight.addColorStop(1, 'rgba(255, 255, 255, 0)');
            
            this.ctx.fillStyle = specularHighlight;
            this.ctx.beginPath();
            this.ctx.arc(lightX, lightY, radius * 0.25, 0, 2 * Math.PI);
            this.ctx.fill();
            
            // 5. 次级高光（环境光反射）
            const ambientHighlight = this.ctx.createRadialGradient(
                x - radius * 0.2, y - radius * 0.5, 0,
                x - radius * 0.2, y - radius * 0.5, radius * 0.4
            );
            ambientHighlight.addColorStop(0, 'rgba(255, 255, 255, 0.4)');
            ambientHighlight.addColorStop(0.5, 'rgba(255, 255, 255, 0.15)');
            ambientHighlight.addColorStop(1, 'rgba(255, 255, 255, 0)');
            
            this.ctx.fillStyle = ambientHighlight;
            this.ctx.beginPath();
            this.ctx.arc(x - radius * 0.15, y - radius * 0.4, radius * 0.3, 0, 2 * Math.PI);
            this.ctx.fill();
            
            // 6. 接触阴影（棋子与棋盘接触处的阴影）
            const contactShadow = this.ctx.createRadialGradient(
                x, y, radius * 0.8,
                x, y, radius
            );
            contactShadow.addColorStop(0, 'rgba(0, 0, 0, 0)');
            contactShadow.addColorStop(0.8, 'rgba(0, 0, 0, 0.1)');
            contactShadow.addColorStop(1, 'rgba(0, 0, 0, 0.3)');
            
            this.ctx.fillStyle = contactShadow;
            this.ctx.beginPath();
            this.ctx.arc(x, y, radius, 0, 2 * Math.PI);
            this.ctx.fill();
            
            // 7. 边缘高光（菲涅尔效果）
            const fresnelHighlight = this.ctx.createRadialGradient(
                x, y, radius * 0.85,
                x, y, radius
            );
            fresnelHighlight.addColorStop(0, 'rgba(255, 255, 255, 0)');
            fresnelHighlight.addColorStop(0.8, 'rgba(255, 255, 255, 0.2)');
            fresnelHighlight.addColorStop(1, 'rgba(255, 255, 255, 0.6)');
            
            this.ctx.fillStyle = fresnelHighlight;
            this.ctx.beginPath();
            this.ctx.arc(x, y, radius, 0, 2 * Math.PI);
            this.ctx.fill();
            
            // 8. 外轮廓
            this.ctx.strokeStyle = '#aaa';
            this.ctx.lineWidth = 1;
            this.ctx.beginPath();
            this.ctx.arc(x, y, radius, 0, 2 * Math.PI);
            this.ctx.stroke();
            
            // 9. 内轮廓高光
            this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)';
            this.ctx.lineWidth = 0.5;
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

    drawWoodTexture() {
        // 保存当前上下文
        this.ctx.save();
        
        // 创建多个年轮中心点（模拟树根横截面）
        const ringCenters = [
            { x: this.canvas.width * 0.3, y: this.canvas.height * 0.25 },
            { x: this.canvas.width * 0.7, y: this.canvas.height * 0.4 },
            { x: this.canvas.width * 0.45, y: this.canvas.height * 0.75 },
            { x: this.canvas.width * 0.15, y: this.canvas.height * 0.8 },
            { x: this.canvas.width * 0.85, y: this.canvas.height * 0.15 }
        ];
        
        // 绘制年轮
        ringCenters.forEach((center, centerIndex) => {
            const maxRadius = Math.min(
                Math.max(center.x, this.canvas.width - center.x),
                Math.max(center.y, this.canvas.height - center.y)
            ) + 50;
            
            // 每个中心绘制多个年轮圆
            const ringCount = 8 + Math.floor(Math.random() * 6);
            
            for (let ring = 1; ring <= ringCount; ring++) {
                const baseRadius = (ring / ringCount) * maxRadius;
                const alpha = 0.08 - (ring / ringCount) * 0.04; // 外圈更淡
                
                this.ctx.globalAlpha = alpha;
                this.ctx.strokeStyle = ring % 2 === 0 ? '#8b4513' : '#a0522d';
                this.ctx.lineWidth = 0.8 + Math.random() * 0.6;
                
                this.ctx.beginPath();
                
                // 绘制不规则的年轮圆
                const segments = 120;
                for (let i = 0; i <= segments; i++) {
                    const angle = (i / segments) * Math.PI * 2;
                    
                    // 添加随机变化让年轮更自然
                    const radiusVariation = 1 + (Math.sin(angle * 6) * 0.15) + (Math.random() - 0.5) * 0.2;
                    const actualRadius = baseRadius * radiusVariation;
                    
                    const x = center.x + Math.cos(angle) * actualRadius;
                    const y = center.y + Math.sin(angle) * actualRadius;
                    
                    if (i === 0) {
                        this.ctx.moveTo(x, y);
                    } else {
                        this.ctx.lineTo(x, y);
                    }
                }
                
                this.ctx.closePath();
                this.ctx.stroke();
            }
        });
        
        // 添加径向木纹（从年轮中心向外的放射状纹理）
        this.ctx.globalAlpha = 0.04;
        ringCenters.forEach(center => {
            const rayCount = 12 + Math.floor(Math.random() * 8);
            
            for (let ray = 0; ray < rayCount; ray++) {
                const angle = (ray / rayCount) * Math.PI * 2 + Math.random() * 0.3;
                const length = 80 + Math.random() * 120;
                
                this.ctx.strokeStyle = Math.random() > 0.5 ? '#654321' : '#8b4513';
                this.ctx.lineWidth = 0.4 + Math.random() * 0.3;
                
                this.ctx.beginPath();
                this.ctx.moveTo(center.x, center.y);
                
                // 绘制略微弯曲的射线
                const segments = 10;
                for (let seg = 1; seg <= segments; seg++) {
                    const progress = seg / segments;
                    const currentLength = length * progress;
                    
                    // 添加轻微的弯曲
                    const curve = Math.sin(progress * Math.PI * 2) * 8;
                    const perpAngle = angle + Math.PI / 2;
                    
                    const x = center.x + Math.cos(angle) * currentLength + Math.cos(perpAngle) * curve;
                    const y = center.y + Math.sin(angle) * currentLength + Math.sin(perpAngle) * curve;
                    
                    this.ctx.lineTo(x, y);
                }
                
                this.ctx.stroke();
            }
        });
        
        // 添加一些木材裂纹和细节
        this.ctx.globalAlpha = 0.06;
        const crackCount = 6 + Math.floor(Math.random() * 4);
        
        for (let crack = 0; crack < crackCount; crack++) {
            const startX = Math.random() * this.canvas.width;
            const startY = Math.random() * this.canvas.height;
            const length = 30 + Math.random() * 100;
            const angle = Math.random() * Math.PI * 2;
            
            this.ctx.strokeStyle = '#654321';
            this.ctx.lineWidth = 0.5 + Math.random() * 0.4;
            
            this.ctx.beginPath();
            this.ctx.moveTo(startX, startY);
            
            // 绘制分叉的裂纹
            const segments = 8;
            let currentX = startX;
            let currentY = startY;
            
            for (let seg = 1; seg <= segments; seg++) {
                const progress = seg / segments;
                const segmentLength = (length / segments) * (1 + Math.random() * 0.3);
                const angleVariation = (Math.random() - 0.5) * 0.4;
                
                currentX += Math.cos(angle + angleVariation) * segmentLength;
                currentY += Math.sin(angle + angleVariation) * segmentLength;
                
                this.ctx.lineTo(currentX, currentY);
            }
            
            this.ctx.stroke();
        }
        
        // 恢复上下文
        this.ctx.restore();
    }

    // 自定义确认弹窗
    showCustomConfirm(title, message) {
        return new Promise((resolve) => {
            // 创建弹窗元素
            const modal = document.createElement('div');
            modal.className = 'custom-confirm-modal';
            modal.innerHTML = `
                <div class="custom-confirm-content">
                    <div class="custom-confirm-title">${title}</div>
                    <div class="custom-confirm-message">${message}</div>
                    <div class="custom-confirm-buttons">
                        <button class="custom-confirm-btn cancel">取消</button>
                        <button class="custom-confirm-btn confirm">确认</button>
                    </div>
                </div>
            `;

            // 添加到页面
            document.body.appendChild(modal);

            // 获取按钮
            const confirmBtn = modal.querySelector('.confirm');
            const cancelBtn = modal.querySelector('.cancel');

            // 显示弹窗
            setTimeout(() => modal.classList.add('show'), 100);

            // 处理确认按钮
            confirmBtn.addEventListener('click', () => {
                modal.classList.remove('show');
                setTimeout(() => {
                    modal.remove();
                    resolve(true);
                }, 300);
            });

            // 处理取消按钮
            cancelBtn.addEventListener('click', () => {
                modal.classList.remove('show');
                setTimeout(() => {
                    modal.remove();
                    resolve(false);
                }, 300);
            });

            // 点击背景关闭（视为取消）
            modal.addEventListener('click', (e) => {
                if (e.target === modal) {
                    modal.classList.remove('show');
                    setTimeout(() => {
                        modal.remove();
                        resolve(false);
                    }, 300);
                }
            });

            // ESC键关闭（视为取消）
            const handleEsc = (e) => {
                if (e.key === 'Escape') {
                    modal.classList.remove('show');
                    setTimeout(() => {
                        modal.remove();
                        resolve(false);
                    }, 300);
                    document.removeEventListener('keydown', handleEsc);
                }
            };
            document.addEventListener('keydown', handleEsc);
        });
    }
}

// 游戏初始化
document.addEventListener('DOMContentLoaded', () => {
    new OnlineGomoku();
});