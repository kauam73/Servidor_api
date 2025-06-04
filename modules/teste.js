const express = require("express");  
const axios = require("axios");  
const cheerio = require("cheerio");  
const cors = require("cors");  
  
const URL = "https://vulcanvalues.com/blox-fruits/stock";  
  
// Configurações  
const USER_AGENT =  
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/110.0.0.0 Safari/537.36";  
  
// Variáveis para cache  
let cache = {  
  data: null,  
  lastUpdated: null  
};  
  
const CACHE_EXPIRATION_TIME = 5 * 60 * 1000; // 5 minutos  
  
/**  
 * Função para calcular o tempo restante a partir de uma data alvo.  
 * Retorna uma string formatada ou uma mensagem de expiração.  
 */  
function computeCountdown(targetTimeStr) {  
  const targetTime = new Date(targetTimeStr);  
  const now = new Date();  
  const distance = targetTime - now;  
  if (distance < 0) return "Expired waiting for restock...";  
  const hours = Math.floor(distance / (1000 * 60 * 60));  
  const minutes = Math.floor((distance % (1000 * 60 * 60)) / (1000 * 60));  
  const seconds = Math.floor((distance % (1000 * 60)) / 1000);  
  return `${hours} HOURS, ${minutes} MINUTES, ${seconds} SECONDS`;  
}  
  
/**  
 * Função para extrair os valores targetTime e targetTimee do JavaScript embutido.  
 * Utiliza regex para capturar os valores entre aspas (simples ou duplas).  
 */  
function extractTargetTimes(html) {  
  const targetTimeMatch = html.match(/var\s+targetTime\s*=\s*["']([^"']+)["']/);  
  const targetTimeeMatch = html.match(/var\s+targetTimee\s*=\s*["']([^"']+)["']/);  
  const targetTime = targetTimeMatch ? targetTimeMatch[1] : null;  
  const targetTimee = targetTimeeMatch ? targetTimeeMatch[1] : null;  
  return { targetTime, targetTimee };  
}  
  
/**  
 * Função para extrair os itens de uma loja com base em um seletor.  
 */  
function extractItems($, selector) {  
  const items = [];  
  $(selector).find("ul li").each((i, el) => {  
    const nome = $(el).find("span.text-md.font-bold").first().text().trim();  
    const link = $(el).find("img").attr("src");  
    const precoBelis = $(el).find("span.text-green-400").first().text().trim();  
    const precoRobux = $(el).find("span.text-yellow-500").first().text().trim();  
  
    if (nome && precoBelis && precoRobux) {  
      items.push({  
        nome,  
        foto: link,  
        preco_belis: precoBelis,  
        preco_robux: precoRobux,  
      });  
    } else {  
      console.warn(`Item da loja com dados faltando: ${nome}`);  
    }  
  });  
  return items;  
}  
  
/**  
 * Função principal de scraping.  
 * Faz a requisição, carrega o HTML, extrai as variáveis de tempo via regex e processa os itens.  
 */  
async function scrapeStock() {  
  try {  
    const { data: html } = await axios.get(URL, {  
      headers: { "User-Agent": USER_AGENT },  
    });  
    const $ = cheerio.load(html);  
  
    let stock = {  
      loja_normal: [],  
      loja_miragem: [],  
      proxima_atualizacao_normal: "",  
      proxima_atualizacao_miragem: "",  
    };  
  
    // Extrai os targetTime a partir do script embutido com regex aprimorada  
    const { targetTime, targetTimee } = extractTargetTimes(html);  
    if (targetTime) {  
      stock.proxima_atualizacao_normal = computeCountdown(targetTime);  
    } else {  
      console.warn("targetTime não encontrado no script.");  
    }  
    if (targetTimee) {  
      stock.proxima_atualizacao_miragem = computeCountdown(targetTimee);  
    } else {  
      console.warn("targetTimee não encontrado no script.");  
    }  
  
    // Extraindo itens da loja normal  
    stock.loja_normal = extractItems($, ".text-center.md\\:pr-4.md\\:flex-grow");  
  
    // Extraindo itens da loja da miragem  
    stock.loja_miragem = extractItems($, ".text-center.md\\:pl-4.md\\:flex-grow");  
  
    if (stock.loja_normal.length === 0) {  
      console.warn("Nenhum item encontrado na loja normal.");  
    }  
    if (stock.loja_miragem.length === 0) {  
      console.warn("Nenhum item encontrado na loja da miragem.");  
    }  
  
    return stock;  
  } catch (error) {  
    console.error("Erro ao fazer scraping:", error.message);  
    return { error: "Erro ao acessar o site" };  
  }  
}  
  
/**  
 * Função para verificar e atualizar o cache.  
 * Agora a lista de itens é mantida em cache, mas o tempo é atualizado constantemente.  
 */  
async function updateCache() {  
  const now = Date.now();  
  // Atualiza o cache de itens a cada 5 minutos  
  if (!cache.data || now - cache.lastUpdated > CACHE_EXPIRATION_TIME) {  
    console.log("Atualizando lista de itens...");  
    cache.data = await scrapeStock();  
    cache.lastUpdated = now;  
  }  
}  
  
/**  
 * Função de setup para registrar a rota no Express.  
 */  
function setup(app) {  
  app.get("/bloxfruits-stock", async (req, res) => {  
    // Garante que a lista de itens está atualizada, mas o tempo é recalculado a cada vez  
    await updateCache();  
    // Sempre recalcula o tempo de atualização, sem depender de cache  
    const stock = await scrapeStock();  
    res.json(stock);  
  });  
  console.log("Módulo de Blox Fruits carregado");  
}  
  
// Exporta o módulo com a função setup para integração com o controlador  
module.exports = { setup };

