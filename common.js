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
    hWokbPair: '0x0ee271b597dcc9f0006d7819a13ea0e0ab7fa2fc',
    // WOKB/USDT 交易对
    wokbUsdtPair: '0xc71f9e1de80eb505c0cb3bbf90ae6593130e5d25',
    updateInterval: 15000,
    klineInterval: 60000
};

// ============================================================
// 价格状态
// ============================================================
let priceHistory = [];
const MAX_HISTORY_POINTS = 30;
let currentCandle = null;
let lastFetchSuccess = false;
let activeRpcIndex = 0;

// 涨跌幅追踪
let previousPrice = null;   // 上一次的价格（用于闪烁方向）
let firstPrice = null;      // 本次会话第一次获取到的价格（用于计算涨跌幅）

// ============================================================
// RPC 调用（带自动回退）
// ============================================================
async function rpcCall(method, params) {
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
        const hWokbReserves = await ethCall(CONFIG.hWokbPair, '0x0902f1ac');
        if (!hWokbReserves) throw new Error('H/WOKB getReserves 失败');

        const hex1 = hWokbReserves.slice(2);
        const hReserveRaw = BigInt('0x' + hex1.slice(0, 64));
        const wokbReserveRaw = BigInt('0x' + hex1.slice(64, 128));

        const wokbUsdtReserves = await ethCall(CONFIG.wokbUsdtPair, '0x0902f1ac');
        if (!wokbUsdtReserves) throw new Error('WOKB/USDT getReserves 失败');

        const hex2 = wokbUsdtReserves.slice(2);
        const usdtReserveRaw = BigInt('0x' + hex2.slice(0, 64));
        const wokbReserveRaw2 = BigInt('0x' + hex2.slice(64, 128));

        const hReserve = Number(hReserveRaw) / 1e18;
        const wokbReserve = Number(wokbReserveRaw) / 1e18;
        const usdtReserve = Number(usdtReserveRaw) / 1e6;
        const wokbReserve2 = Number(wokbReserveRaw2) / 1e18;

        if (hReserve <= 0 || wokbReserve2 <= 0) throw new Error('储备量为零');

        const hPriceInWokb = wokbReserve / hReserve;
        const wokbPriceInUsdt = usdtReserve / wokbReserve2;
        const hPriceInUsdt = hPriceInWokb * wokbPriceInUsdt;

        console.log(`H 价格: ${hPriceInUsdt.toFixed(10)} USDT`);

        lastFetchSuccess = true;
        updatePriceUI(hPriceInUsdt);
        recordPricePoint(hPriceInUsdt);

    } catch (error) {
        console.error('链上数据获取失败:', error);
        lastFetchSuccess = false;
        const priceEl = document.getElementById('hTokenPrice');
        if (priceEl && !previousPrice) {
            priceEl.innerHTML = '<span style="font-size:2.2rem; font-weight:800; color:white;">正在获取...</span>';
        }
    }
}

// ============================================================
// 省略零格式化：0.00000358 → 0.0₅358
// ============================================================
function formatPriceWithSubscript(price) {
    if (price >= 1) {
        return { html: price.toFixed(4) + '<span class="price-unit">USDT</span>', plain: price.toFixed(4) };
    }
    if (price >= 0.01) {
        return { html: price.toFixed(6) + '<span class="price-unit">USDT</span>', plain: price.toFixed(6) };
    }

    // 小于 0.01 的价格，计算前导零个数
    const priceStr = price.toFixed(18);
    // 找到小数点后第一个非零数字的位置
    const match = priceStr.match(/^0\.0*([\d])/);
    if (!match) {
        return { html: price.toExponential(3) + '<span class="price-unit">USDT</span>', plain: price.toExponential(3) };
    }

    // 计算小数点后的前导零个数
    const afterDot = priceStr.split('.')[1];
    let zeroCount = 0;
    for (let i = 0; i < afterDot.length; i++) {
        if (afterDot[i] === '0') zeroCount++;
        else break;
    }

    // 提取有效数字（取3-4位）
    const significantDigits = afterDot.slice(zeroCount, zeroCount + 3);

    // 构建 HTML：0.0₅358
    const html = `0.0<span class="price-zero-count">${zeroCount}</span>${significantDigits}<span class="price-unit">USDT</span>`;
    const plain = `0.0{${zeroCount}}${significantDigits}`;

    return { html, plain, zeroCount, significantDigits };
}

