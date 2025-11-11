// server.js - Simple development server
import { createServer } from 'http';
import { parse } from 'url';

const PORT = 3000;

// Load environment variables from .env.local
import { readFileSync } from 'fs';
try {
    const envContent = readFileSync('.env.local', 'utf-8');
    envContent.split('\n').forEach(line => {
        const [key, value] = line.split('=');
        if (key && value) {
            process.env[key.trim()] = value.trim();
        }
    });
    console.log('✅ Loaded .env.local');
} catch (e) {
    console.log('⚠️ No .env.local found');
}

// Import API handlers
async function loadAPIHandlers() {
    const chatV2 = await import('./api/chat-v2.js');
    const analyzePitch = await import('./api/analyze-pitch.js');
    const adaptiveQuestion = await import('./api/generate-adaptive-question.js');

    return {
        '/api/chat-v2': chatV2.default,
        '/api/analyze-pitch': analyzePitch.default,
        '/api/generate-adaptive-question': adaptiveQuestion.default
    };
}

const server = createServer(async (req, res) => {
    const parsedUrl = parse(req.url, true);
    const pathname = parsedUrl.pathname;

    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        res.statusCode = 200;
        res.end();
        return;
    }

    const handlers = await loadAPIHandlers();

    if (handlers[pathname]) {
        let body = '';
        req.on('data', chunk => {
            body += chunk.toString();
        });

        req.on('end', async () => {
            try {
                const data = body ? JSON.parse(body) : {};

                const mockReq = {
                    method: req.method,
                    body: data,
                    headers: req.headers
                };

                const mockRes = {
                    status: (code) => {
                        res.statusCode = code;
                        return mockRes;
                    },
                    json: (data) => {
                        res.setHeader('Content-Type', 'application/json');
                        res.end(JSON.stringify(data));
                    },
                    setHeader: (key, value) => {
                        res.setHeader(key, value);
                    },
                    end: () => {
                        res.end();
                    }
                };

                await handlers[pathname](mockReq, mockRes);

            } catch (error) {
                console.error('❌ API Error:', error);
                res.statusCode = 500;
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ error: error.message, stack: error.stack }));
            }
        });
    } else {
        res.statusCode = 404;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ error: 'Not found', path: pathname }));
    }
});

server.listen(PORT, () => {
    console.log(`\n${'='.repeat(50)}`);
    console.log(`✅ PitchPerfect Dev Server Running`);
    console.log(`${'='.repeat(50)}\n`);
    console.log(`🌐 Server: http://localhost:${PORT}\n`);
    console.log('📡 Available API endpoints:');
    console.log('   POST /api/chat-v2');
    console.log('   POST /api/analyze-pitch');
    console.log('   POST /api/generate-adaptive-question\n');
    console.log(`💡 Press Ctrl+C to stop\n`);
    console.log(`${'='.repeat(50)}\n`);
});