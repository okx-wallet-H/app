/**
 * 海豚社区 - OKX Web3 API 代理服务
 * 保护 API 密钥，前端通过本地代理调用 OKX API
 */
const http = require('http');
const https = require('https');
const crypto = require('crypto');
const url = require('url');
const fs = require('fs');
const path = require('path');

// ============================================================
// OKX Web3 API 配置
// ============================================================
const OKX_CONFIG = {
    apiKey: '39b84d18-8693-4554-9a37-170cbc7a5812',
    secretKey: 'A07D90C0C2A85CE957A1619D8DA38E20',
    passphrase: 'Yy133678.',
    baseUrl: 'web3.okx.com'
};

const PORT = 3000;

// ============================================================
// OKX 签名生成
// ============================================================
function getTimestamp() {
    return new Date().toISOString().replace(/(\.\d{3})\d*Z/, '$1Z');
}

function sign(timestamp, method, requestPath, body = '') {
    const message = timestamp + method + requestPath + body;
    const hmacObj = crypto.createHmac('sha256', OKX_CONFIG.secretKey);
    hmacObj.update(message);
    return hmacObj.digest('base64');
}

function getOkxHeaders(method, requestPath, body = '') {
    const timestamp = getTimestamp();
    return {
        'Content-Type': 'application/json',
        'OK-ACCESS-KEY': OKX_CONFIG.apiKey,
        'OK-ACCESS-SIGN': sign(timestamp, method, requestPath, body),
        'OK-ACCESS-PASSPHRASE': OKX_CONFIG.passphrase,
        'OK-ACCESS-TIMESTAMP': timestamp
    };
}

// ============================================================
// HTTPS 请求封装
// ============================================================
function okxRequest(method, apiPath, body = null) {
    return new Promise((resolve, reject) => {
        const bodyStr = body ? JSON.stringify(body) : '';
        const headers = getOkxHeaders(method, apiPath, method === 'POST' ? bodyStr : '');

        const options = {
            hostname: OKX_CONFIG.baseUrl,
            path: apiPath,
            method: method,
            headers: headers
        };

        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    resolve(JSON.parse(data));
                } catch (e) {
                    resolve({ code: '-1', msg: 'Parse error', raw: data.substring(0, 200) });
                }
            });
        });

        req.on('error', (e) => {
            reject({ code: '-1', msg: e.message });
        });

        req.setTimeout(15000, () => {
            req.destroy();
            reject({ code: '-1', msg: 'Request timeout' });
        });

        if (method === 'POST' && bodyStr) {
            req.write(bodyStr);
        }
        req.end();
    });
}

// ============================================================
// MIME 类型
// ============================================================
const MIME_TYPES = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
    '.webp': 'image/webp'
};

