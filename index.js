//Dependencies
const express = require('express');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const line = require('@line/bot-sdk');
const path = require('path');
require('dotenv-flow').config();;
const fs = require('fs');
const similarity = require('string-similarity');
const wordcut = require('wordcut');
const { google } = require('googleapis');
const { time } = require('console');
const port = process.env.PORT || 3002; // Fallback to 3000 if PORT is not set

//Start word cut for Thai Tokenizer
wordcut.init();

const app = express();

// Parse JSON request bodies
app.use(express.json());

// LINE Messaging API configuration
const lineConfig = {
    channelAccessToken: process.env.LINE_ACCESS_TOKEN,
    channelSecret: process.env.LINE_SECRET_TOKEN,
};
const lineClient = new line.Client(lineConfig);

// Chatbot Configuration
const MODEL_NAME = "gemini-1.5-flash-latest";
const API_KEY = process.env.GOOGLE_API_KEY;

// Load data.json
const dataPath = path.join(__dirname, 'data/data.json');
const rawData = fs.readFileSync(dataPath);
const questionsData = JSON.parse(rawData);

// Load info.json
const infoPath = path.join(__dirname, 'data/info.json');
const rawInfo = fs.readFileSync(infoPath);
const additionalInfo = JSON.parse(rawInfo);

// Google Sheets Configuration
const SPREADSHEET_ID = process.env.SPREADSHEET_ID;
const SHEET_NAME = "Logs";
const auth = new google.auth.GoogleAuth({
    keyFile: path.join(__dirname, 'credentials.json'),
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
});

async function initializeGoogleSheets() {
    const sheets = google.sheets({ version: 'v4', auth });
    
    try {
        // Check if the sheet exists with correct range format
        await sheets.spreadsheets.values.get({
            spreadsheetId: SPREADSHEET_ID,
            range: `${SHEET_NAME}!A1:C1`  // Changed from SHEET_NAME to specific range
        });
        console.log('[DEBUG] Sheet already exists');
    } catch (error) {
        if (error.code === 404 || error.message.includes('Unable to parse range')) {
            console.log('[DEBUG] Creating new sheet');
            try {
                // Create the sheet if it doesn't exist
                await sheets.spreadsheets.batchUpdate({
                    spreadsheetId: SPREADSHEET_ID,
                    resource: {
                        requests: [{
                            addSheet: {
                                properties: {
                                    title: SHEET_NAME,
                                    gridProperties: {
                                        rowCount: 1000,
                                        columnCount: 3
                                    }
                                }
                            }
                        }]
                    }
                });
                
                // Add headers with correct range format
                await sheets.spreadsheets.values.update({
                    spreadsheetId: SPREADSHEET_ID,
                    range: `${SHEET_NAME}!A1:D1`,
                    valueInputOption: 'RAW',
                    resource: {
                        values: [['Timestamp', 'User Question', 'Bot Response','Response Type']]
                    }
                });
                console.log('[DEBUG] Sheet created and headers added');
            } catch (createError) {
                if (createError.message.includes('Already exists')) {
                    console.log('[DEBUG] Sheet already exists, proceeding with headers');
                    // Try to update headers anyway
                    await sheets.spreadsheets.values.update({
                        spreadsheetId: SPREADSHEET_ID,
                        range: `${SHEET_NAME}!A1:D1`,
                        valueInputOption: 'RAW',
                        resource: {
                            values: [['Timestamp', 'User Question', 'Bot Response', 'Response Type']]
                        }
                    });
                } else {
                    throw createError;
                }
            }
        } else {
            throw error;
        }
    }
}

// In-memory storage for conversation history
const conversationHistory = {};

// Function to store conversation history
function storeConversation(userId, userInput, botResponse) {
    if (!conversationHistory[userId]) {
        conversationHistory[userId] = [];
    }
    conversationHistory[userId].push({ userInput, botResponse });

    // Keep only the last 3 conversations
    if (conversationHistory[userId].length > 3) {
        conversationHistory[userId].shift();
    }
}

// Tokenization function for Thai text
function tokenizeThaiText(text) {
    return wordcut.cut(text);
}

