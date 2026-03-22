// ============================================================
// 海豚社区 - okx-api.js
// OKX Web3 API 前端调用封装（通过本地代理 server.js）
// ============================================================

const OKX_API = {
    // 代理服务地址（server.js 运行在同源）
    baseUrl: '',

    // 缓存
    _cache: {},
    _cacheExpiry: {},
    _pending: {},  // 请求去重：同一 URL 只发一次

    // ============================================================
    // 通用请求
    // ============================================================
    async request(endpoint, params = {}) {
        const qs = Object.entries(params)
            .filter(([_, v]) => v !== undefined && v !== null && v !== '')
            .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
            .join('&');
        const url = `${this.baseUrl}/api/${endpoint}${qs ? '?' + qs : ''}`;

        // 缓存检查（30秒有效）
        const cacheKey = url;
        if (this._cache[cacheKey] && this._cacheExpiry[cacheKey] > Date.now()) {
            return this._cache[cacheKey];
        }

        // 请求去重：如果同一 URL 正在请求中，等待已有请求完成
        if (this._pending[cacheKey]) {
            return this._pending[cacheKey];
        }

        const doFetch = async () => {
            try {
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 15000);
                const resp = await fetch(url, { signal: controller.signal });
                clearTimeout(timeoutId);
                const data = await resp.json();

                if (data.code === '0' && data.data) {
                    this._cache[cacheKey] = data.data;
                    this._cacheExpiry[cacheKey] = Date.now() + 30000;
                    return data.data;
                }
                console.warn(`OKX API ${endpoint} 返回:`, data.code, data.msg);
                return null;
            } catch (e) {
                console.error(`OKX API ${endpoint} 请求失败:`, e.message);
                return null;
            } finally {
                delete this._pending[cacheKey];
            }
        };

        this._pending[cacheKey] = doFetch();
        return this._pending[cacheKey];
    },

    // ============================================================
    // 热门代币
    // rankingType: 1=涨幅, 2=跌幅, 3=新币, 4=热门
    // rankingTimeFrame: 1=1h, 2=4h, 3=12h, 4=24h
    // ============================================================
    async getHotTokens(options = {}) {
        return this.request('hot-tokens', {
            rankingType: options.rankingType || '4',
            rankingTimeFrame: options.rankingTimeFrame || '2',
            chainIndex: options.chainIndex || ''
        });
    },

    // ============================================================
    // 代币榜单
    // sortBy: 1=市值, 2=价格, 3=涨幅, 4=跌幅, 5=交易量
    // timeFrame: 1=5m, 2=1h, 3=4h, 4=24h
    // ============================================================
    async getTokenToplist(options = {}) {
        return this.request('token-toplist', {
            chains: options.chains || '196',
            sortBy: options.sortBy || '5',
            timeFrame: options.timeFrame || '4'
        });
    },

    // ============================================================
    // 代币搜索
    // ============================================================
    async searchTokens(keyword, chains = '196') {
        if (!keyword || keyword.trim().length === 0) return null;
        return this.request('token-search', {
            chains: chains,
            search: keyword.trim()
        });
    },

    // ============================================================
    // 代币基础信息 (POST via proxy)
    // ============================================================
    async getTokenBasicInfo(address, chainIndex = '196') {
        return this.request('token-basic-info', {
            chainIndex: chainIndex,
            address: address
        });
    },

    // ============================================================
    // 代币交易信息 (POST via proxy)
    // ============================================================
    async getTokenPriceInfo(address, chainIndex = '196') {
        return this.request('token-price-info', {
            chainIndex: chainIndex,
            address: address
        });
    },

    // ============================================================
    // 代币交易活动
    // ============================================================
    async getTokenTrades(address, chainIndex = '196', limit = 50) {
        return this.request('token-trades', {
            chainIndex: chainIndex,
            tokenContractAddress: address,
            limit: limit
        });
    },

    // ============================================================
    // 代币持有者信息
    // ============================================================
    async getTokenHolders(address, chainIndex = '196') {
        return this.request('token-holders', {
            chainIndex: chainIndex,
            tokenContractAddress: address
        });
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
