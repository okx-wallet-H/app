// ============================================================
// 海豚社区 - okx-api.js  v3.0
// OKX Web3 API 前端调用封装（通过 Supabase Edge Function 代理）
// 新增: /price-info, /hot-tokens, /toplist, /token-basic
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
    // 通用 GET 请求（到 Edge Function）
    // ============================================================
    async getEdge(route, params = {}) {
        const qs = Object.entries(params)
            .filter(([, v]) => v !== undefined && v !== null && v !== '')
            .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
            .join('&');
        const url = this.edgeProxy + route + (qs ? '?' + qs : '');
        const cacheKey = url;

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
                    method: 'GET',
                    signal: controller.signal
                });
                clearTimeout(timeoutId);
                const data = await resp.json();
                if (data.code === '0' && data.data !== undefined) {
                    this._cache[cacheKey] = data.data;
                    this._cacheExpiry[cacheKey] = Date.now() + 60000;
                    return data.data;
                }
                console.warn(`OKX Edge GET ${route} 返回:`, data.code, data.msg);
                return null;
            } catch (e) {
                console.error(`OKX Edge GET ${route} 请求失败:`, e.message);
                return null;
            } finally {
                delete this._pending[cacheKey];
            }
        };

        this._pending[cacheKey] = doFetch();
        return this._pending[cacheKey];
    },

    // ============================================================
    // 热门代币 - 固定列表（X Layer + BSC）含实时价格和24h涨跌幅
    // 调用 /trending 接口（内部使用 price-info v6 API）
    // options.chainIndex: '196' | '56' | 'all'
    // options.rankingType: 忽略（固定列表模式）
    // ============================================================
    async getHotTokens(options = {}) {
        const chainIndex = options.chainIndex || 'all';
        const raw = await this.postEdge('/trending', { chainIndex });
        if (!raw || !Array.isArray(raw)) return null;

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
    // 真实热门代币榜单（v6 hot-token API）
    // rankingType: '4'=Trending(token score), '5'=Xmentioned(Twitter)
    // rankingTimeFrame: '1'=5m, '2'=1h, '3'=4h, '4'=24h
    // rankBy: '2'=价格变化, '5'=交易额, '6'=市值, '12'=社媒分数
    // ============================================================
    async getRealHotTokens(options = {}) {
        const params = {
            rankingType: options.rankingType || '4',
            rankingTimeFrame: options.rankingTimeFrame || '4',
        };
        if (options.chainIndex) params.chainIndex = options.chainIndex;
        if (options.rankBy) params.rankBy = options.rankBy;
        if (options.limit) params.limit = options.limit;

        const raw = await this.getEdge('/hot-tokens', params);
        if (!raw || !Array.isArray(raw)) return null;

        return raw.map(t => ({
            tokenSymbol: t.tokenSymbol,
            tokenName: t.tokenSymbol,
            tokenFullName: t.tokenSymbol,
            tokenLogoUrl: t.tokenLogoUrl || '',
            tokenContractAddress: t.tokenContractAddress || '',
            chainIndex: t.chainIndex || '196',
            price: t.price || '0',
            change: t.change || '0',
            volume24H: t.volume || '0',
            volume: t.volume || '0',
            marketCap: t.marketCap || '0',
            holders: t.holders || '0',
            txs: t.txs || '0',
            txsBuy: t.txsBuy || '0',
            txsSell: t.txsSell || '0',
            liquidity: t.liquidity || '0',
            inflowUsd: t.inflowUsd || '0',
        }));
    },

    // ============================================================
    // 代币榜单（v6 toplist API）
    // sortBy: '2'=涨跌幅, '5'=成交量, '6'=市值
    // timeFrame: '1'=5m, '2'=1h, '3'=4h, '4'=24h
    // chains: '196,56' 逗号分隔
    // ============================================================
    async getToplist(options = {}) {
        const params = {
            chains: options.chains || '196,56',
            sortBy: options.sortBy || '2',
            timeFrame: options.timeFrame || '4',
        };

        const raw = await this.getEdge('/toplist', params);
        if (!raw || !Array.isArray(raw)) return null;

        return raw.map(t => ({
            tokenSymbol: t.tokenSymbol,
            tokenName: t.tokenSymbol,
            tokenFullName: t.tokenSymbol,
            tokenLogoUrl: t.tokenLogoUrl || '',
            tokenContractAddress: t.tokenContractAddress || '',
            chainIndex: t.chainIndex || '196',
            price: t.price || '0',
            change: t.change || '0',
            volume24H: t.volume || '0',
            volume: t.volume || '0',
            marketCap: t.marketCap || '0',
            holders: t.holders || '0',
            txs: t.txs || '0',
            txsBuy: t.txsBuy || '0',
            txsSell: t.txsSell || '0',
        }));
    },

    // ============================================================
    // 代币搜索（调用 /search 接口）
    // ============================================================
    async searchTokens(keyword, chains = 'all') {
        if (!keyword || keyword.trim().length === 0) return null;
        const chainIndex = chains === 'all' || chains.includes(',') ? 'all' : chains;
        const raw = await this.postEdge('/search', {
            keyword: keyword.trim(),
            chainIndex
        });
        if (!raw || !Array.isArray(raw)) return null;

        return raw.map(t => ({
            tokenSymbol: t.symbol,
            tokenName: t.name,
            tokenFullName: t.name,
            tokenLogoUrl: t.logoUrl || '',
            tokenContractAddress: t.tokenContractAddress || '',
            chainIndex: t.chainIndex || '196',
            price: t.price || '0',
            change: t.priceChange24h || '0',
            volume24H: t.volume24H || '0',
            volume: t.volume24H || '0',
            marketCap: t.marketCap || '0',
        }));
    },

    // ============================================================
    // 代币交易信息（price-info，含24h涨跌幅、成交量等）
    // 返回: { price, priceChange24H, priceChange1H, volume24H,
    //         marketCap, holders, liquidity, ... }
    // ============================================================
    async getTokenPriceInfo(address, chainIndex = '196') {
        if (!address) return null;
        const raw = await this.postEdge('/price-info', [{ chainIndex, tokenContractAddress: address }]);
        if (!raw || !Array.isArray(raw) || raw.length === 0) return null;
        const d = raw[0];
        return {
            price: d.price || '0',
            priceChange5M: d.priceChange5M || '0',
            priceChange1H: d.priceChange1H || '0',
            priceChange4H: d.priceChange4H || '0',
            priceChange24H: d.priceChange24H || '0',
            volume5M: d.volume5M || '0',
            volume1H: d.volume1H || '0',
            volume4H: d.volume4H || '0',
            volume24H: d.volume24H || '0',
            txs5M: d.txs5M || '0',
            txs1H: d.txs1H || '0',
            txs4H: d.txs4H || '0',
            txs24H: d.txs24H || '0',
            maxPrice: d.maxPrice || '0',
            minPrice: d.minPrice || '0',
            marketCap: d.marketCap || '0',
            circSupply: d.circSupply || '0',
            liquidity: d.liquidity || '0',
            holders: d.holders || '0',
        };
    },

    // ============================================================
    // 代币基础信息
    // ============================================================
    async getTokenBasicInfo(address, chainIndex = '196') {
        if (!address) return null;
        const raw = await this.postEdge('/token-basic', [{ chainIndex, tokenContractAddress: address }]);
        if (!raw || !Array.isArray(raw) || raw.length === 0) return null;
        return raw[0];
    },

    // ============================================================
    // 代币交易活动（暂时返回 null，等待后续扩展）
    // ============================================================
    async getTokenTrades(address, chainIndex = '196', limit = 50) {
        return null;
    },

    // ============================================================
    // 代币持有者信息（暂时返回 null，等待后续扩展）
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
