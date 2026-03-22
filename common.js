// 热门代币生成
const hotTokens = [
    { symbol: 'H', price: '0.00552 U', change: '+5.67%', up: true },
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

// K线图绘制
function drawKline(canvasId) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const width = canvas.clientWidth, height = canvas.clientHeight;
    canvas.width = width; canvas.height = height;
    const data = [];
    let price = 0.0055;
    for (let i = 0; i < 30; i++) {
        let change = (Math.random() - 0.5) * 0.0004;
        let open = price;
        let close = price + change;
        let high = Math.max(open, close) + Math.random() * 0.0002;
        let low = Math.min(open, close) - Math.random() * 0.0002;
        data.push({ open, high, low, close });
        price = close;
    }
    const minPrice = Math.min(...data.map(d => d.low));
    const maxPrice = Math.max(...data.map(d => d.high));
    const yScale = height / (maxPrice - minPrice);
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

// 为页面添加导航高亮（根据当前路径）
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
    if (document.getElementById('priceKline')) drawKline('priceKline');
    highlightCurrentNav();

    // 绑定按钮点击模拟（仅演示）
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
    const toolCards = document.querySelectorAll('.tool-card');
    toolCards.forEach(card => {
        if (!card.hasAttribute('data-listener')) {
            card.setAttribute('data-listener', 'true');
            card.addEventListener('click', () => alert('功能开发中'));
        }
    });
    const chatItems = document.querySelectorAll('.chat-item');
    chatItems.forEach(item => {
        if (!item.hasAttribute('data-listener')) {
            item.setAttribute('data-listener', 'true');
            item.addEventListener('click', () => alert('进入聊天室（演示版）'));
        }
    });
    const tokenCards = document.querySelectorAll('.token-card');
    tokenCards.forEach(card => {
        if (!card.hasAttribute('data-listener')) {
            card.setAttribute('data-listener', 'true');
            card.addEventListener('click', () => alert('更多代币信息开发中'));
        }
    });
});