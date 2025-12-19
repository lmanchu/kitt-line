/**
 * KITT LINE Bot
 * Personal AI Assistant via LINE Messaging API
 */

require('dotenv').config();
const express = require('express');
const line = require('@line/bot-sdk');
const core = require('./core');

// LINE SDK config
const lineConfig = {
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.LINE_CHANNEL_SECRET
};

const client = new line.messagingApi.MessagingApiClient({
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN
});

// Initialize Express
const app = express();

// Webhook endpoint - must use LINE middleware for signature validation
app.post('/webhook', line.middleware(lineConfig), async (req, res) => {
  try {
    const events = req.body.events;

    // Process events in parallel
    await Promise.all(events.map(handleEvent));

    res.status(200).send('OK');
  } catch (error) {
    console.error('Webhook error:', error);
    res.status(500).send('Error');
  }
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    service: 'kitt-line',
    timestamp: new Date().toISOString()
  });
});

/**
 * Handle LINE webhook events
 */
async function handleEvent(event) {
  // Only handle text messages for now
  if (event.type !== 'message' || event.message.type !== 'text') {
    console.log(`[SKIP] Event type: ${event.type}, message type: ${event.message?.type}`);
    return null;
  }

  const userMessage = event.message.text;
  const userId = event.source.userId;
  const replyToken = event.replyToken;

  console.log(`[LINE] User: ${userId}`);
  console.log(`[LINE] Message: ${userMessage}`);

  try {
    // Detect language
    const userLang = await core.detectLanguage(userMessage);
    console.log(`[LINE] Detected language: ${userLang}`);

    // Check if this is a knowledge update request
    const isKnowledgeUpdate = await core.detectKnowledgeUpdateIntent(userMessage);
    console.log(`[LINE] Is knowledge update: ${isKnowledgeUpdate}`);

    let responseText;

    if (isKnowledgeUpdate) {
      // For now, acknowledge and log - will add approval workflow later
      responseText = userLang === 'zh-CN'
        ? `✅ 已收到更新请求，我会帮你记录：\n\n"${userMessage}"\n\n(功能开发中，目前仅记录到日志)`
        : `✅ 已收到更新請求，我會幫你記錄：\n\n「${userMessage}」\n\n（功能開發中，目前僅記錄到日誌）`;

      // TODO: Integrate with PKM approval workflow
      console.log(`[LINE] Knowledge update logged: ${userMessage}`);
    } else {
      // Generate AI response
      responseText = await core.generateAIResponse(userMessage, userLang);
    }

    // Reply to user
    await client.replyMessage({
      replyToken: replyToken,
      messages: [{
        type: 'text',
        text: responseText
      }]
    });

    console.log(`[LINE] Response sent (${responseText.length} chars)`);

  } catch (error) {
    console.error('[LINE] Error handling message:', error);

    // Send error response
    await client.replyMessage({
      replyToken: replyToken,
      messages: [{
        type: 'text',
        text: '抱歉，處理訊息時發生錯誤，請稍後再試。'
      }]
    });
  }
}

// ============ STARTUP ============

const PORT = process.env.PORT || 3001;

// Load knowledge base
core.loadKnowledgeBase();
core.watchKnowledgeBase();

// Start server
app.listen(PORT, () => {
  console.log('');
  console.log('🚗 KITT LINE Bot is online!');
  console.log(`📡 Webhook: http://localhost:${PORT}/webhook`);
  console.log(`🏥 Health: http://localhost:${PORT}/health`);
  console.log('');
  console.log('📝 Next steps:');
  console.log('   1. Start cloudflared tunnel');
  console.log('   2. Set webhook URL in LINE Official Account Manager');
  console.log('');
});
