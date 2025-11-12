// server.js - Development server with static file serving
import { createServer } from 'http';
import { parse } from 'url';
import { readFileSync } from 'fs';
import { join, extname } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const PORT = 3000;

// Load environment variables from .env.local
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

// MIME types for static files
const MIME_TYPES = {
    '.html': 'text/html',
    '.css': 'text/css',
    '.js': 'text/javascript',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon'
};

// Import API handlers
async function loadAPIHandlers() {
    const chatV2 = await import('./api/chat-v2.js');
    const analyzePitch = await import('./api/analyze-pitch.js');
    const adaptiveQuestion = await import('./api/generate-adaptive-question.js');
    const evaluatePhase = await import('./api/evaluate-phase.js');

    return {
        '/api/chat-v2': chatV2.default,
        '/api/analyze-pitch': analyzePitch.default,
        '/api/generate-adaptive-question': adaptiveQuestion.default,
        '/api/evaluate-phase': evaluatePhase.default
    };
}

// Serve static files
function serveStaticFile(pathname, res) {
    try {
        // Remove leading slash and resolve path
        const filePath = join(__dirname, pathname === '/' ? 'index.html' : pathname);

        // Get file extension and content type
        const ext = extname(filePath);
        const contentType = MIME_TYPES[ext] || 'text/plain';

        // Read and serve file
        const content = readFileSync(filePath);
        res.statusCode = 200;
        res.setHeader('Content-Type', contentType);
        res.end(content);

        console.log(`✅ Served: ${pathname}`);
        return true;
    } catch (error) {
        if (error.code === 'ENOENT') {
            res.statusCode = 404;
            res.setHeader('Content-Type', 'text/html');
            res.end(`
                <!DOCTYPE html>
                <html>
                <head><title>404 - Not Found</title></head>
                <body>
                    <h1>404 - File Not Found</h1>
                    <p>Could not find: ${pathname}</p>
                    <p><a href="/">Go to Home</a></p>
                </body>
                </html>
            `);
            console.log(`❌ Not found: ${pathname}`);
        } else {
            res.statusCode = 500;
            res.setHeader('Content-Type', 'text/plain');
            res.end('Internal Server Error');
            console.error(`❌ Error serving ${pathname}:`, error.message);
        }
        return false;
    }
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

    // Handle API routes
    if (pathname.startsWith('/api/')) {
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
            res.end(JSON.stringify({ error: 'API endpoint not found', path: pathname }));
        }
    } else {
        // Serve static files (HTML, CSS, JS, images)
        serveStaticFile(pathname, res);
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
    console.log('   POST /api/evaluate-phase');
    console.log('📄 Static files served from root directory\n');
    console.log('🎯 Try: http://localhost:3000/workshop-interface.html\n');
    console.log(`💡 Press Ctrl+C to stop\n`);
    console.log(`${'='.repeat(50)}\n`);
});