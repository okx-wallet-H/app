// ============================================================
// 海豚社区 - common.js
// 对接 X Layer 链上真实数据（H Token 实时价格 + 迷你 K 线）
// ============================================================

const CONFIG = {
    // 双 RPC 节点：优先私有节点，失败自动回退公共节点
    rpcUrls: [
        'https://shy-shy-surf.xlayer-mainnet.quiknode.pro/fa135d65d86e5cf4688019042067d4449f1235c5',
        'https://rpc.xlayer.tech'
    ],
    // H/WOKB 交易对（Uniswap V2 风格）
    // token0 = H (0x867fdd2eef548f80808d0c9065cd55f57e207777) 18 decimals
    // token1 = WOKB (0xe538905cf8410324e03a5a23c1c177a474d59b2b) 18 decimals
    hWokbPair: '0x0ee271b597dcc9f0006d7819a13ea0e0ab7fa2fc',
    // WOKB/USDT 交易对
    // token0 = USDT (0x1e4a5963abfd975d8c9021ce480b42188849d41d) 6 decimals
    // token1 = WOKB 18 decimals
    wokbUsdtPair: '0xc71f9e1de80eb505c0cb3bbf90ae6593130e5d25',
    updateInterval: 15000, // 15 秒更新一次
    klineInterval: 60000   // K 线每根蜡烛代表 1 分钟
};

// ============================================================
// 价格历史 & K 线数据
// ============================================================
let priceHistory = [];
const MAX_HISTORY_POINTS = 30;
let currentCandle = null;
let lastFetchSuccess = false;
let activeRpcIndex = 0; // 当前使用的 RPC 索引

// ============================================================
// RPC 调用（带自动回退）
// ============================================================
async function rpcCall(method, params) {
    // 先尝试当前活跃节点，失败后尝试其他节点
    const urls = [CONFIG.rpcUrls[activeRpcIndex], ...CONFIG.rpcUrls.filter((_, i) => i !== activeRpcIndex)];

    for (let i = 0; i < urls.length; i++) {
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 8000);

            const response = await fetch(urls[i], {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ jsonrpc: '2.0', method, params, id: 1 }),
                signal: controller.signal
            });
            clearTimeout(timeoutId);

            const data = await response.json();
            if (data.result) {
                // 记住成功的节点
                activeRpcIndex = CONFIG.rpcUrls.indexOf(urls[i]);
                return data.result;
            }
        } catch (e) {
            console.warn(`RPC ${urls[i].substring(0, 40)}... 失败:`, e.message);
        }
    }
    return null;
}

async function ethCall(to, data) {
    return rpcCall('eth_call', [{ to, data }, 'latest']);
}

// ============================================================
// 链上价格获取：H → WOKB → USDT 两跳定价
// ============================================================
async function fetchOnChainPrice() {
    console.log('正在获取 H Token 链上实时价格...');
    try {
        // 1) 获取 H/WOKB 池子储备量
        const hWokbReserves = await ethCall(CONFIG.hWokbPair, '0x0902f1ac');
        if (!hWokbReserves) throw new Error('H/WOKB getReserves 失败');

        const hex1 = hWokbReserves.slice(2);
        const hReserveRaw = BigInt('0x' + hex1.slice(0, 64));
        const wokbReserveRaw = BigInt('0x' + hex1.slice(64, 128));

        // 2) 获取 WOKB/USDT 池子储备量
        const wokbUsdtReserves = await ethCall(CONFIG.wokbUsdtPair, '0x0902f1ac');
        if (!wokbUsdtReserves) throw new Error('WOKB/USDT getReserves 失败');

        const hex2 = wokbUsdtReserves.slice(2);
        const usdtReserveRaw = BigInt('0x' + hex2.slice(0, 64));   // token0 = USDT (6 decimals)
        const wokbReserveRaw2 = BigInt('0x' + hex2.slice(64, 128)); // token1 = WOKB (18 decimals)

        // 3) 计算价格
        // H price in WOKB = wokbReserve(H池) / hReserve
        // WOKB price in USDT = usdtReserve / wokbReserve(USDT池)
        // 为保持精度，使用整数运算再转换

        const hReserve = Number(hReserveRaw) / 1e18;
        const wokbReserve = Number(wokbReserveRaw) / 1e18;
        const usdtReserve = Number(usdtReserveRaw) / 1e6;
        const wokbReserve2 = Number(wokbReserveRaw2) / 1e18;

        if (hReserve <= 0 || wokbReserve2 <= 0) throw new Error('储备量为零');

        const hPriceInWokb = wokbReserve / hReserve;
        const wokbPriceInUsdt = usdtReserve / wokbReserve2;
        const hPriceInUsdt = hPriceInWokb * wokbPriceInUsdt;

        console.log(`H 价格: ${hPriceInUsdt.toFixed(10)} USDT (WOKB价格: ${wokbPriceInUsdt.toFixed(2)} USDT)`);

        lastFetchSuccess = true;
        updatePriceUI(hPriceInUsdt);
        recordPricePoint(hPriceInUsdt);

    } catch (error) {
        console.error('链上数据获取失败:', error);
        lastFetchSuccess = false;
        // 显示"正在获取"
        const priceEl = document.getElementById('hTokenPrice');
        if (priceEl && priceEl.innerText === '加载中...') {
            priceEl.innerText = '正在获取...';
        }
    }
}

