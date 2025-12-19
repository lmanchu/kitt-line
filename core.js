/**
 * KITT Core - Platform-agnostic AI assistant logic
 * Shared between Slack Bot and LINE Bot
 */

const fs = require('fs');
const path = require('path');

// ============ CONFIGURATION ============

const OLLAMA_API = process.env.OLLAMA_API || 'http://localhost:11434/api/generate';
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'qwen3-vl:4b';

// Knowledge base paths
const KB_BASE_PATH = path.join(process.env.HOME, 'Dropbox/PKM-Vault/1-Projects/IrisGo/Product');
const KB_FILES = {
  product: 'knowledge-base.md',
  customers: 'customers.md',
  roadmap: 'roadmap.md',
  priorities: 'priorities.md',
  resources: 'resources.md',
  pmMemory: 'pm-memory.md'
};

// In-memory knowledge base
let knowledgeBase = {
  product: '',
  customers: '',
  roadmap: '',
  priorities: '',
  resources: '',
  pmMemory: '',
  lastUpdated: null
};

// ============ KNOWLEDGE BASE ============

/**
 * Load all knowledge base files into memory
 */
function loadKnowledgeBase() {
  try {
    console.log('📚 Loading IrisGo knowledge base...');

    for (const [key, filename] of Object.entries(KB_FILES)) {
      const filePath = path.join(KB_BASE_PATH, filename);

      if (fs.existsSync(filePath)) {
        knowledgeBase[key] = fs.readFileSync(filePath, 'utf8');
        console.log(`  ✓ Loaded ${filename} (${knowledgeBase[key].length} chars)`);
      } else {
        console.warn(`  ⚠️  ${filename} not found, skipping`);
        knowledgeBase[key] = '';
      }
    }

    knowledgeBase.lastUpdated = new Date().toISOString();
    console.log(`✓ Knowledge base loaded at ${knowledgeBase.lastUpdated}`);

  } catch (error) {
    console.error('❌ Failed to load knowledge base:', error.message);
  }
}

/**
 * Watch knowledge base directory for changes
 */
function watchKnowledgeBase() {
  try {
    fs.watch(KB_BASE_PATH, (eventType, filename) => {
      if (filename && filename.endsWith('.md')) {
        console.log(`🔄 Detected change in ${filename}, reloading knowledge base...`);
        loadKnowledgeBase();
      }
    });
    console.log(`👁️  Watching ${KB_BASE_PATH} for changes`);
  } catch (error) {
    console.error('❌ Failed to setup file watcher:', error.message);
  }
}

function getKnowledgeBase() {
  return knowledgeBase;
}

// ============ OLLAMA LLM ============

/**
 * Call Ollama API
 */
async function callOllama(prompt, maxTokens = 300) {
  try {
    const response = await fetch(OLLAMA_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: OLLAMA_MODEL,
        prompt: prompt,
        stream: false,
        options: {
          temperature: 0.3,
          num_predict: maxTokens,
          top_p: 0.9
        }
      })
    });

    if (!response.ok) {
      throw new Error(`Ollama API error: ${response.status}`);
    }

    const data = await response.json();
    return (data.response || data.thinking || '').trim();
  } catch (error) {
    console.error('Ollama API error:', error.message);
    throw error;
  }
}

// ============ LANGUAGE DETECTION ============

/**
 * Detect language and distinguish Simplified vs Traditional Chinese
 */
async function detectLanguage(text) {
  try {
    const prompt = `What language is this text? Reply with ONLY ONE of these codes: zh-TW, zh-CN, en, ja, ko, es, fr, de

Text: "${text}"

ONE CODE ONLY:`;

    const result = await callOllama(prompt, 20);
    const cleaned = result.trim().toLowerCase();

    // Extract valid language code from response
    const validCodes = ['zh-tw', 'zh-cn', 'en', 'ja', 'ko', 'es', 'fr', 'de'];
    for (const code of validCodes) {
      if (cleaned.includes(code)) {
        return code === 'zh-tw' ? 'zh-TW' : code === 'zh-cn' ? 'zh-CN' : code;
      }
    }

    // Fallback: detect Chinese and distinguish Simplified vs Traditional
    if (/[\u4e00-\u9fff]/.test(text)) {
      const simplifiedChars = /[这这个们会说对没关机开时为么什让给从远进还边]/;
      const traditionalChars = /[這個們會說對沒關機開時為麼什讓給從遠進還邊]/;

      const hasSimplified = simplifiedChars.test(text);
      const hasTraditional = traditionalChars.test(text);

      if (hasSimplified && !hasTraditional) {
        return 'zh-CN';
      }
      return 'zh-TW';
    }

    return 'en';
  } catch (error) {
    console.error('Language detection error:', error.message);
    return 'en';
  }
}

