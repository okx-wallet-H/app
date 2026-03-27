// ============================================================
// 海豚社区 - okx-api.js  v4.0
// OKX Web3 API 前端调用封装（通过 Supabase Edge Function 代理）
// 修复：getRealHotTokens / getToplist / searchTokens / formatChange 等
// ============================================================
const OKX_API = {
    // Supabase Edge Function 代理地址
    edgeProxy: 'https://pheeyaobcvdlujmrzouj.supabase.co/functions/v1/okx-proxy',
    // 缓存（60秒有效）
    _cache: {},
    _cacheExpiry: {},
    _pending: {},
    // ============================================================
    // 通用 GET 请求（到 Edge Function，使用 ?action= 参数）
    // ============================================================
    async getEdge(action, params = {}) {
        const qs = Object.entries({ action, ...params })
            .filter(([, v]) => v !== undefined && v !== null && v !== '')
            .map(([k, v]) => encodeURIComponent(k) + '=' + encodeURIComponent(v))
            .join('&');
        const url = this.edgeProxy + '?' + qs;
        const cacheKey = url;
        if (this._cache[cacheKey] && this._cacheExpiry[cacheKey] > Date.now()) {
            return this._cache[cacheKey];
        }
        if (this._pending[cacheKey]) return this._pending[cacheKey];
        const doFetch = async () => {
            try {
                const ctrl = new AbortController();
                const tid = setTimeout(() => ctrl.abort(), 15000);
                const resp = await fetch(url, { method: 'GET', signal: ctrl.signal });
                clearTimeout(tid);
                const data = await resp.json();
                if (data.code === '0' && data.data !== undefined) {
                    this._cache[cacheKey] = data.data;
                    this._cacheExpiry[cacheKey] = Date.now() + 60000;
                    return data.data;
                }
                console.warn('OKX Edge GET', action, data.code, data.msg);
                return null;
            } catch (e) {
                console.error('OKX Edge GET', action, e.message);
                return null;
            } finally { delete this._pending[cacheKey]; }
        };
        this._pending[cacheKey] = doFetch();
        return this._pending[cacheKey];
    },
    // ============================================================
    // 热门代币（真实 hot-tokens 接口）
    // options: { chainIndex, rankingType, rankingTimeFrame, rankBy, limit }
    // ============================================================
    async getRealHotTokens(options = {}) {
        const params = {
            rankingType: options.rankingType || '4',
            rankingTimeFrame: options.rankingTimeFrame || '4',
        };
        if (options.chainIndex) params.chainIndex = options.chainIndex;
        if (options.rankBy) params.rankBy = options.rankBy;
        if (options.limit) params.limit = options.limit;
        const raw = await this.getEdge('hot-tokens', params);
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
    // 兼容旧方法
    // ============================================================
    async getHotTokens(options = {}) { return this.getRealHotTokens(options); },
    // ============================================================
    // 代币榜单（用 hot-tokens 替代，因 token-toplist 接口有问题）
    // options: { chains, sortBy, timeFrame }
    // sortBy: '2'=涨跌幅, '5'=成交量, '6'=市值
    // ============================================================
    async getToplist(options = {}) {
        const sortBy = options.sortBy || '2';
        const timeFrame = options.timeFrame || '4';
        const chains = options.chains || '196,56';
        const rankByMap = { '2': '2', '5': '5', '6': '6' };
        const rankBy = rankByMap[sortBy] || '2';
        const chainList = chains.split(',').map(c => c.trim()).filter(Boolean);
        const allResults = [];
        for (const chainIndex of chainList) {
            const raw = await this.getEdge('hot-tokens', { rankingType: '4', rankingTimeFrame: timeFrame, rankBy, chainIndex });
            if (raw && Array.isArray(raw)) allResults.push(...raw);
        }
        if (allResults.length === 0) return null;
        if (sortBy === '2') allResults.sort((a, b) => parseFloat(b.change || 0) - parseFloat(a.change || 0));
        else if (sortBy === '5') allResults.sort((a, b) => parseFloat(b.volume || 0) - parseFloat(a.volume || 0));
        else if (sortBy === '6') allResults.sort((a, b) => parseFloat(b.marketCap || 0) - parseFloat(a.marketCap || 0));
        return allResults.map(t => ({
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
        }));
    },
    // ============================================================
    // 代币搜索（用 hot-tokens 过滤，因 token-search 接口有问题）
    // ============================================================
    async searchTokens(keyword, chains) {
        if (!keyword || !keyword.trim()) return null;
        const kw = keyword.trim().toUpperCase();
        const chainList = (!chains || chains === 'all') ? ['196', '56', '1'] : chains.split(',').map(c => c.trim());
        const allResults = [];
        for (const chainIndex of chainList) {
            const raw = await this.getEdge('hot-tokens', { rankingType: '4', rankingTimeFrame: '4', chainIndex });
            if (raw && Array.isArray(raw)) {
                const matched = raw.filter(t =>
                    (t.tokenSymbol || '').toUpperCase().includes(kw) ||
                    (t.tokenContractAddress || '').toLowerCase().includes(keyword.toLowerCase())
                );
                allResults.push(...matched);
            }
        }
        if (allResults.length === 0) return null;
        return allResults.map(t => ({
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
        }));
    },
    // ============================================================
    // 代币价格/交易信息（用 wallet-assets + hot-tokens 组合替代）
    // ============================================================
    async getTokenPriceInfo(address, chainIndex) {
        if (!address) return null;
        chainIndex = chainIndex || '196';
        let price = '0', change = '0', volume = '0', marketCap = '0', holders = '0', liquidity = '0';
        try {
            // 1. 用 wallet-assets 获取价格
            const assetsRaw = await this.getEdge('wallet-assets', { address, chains: chainIndex });
            if (assetsRaw && Array.isArray(assetsRaw)) {
                for (const chain of assetsRaw) {
                    for (const asset of (chain.tokenAssets || [])) {
                        if ((asset.tokenContractAddress || '').toLowerCase() === address.toLowerCase()) {
                            price = asset.tokenPrice || '0';
                        }
                    }
                }
                if (price === '0' && assetsRaw[0] && assetsRaw[0].tokenAssets && assetsRaw[0].tokenAssets[0]) {
                    price = assetsRaw[0].tokenAssets[0].tokenPrice || '0';
                }
            }
            // 2. 用 hot-tokens 获取涨跌幅、成交量等
            const hotRaw = await this.getEdge('hot-tokens', { rankingType: '4', rankingTimeFrame: '4', chainIndex });
            if (hotRaw && Array.isArray(hotRaw)) {
                const found = hotRaw.find(t => (t.tokenContractAddress || '').toLowerCase() === address.toLowerCase());
                if (found) {
                    if (price === '0') price = found.price || '0';
                    change = found.change || '0';
                    volume = found.volume || '0';
                    marketCap = found.marketCap || '0';
                    holders = found.holders || '0';
                    liquidity = found.liquidity || '0';
                }
            }
            // 3. 用 token-holders 获取持有者数量
            if (holders === '0') {
                const holdersRaw = await this.getEdge('token-holders', { chainIndex, tokenContractAddress: address });
                if (holdersRaw && Array.isArray(holdersRaw)) holders = String(holdersRaw.length);
            }
        } catch (e) {
            console.error('getTokenPriceInfo 失败:', e.message);
        }
        return {
            price, priceChange5M: '0', priceChange1H: '0', priceChange4H: '0', priceChange24H: change,
            volume5M: '0', volume1H: '0', volume4H: '0', volume24H: volume,
            txs5M: '0', txs1H: '0', txs4H: '0', txs24H: '0',
            maxPrice: '0', minPrice: '0', marketCap, circSupply: '0', liquidity, holders,
        };
    },
    // ============================================================
    // 代币持有者信息（用 token-holders 接口）
    // ============================================================
    async getTokenHolders(address, chainIndex) {
        if (!address) return null;
        chainIndex = chainIndex || '196';
        return this.getEdge('token-holders', { chainIndex, tokenContractAddress: address });
    },
    // ============================================================
    // 代币基础信息（接口不可用，返回 null）
    // ============================================================
    async getTokenBasicInfo(address, chainIndex) { return null; },
    // ============================================================
    // 代币交易活动（接口不可用，返回 null）
    // ============================================================
    async getTokenTrades(address, chainIndex, limit) { return null; },
    // ============================================================
    // 钱包资产
    // ============================================================
    async getWalletAssets(address, chains) {
        if (!address) return null;
        return this.getEdge('wallet-assets', { address, chains: chains || '196,56' });
    },
    async getWalletTotalValue(address, chains) {
        if (!address) return null;
        return this.getEdge('wallet-total-value', { address, chains: chains || '196,56' });
    },
    // ============================================================
    // 工具函数
    // ============================================================
    formatPrice(price) {
        const p = parseFloat(price);
        if (isNaN(p) || p === 0) return '--';
        if (p >= 1000) return '$' + p.toLocaleString('en-US', { maximumFractionDigits: 2 });
        if (p >= 1) return '$' + p.toFixed(4);
        if (p >= 0.01) return '$' + p.toFixed(6);
        const str = p.toFixed(20);
        const match = str.match(/^0\.(0+)/);
        if (match) {
            const zeros = match[1].length;
            if (zeros >= 4) {
                const subDigits = ['₀','₁','₂','₃','₄','₅','₆','₇','₈','₉'];
                const subStr = zeros.toString().split('').map(d => subDigits[+d]).join('');
                const remain = str.slice(2 + zeros, 2 + zeros + 4);
                return '$0.0' + subStr + remain;
            }
        }
        return '$' + p.toFixed(8);
    },
    formatChange(change) {
        const c = parseFloat(change);
        if (isNaN(c)) return { text: '--', class: 'flat' };
        const sign = c >= 0 ? '+' : '';
        return { text: sign + c.toFixed(2) + '%', class: c > 0 ? 'up' : c < 0 ? 'down' : 'flat' };
    },
    formatVolume(vol) {
        const v = parseFloat(vol);
        if (isNaN(v) || v === 0) return '--';
        if (v >= 1e9) return '$' + (v / 1e9).toFixed(2) + 'B';
        if (v >= 1e6) return '$' + (v / 1e6).toFixed(2) + 'M';
        if (v >= 1e3) return '$' + (v / 1e3).toFixed(2) + 'K';
        return '$' + v.toFixed(2);
    },
    formatMarketCap(mcap) { return this.formatVolume(mcap); },
    formatHolders(count) {
        const n = parseInt(count);
        if (isNaN(n)) return '--';
        if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M';
        if (n >= 1e3) return (n / 1e3).toFixed(1) + 'K';
        return n.toLocaleString();
    },
    shortAddress(addr) {
        if (!addr || addr.length < 12) return addr || '--';
        return addr.slice(0, 6) + '...' + addr.slice(-4);
    },
    formatTime(timestamp) {
        if (!timestamp) return '--';
        const d = new Date(parseInt(timestamp));
        const diff = (Date.now() - d) / 1000;
        if (diff < 60) return '刚刚';
        if (diff < 3600) return Math.floor(diff / 60) + '分钟前';
        if (diff < 86400) return Math.floor(diff / 3600) + '小时前';
        return (d.getMonth() + 1) + '/' + d.getDate() + ' ' + String(d.getHours()).padStart(2,'0') + ':' + String(d.getMinutes()).padStart(2,'0');
    },
    getChainName(chainIndex) {
        const chains = {
            '1': 'Ethereum', '56': 'BSC', '137': 'Polygon', '196': 'X Layer',
            '42161': 'Arbitrum', '10': 'Optimism', '43114': 'Avalanche', '8453': 'Base',
            '324': 'zkSync', '501': 'Solana', '195': 'X Layer Testnet'
        };
        return chains[String(chainIndex)] || 'Chain ' + chainIndex;
    }
};
window.OKX_API = OKX_API;