// ============================================================
// 价格 UI 更新
// ============================================================
function updatePriceUI(price) {
    const priceEl = document.getElementById('hTokenPrice');
    if (!priceEl) return;

    // 根据价格大小自动选择显示精度
    let displayPrice;
    if (price >= 1) {
        displayPrice = price.toFixed(4);
    } else if (price >= 0.001) {
        displayPrice = price.toFixed(6);
    } else if (price >= 0.000001) {
        displayPrice = price.toFixed(8);
    } else {
        // 极小价格使用科学计数法友好格式
        // 例如 0.0000035869 → 0.00000359
        displayPrice = price.toFixed(8);
    }

    priceEl.innerText = `${displayPrice} USDT`;

    // 同步更新热门代币列表中的 H 价格
    if (hotTokens && hotTokens.length > 0) {
        hotTokens[0].price = `${displayPrice} U`;
        generateHotTokens();
    }
}

// ============================================================
// K 线数据记录（真实蜡烛图）
// ============================================================
function recordPricePoint(price) {
    const now = Date.now();
    const p = price;

    if (!currentCandle) {
        // 初始化第一根蜡烛
        currentCandle = {
            open: p, high: p, low: p, close: p,
            startTime: now
        };
    }

    // 更新当前蜡烛
    currentCandle.close = p;
    currentCandle.high = Math.max(currentCandle.high, p);
    currentCandle.low = Math.min(currentCandle.low, p);

    // 检查是否需要切换到新蜡烛
    if (now - currentCandle.startTime >= CONFIG.klineInterval) {
        // 完成当前蜡烛，推入历史
        priceHistory.push({
            open: currentCandle.open,
            high: currentCandle.high,
            low: currentCandle.low,
            close: currentCandle.close
        });

        // 限制历史长度
        if (priceHistory.length > MAX_HISTORY_POINTS) {
            priceHistory.shift();
        }

        // 开始新蜡烛
        currentCandle = {
            open: p, high: p, low: p, close: p,
            startTime: now
        };
    }

    // 构建绘图数据：历史蜡烛 + 当前进行中的蜡烛
    const drawData = [
        ...priceHistory,
        { open: currentCandle.open, high: currentCandle.high, low: currentCandle.low, close: currentCandle.close }
    ];

    // 如果数据点太少，用当前价格填充以让图表看起来不空
    while (drawData.length < 5) {
        drawData.unshift({ open: p, high: p, low: p, close: p });
    }

    const canvas = document.getElementById('priceKline');
    if (canvas) drawKlineFromData(canvas, drawData);
}

