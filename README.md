# ATOMIC SCITU LINE Official Integrated Chatbot 🤖

## Overview
A smart LINE chatbot for the Faculty of Science and Technology, Thammasat University, powered by Google's Gemini AI. The chatbot, named "อะตอมยูงทอง", provides information and assistance to students and faculty members.

## Tech Stack 🛠️

### Core Technologies
- **Node.js** - Runtime environment
- **Express.js** - Web application framework
- **Serverless Framework** - For AWS Lambda deployment

### AI/ML Integration
- **Google Gemini AI** - For natural language processing and response generation
- **Thai Language Support** - Native Thai language processing capabilities

### External Services
- **LINE Messaging API** - For chatbot integration with LINE
- **Google Sheets API** - For conversation logging and data storage
- **ngrok** - For local development and testing

### Development Tools
- **Visual Studio Code** - Primary IDE
- **Git** - Version control
- **npm** - Package management

### Infrastructure
- **AWS Lambda** - Serverless compute
- **AWS API Gateway** - API management

## Key Features ✨
- Thai language support with emoji integration
- Conversation context awareness
- Automated logging to Google Sheets
- Serverless architecture
- Real-time response generation
- Memory management for conversation history

## Project Structure 📁
```plaintext
ATOMIC-SCITU-LINE-OFFICAIL-INTEGRATED-CHATBOT/
├── index.js            # Main application entry point
├── serverless.yml      # Serverless configuration
├── package.json        # Dependencies and scripts
└── .env               # Environment variables
```

## Environment Setup
Requires the following environment variables:
```env
CHANNEL_ACCESS_TOKEN=your_line_channel_token
CHANNEL_SECRET=your_line_channel_secret
API_KEY=your_gemini_api_key
SPREADSHEET_ID=your_google_sheets_id
```

This intelligent chatbot combines modern cloud technologies with advanced AI capabilities to provide a seamless experience for the Faculty of Science and Technology community.
