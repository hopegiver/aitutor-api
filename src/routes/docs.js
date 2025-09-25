import { Hono } from 'hono';
import { openApiSpec } from '../docs/openapi.js';

const docs = new Hono();

// Swagger UI HTML template
const swaggerUIHTML = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>AI Tutor API - Documentation</title>
    <link rel="stylesheet" type="text/css" href="https://unpkg.com/swagger-ui-dist@5.10.5/swagger-ui.css" />
    <style>
        html {
            box-sizing: border-box;
            overflow: -moz-scrollbars-vertical;
            overflow-y: scroll;
        }
        *, *:before, *:after {
            box-sizing: inherit;
        }
        body {
            margin:0;
            background: #fafafa;
        }
        .swagger-ui .topbar {
            display: none;
        }
        .swagger-ui .info .title {
            color: #3b4151;
        }
        .custom-header {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            padding: 20px;
            text-align: center;
            margin-bottom: 20px;
        }
        .custom-header h1 {
            margin: 0;
            font-size: 2.5em;
            font-weight: 300;
        }
        .custom-header p {
            margin: 10px 0 0;
            opacity: 0.9;
            font-size: 1.1em;
        }
    </style>
</head>
<body>
    <div class="custom-header">
        <h1>🤖 AI Tutor API</h1>
        <p>Intelligent tutoring powered by OpenAI and Cloudflare Workers</p>
    </div>
    <div id="swagger-ui"></div>

    <script src="https://unpkg.com/swagger-ui-dist@5.10.5/swagger-ui-bundle.js"></script>
    <script src="https://unpkg.com/swagger-ui-dist@5.10.5/swagger-ui-standalone-preset.js"></script>
    <script>
        window.onload = function() {
            SwaggerUIBundle({
                url: '/docs/openapi.json',
                dom_id: '#swagger-ui',
                deepLinking: true,
                presets: [
                    SwaggerUIBundle.presets.apis,
                    SwaggerUIStandalonePreset
                ],
                plugins: [
                    SwaggerUIBundle.plugins.DownloadUrl
                ],
                layout: "StandaloneLayout",
                tryItOutEnabled: true,
                requestInterceptor: function(request) {
                    // Add any custom headers here if needed
                    return request;
                },
                responseInterceptor: function(response) {
                    return response;
                }
            });
        };
    </script>
</body>
</html>
`;

// Main docs page with Swagger UI
docs.get('/', (c) => {
  return c.html(swaggerUIHTML);
});

// OpenAPI JSON specification endpoint
docs.get('/openapi.json', (c) => {
  return c.json(openApiSpec);
});

// OpenAPI YAML specification endpoint (optional)
docs.get('/openapi.yaml', (c) => {
  // Simple JSON to YAML converter for basic structure
  const yamlContent = `openapi: ${openApiSpec.openapi}
info:
  title: "${openApiSpec.info.title}"
  version: ${openApiSpec.info.version}
  description: "${openApiSpec.info.description}"
servers:
${openApiSpec.servers.map(server => `  - url: ${server.url}
    description: ${server.description}`).join('\n')}

# For full YAML specification, use the JSON endpoint
# This is a simplified version - use /docs/openapi.json for complete spec
`;

  return new Response(yamlContent, {
    headers: {
      'Content-Type': 'text/yaml',
    },
  });
});

// Redirect root docs to swagger UI
docs.get('/swagger', (c) => {
  return c.redirect('/docs');
});

export default docs;