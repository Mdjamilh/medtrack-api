/**
 * Swagger UI page that loads its assets from a version-pinned CDN. Serving
 * them from node_modules breaks on serverless hosts that don't bundle those
 * files, which left /docs blank in production.
 */
const SWAGGER_UI_VERSION = "5.34.0";
const CDN = `https://cdn.jsdelivr.net/npm/swagger-ui-dist@${SWAGGER_UI_VERSION}`;

export function docsPage({ specUrl, title }: { specUrl: string; title: string }): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${title}</title>
    <link rel="stylesheet" href="${CDN}/swagger-ui.css" />
  </head>
  <body>
    <div id="swagger-ui"></div>
    <script src="${CDN}/swagger-ui-bundle.js" crossorigin="anonymous"></script>
    <script>
      window.ui = SwaggerUIBundle({ url: ${JSON.stringify(specUrl)}, dom_id: "#swagger-ui", persistAuthorization: true });
    </script>
  </body>
</html>`;
}
