const express = require("express");

function createTestApp({ user } = {}) {
  const app = express();

  app.use(express.json());

  app.use((req, res, next) => {
    req.user = user || {
      uid: "test-admin",
      role: "superadmin",
      community_id: "test-community",
      customer_id: "test-customer"
    };
    next();
  });

  const adminRoutes = require("../src/routes/admin.routes.js");
  app.use("/api/v1/admin", adminRoutes);

  app.use((err, req, res, next) => {
    res.status(err.statusCode || 500).json({
      error: err.message || "Internal Server Error"
    });
  });

  return app;
}

function startTestServer(options = {}) {
  const app = createTestApp(options);

  return new Promise((resolve) => {
    const server = app.listen(0, () => {
      resolve({
        app,
        server,
        port: server.address().port,
        close: () => new Promise((done) => server.close(done))
      });
    });
  });
}

module.exports = {
  createTestApp,
  startTestServer
};
