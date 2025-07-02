class Gomoku {
    constructor() {
        this.canvas = document.getElementById('game-board');
        this.ctx = this.canvas.getContext('2d');
        this.currentPlayer = 1; // 1: 黑子, 2: 白子
        this.gameMode = 'pvp'; // 'pvp': 双人对战, 'pve': 人机对战
        this.gameOver = false;
        this.boardSize = 15;
        this.cellSize = 38;
        this.board = [];
        
        this.initBoard();
        this.initEventListeners();
        this.drawBoard();
        this.updateStatus();
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
        this.canvas.addEventListener('click', (e) => {
            if (!this.gameOver) {
                this.handleClick(e);
            }
        });

        document.getElementById('reset-btn').addEventListener('click', () => {
            this.resetGame();
        });

        document.getElementById('pvp-mode').addEventListener('click', () => {
            this.setGameMode('pvp');
        });

        document.getElementById('pve-mode').addEventListener('click', () => {
            this.setGameMode('pve');
        });
    }

    setGameMode(mode) {
        this.gameMode = mode;
        document.querySelectorAll('.mode-btn').forEach(btn => btn.classList.remove('active'));
        document.getElementById(mode + '-mode').classList.add('active');
        this.resetGame();
    }

    handleClick(e) {
        const rect = this.canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        
        const col = Math.round((x - this.cellSize / 2) / this.cellSize);
        const row = Math.round((y - this.cellSize / 2) / this.cellSize);
        
        if (this.isValidMove(row, col)) {
            this.makeMove(row, col, this.currentPlayer);
            
            if (this.checkWin(row, col, this.currentPlayer)) {
                this.endGame(this.currentPlayer);
                return;
            }
            
            if (this.isBoardFull()) {
                this.endGame(0); // 平局
                return;
            }
            
            this.currentPlayer = this.currentPlayer === 1 ? 2 : 1;
            this.updateStatus();
            
            // 如果是人机对战模式且轮到电脑
            if (this.gameMode === 'pve' && this.currentPlayer === 2) {
                setTimeout(() => {
                    this.makeAIMove();
                }, 500);
            }
        }
    }

    isValidMove(row, col) {
        return row >= 0 && row < this.boardSize && col >= 0 && col < this.boardSize && this.board[row][col] === 0;
    }

    makeMove(row, col, player) {
        this.board[row][col] = player;
        this.drawPiece(row, col, player);
    }

    makeAIMove() {
        const bestMove = this.getBestMove();
        if (bestMove) {
            this.makeMove(bestMove.row, bestMove.col, 2);
            
            if (this.checkWin(bestMove.row, bestMove.col, 2)) {
                this.endGame(2);
                return;
            }
            
            if (this.isBoardFull()) {
                this.endGame(0);
                return;
            }
            
            this.currentPlayer = 1;
            this.updateStatus();
        }
    }

    getBestMove() {
        // 简单的AI策略：优先防御，其次进攻
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
        
        // 评估攻击和防守价值
        const directions = [
            [0, 1],   // 水平
            [1, 0],   // 垂直
            [1, 1],   // 对角线
            [1, -1]   // 反对角线
        ];
        
        directions.forEach(([dx, dy]) => {
            // 防守：阻止玩家获胜
            const playerThreat = this.countConsecutive(row, col, dx, dy, 1);
            if (playerThreat >= 4) score += 10000; // 阻止玩家获胜
            else if (playerThreat === 3) score += 500;
            else if (playerThreat === 2) score += 50;
            
            // 进攻：AI自己获胜
            const aiOpportunity = this.countConsecutive(row, col, dx, dy, 2);
            if (aiOpportunity >= 4) score += 50000; // AI获胜
            else if (aiOpportunity === 3) score += 1000;
            else if (aiOpportunity === 2) score += 100;
        });
        
        // 中心位置bonus
        const center = Math.floor(this.boardSize / 2);
        const distanceFromCenter = Math.abs(row - center) + Math.abs(col - center);
        score += (this.boardSize - distanceFromCenter) * 2;
        
        return score;
    }

    countConsecutive(row, col, dx, dy, player) {
        let count = 1; // 包括当前位置
        
        // 向一个方向计数
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
        
        // 向相反方向计数
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
        
        return count - 1; // 减去重复计算的当前位置
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
                if (newRow >= 0 && newRow < this.boardSize && 
                    newCol >= 0 && newCol < this.boardSize && 
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

    drawBoard() {
        this.ctx.fillStyle = '#deb887';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        
        this.ctx.strokeStyle = '#8b4513';
        this.ctx.lineWidth = 1;
        
        // 绘制网格线
        for (let i = 0; i < this.boardSize; i++) {
            const pos = this.cellSize / 2 + i * this.cellSize;
            
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
        
        // 绘制天元和星位
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
            // 黑子
            this.ctx.fillStyle = '#000';
            this.ctx.fill();
            this.ctx.strokeStyle = '#333';
            this.ctx.lineWidth = 2;
            this.ctx.stroke();
        } else {
            // 白子
            this.ctx.fillStyle = '#fff';
            this.ctx.fill();
            this.ctx.strokeStyle = '#666';
            this.ctx.lineWidth = 2;
            this.ctx.stroke();
        }
    }

    updateStatus() {
        const statusElement = document.getElementById('current-player');
        if (this.gameMode === 'pvp') {
            statusElement.textContent = this.currentPlayer === 1 ? '黑子回合' : '白子回合';
        } else {
            statusElement.textContent = this.currentPlayer === 1 ? '你的回合' : '电脑思考中...';
        }
    }

    endGame(winner) {
        this.gameOver = true;
        const winnerDisplay = document.getElementById('winner-display');
        
        if (winner === 0) {
            winnerDisplay.textContent = '平局！';
        } else if (this.gameMode === 'pvp') {
            winnerDisplay.textContent = winner === 1 ? '黑子获胜！' : '白子获胜！';
        } else {
            winnerDisplay.textContent = winner === 1 ? '你赢了！' : '电脑获胜！';
        }
        
        winnerDisplay.classList.add('show');
        document.getElementById('current-player').textContent = '游戏结束';
    }

    resetGame() {
        this.gameOver = false;
        this.currentPlayer = 1;
        this.initBoard();
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        this.drawBoard();
        this.updateStatus();
        
        const winnerDisplay = document.getElementById('winner-display');
        winnerDisplay.classList.remove('show');
        winnerDisplay.textContent = '';
    }
}

// 游戏初始化
document.addEventListener('DOMContentLoaded', () => {
    new Gomoku();
});