// ============================================================
// 静态文件服务
// ============================================================
function serveStaticFile(filePath, res) {
    const safePath = path.resolve(__dirname, filePath.replace(/^\//, ''));
    if (!safePath.startsWith(path.resolve(__dirname))) {
        res.writeHead(403);
        res.end('Forbidden');
        return;
    }

    fs.readFile(safePath, (err, data) => {
        if (err) {
            res.writeHead(404);
            res.end('Not Found');
            return;
        }
        const ext = path.extname(safePath).toLowerCase();
        const contentType = MIME_TYPES[ext] || 'application/octet-stream';
        res.writeHead(200, { 'Content-Type': contentType });
        res.end(data);
    });
}

// ============================================================
// API 路由处理
// ============================================================
async function handleApiRequest(pathname, query, req, res) {
    const corsHeaders = {
        'Content-Type': 'application/json; charset=utf-8',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type'
    };

    try {
        let result;

        switch (pathname) {
            // 热门代币
            case '/api/hot-tokens': {
                const rankingType = query.rankingType || '4';
                const chainIndex = query.chainIndex || '';
                const rankBy = query.rankBy || '';
                const timeFrame = query.rankingTimeFrame || '2';
                let apiPath = `/api/v6/dex/market/token/hot-token?rankingType=${rankingType}&rankingTimeFrame=${timeFrame}`;
                if (chainIndex) apiPath += `&chainIndex=${chainIndex}`;
                if (rankBy) apiPath += `&rankBy=${rankBy}`;
                result = await okxRequest('GET', apiPath);
                break;
            }

            // 代币榜单
            case '/api/token-toplist': {
                const chains = query.chains || '1';
                const sortBy = query.sortBy || '5';
                const timeFrame = query.timeFrame || '4';
                const apiPath = `/api/v6/dex/market/token/toplist?chains=${chains}&sortBy=${sortBy}&timeFrame=${timeFrame}`;
                result = await okxRequest('GET', apiPath);
                break;
            }

            // 代币搜索
            case '/api/token-search': {
                const chains = query.chains || '1';
                const search = query.search || '';
                if (!search) {
                    res.writeHead(400, corsHeaders);
                    res.end(JSON.stringify({ code: '-1', msg: 'search parameter required' }));
                    return;
                }
                const apiPath = `/api/v6/dex/market/token/search?chains=${encodeURIComponent(chains)}&search=${encodeURIComponent(search)}`;
                result = await okxRequest('GET', apiPath);
                break;
            }

            // 代币基础信息 (POST)
            case '/api/token-basic-info': {
                const chainIndex = query.chainIndex || '1';
                const address = query.address || '';
                if (!address) {
                    res.writeHead(400, corsHeaders);
                    res.end(JSON.stringify({ code: '-1', msg: 'address parameter required' }));
                    return;
                }
                const body = [{ chainIndex, tokenContractAddress: address }];
                result = await okxRequest('POST', '/api/v6/dex/market/token/basic-info', body);
                break;
            }

            // 代币交易信息 (POST)
            case '/api/token-price-info': {
                const chainIndex = query.chainIndex || '1';
                const address = query.address || '';
                if (!address) {
                    res.writeHead(400, corsHeaders);
                    res.end(JSON.stringify({ code: '-1', msg: 'address parameter required' }));
                    return;
                }
                const body = [{ chainIndex, tokenContractAddress: address }];
                result = await okxRequest('POST', '/api/v6/dex/market/price-info', body);
                break;
            }

            // 代币交易活动
            case '/api/token-trades': {
                const chainIndex = query.chainIndex || '1';
                const address = query.tokenContractAddress || '';
                const limit = query.limit || '50';
                const tagFilter = query.tagFilter || '';
                if (!address) {
                    res.writeHead(400, corsHeaders);
                    res.end(JSON.stringify({ code: '-1', msg: 'tokenContractAddress parameter required' }));
                    return;
                }
                let apiPath = `/api/v6/dex/market/trades?chainIndex=${chainIndex}&tokenContractAddress=${encodeURIComponent(address)}&limit=${limit}`;
                if (tagFilter) apiPath += `&tagFilter=${tagFilter}`;
                if (query.after) apiPath += `&after=${query.after}`;
                result = await okxRequest('GET', apiPath);
                break;
            }

            // 代币持有者信息
            case '/api/token-holders': {
                const chainIndex = query.chainIndex || '1';
                const address = query.tokenContractAddress || '';
                const tagFilter = query.tagFilter || '';
                if (!address) {
                    res.writeHead(400, corsHeaders);
                    res.end(JSON.stringify({ code: '-1', msg: 'tokenContractAddress parameter required' }));
                    return;
                }
                let apiPath = `/api/v6/dex/market/token/holder?chainIndex=${chainIndex}&tokenContractAddress=${encodeURIComponent(address)}`;
                if (tagFilter) apiPath += `&tagFilter=${tagFilter}`;
                result = await okxRequest('GET', apiPath);
                break;
            }

            default:
                res.writeHead(404, corsHeaders);
                res.end(JSON.stringify({ code: '-1', msg: 'API not found' }));
                return;
        }

        res.writeHead(200, corsHeaders);
        res.end(JSON.stringify(result));

    } catch (error) {
        res.writeHead(500, corsHeaders);
        res.end(JSON.stringify({ code: '-1', msg: error.message || 'Server error' }));
    }
}

// ============================================================
// HTTP 服务器
// ============================================================
const server = http.createServer((req, res) => {
    const parsedUrl = url.parse(req.url, true);
    const pathname = parsedUrl.pathname;
    const query = parsedUrl.query;

    // CORS preflight
    if (req.method === 'OPTIONS') {
        res.writeHead(204, {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type'
        });
        res.end();
        return;
    }

    // API 路由
    if (pathname.startsWith('/api/')) {
        handleApiRequest(pathname, query, req, res);
        return;
    }

    // 静态文件
    let filePath = pathname === '/' ? '/index.html' : pathname;
    serveStaticFile(filePath, res);
});

server.listen(PORT, '0.0.0.0', () => {
    console.log(`海豚社区服务器启动: http://localhost:${PORT}`);
    console.log('API 代理已就绪，OKX Web3 API 密钥已保护');
});
