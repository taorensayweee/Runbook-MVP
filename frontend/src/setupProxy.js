const { createProxyMiddleware } = require('http-proxy-middleware');

module.exports = function(app) {
  app.use(
    '/api',
    createProxyMiddleware({
      target: 'http://backend:5000',
      changeOrigin: true,
    })
  );
  app.use(
    '/uploads',
    createProxyMiddleware({
      target: 'http://backend:5000',
      changeOrigin: true,
    })
  );
}; 