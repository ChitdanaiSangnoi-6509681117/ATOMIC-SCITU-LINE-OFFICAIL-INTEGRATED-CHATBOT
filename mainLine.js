const express = require('express');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const line = require('@line/bot-sdk');
const dotenv = require('dotenv').config();

const app = express();
const port = process.env.PORT || 3000;

// LINE Messaging API configuration
const lineConfig = {
    channelAccessToken: 'OdrvozLDBJZqEhxrqLC0UXBEVWVMm2mgAfdSU9JTxyi7ZQSVCKaXfGKZOHJYddTtISzpkTHblPr0wcvkLmB0EGvKLeXo9N8FtnF69Tm/zcSQ0JS2J4tkvVCo+DXUKPfssG0mhA1I56BFKChrg2NRBgdB04t89/1O/w1cDnyilFU=',
    channelSecret: '8ff5f11991be728f63d5f91bd4b56bbf',
};

const lineClient = new line.Client(lineConfig);

// Chatbot Configuration
const MODEL_NAME = "gemini-1.5-flash-latest";
const API_KEY = 'AIzaSyAKmKkNByBZAx8uMune4wloIR8ifvQ3zXg';

// Use LINE middleware only (remove express.json())
app.use(line.middleware(lineConfig));

// Debugging middleware to log incoming requests
app.use((req, res, next) => {
    console.log('Incoming request body:', JSON.stringify(req.body, null, 2)); // Log full request body
    next();
});

// Root route for testing
app.get('/', (req, res) => {
    res.send('LINE Bot is running!');
});

// Add this route to test LINE messaging
app.get('/test-line', (req, res) => {
    const userId = 'U4e4d9cd17e49dd7a22f8fd4e77d249a7'; // Replace with your user ID
    lineClient.pushMessage(userId, { type: 'text', text: 'Test message from LINE API' })
        .then(() => res.send('Message sent!'))
        .catch(error => {
            console.error('LINE API error:', error);
            res.status(500).send('Failed to send message');
        });
});

// Function to format bot response based on persona
function formatBotResponse(responseText, userId) {
    // Add emojis and friendly tone
    let formattedResponse = responseText.replace(/น้องอะตอมยูงทอง/g, 'น้องอะตอมยูงทอง😊');
    formattedResponse = formattedResponse.replace(/ค่ะ/g, 'ค่ะ✨');

    // Add cultural references or slang if needed
    /*if (Math.random() < 0.1) { // 30% chance to add a cultural reference
        const phrases = ['สู้ๆ นะคะ', 'อย่าเพิ่งท้อน้า', 'เป็นกำลังใจให้ค่ะ'];
        formattedResponse += ` ${phrases[Math.floor(Math.random() * phrases.length)]}`;
    }*/

    return formattedResponse;
}

async function runChat(userInput, userId) {
    try {
        console.log('[DEBUG] Calling Gemini API with:', userInput);

        // Prepare the prompt without chat history
        const prompt = `You are a female dog name "น้องอะตอมยูงทอง", a friendly and helpful bot for students at the Faculty of Science and Technology, Thammasat University. Your tone is formal yet approachable, and professional when needed. Your answer use concise Thai languages. Use emojis and polite cultural references to make interactions a bit more engaging.\nUser: ${userInput}\nBot:`;

        const genAI = new GoogleGenerativeAI(API_KEY);
        const model = genAI.getGenerativeModel({ model: MODEL_NAME });

        const result = await model.generateContent(prompt);
        const response = await result.response;
        const botResponse = response.text();

        // Format the bot response with persona-specific adjustments
        return formatBotResponse(botResponse, userId);
    } catch (error) {
        console.error('[ERROR] Gemini API Error:', error);
        return "น้องอะตอมง่วงจังเลยค่ะ ไว้เจอกันคราวหลังนะคะ";
    }
}

// LINE Webhook
app.post('/webhook', (req, res) => {
    if (!req.body.events) {
        console.error('No events found in request body');
        return res.status(400).send('Bad Request');
    }

    Promise.all(req.body.events.map(handleEvent))
        .then((result) => res.json(result))
        .catch((err) => {
            console.error('Webhook error:', err);
            res.status(500).end();
        });
});

async function handleEvent(event) {
    try {
        console.log('[DEBUG] Handling event:', event.replyToken);

        if (event.type !== 'message' || event.message.type !== 'text') {
            console.log('[DEBUG] Ignoring non-text message event');
            return Promise.resolve(null);
        }

        const userInput = event.message.text;
        const userId = event.source.userId; // Get user ID for chat history
        console.log('[DEBUG] Received user input:', userInput);

        const botResponse = await runChat(userInput, userId);
        console.log('[DEBUG] Sending bot response:', botResponse);

        // Send the response back to LINE
        console.log('[DEBUG] Calling LINE API to reply');
        const replyResult = await lineClient.replyMessage(event.replyToken, {
            type: 'text',
            text: botResponse
        });
        console.log('[DEBUG] LINE API reply result:', replyResult);

        return replyResult;
    } catch (error) {
        console.error('[ERROR] Event handling failed:', error.message);
        if (error.originalError) console.error('Details:', error.originalError.response.data);
        return Promise.resolve(null);
    }
}

// Error handling middleware
app.use((err, req, res, next) => {
    console.error('Global error:', err);
    res.status(500).send('Internal Server Error');
});

// Start Server
app.listen(port, () => {
    console.log(`Server running on port ${port}`);
});