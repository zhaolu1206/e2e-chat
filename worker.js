// Cloudflare Workers 信令服务器
// 这个文件用于 Cloudflare Workers 部署

export default {
    async fetch(request, env) {
        // 处理 CORS
        if (request.method === 'OPTIONS') {
            return new Response(null, {
                headers: {
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
                    'Access-Control-Allow-Headers': 'Content-Type',
                },
            });
        }

        const url = new URL(request.url);
        const path = url.pathname;

        // WebSocket 升级处理
        if (path === '/ws' || path === '/signaling') {
            const upgradeHeader = request.headers.get('Upgrade');
            if (upgradeHeader !== 'websocket') {
                return new Response('Expected WebSocket', { status: 426 });
            }

            // 使用 Durable Objects 或简单的内存存储
            // 这里使用简单的内存存储（在 Cloudflare Workers 中，可以使用 Durable Objects 实现持久化）
            return handleWebSocket(request);
        }

        // 健康检查
        if (path === '/health') {
            return new Response(JSON.stringify({ status: 'ok' }), {
                headers: { 'Content-Type': 'application/json' },
            });
        }

        // 静态文件服务（如果使用 Cloudflare Pages，这个不需要）
        return new Response('Not Found', { status: 404 });
    },
};

// 简单的 WebSocket 处理（需要 Durable Objects 来实现真正的多实例支持）
async function handleWebSocket(request) {
    // 注意：Cloudflare Workers 的 WebSocket 支持需要使用 Durable Objects
    // 这里提供一个基础框架，实际部署时需要配置 Durable Objects
    
    return new Response('WebSocket support requires Durable Objects', { status: 501 });
}
