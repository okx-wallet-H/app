// ============================================================
// 海豚社区 - okx-api.js
// OKX Web3 API 前端调用封装（通过 Supabase Edge Function 代理）
// ============================================================

const OKX_API = {
    // Supabase Edge Function 代理地址
    edgeProxy: 'https://pheeyaobcvdlujmrzouj.supabase.co/functions/v1/okx-proxy',

    // 缓存（60秒有效）
    _cache: {},
    _cacheExpiry: {},
    _pending: {},

    // ============================================================
    // 通用 POST 请求（到 Edge Function）
    // ============================================================
    async postEdge(route, body = {}) {
        const url = this.edgeProxy + route;
        const cacheKey = url + JSON.stringify(body);

        if (this._cache[cacheKey] && this._cacheExpiry[cacheKey] > Date.now()) {
            return this._cache[cacheKey];
        }
        if (this._pending[cacheKey]) {
            return this._pending[cacheKey];
        }

        const doFetch = async () => {
            try {
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 15000);
                const resp = await fetch(url, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(body),
                    signal: controller.signal
                });
                clearTimeout(timeoutId);
                const data = await resp.json();
                if (data.code === '0' && data.data !== undefined) {
                    this._cache[cacheKey] = data.data;
                    this._cacheExpiry[cacheKey] = Date.now() + 60000;
                    return data.data;
                }
                console.warn(`OKX Edge ${route} 返回:`, data.code, data.msg);
                return null;
            } catch (e) {
                console.error(`OKX Edge ${route} 请求失败:`, e.message);
                return null;
            } finally {
                delete this._pending[cacheKey];
            }
        };

        this._pending[cacheKey] = doFetch();
        return this._pending[cacheKey];
    },

    // ============================================================
    // 热门代币（调用 /trending 接口）
    // rankingType: 1=涨幅, 2=跌幅, 3=新币, 4=热门（此处用 trending）
    // ============================================================
    async getHotTokens(options = {}) {
        const chainIndex = options.chainIndex || 'all';
        const raw = await this.postEdge('/trending', { chainIndex });
        if (!raw || !Array.isArray(raw)) return null;

        // 转换为 market.html 期望的格式
        return raw.map(t => ({
            tokenSymbol: t.symbol,
            tokenName: t.name,
            tokenFullName: t.name,
            tokenLogoUrl: t.logoUrl || '',
            tokenContractAddress: t.tokenContractAddress || '',
            chainIndex: t.chainIndex || '196',
            price: t.price || '0',
            change: t.priceChange24h || '0',
            volume24H: '0',
            volume: '0',
            marketCap: '0',
        }));
    },

    // ============================================================
    // 代币搜索（调用 /search 接口）
    // ============================================================
    async searchTokens(keyword, chains = 'all') {
        if (!keyword || keyword.trim().length === 0) return null;
        // chains 参数可能是 '196,1,56' 格式，取第一个或 'all'
        const chainIndex = chains === 'all' || chains.includes(',') ? 'all' : chains;
        const raw = await this.postEdge('/search', {
            keyword: keyword.trim(),
            chainIndex
        });
        if (!raw || !Array.isArray(raw)) return null;

        // 转换为 market.html 期望的格式
        return raw.map(t => ({
            tokenSymbol: t.symbol,
            tokenName: t.name,
            tokenFullName: t.name,
            tokenLogoUrl: t.logoUrl || '',
            tokenContractAddress: t.contract || t.tokenContractAddress || '',
            chainIndex: t.chain || t.chainIndex || '196',
            price: t.price || '0',
            change: t.priceChange24h || '0',
            volume24H: '0',
            volume: '0',
            marketCap: '0',
        }));
    },

    // ============================================================
    // 代币基础信息（暂时返回 null，等待后续扩展）
    // ============================================================
    async getTokenBasicInfo(address, chainIndex = '196') {
        return null;
    },

    // ============================================================
    // 代币交易信息（暂时返回 null）
    // ============================================================
    async getTokenPriceInfo(address, chainIndex = '196') {
        return null;
    },

    // ============================================================
    // 代币交易活动（暂时返回 null）
    // ============================================================
    async getTokenTrades(address, chainIndex = '196', limit = 50) {
        return null;
    },

    // ============================================================
    // 代币持有者信息（暂时返回 null）
    // ============================================================
    async getTokenHolders(address, chainIndex = '196') {
        return null;
    },

    // ============================================================
    // 工具函数
    // ============================================================

    // 格式化价格（省略零格式）
    formatPrice(price) {
        const p = parseFloat(price);
        if (isNaN(p) || p === 0) return '--';
        if (p >= 1000) return '$' + p.toLocaleString('en-US', { maximumFractionDigits: 2 });
        if (p >= 1) return '$' + p.toFixed(4);
        if (p >= 0.01) return '$' + p.toFixed(6);

        // 省略零格式
        const str = p.toFixed(18);
        const afterDot = str.split('.')[1];
        let zeros = 0;
        for (const c of afterDot) {
            if (c === '0') zeros++;
            else break;
        }
        const sig = afterDot.slice(zeros, zeros + 4);
        return `$0.0{${zeros}}${sig}`;
    },

    // 格式化价格为 HTML（带下标）
    formatPriceHtml(price) {
        const p = parseFloat(price);
        if (isNaN(p) || p === 0) return '--';
        if (p >= 1000) return '$' + p.toLocaleString('en-US', { maximumFractionDigits: 2 });
        if (p >= 1) return '$' + p.toFixed(4);
        if (p >= 0.01) return '$' + p.toFixed(6);

        const str = p.toFixed(18);
        const afterDot = str.split('.')[1];
        let zeros = 0;
        for (const c of afterDot) {
            if (c === '0') zeros++;
            else break;
        }
        const sig = afterDot.slice(zeros, zeros + 4);
        return `$0.0<sub style="font-size:0.6em;opacity:0.7;">${zeros}</sub>${sig}`;
    },

    // 格式化涨跌幅
    formatChange(change) {
        const c = parseFloat(change);
        if (isNaN(c)) return { text: '--', class: 'flat' };
        const sign = c >= 0 ? '+' : '';
        return {
            text: `${sign}${c.toFixed(2)}%`,
            class: c > 0 ? 'up' : c < 0 ? 'down' : 'flat'
        };
    },

    // 格式化成交量
    formatVolume(vol) {
        const v = parseFloat(vol);
        if (isNaN(v) || v === 0) return '--';
        if (v >= 1e9) return '$' + (v / 1e9).toFixed(2) + 'B';
        if (v >= 1e6) return '$' + (v / 1e6).toFixed(2) + 'M';
        if (v >= 1e3) return '$' + (v / 1e3).toFixed(2) + 'K';
        return '$' + v.toFixed(2);
    },

    // 格式化市值
    formatMarketCap(mcap) {
        return this.formatVolume(mcap);
    },

    // 格式化持有者数量
    formatHolders(count) {
        const n = parseInt(count);
        if (isNaN(n)) return '--';
        if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M';
        if (n >= 1e3) return (n / 1e3).toFixed(1) + 'K';
        return n.toLocaleString();
    },

    // 缩短地址
    shortAddress(addr) {
        if (!addr || addr.length < 12) return addr || '--';
        return addr.slice(0, 6) + '...' + addr.slice(-4);
    },

    // 时间格式化
    formatTime(timestamp) {
        if (!timestamp) return '--';
        const d = new Date(parseInt(timestamp));
        const now = new Date();
        const diff = (now - d) / 1000;
        if (diff < 60) return '刚刚';
        if (diff < 3600) return Math.floor(diff / 60) + '分钟前';
        if (diff < 86400) return Math.floor(diff / 3600) + '小时前';
        return d.getMonth() + 1 + '/' + d.getDate() + ' ' + d.getHours().toString().padStart(2, '0') + ':' + d.getMinutes().toString().padStart(2, '0');
    },

    // 获取链名称
    getChainName(chainIndex) {
        const chains = {
            '1': 'Ethereum', '56': 'BSC', '137': 'Polygon', '196': 'X Layer',
            '42161': 'Arbitrum', '10': 'Optimism', '43114': 'Avalanche', '8453': 'Base',
            '324': 'zkSync', '59144': 'Linea', '534352': 'Scroll', '5000': 'Mantle'
        };
        return chains[String(chainIndex)] || `Chain ${chainIndex}`;
    }
};