// ============ INTENT DETECTION ============

/**
 * Rule-based quick check for potential knowledge updates
 */
function detectKnowledgeUpdateIntent_RuleBased(text) {
  const updatePatterns = [
    /記得|記住|記錄|记得|记住|记录/,
    /更新|update/i,
    /新增|加入|添加|add/i,
    /邀請了|邀请了|contacted|聯繫了|联系了/i,
    /已經.*完成|已完成|已经.*完成/,
    /狀態.*變成|改為|changed|状态.*变成|改为/i,
    /進度|进度|progress/i,
    /幫我.*通知|帮我.*通知/,
    /待[辦办]|todo/i,
  ];

  return updatePatterns.some(pattern => pattern.test(text));
}

/**
 * LLM-based confirmation for knowledge update intent
 */
async function detectKnowledgeUpdateIntent_LLM(text) {
  try {
    const prompt = `Classify this message. Is it a request to UPDATE, RECORD, or REMEMBER information (like contacts, status, progress, tasks)?

Message: "${text}"

Reply with ONLY one word:
- YES (if it's asking to record/update/remember something)
- NO (if it's just a question or general chat)

Answer:`;

    const result = await callOllama(prompt, 10);
    const answer = result.trim().toUpperCase();
    console.log(`[DEBUG] LLM intent detection result: "${answer}"`);
    return answer.includes('YES');
  } catch (error) {
    console.error('[ERROR] LLM intent detection failed:', error.message);
    return true; // Fallback to true since rule-based already passed
  }
}

/**
 * Hybrid knowledge update detection
 */
async function detectKnowledgeUpdateIntent(text) {
  const ruleBasedResult = detectKnowledgeUpdateIntent_RuleBased(text);

  if (!ruleBasedResult) {
    console.log(`[DEBUG] Rule-based: NOT a knowledge update`);
    return false;
  }

  console.log(`[DEBUG] Rule-based: POSSIBLE knowledge update, confirming with LLM...`);
  const llmResult = await detectKnowledgeUpdateIntent_LLM(text);

  return llmResult;
}

// ============ AI RESPONSE GENERATION ============

/**
 * Generate AI response using knowledge base context
 */
async function generateAIResponse(message, userLang = 'zh-TW') {
  const langInstructions = {
    'zh-TW': '請用繁體中文回答',
    'zh-CN': '请用简体中文回答',
    'en': 'Please respond in English',
    'ja': '日本語で回答してください',
    'ko': '한국어로 응답해 주세요'
  };

  const langInstruction = langInstructions[userLang] || langInstructions['zh-TW'];

  const systemPrompt = `You are KITT, an AI assistant for IrisGo team. ${langInstruction}.

## Knowledge Base Context:

### Product Overview:
${knowledgeBase.product.substring(0, 2000)}

### Current Priorities:
${knowledgeBase.priorities.substring(0, 1500)}

### Customer Status:
${knowledgeBase.customers.substring(0, 1500)}

### PM Memory:
${knowledgeBase.pmMemory.substring(0, 1500)}

---

User message: ${message}

Provide a helpful, concise response based on the knowledge base. If the information is not in the knowledge base, say so honestly.`;

  try {
    const result = await callOllama(systemPrompt, 500);
    return result;
  } catch (error) {
    console.error('AI Response error:', error.message);
    return userLang.startsWith('zh')
      ? '抱歉，我暫時無法回應，請稍後再試。'
      : 'Sorry, I cannot respond at the moment. Please try again later.';
  }
}

// ============ EXPORTS ============

module.exports = {
  loadKnowledgeBase,
  watchKnowledgeBase,
  getKnowledgeBase,
  callOllama,
  detectLanguage,
  detectKnowledgeUpdateIntent,
  generateAIResponse
};