// Function to format bot response
function formatBotResponse(responseText, userId) {
    let formattedResponse = responseText.replace(/น้องอะตอมยูงทอง/g, 'น้องอะตอมยูงทอง😊');
    formattedResponse = formattedResponse.replace(/ค่ะ/g, 'ค่ะ✨');
    return formattedResponse;
}

// Function to append data to Google Sheet
async function appendToGoogleSheet(timestamp, userQuestion, botResponse, responseType) {
    try {
        const sheets = google.sheets({ version: 'v4', auth });
        
        // Get the last row number
        const response = await sheets.spreadsheets.values.get({
            spreadsheetId: SPREADSHEET_ID,
            range: `${SHEET_NAME}!A:A`
        });
        
        const nextRow = (response.data.values?.length || 0) + 1;
        
        // Append data to the next row
        await sheets.spreadsheets.values.update({
            spreadsheetId: SPREADSHEET_ID,
            range: `${SHEET_NAME}!A${nextRow}:D${nextRow}`,
            valueInputOption: 'RAW',
            resource: {
                values: [[timestamp, userQuestion, botResponse, responseType]]
            }
        });
        
        console.log('[DEBUG] Data successfully appended to Google Sheet');
    } catch (error) {
        console.error('[ERROR] Failed to append data to Google Sheet:', error.message);
        // Attempt to initialize the sheet if it doesn't exist
        if (error.code === 404) {
            try {
                await initializeGoogleSheets();
                // Retry appending data
                await appendToGoogleSheet(timestamp, userQuestion, botResponse, responseType);
            } catch (initError) {
                console.error('[ERROR] Failed to initialize Google Sheet:', initError.message);
            }
        }
    }
}

// Main chatbot function
async function runChat(userInput, userId) {
    try {
        console.log('[DEBUG] Checking RAG method...');
        
        // Tokenize user input
        const tokenizedInput = tokenizeThaiText(userInput);
        console.log('[DEBUG] Tokenized Input:', tokenizedInput);

        const threshold = 0.65;
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

        let botResponse;
        if (highestScore >= threshold) {
            console.log('[DEBUG] Match found in data.json with score:', highestScore);
            botResponse = bestMatch.answer;
            responseType = "RAG Method";
        } else {
            console.log(`[DEBUG] No sufficient match found. Highest similarity score: ${(highestScore * 100).toFixed(2)}%`);

            console.log('[DEBUG] Falling back to Gemini API...');
            
            // Get the last 3 conversations
            const recentConversations = conversationHistory[userId] || [];
            const conversationContext = recentConversations.map(conv => 
                `User: ${conv.userInput}\nBot: ${conv.botResponse}`
            ).join('\n');

            const prompt = `
                You are a female chatbot, an offsprings of dog and cat for the Faculty of Science and Technology named "อะตอมยูงทอง", Thammasat University. 
                Use concise Thai language with emojis and politeness. Answer the user's question based on the following info (you don't have to say
                "สวัสดีค่ะ" unless they greets you first):
                ${JSON.stringify(additionalInfo, null, 2)}
                
                Your recent conversation with this user:
                ${conversationContext}
                
                Current User Question: ${userInput}
                Bot:
            `;

            const genAI = new GoogleGenerativeAI(API_KEY);
            const model = genAI.getGenerativeModel({ model: MODEL_NAME });

            const result = await model.generateContent(prompt);
            console.log(prompt);
            const response = await result.response;
            botResponse = response.text();
            responseType = "Generative AI";
        }

        // Format the bot response
        const formattedResponse = formatBotResponse(botResponse, userId);

        // Store the conversation
        storeConversation(userId, userInput, formattedResponse);

        // Log the interaction to Google Sheets
        const timestamp = new Date().toLocaleString('en-US', { timeZone: 'Asia/Bangkok' });
        await appendToGoogleSheet(timestamp, userInput, formattedResponse, responseType);

        return formattedResponse;
    } catch (error) {
        console.error('[ERROR] Failed to process chat:', error);
        responseType = "Fallback";
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

// Start the server with Google Sheets initialization
app.listen(port, async () => {
    console.log(`Server running on port ${port}`);
    try {
        await initializeGoogleSheets();
        console.log('Google Sheets integration initialized successfully');
    } catch (error) {
        console.error('Failed to initialize Google Sheets:', error.message);
    }
});