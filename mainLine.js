const express = require('express');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const line = require('@line/bot-sdk');
const dotenv = require('dotenv').config();
const fs = require('fs');
const path = require('path');
const similarity = require('string-similarity');
const wordcut = require('wordcut');

// Initialize wordcut for Thai tokenization
wordcut.init();

const app = express();
const port = process.env.PORT || 3001; // Changed port to 3001

// Parse JSON request bodies
app.use(express.json());

// LINE Messaging API configuration
const lineConfig = {
    channelAccessToken: 'OdrvozLDBJZqEhxrqLC0UXBEVWVMm2mgAfdSU9JTxyi7ZQSVCKaXfGKZOHJYddTtISzpkTHblPr0wcvkLmB0EGvKLeXo9N8FtnF69Tm/zcSQ0JS2J4tkvVCo+DXUKPfssG0mhA1I56BFKChrg2NRBgdB04t89/1O/w1cDnyilFU=',
    channelSecret: '8ff5f11991be728f63d5f91bd4b56bbf',
};
const lineClient = new line.Client(lineConfig);

// Chatbot Configuration
const MODEL_NAME = "gemini-1.5-flash-latest";
const API_KEY = 'AIzaSyAKmKkNByBZAx8uMune4wloIR8ifvQ3zXg';

// Load data.json
const dataPath = path.join(__dirname, 'data/data.json');
const rawData = fs.readFileSync(dataPath);
const questionsData = JSON.parse(rawData);

// Load info.json
const infoPath = path.join(__dirname, 'data/info.json');
const rawInfo = fs.readFileSync(infoPath);
const additionalInfo = JSON.parse(rawInfo);

// Tokenization function for Thai text
function tokenizeThaiText(text) {
    return wordcut.cut(text); // Tokenize Thai text into spaced words
}

// Function to format bot response
function formatBotResponse(responseText, userId) {
    let formattedResponse = responseText.replace(/น้องอะตอมยูงทอง/g, 'น้องอะตอมยูงทอง😊');
    formattedResponse = formattedResponse.replace(/ค่ะ/g, 'ค่ะ✨');
    return formattedResponse;
}

// Main chatbot function
async function runChat(userInput, userId) {
    try {
        console.log('[DEBUG] Checking RAG method...');
        
        // Tokenize user input
        const tokenizedInput = tokenizeThaiText(userInput);
        console.log('[DEBUG] Tokenized Input:', tokenizedInput);

        const threshold = 0.60; // Define a similarity threshold
        let bestMatch = null;
        let highestScore = 0;

        // Compare user input with questions in data.json
        questionsData.forEach(entry => {
            const tokenizedQuestion = tokenizeThaiText(entry.question);
            const score = similarity.compareTwoStrings(tokenizedInput, tokenizedQuestion);
            if (score > highestScore) {
                highestScore = score;
                bestMatch = entry;
            }
        });

        if (highestScore >= threshold) {
            console.log('[DEBUG] Match found in data.json with score:', highestScore);
            return bestMatch.answer;
        }

        // Log the percentage similarity in terminal
        console.log(`[DEBUG] No sufficient match found. Highest similarity score: ${(highestScore * 100).toFixed(2)}%`);

        // Call Gemini API if no sufficient match
        console.log('[DEBUG] Falling back to Gemini API...');
        const prompt = `
            You are a chatbot for the Faculty of Science and Technology, Thammasat University. 
            Use concise Thai language with emojis and politeness. Answer the user's question based on the following info:
            ${JSON.stringify(additionalInfo, null, 2)}
            
            User: ${userInput}
            Bot:
        `;

        const genAI = new GoogleGenerativeAI(API_KEY);
        const model = genAI.getGenerativeModel({ model: MODEL_NAME });

        const result = await model.generateContent(prompt);
        const response = await result.response;
        const botResponse = response.text();

        return formatBotResponse(botResponse, userId);
    } catch (error) {
        console.error('[ERROR] Failed to process chat:', error);
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
        if (event.type !== 'message' || event.message.type !== 'text') {
            console.log('[DEBUG] Ignoring non-text message event');
            return Promise.resolve(null);
        }

        const userInput = event.message.text;
        const userId = event.source.userId;
        console.log('[DEBUG] Received user input:', userInput);

        const botResponse = await runChat(userInput, userId);
        console.log('[DEBUG] Sending bot response:', botResponse);

        return await lineClient.replyMessage(event.replyToken, {
            type: 'text',
            text: botResponse
        });
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

// Start the server
app.listen(port, () => {
    console.log(`Server running on port ${port}`);
});