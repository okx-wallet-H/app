// OKX Web3 API 前端直连（使用 Web Crypto API 签名）
// 支持 GitHub Pages 纯静态部署，无需后端代理
// ============================================================

const OKX_API = {
    // Supabase Edge Function 配置
    _config: {
        baseUrl: 'https://brydhwbiypnnktuwawpq.supabase.co/functions/v1/okx-proxy'
    },

    // 缓存
    _cache: {},
    _cacheExpiry: {},
    _pending: {},

    // ============================================================
    // 通用请求（通过 Supabase 代理）
    // ============================================================
    async _request(apiPath, method = 'GET', body = null) {
        // 提取 action
        let action = '';
        if (apiPath.includes('/hot-token')) action = 'hot-tokens';
        else if (apiPath.includes('/toplist')) action = 'token-toplist';
        else if (apiPath.includes('/search')) action = 'token-search';
        else if (apiPath.includes('/basic-info')) action = 'token-basic-info';
        else if (apiPath.includes('/price-info')) action = 'token-price-info';
        else if (apiPath.includes('/trades')) action = 'token-trades';
        else if (apiPath.includes('/holder')) action = 'token-holders';
        else if (apiPath.includes('/total-value-by-address')) action = 'wallet-total-value';
        else if (apiPath.includes('/all-token-balances-by-address')) action = 'wallet-assets';
        else if (apiPath.includes('/token-balance-by-address')) action = 'wallet-token-balance';

        // 提取参数
        const urlObj = new URL('https://dummy.com' + apiPath);
        const params = new URLSearchParams(urlObj.search);
        params.set('action', action);

        const finalUrl = `${this._config.baseUrl}?${params.toString()}`;
        const cacheKey = finalUrl + (body ? JSON.stringify(body) : '');

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

                const resp = await fetch(finalUrl, {
                    method: 'GET', // Edge Function 统一用 GET 接收 action 参数
                    signal: controller.signal
                });
                clearTimeout(timeoutId);

                const data = await resp.json();
                if (data.code === '0' && data.data) {
                    this._cache[cacheKey] = data.data;
                    this._cacheExpiry[cacheKey] = Date.now() + 30000;
                    return data.data;
                }
                return null;
            } catch (e) {
                console.error('OKX API Proxy Error:', e.message);
                return null;
            } finally {
                delete this._pending[cacheKey];
            }
        };

        this._pending[cacheKey] = doFetch();
        return this._pending[cacheKey];
    },

    // 映射方法
    async _get(apiPath) { return this._request(apiPath, 'GET'); },
    async _post(apiPath, body) { return this._request(apiPath, 'POST', body); },

    // ============================================================
    // 兼容旧的 request 方法（供 common.js 中的 renderHotTokens 调用）
    // ============================================================
    async request(apiPath) {
        return this._get(apiPath);
    },

    // ============================================================
    // 热门代币 API
    // ============================================================
    async getHotTokens(rankingType = '4') {
        // rankingType: 1=涨幅榜, 2=跌幅榜, 3=新上线, 4=热门
        return this._get(`/api/v6/dex/market/token/hot-token?rankingType=${rankingType}`);
    },

    // ============================================================
    // 代币榜单 API
    // ============================================================
    async getTokenTopList(rankingType = '1', chainIndex = '196') {
        return this._get(`/api/v6/dex/market/token/toplist?rankingType=${rankingType}&chainIndex=${chainIndex}`);
    },

    // ============================================================
    // 代币搜索 API
    // ============================================================
    async searchToken(keyword, chainIndex = '196') {
        if (!keyword) return null;
        return this._get(`/api/v6/dex/market/token/search?keyword=${encodeURIComponent(keyword)}&chainIndex=${chainIndex}`);
    },

    // ============================================================
    // 代币基础信息
    // ============================================================
    async getTokenBasicInfo(address, chainIndex = '196') {
        if (!address) return null;
        return this._get(`/api/v6/dex/market/token/basic-info?chainIndex=${chainIndex}&tokenContractAddress=${encodeURIComponent(address)}`);
    },

    // ============================================================
    // 代币价格/交易信息
    // ============================================================
    async getTokenPriceInfo(address, chainIndex = '196') {
        if (!address) return null;
        return this._get(`/api/v6/dex/market/token/price-info?chainIndex=${chainIndex}&tokenContractAddress=${encodeURIComponent(address)}`);
    },

    // ============================================================
    // 代币交易活动
    // ============================================================
    async getTokenTrades(address, chainIndex = '196', limit = 20) {
        if (!address) return null;
        return this._get(`/api/v6/dex/market/token/trades?chainIndex=${chainIndex}&tokenContractAddress=${encodeURIComponent(address)}&limit=${limit}`);
    },

    // ============================================================
    // 代币持有者信息
    // ============================================================
    async getTokenHolders(address, chainIndex = '196') {
        if (!address) return null;
        return this._get(`/api/v6/dex/market/token/holder?chainIndex=${chainIndex}&tokenContractAddress=${encodeURIComponent(address)}`);
    },

    // ============================================================
    // 钱包余额 API
    // ============================================================

    // 获取总估值
    async getWalletTotalValue(address, chains = '1,56,137,196,8453,42161') {
        if (!address) return null;
        return this._get(`/api/v6/dex/balance/total-value-by-address?address=${address}&chains=${chains}`);
    },

    // 获取资产明细 (所有代币余额)
    async getWalletAssets(address, chains = '1,56,137,196,8453,42161') {
        if (!address) return null;
        return this._get(`/api/v6/dex/balance/all-token-balances-by-address?address=${address}&chains=${chains}`);
    },

    // 获取特定代币余额
    async getWalletTokenBalance(address, chainIndex, tokenContractAddress) {
        if (!address || !tokenContractAddress) return null;
        return this._get(`/api/v6/dex/balance/token-balance-by-address?address=${address}&chainIndex=${chainIndex}&tokenContractAddress=${tokenContractAddress}`);
    },

    // ============================================================
    // 工具函数
    // ============================================================

    // 获取链名称
    getChainName(chainIndex) {
        const chains = {
            '1': 'Ethereum',
            '56': 'BNB Chain',
            '137': 'Polygon',
            '196': 'X Layer',
            '8453': 'Base',
            '42161': 'Arbitrum One',
            '10': 'Optimism',
            '43114': 'Avalanche',
            '250': 'Fantom',
            '324': 'zkSync Era'
        };
        return chains[chainIndex] || `Chain ${chainIndex}`;
    },

    // 缩短地址
    shortAddress(addr) {
        if (!addr) return '';
        if (addr.length <= 10) return addr;
        return addr.slice(0, 6) + '...' + addr.slice(-4);
    },

    // 格式化价格（省略零格式）
    formatPrice(price) {
        const p = parseFloat(price);
        if (isNaN(p) || p === 0) return '--';
        if (p >= 1000) return '$' + p.toLocaleString('en-US', { maximumFractionDigits: 2 });
        if (p >= 1) return '$' + p.toFixed(4);
        if (p >= 0.01) return '$' + p.toFixed(6);

        // 处理极小价格，使用下标零格式
        const str = p.toFixed(20);
        const match = str.match(/^0\.0+(?=[1-9])/);
        if (match) {
            const zeros = match[0].length - 2;
            if (zeros >= 4) {
                const subDigits = ['₀', '₁', '₂', '₃', '₄', '₅', '₆', '₇', '₈', '₉'];
                const subStr = zeros.toString().split('').map(d => subDigits[parseInt(d)]).join('');
                const remain = str.slice(match[0].length, match[0].length + 4);
                return `$0.0${subStr}${remain}`;
            }
        }
        return '$' + p.toFixed(8);
    }
};

// 导出到全局
window.OKX_API = OKX_API;
