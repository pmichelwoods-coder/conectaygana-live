require('dotenv').config();
const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');

const app = express();
const PORT = process.env.PORT || 5001;

// Middleware
app.use(cors());
app.use(express.json());

// Health check endpoint
app.get('/api/health', (req, res) => {
    res.json({
        status: 'OK',
        service: 'Digital Partner Hand API',
        timestamp: new Date().toISOString(),
        environment: {
            MESSAGGIO_API_KEY: process.env.MESSAGGIO_API_KEY ? '✅ Set' : '❌ Missing',
            WHATSAPP_PHONE_NUMBER_ID: process.env.WHATSAPP_PHONE_NUMBER_ID ? '✅ Set' : '❌ Missing',
            PORT: process.env.PORT || '5001',
            NODE_ENV: process.env.NODE_ENV || 'development'
        }
    });
});

// Root endpoint
app.get('/', (req, res) => {
    res.json({
        message: 'Digital Partner Hand API',
        version: '1.0.0',
        endpoints: {
            health: '/api/health',
            testWhatsApp: '/api/test-whatsapp',
            webhook: '/api/webhook'
        }
    });
});

// Test WhatsApp endpoint with Messaggio
app.post('/api/test-whatsapp', async (req, res) => {
    try {
        const { phoneNumber, message } = req.body;
        
        // Validate required fields
        if (!phoneNumber || !message) {
            return res.status(400).json({ 
                error: 'Phone number and message required',
                tip: 'Use format: {"phoneNumber":"8095551234","message":"Hello"}'
            });
        }
        
        // Format phone number with country code
        const formattedPhone = phoneNumber.startsWith('+') ? phoneNumber : `+${phoneNumber}`;
        
        console.log('📱 Sending WhatsApp via Messaggio to:', formattedPhone);
        console.log('📝 Message:', message);
        console.log('🔑 API Key present:', process.env.MESSAGGIO_API_KEY ? '✅ Yes' : '❌ No');
        console.log('📋 Phone Number ID:', process.env.WHATSAPP_PHONE_NUMBER_ID || 'Not set');
        
        // Check if API key exists
        if (!process.env.MESSAGGIO_API_KEY) {
            console.error('❌ MESSAGGIO_API_KEY not set in environment');
            return res.status(500).json({ 
                error: 'Messaggio API key not configured',
                tip: 'Add MESSAGGIO_API_KEY to environment variables in Render'
            });
        }
        
        // Try sending via Messaggio API
        let response;
        let data;
        
        try {
            // Option 1: Using Bearer token authentication
            response = await fetch('https://api.messaggio.com/v1/messages', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${process.env.MESSAGGIO_API_KEY}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    to: formattedPhone,
                    text: message,
                    type: 'text'
                })
            });
            
            data = await response.json();
            console.log('📨 Messaggio API Response:', JSON.stringify(data, null, 2));
            
        } catch (fetchError) {
            console.error('❌ Fetch error:', fetchError);
            
            // Try alternative authentication method
            console.log('🔄 Trying alternative authentication method...');
            
            response = await fetch('https://api.messaggio.com/v1/messages', {
                method: 'POST',
                headers: {
                    'X-API-Key': process.env.MESSAGGIO_API_KEY,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    to: formattedPhone,
                    text: message,
                    type: 'text'
                })
            });
            
            data = await response.json();
            console.log('📨 Alternative API Response:', JSON.stringify(data, null, 2));
        }
        
        // Check if response was successful
        if (!response.ok) {
            const errorDetails = {
                status: response.status,
                statusText: response.statusText,
                data: data
            };
            
            console.error('❌ API Error:', errorDetails);
            
            return res.status(500).json({ 
                error: 'Failed to send WhatsApp',
                details: errorDetails,
                tip: 'Check your Messaggio API key and WhatsApp number configuration'
            });
        }
        
        // Success!
        console.log('✅ WhatsApp message sent successfully!');
        
        res.json({ 
            success: true, 
            message: 'WhatsApp message sent successfully',
            data: data,
            to: formattedPhone
        });
        
    } catch (error) {
        console.error('❌ Server Error:', error);
        res.status(500).json({ 
            error: 'Failed to send WhatsApp',
            details: error.message,
            stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
        });
    }
});

// Webhook endpoint for receiving messages (optional)
app.post('/api/webhook', (req, res) => {
    console.log('📨 Webhook received:', req.body);
    res.status(200).json({ status: 'received' });
});

// WhatsApp webhook verification (for Meta)
app.get('/api/webhook', (req, res) => {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];
    
    if (mode && token) {
        if (mode === 'subscribe' && token === process.env.WEBHOOK_VERIFY_TOKEN) {
            console.log('✅ Webhook verified');
            res.status(200).send(challenge);
        } else {
            res.sendStatus(403);
        }
    } else {
        res.sendStatus(400);
    }
});

// Start server
app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`🔗 Health check: http://localhost:${PORT}/api/health`);
    console.log(`📱 Test WhatsApp: POST http://localhost:${PORT}/api/test-whatsapp`);
    console.log('✅ Environment:');
    console.log(`   - MESSAGGIO_API_KEY: ${process.env.MESSAGGIO_API_KEY ? 'Set' : 'Not set'}`);
    console.log(`   - WHATSAPP_PHONE_NUMBER_ID: ${process.env.WHATSAPP_PHONE_NUMBER_ID ? 'Set' : 'Not set'}`);
});

module.exports = app;