// ============================================================
// 价格 UI 更新（带丝滑动画 + 涨跌幅）
// ============================================================
function updatePriceUI(price) {
    const priceEl = document.getElementById('hTokenPrice');
    if (!priceEl) return;

    // 记录第一次价格（用于计算涨跌幅基准）
    if (firstPrice === null) {
        firstPrice = price;
    }

    // 判断涨跌方向（相对上一次价格）
    let direction = 'neutral';
    if (previousPrice !== null) {
        if (price > previousPrice) direction = 'up';
        else if (price < previousPrice) direction = 'down';
    }

    // 格式化价格
    const formatted = formatPriceWithSubscript(price);

    // 添加闪烁动画
    priceEl.classList.remove('flash-up', 'flash-down');
    if (direction === 'up') {
        // 强制 reflow 以重新触发动画
        void priceEl.offsetWidth;
        priceEl.classList.add('flash-up');
    } else if (direction === 'down') {
        void priceEl.offsetWidth;
        priceEl.classList.add('flash-down');
    }

    // 更新价格 HTML
    priceEl.innerHTML = formatted.html;

    // 更新涨跌幅
    updateChangePercent(price, direction);

    // 记录当前价格
    previousPrice = price;

    // 同步更新热门代币列表
    if (hotTokens && hotTokens.length > 0) {
        const changePercent = firstPrice > 0 ? ((price - firstPrice) / firstPrice * 100) : 0;
        const changeStr = (changePercent >= 0 ? '+' : '') + changePercent.toFixed(2) + '%';
        hotTokens[0].price = formatted.plain.replace('{', '₍').replace('}', '₎');
        hotTokens[0].change = changeStr;
        hotTokens[0].up = changePercent >= 0;
        generateHotTokens();
    }
}

// ============================================================
// 涨跌幅百分比更新
// ============================================================
function updateChangePercent(price, direction) {
    const badge = document.getElementById('priceChangeBadge');
    const text = document.getElementById('priceChangeText');
    if (!badge || !text) return;

    // 计算相对于首次价格的涨跌幅
    const changePercent = firstPrice > 0 ? ((price - firstPrice) / firstPrice * 100) : 0;
    const absChange = Math.abs(changePercent);

    // 确定显示状态
    let cssClass, arrow, displayText;
    if (changePercent > 0.001) {
        cssClass = 'up';
        arrow = '▲';
        displayText = `+${absChange.toFixed(2)}%`;
    } else if (changePercent < -0.001) {
        cssClass = 'down';
        arrow = '▼';
        displayText = `-${absChange.toFixed(2)}%`;
    } else {
        cssClass = 'neutral';
        arrow = '●';
        displayText = `0.00%`;
    }

    // 平滑更新
    badge.className = `price-change-badge ${cssClass}`;
    badge.querySelector('.arrow').textContent = arrow;
    text.textContent = displayText;
}