// ============================================================
// K 线绘制（蜡烛图 + 均线）
// ============================================================
function drawKlineFromData(canvas, data) {
    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;

    // 高清渲染
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.scale(dpr, dpr);

    const padding = { top: 8, bottom: 8, left: 4, right: 4 };
    const chartW = width - padding.left - padding.right;
    const chartH = height - padding.top - padding.bottom;

    const allPrices = data.flatMap(d => [d.high, d.low]);
    let minPrice = Math.min(...allPrices);
    let maxPrice = Math.max(...allPrices);

    // 如果价格范围太小，人为扩展以避免扁平图
    if (maxPrice - minPrice < minPrice * 0.001) {
        const mid = (maxPrice + minPrice) / 2;
        minPrice = mid * 0.999;
        maxPrice = mid * 1.001;
    }

    const range = maxPrice - minPrice;
    const yScale = chartH / range;
    const barGap = chartW / data.length;
    const barWidth = Math.max(barGap * 0.6, 2);

    ctx.clearRect(0, 0, width, height);

    // 绘制半透明网格线
    ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    ctx.lineWidth = 0.5;
    for (let i = 0; i <= 3; i++) {
        const y = padding.top + (chartH / 3) * i;
        ctx.beginPath();
        ctx.moveTo(padding.left, y);
        ctx.lineTo(width - padding.right, y);
        ctx.stroke();
    }

    // 绘制蜡烛
    const riseColor = '#10B981';
    const fallColor = '#EF4444';

    data.forEach((d, i) => {
        const x = padding.left + i * barGap + barGap / 2;
        const openY = padding.top + (maxPrice - d.open) * yScale;
        const closeY = padding.top + (maxPrice - d.close) * yScale;
        const highY = padding.top + (maxPrice - d.high) * yScale;
        const lowY = padding.top + (maxPrice - d.low) * yScale;
        const isRise = d.close >= d.open;
        const color = isRise ? riseColor : fallColor;

        // 影线
        ctx.beginPath();
        ctx.moveTo(x, highY);
        ctx.lineTo(x, lowY);
        ctx.strokeStyle = color;
        ctx.lineWidth = 1;
        ctx.stroke();

        // 实体
        const bodyTop = Math.min(openY, closeY);
        const bodyHeight = Math.max(Math.abs(closeY - openY), 1);
        ctx.fillStyle = color;
        ctx.fillRect(x - barWidth / 2, bodyTop, barWidth, bodyHeight);
    });

    // 绘制收盘价均线（平滑曲线）
    if (data.length >= 3) {
        ctx.beginPath();
        ctx.strokeStyle = 'rgba(124, 58, 237, 0.6)';
        ctx.lineWidth = 1.5;

        const closes = data.map(d => d.close);
        for (let i = 0; i < closes.length; i++) {
            const x = padding.left + i * barGap + barGap / 2;
            const y = padding.top + (maxPrice - closes[i]) * yScale;
            if (i === 0) {
                ctx.moveTo(x, y);
            } else {
                // 贝塞尔曲线平滑
                const prevX = padding.left + (i - 1) * barGap + barGap / 2;
                const prevY = padding.top + (maxPrice - closes[i - 1]) * yScale;
                const cpX = (prevX + x) / 2;
                ctx.bezierCurveTo(cpX, prevY, cpX, y, x, y);
            }
        }
        ctx.stroke();
    }
}

// ============================================================
// 热门代币
// ============================================================
const hotTokens = [
    { symbol: 'H', price: '加载中...', change: '--', up: true },
    { symbol: 'OKB', price: '--', change: '--', up: true },
    { symbol: 'USDT', price: '$1.00', change: '+0.01%', up: true },
    { symbol: 'WOKB', price: '--', change: '--', up: true },
    { symbol: 'ETH', price: '--', change: '--', up: true }
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

// ============================================================
// 工具网格
// ============================================================
const tools = ["签到", "抽奖", "积分", "行情", "查询系统", "便捷访问", "交易", "连接OKX", "团队详情", "邀请好友", "我的收益", "设置昵称"];

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

// ============================================================
// 导航高亮
// ============================================================
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

// ============================================================
// 页面初始化
// ============================================================
document.addEventListener('DOMContentLoaded', () => {
    generateHotTokens();
    generateTools();
    highlightCurrentNav();

    // 首页：启动价格轮询
    if (document.getElementById('hTokenPrice')) {
        fetchOnChainPrice();
        setInterval(fetchOnChainPrice, CONFIG.updateInterval);
    }

    // 通用按钮事件（质押等模拟操作）
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
