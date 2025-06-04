const express = require('express');
const fs = require('fs').promises;
const path = require('path');
const cors = require('cors');

const app = express();
app.use(express.json());
app.use(cors());

const blockedIps = new Map(); // IPs bloqueados
const registeredRoutes = new Set(); // Rotas registradas

// Carrega módulos dinamicamente
async function loadModules(app) {
  const modulesDir = path.join(__dirname, 'modules');
  const files = await fs.readdir(modulesDir);

  for (const file of files) {
    if (path.extname(file) !== '.js') continue;
    try {
      const { setup } = require(path.join(modulesDir, file));
      if (typeof setup === 'function') {
        const before = new Set(getAppRoutes());
        setup(app);
        const newRoutes = getAppRoutes().filter((r) => !before.has(r));
        newRoutes.forEach((r) => registeredRoutes.add(r));
        console.log(`Módulo carregado: ${file}`);
      }
    } catch (error) {
      console.error(`Erro ao carregar ${file}:`, error);
    }
  }
}

// Verifica bloqueio de IP
function checkIfBlocked(ip) {
  const data = blockedIps.get(ip);
  if (!data) return false;

  const now = Date.now();
  if (data.blockUntil > now) {
    return Math.ceil((data.blockUntil - now) / 60000); // Minutos restantes
  }

  blockedIps.delete(ip);
  return false;
}

// Middleware de bloqueio
app.use((req, res, next) => {
  const ip = req.ip;
  const blockTime = checkIfBlocked(ip);
  if (blockTime) {
    return res.status(403).json({ message: `Bloqueado por ${blockTime} minutos` });
  }
  next();
});

// Rastreia requisições
function trackRequests(ip) {
  const now = Date.now();
  const data = blockedIps.get(ip) ?? {
    requests: 0,
    lastRequest: now,
  };

  const timeDiff = (now - data.lastRequest) / 1000;
  data.requests = timeDiff < 60 ? data.requests + 1 : 1;

  if (data.requests > 10) {
    data.blockUntil = now + 600000; // 10 minutos
    data.requests = 0;
  }

  data.lastRequest = now;
  blockedIps.set(ip, data);
}

// Middleware de rastreamento
app.use((req, res, next) => {
  trackRequests(req.ip);
  next();
});

// Rotas principais
app.get('/', (req, res) => res.json({ availableRoutes: getAppRoutes() }));
app.get('/status', (req, res) => res.json({ result: 'server on' }));

// Obtém rotas detalhadas
function getAppRoutes() {
  const routes = [];
  app._router.stack.forEach(({ route, name, handle }) => {
    if (route) {
      const methods = Object.keys(route.methods).map((m) => m.toUpperCase());
      methods.forEach((method) => {
        routes.push({
          path: route.path,
          method,
          params: (route.path.match(/:\w+/g) || []).map((p) => p.slice(1)),
        });
      });
    } else if (name === 'router') {
      handle.stack.forEach(({ route }) => {
        if (route) {
          const methods = Object.keys(route.methods).map((m) => m.toUpperCase());
          methods.forEach((method) => {
            routes.push({
              path: route.path,
              method,
              params: (route.path.match(/:\w+/g) || []).map((p) => p.slice(1)),
            });
          });
        }
      });
    }
  });
  return routes;
}

// Inicia servidor
async function startServer() {
  await loadModules(app);
  const PORT = process.env.PORT || 4000;
  app.listen(PORT, () => console.log(`Servidor rodando na porta ${PORT}`));
}

startServer();