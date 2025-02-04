const express = require('express');

const fs = require('fs').promises;

const path = require('path');

const axios = require('axios');

const cors = require('cors');

// ==================== CONFIGURAÇÕES ==================== //

const CONFIG = {

    FILES: {

        SCRIPTS: path.join(__dirname, 'scripts.json'),

        APIS: path.join(__dirname, 'apisbypass.json')

    },

    API: {

        KEY: 'tekscripts',

        ERROR_KEYWORDS: [

            "erro", "error", "404", "unsupported", "invalid",

            "failed", "null", "afk", "down", "off", "stop", "discord", "not", "none",
            "None", "NoNe", "fall", "er", "invalid", "inva"

        ]

    },

    LIMITS: {

        SCRIPTS_PER_DAY: 30,

        MIN_NAME_LENGTH: 3,

        MIN_SCRIPT_LENGTH: 10

    },

    SERVER: {

        PORT: 3000,

        TIMEOUT: 60000

    }

};

// ==================== INICIALIZAÇÃO DO SERVIDOR ==================== //

const app = express();

app.use(express.json());

app.use(cors());

// ==================== SERVIÇOS DE ARQUIVO ==================== //

const FileService = {

    async loadScripts() {

        try {

            const data = await fs.readFile(CONFIG.FILES.SCRIPTS, 'utf8');

            return JSON.parse(data);

        } catch {

            return [];

        }

    },

    async saveScripts(scripts) {

        await fs.writeFile(CONFIG.FILES.SCRIPTS, JSON.stringify(scripts, null, 2));

    },

    async loadApis() {

        try {

            const data = await fs.readFile(CONFIG.FILES.APIS, 'utf8');

            return JSON.parse(data).apis || [];

        } catch {

            return [];

        }

    }

};

// ==================== VALIDAÇÕES ==================== //

const ValidationService = {

    isDuplicate(script, scripts) {

        return scripts.some(s => s.script === script);

    },

    countDailyScripts(user, scripts) {

        const today = new Date().toISOString().slice(0, 10);

        return scripts.filter(s => s.nome === user && s.data.startsWith(today)).length;

    },

    validateScript(nome, script) {

        if (!nome || nome.length < CONFIG.LIMITS.MIN_NAME_LENGTH) {

            return 'Nome inválido (mínimo 3 caracteres).';

        }

        if (!script || script.length < CONFIG.LIMITS.MIN_SCRIPT_LENGTH) {

            return 'Script inválido (mínimo 10 caracteres).';

        }

        return null;

    },

    isErrorResponse(responseText) {

        if (!responseText) return true;

        const lowerText = responseText.toLowerCase();

        return CONFIG.API.ERROR_KEYWORDS.some(keyword => lowerText.includes(keyword));

    }

};

// ==================== SERVIÇO DE BYPASS ==================== //

const BypassService = {

    async processUrl(url) {

        const apis = await FileService.loadApis();

        if (!apis.length) throw new Error('Nenhuma API configurada');

        for (const api of apis) {

            const result = await this._tryApi(url, api);

            if (result) return result;

        }

        throw new Error('Nenhuma API conseguiu processar a URL');

    },

    async _tryApi(url, apiConfig) {

        try {

            const apiUrl = apiConfig.url.replace('{url}', encodeURIComponent(url));

            const response = await axios.get(apiUrl, { timeout: CONFIG.SERVER.TIMEOUT });

            const result = apiConfig.parse_json 

                ? response.data[apiConfig.response_key]

                : response.data;

            return result && !ValidationService.isErrorResponse(result) ? result : null;

        } catch (error) {

            console.error(`Erro na API ${apiConfig.name}:`, error.message);

            return null;

        }

    }

};

// ==================== CONTROLADORES ==================== //

const ScriptController = {

    async submit(req, res) {

        try {

            const { nome, script } = req.body;

            const error = ValidationService.validateScript(nome, script);

            if (error) return res.status(400).json({ mensagem: error });

            const scripts = await FileService.loadScripts();

            

            if (ValidationService.isDuplicate(script, scripts)) {

                return res.status(400).json({ mensagem: 'Script duplicado!' });

            }

            if (ValidationService.countDailyScripts(nome, scripts) >= CONFIG.LIMITS.SCRIPTS_PER_DAY) {

                return res.status(400).json({ mensagem: 'Limite diário excedido!' });

            }

            const newScript = {

                id: scripts.length ? Math.max(...scripts.map(s => s.id)) + 1 : 1,

                nome,

                script,

                status: 'Em análise',

                data: new Date().toISOString()

            };

            await FileService.saveScripts([...scripts, newScript]);

            res.status(201).json({ mensagem: 'Script enviado com sucesso!' });

        } catch (error) {

            res.status(500).json({ mensagem: 'Erro interno no servidor' });

        }

    },

    async list(req, res) {

        try {

            const { page = 1, limit = 10 } = req.query;

            const scripts = await FileService.loadScripts();

            const startIndex = (page - 1) * limit;

            

            res.json({

                total: scripts.length,

                scripts: scripts.slice(startIndex, startIndex + parseInt(limit))

            });

        } catch (error) {

            res.status(500).json({ mensagem: 'Erro ao carregar scripts' });

        }

    },

    async updateStatus(req, res) {

        try {

            const scripts = await FileService.loadScripts();

            const script = scripts.find(s => s.id === parseInt(req.params.id));

            

            if (!script) return res.status(404).json({ mensagem: 'Script não encontrado' });

            

            script.status = req.body.status || script.status;

            await FileService.saveScripts(scripts);

            

            res.json({ mensagem: 'Status atualizado com sucesso' });

        } catch (error) {

            res.status(500).json({ mensagem: 'Erro ao atualizar status' });

        }

    },

    async delete(req, res) {

        try {

            let scripts = await FileService.loadScripts();

            const initialLength = scripts.length;

            

            scripts = scripts.filter(s => s.id !== parseInt(req.params.id));

            

            if (scripts.length === initialLength) {

                return res.status(404).json({ mensagem: 'Script não encontrado' });

            }

            await FileService.saveScripts(scripts);

            res.json({ mensagem: 'Script removido com sucesso' });

        } catch (error) {

            res.status(500).json({ mensagem: 'Erro ao remover script' });

        }

    }

};

const BypassController = {

    async handle(req, res) {

        try {

            const result = await BypassService.processUrl(req.query.url);

            res.json({ result });

        } catch (error) {

            const statusCode = error.message.includes('configurada') ? 500 : 502;

            res.status(statusCode).json({ error: error.message });

        }

    }

};

// ==================== MIDDLEWARES ==================== //

const ApiKeyMiddleware = (req, res, next) => {

    if (req.query.key !== CONFIG.API.KEY) {

        return res.status(401).json({ error: 'Chave de API inválida' });

    }

    if (!req.query.url) {

        return res.status(400).json({ error: 'URL não fornecida' });

    }

    next();

};

// ==================== ROTAS ==================== //

app.post('/enviar_script', ScriptController.submit);

app.get('/listar_scripts', ScriptController.list);

app.patch('/alterar_status/:id', ScriptController.updateStatus);

app.delete('/remover_script/:id', ScriptController.delete);

app.get('/bypass', ApiKeyMiddleware, BypassController.handle);

// ==================== INICIALIZAÇÃO ==================== //

app.listen(CONFIG.SERVER.PORT, () => {

    console.log(`Servidor operacional na porta ${CONFIG.SERVER.PORT}`);

});
