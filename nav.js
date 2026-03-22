/**
 * 全局底部导航栏 SVG 图标渲染
 * 在各页面 <script src="common.js"></script> 之后引入
 * 自动替换 .bottom-nav 中的 emoji 图标为 SVG
 */

// SVG 图标定义
const NAV_ICONS = {
    home: `<svg viewBox="0 0 24 24" fill="none">
        <path d="M3 9.5L12 3l9 6.5V20a1 1 0 01-1 1H5a1 1 0 01-1-1V9.5z" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
        <path d="M9 21V12h6v9" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>`,
    stake: `<svg viewBox="0 0 24 24" fill="none">
        <path d="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 17l-6.2 4.3 2.4-7.4L2 9.4h7.6L12 2z" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>`,
    contest: `<svg viewBox="0 0 24 24" fill="none">
        <path d="M8 21h8M12 17v4M7 4H4a1 1 0 00-1 1v3a5 5 0 005 5h0M17 4h3a1 1 0 011 1v3a5 5 0 01-5 5h0" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
        <path d="M7 4h10v8a5 5 0 01-10 0V4z" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>`,
    im: `<svg viewBox="0 0 24 24" fill="none">
        <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2v10z" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
        <circle cx="9" cy="10" r="1" fill="currentColor" stroke="none"/>
        <circle cx="12" cy="10" r="1" fill="currentColor" stroke="none"/>
        <circle cx="15" cy="10" r="1" fill="currentColor" stroke="none"/>
    </svg>`,
    wallet: `<svg viewBox="0 0 24 24" fill="none">
        <rect x="2" y="5" width="20" height="16" rx="2" stroke-width="1.8"/>
        <path d="M2 10h20" stroke-width="1.8" stroke-linecap="round"/>
        <circle cx="17" cy="15" r="1.5" fill="currentColor" stroke="none"/>
    </svg>`
};

// H 字母头像 SVG 生成器
function createHAvatar(size = 48, borderRadius = 18) {
    const s = size;
    const r = borderRadius;
    return `<div class="h-avatar" style="width:${s}px;height:${s}px;border-radius:${r}px;">
        <svg width="${Math.round(s*0.52)}" height="${Math.round(s*0.52)}" viewBox="0 0 26 26" fill="none" xmlns="http://www.w3.org/2000/svg">
            <text x="13" y="20" text-anchor="middle" font-family="'SF Pro Display','Inter',system-ui,sans-serif" font-weight="800" font-size="20" fill="white" letter-spacing="-0.5">H</text>
        </svg>
    </div>`;
}

// 渲染底部导航栏 SVG 图标
(function renderNavIcons() {
    const navMap = [
        { href: 'index.html',   icon: 'home',    label: '首页' },
        { href: 'stake.html',   icon: 'stake',   label: '质押' },
        { href: 'contest.html', icon: 'contest', label: '交易赛' },
        { href: 'im.html',      icon: 'im',      label: 'IM' },
        { href: 'wallet.html',  icon: 'wallet',  label: '钱包' },
    ];

    const nav = document.querySelector('.bottom-nav');
    if (!nav) return;

    // 判断当前页面
    const currentPage = location.pathname.split('/').pop() || 'index.html';

    nav.innerHTML = navMap.map(item => {
        const isActive = currentPage === item.href ? 'active' : '';
        return `<a href="${item.href}" class="nav-item ${isActive}">
            <div class="nav-icon">${NAV_ICONS[item.icon]}</div>
            <span>${item.label}</span>
        </a>`;
    }).join('');
})();

// 全局 H 头像替换：将页面中 class="profile-avatar" 的元素替换为 H 头像
(function replaceProfileAvatars() {
    document.querySelectorAll('.profile-avatar').forEach(el => {
        // 只替换内容为 emoji 的默认头像
        const txt = el.textContent.trim();
        if (txt === '🐟' || txt === '' || /^\p{Emoji}$/u.test(txt)) {
            el.innerHTML = `<svg width="36" height="36" viewBox="0 0 36 36" fill="none">
                <text x="18" y="26" text-anchor="middle" font-family="'SF Pro Display','Inter',system-ui,sans-serif" font-weight="800" font-size="26" fill="white" letter-spacing="-0.5">H</text>
            </svg>`;
            el.style.background = 'linear-gradient(135deg, #2D1B69 0%, #7C3AED 60%, #A855F7 100%)';
        }
    });
})();