// ============================================================
// K 线数据记录（真实蜡烛图）
// ============================================================
function recordPricePoint(price) {
    const now = Date.now();
    const p = price;

    if (!currentCandle) {
        currentCandle = {
            open: p, high: p, low: p, close: p,
            startTime: now
        };
    }

    currentCandle.close = p;
    currentCandle.high = Math.max(currentCandle.high, p);
    currentCandle.low = Math.min(currentCandle.low, p);

    if (now - currentCandle.startTime >= CONFIG.klineInterval) {
        priceHistory.push({
            open: currentCandle.open,
            high: currentCandle.high,
            low: currentCandle.low,
            close: currentCandle.close
        });
        if (priceHistory.length > MAX_HISTORY_POINTS) {
            priceHistory.shift();
        }
        currentCandle = {
            open: p, high: p, low: p, close: p,
            startTime: now
        };
    }

    const drawData = [
        ...priceHistory,
        { open: currentCandle.open, high: currentCandle.high, low: currentCandle.low, close: currentCandle.close }
    ];
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

    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.scale(dpr, dpr);

    const padding = { top: 8, bottom: 8, left: 4, right: 4 };
    const chartH = height - padding.top - padding.bottom;
    const chartW = width - padding.left - padding.right;

    const allPrices = data.flatMap(d => [d.high, d.low]);
    let minPrice = Math.min(...allPrices);
    let maxPrice = Math.max(...allPrices);

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

    // 网格线
    ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    ctx.lineWidth = 0.5;
    for (let i = 0; i <= 3; i++) {
        const y = padding.top + (chartH / 3) * i;
        ctx.beginPath();
        ctx.moveTo(padding.left, y);
        ctx.lineTo(width - padding.right, y);
        ctx.stroke();
    }

    // 蜡烛
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

        ctx.beginPath();
        ctx.moveTo(x, highY);
        ctx.lineTo(x, lowY);
        ctx.strokeStyle = color;
        ctx.lineWidth = 1;
        ctx.stroke();

        const bodyTop = Math.min(openY, closeY);
        const bodyHeight = Math.max(Math.abs(closeY - openY), 1);
        ctx.fillStyle = color;
        ctx.fillRect(x - barWidth / 2, bodyTop, barWidth, bodyHeight);
    });

    // 均线
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
// 设置中心入口（6个）
// ============================================================
const tools = [
    {
        name: "盈亏分析",
        url: "pnl.html",
        icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
        </svg>`,
        color: '#7C3AED',
        bg: 'rgba(124,58,237,0.1)',
        desc: '个人数据'
    },
    {
        name: "数据总览",
        url: "overview.html",
        icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
            <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/>
            <rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/>
        </svg>`,
        color: '#3B82F6',
        bg: 'rgba(59,130,246,0.1)',
        desc: '社区数据'
    },
    {
        name: "社区模型",
        url: "tokenomics.html",
        icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="10"/>
            <path d="M12 8v4l3 3"/>
        </svg>`,
        color: '#F59E0B',
        bg: 'rgba(245,158,11,0.1)',
        desc: '代币经济'
    },
    {
        name: "行情中心",
        url: "market.html",
        icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/>
            <polyline points="17 6 23 6 23 12"/>
        </svg>`,
        color: '#10B981',
        bg: 'rgba(16,185,129,0.1)',
        desc: '实时行情'
    },
    {
        name: "钱包备份",
        url: "backup.html",
        icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
        </svg>`,
        color: '#EF4444',
        bg: 'rgba(239,68,68,0.08)',
        desc: '安全备份'
    },
    {
        name: "修改密码",
        url: "password.html",
        icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
            <path d="M7 11V7a5 5 0 0110 0v4"/>
        </svg>`,
        color: '#6366F1',
        bg: 'rgba(99,102,241,0.1)',
        desc: '账户安全'
    }
];

function generateTools() {
    const container = document.getElementById('toolsGrid');
    if (!container) return;
    container.innerHTML = '';
    tools.forEach(t => {
        const div = document.createElement('div');
        div.className = 'tool-card';
        div.innerHTML = `
            <div class="tool-icon-svg" style="background:${t.bg};color:${t.color};width:44px;height:44px;border-radius:16px;display:flex;align-items:center;justify-content:center;margin:0 auto 8px;">
                ${t.icon}
            </div>
            <div class="tool-name" style="font-size:0.78rem;font-weight:700;color:#2D1B69;">${t.name}</div>
            <div style="font-size:0.62rem;color:#94A3B8;margin-top:2px;font-weight:600;">${t.desc}</div>
        `;
        div.style.cssText = 'display:flex;flex-direction:column;align-items:center;padding:14px 8px;background:rgba(255,255,255,0.78);border:1px solid rgba(255,255,255,0.9);border-radius:20px;cursor:pointer;transition:all 0.2s;box-shadow:0 3px 12px rgba(45,27,105,0.06);';
        div.addEventListener('click', () => {
            if (t.url) window.location.href = t.url;
        });
        div.addEventListener('touchstart', () => { div.style.transform = 'scale(0.97)'; }, { passive: true });
        div.addEventListener('touchend', () => { div.style.transform = ''; });
        container.appendChild(div);
    });
    // 设置 SVG 图标尺寸
    container.querySelectorAll('.tool-icon-svg svg').forEach(svg => {
        svg.style.width = '22px';
        svg.style.height = '22px';
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

    // 通用按钮事件
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
