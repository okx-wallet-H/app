// 配置信息
const CONFIG = {
    rpcUrl: 'https://shy-shy-surf.xlayer-mainnet.quiknode.pro/fa135d65d86e5cf4688019042067d4449f1235c5', // 您的私有 X Layer 节点
    pairAddress: '0x0ee271b597dcc9f0006d7819a13ea0e0ab7fa2fc', // H 代币池子地址
    updateInterval: 15000 // 15秒更新一次，私有节点可以更快
};

// 内存中存储最近的价格点，用于绘制 K 线
let priceHistory = [];
const MAX_HISTORY_POINTS = 30;

// 热门代币生成
const hotTokens = [
    { symbol: 'H', price: '加载中...', change: '0.00%', up: true },
    { symbol: 'BNB', price: '$585.20', change: '+1.2%', up: true },
    { symbol: 'OKB', price: '$48.75', change: '-0.3%', up: false },
    { symbol: 'USDT', price: '$1.00', change: '+0.01%', up: true },
    { symbol: 'CAKE', price: '$2.45', change: '+3.2%', up: true }
];

function generateHotTokens() {
    const container = document.getElementById('hotTokensList');
    if (!container) return;
    container.innerHTML = '';
    hotTokens.forEach(t => {
        const div = document.createElement('div');
        div.className = 'token-card';
        div.innerHTML = `<div class="token-symbol">${t.symbol}</div><div class="token-price">${t.price}</div><div class="token-change ${t.up ? 'positive' : 'negative'}">${t.change}</div>`;
        container.appendChild(div);
    });
}

// 工具网格
const tools = ["签到","抽奖","积分","行情","查询系统","便捷访问","交易","连接OKX","团队详情","邀请好友","我的收益","设置昵称"];
function generateTools() {
    const container = document.getElementById('toolsGrid');
    if (!container) return;
    container.innerHTML = '';
    tools.forEach(name => {
        const div = document.createElement('div');
        div.className = 'tool-card';
        div.innerHTML = `<div class="tool-icon">🔧</div><div class="tool-name">${name}</div>`;
        div.addEventListener('click', () => alert(`「${name}」功能开发中`));
        container.appendChild(div);
    });
}

// 使用 ethers.js 从私有 RPC 节点获取链上实时价格
async function fetchOnChainPrice() {
    console.log('正在通过私有 RPC 节点获取 H 代币链上实时价格...');
    try {
        if (typeof ethers === 'undefined') {
            console.error('ethers.js 未加载，请检查 index.html');
            return;
        }

        const provider = new ethers.providers.JsonRpcProvider(CONFIG.rpcUrl);
        
        // Uniswap V2 Pair 合约的 getReserves 接口 ABI
        const pairAbi = ["function getReserves() external view returns (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast)"];
        const pairContract = new ethers.Contract(CONFIG.pairAddress, pairAbi, provider);

        const reserves = await pairContract.getReserves();
        
        // 假设 H 是 token0，U 是 token1 (如果是反的，请调换位置)
        // 价格 = reserve1 / reserve0
        const reserve0 = parseFloat(ethers.utils.formatUnits(reserves.reserve0, 18));
        const reserve1 = parseFloat(ethers.utils.formatUnits(reserves.reserve1, 18));
        
        if (reserve0 > 0) {
            const price = (reserve1 / reserve0).toFixed(6);
            updatePriceUI(price);
            
            // 记录价格历史用于绘图
            recordPricePoint(price);
        }
    } catch (error) {
        console.error('链上数据获取失败:', error);
    }
}

function recordPricePoint(price) {
    const p = parseFloat(price);
    if (priceHistory.length === 0) {
        // 初始填充一些数据点，避免 K 线太短
        for(let i=0; i<MAX_HISTORY_POINTS; i++) {
            priceHistory.push({ open: p, high: p, low: p, close: p });
        }
    } else {
        const last = priceHistory[priceHistory.length - 1];
        const newPoint = {
            open: last.close,
            high: Math.max(last.close, p),
            low: Math.min(last.close, p),
            close: p
        };
        priceHistory.push(newPoint);
        if (priceHistory.length > MAX_HISTORY_POINTS) {
            priceHistory.shift();
        }
    }
    
    const canvas = document.getElementById('priceKline');
    if (canvas) drawKlineFromData(canvas, priceHistory);
}

function updatePriceUI(price) {
    const priceEl = document.getElementById('hTokenPrice');
    if (priceEl) {
        priceEl.innerText = `${price} U`;
        hotTokens[0].price = `${price} U`;
        generateHotTokens();
    }
}

function drawKlineFromData(canvas, data) {
    const ctx = canvas.getContext('2d');
    const width = canvas.clientWidth, height = canvas.clientHeight;
    canvas.width = width; canvas.height = height;
    
    const minPrice = Math.min(...data.map(d => d.low));
    const maxPrice = Math.max(...data.map(d => d.high));
    const range = maxPrice - minPrice || 0.0001;
    const yScale = height / range;
    const barWidth = (width / data.length) * 0.7;
    
    ctx.clearRect(0, 0, width, height);
    data.forEach((d, i) => {
        const x = 5 + i * (width / data.length);
        const openY = height - (d.open - minPrice) * yScale;
        const closeY = height - (d.close - minPrice) * yScale;
        const highY = height - (d.high - minPrice) * yScale;
        const lowY = height - (d.low - minPrice) * yScale;
        const isRise = d.close >= d.open;
        
        ctx.beginPath();
        ctx.moveTo(x + barWidth / 2, highY);
        ctx.lineTo(x + barWidth / 2, lowY);
        ctx.strokeStyle = isRise ? '#10B981' : '#EF4444';
        ctx.lineWidth = 1.5;
        ctx.stroke();
        
        const rectX = x + barWidth / 2 - barWidth / 2.5;
        const rectHeight = Math.abs(closeY - openY);
        const rectY = isRise ? closeY : openY;
        ctx.fillStyle = isRise ? '#10B981' : '#EF4444';
        ctx.fillRect(rectX, rectY, barWidth / 1.2, rectHeight || 1);
    });
}

// 为页面添加导航高亮
function highlightCurrentNav() {
    const currentPage = window.location.pathname.split('/').pop() || 'index.html';
    const navItems = document.querySelectorAll('.nav-item');
    navItems.forEach(item => {
        const href = item.getAttribute('href');
        if (href && href.includes(currentPage)) {
            item.classList.add('active');
        } else {
            item.classList.remove('active');
        }
    });
}

// 页面加载时执行
document.addEventListener('DOMContentLoaded', () => {
    generateHotTokens();
    generateTools();
    highlightCurrentNav();

    if (document.getElementById('hTokenPrice')) {
        fetchOnChainPrice();
        setInterval(fetchOnChainPrice, CONFIG.updateInterval);
    }

    const btns = document.querySelectorAll('.btn-gradient, .btn-outline');
    btns.forEach(btn => {
        if (!btn.hasAttribute('data-listener')) {
            btn.setAttribute('data-listener', 'true');
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                alert('模拟操作：实际开发将连接智能合约/后端');
            });
        }
    });
});
