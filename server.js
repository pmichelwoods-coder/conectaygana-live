require('dotenv').config();
const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');

const app = express();
const PORT = process.env.PORT || 5001;

// Middleware
app.use(cors());
app.use(express.json());

// Your Messaggio credentials
const MESSAGGIO_LOGIN = 'a88a79e9de5345ea8985910bf91240fc';
const WHATSAPP_FROM = 'd934r7odajas738cbf30';
const WHATSAPP_NUMBER = '+18298172104';
const PROJECT_NAME = 'Digital Partner Hand';

// Health check
app.get('/api/health', (req, res) => {
    res.json({
        status: 'OK',
        service: PROJECT_NAME,
        whatsappNumber: WHATSAPP_NUMBER,
        messaggioConfigured: true,
        projectLogin: 'd92kko9jfeec73bck270',
        senderCode: WHATSAPP_FROM,
        timestamp: new Date().toISOString()
    });
});

// Root endpoint
app.get('/', (req, res) => {
    res.json({
        message: `${PROJECT_NAME} API`,
        version: '1.0.0',
        whatsappNumber: WHATSAPP_NUMBER,
        endpoints: {
            health: '/api/health',
            sendWhatsApp: '/api/send-whatsapp',
            testMyNumber: '/api/test-my-number',
            webhook: '/api/webhook/messaggio',
            checkWhatsAppStatus: '/api/check-whatsapp-status',
            getChannels: '/api/get-channels'
        }
    });
});

// Get all channels from Messaggio
app.get('/api/get-channels', async (req, res) => {
    try {
        const response = await fetch('https://msg.messaggio.com/api/v1/channels', {
            method: 'GET',
            headers: {
                'Accept': 'application/json',
                'Messaggio-Login': MESSAGGIO_LOGIN
            }
        });
        
        const data = await response.json();
        
        res.json({
            success: true,
            channels: data,
            activeSender: WHATSAPP_FROM,
            whatsappNumber: WHATSAPP_NUMBER
        });
    } catch (error) {
        console.error('Error fetching channels:', error);
        res.status(500).json({ 
            error: 'Failed to fetch channels',
            details: error.message 
        });
    }
});

// Check WhatsApp channel status
app.get('/api/check-whatsapp-status', async (req, res) => {
    try {
        // First, get all channels to verify WhatsApp is active
        const response = await fetch('https://msg.messaggio.com/api/v1/channels', {
            method: 'GET',
            headers: {
                'Accept': 'application/json',
                'Messaggio-Login': MESSAGGIO_LOGIN
            }
        });
        
        const data = await response.json();
        
        // Find WhatsApp channel
        const whatsappChannel = data.find(channel => 
            channel.type === 'whatsapp' || 
            channel.code === WHATSAPP_FROM ||
            channel.name === 'Digital Partner Hand'
        );
        
        res.json({
            success: true,
            whatsappChannel: whatsappChannel || 'Not found',
            allChannels: data,
            message: '✅ WhatsApp channel found! Ready to send messages.' + 
                     (whatsappChannel ? '' : ' ⚠️ WhatsApp channel not found - check configuration')
        });
    } catch (error) {
        console.error('Error checking channels:', error);
        res.status(500).json({ 
            error: 'Failed to check channels',
            details: error.message 
        });
    }
});

// Send WhatsApp message via Messaggio
app.post('/api/send-whatsapp', async (req, res) => {
    try {
        const { phoneNumber, message, mediaUrl, caption } = req.body;
        
        if (!phoneNumber || !message) {
            return res.status(400).json({ 
                error: 'Phone number and message required',
                tip: 'Use format: {"phoneNumber":"8299394470","message":"Hello"}'
            });
        }
        
        // Clean phone number (remove + sign if present)
        const cleanPhone = phoneNumber.replace(/\+/g, '');
        
        console.log(`📱 Sending WhatsApp from ${WHATSAPP_NUMBER} to:`, cleanPhone);
        console.log('📝 Message:', message);
        console.log('📤 Using sender code:', WHATSAPP_FROM);
        
        // Build payload for Messaggio
        const payload = {
            recipients: [
                { phone: cleanPhone }
            ],
            channels: ['whatsapp'],
            whatsapp: {
                from: WHATSAPP_FROM,
                content: [
                    {
                        type: 'text',
                        text: message
                    }
                ]
            }
        };
        
        // Add media content if provided
        if (mediaUrl) {
            payload.whatsapp.content.push({
                type: 'media',
                media: {
                    url: mediaUrl,
                    caption: caption || ''
                }
            });
        }
        
        console.log('📤 Sending payload to Messaggio...');
        
        const response = await fetch('https://msg.messaggio.com/api/v1/send', {
            method: 'POST',
            headers: {
                'Accept': 'application/json',
                'Content-Type': 'application/json',
                'Messaggio-Login': MESSAGGIO_LOGIN
            },
            body: JSON.stringify(payload)
        });
        
        const data = await response.json();
        console.log('📨 Messaggio Response:', JSON.stringify(data, null, 2));
        
        if (!response.ok) {
            let errorMessage = 'Failed to send WhatsApp';
            if (data.detail) {
                errorMessage = data.detail;
            }
            
            return res.status(response.status || 500).json({ 
                error: errorMessage,
                details: data,
                status: response.status
            });
        }
        
        // Check for individual message errors
        if (data.messages && data.messages.length > 0) {
            const messageResult = data.messages[0];
            if (messageResult.error) {
                return res.status(500).json({
                    error: 'Message rejected by Messaggio',
                    details: messageResult.error
                });
            }
            
            console.log('✅ Message accepted with ID:', messageResult.message_id);
            
            return res.json({ 
                success: true, 
                message: 'WhatsApp message sent successfully',
                message_id: messageResult.message_id,
                accepted_at: data.accepted_at,
                from: WHATSAPP_NUMBER,
                to: cleanPhone,
                sender_code: WHATSAPP_FROM
            });
        }
        
        return res.status(500).json({
            error: 'Unexpected response from Messaggio',
            details: data
        });
        
    } catch (error) {
        console.error('❌ Server Error:', error);
        res.status(500).json({ 
            error: 'Failed to send WhatsApp',
            details: error.message
        });
    }
});

// Test endpoint specifically for your new number
app.post('/api/test-my-number', async (req, res) => {
    try {
        const testMessage = req.body.message || `✅ Test from ${PROJECT_NAME} at ${new Date().toLocaleString()}`;
        
        // Send to yourself to verify connection
        const cleanNumber = WHATSAPP_NUMBER.replace(/\+/g, '');
        
        console.log('🧪 Sending test message to:', cleanNumber);
        console.log('📤 Using sender code:', WHATSAPP_FROM);
        
        const payload = {
            recipients: [{ phone: cleanNumber }],
            channels: ['whatsapp'],
            whatsapp: {
                from: WHATSAPP_FROM,
                content: [
                    {
                        type: 'text',
                        text: testMessage
                    }
                ]
            }
        };
        
        const response = await fetch('https://msg.messaggio.com/api/v1/send', {
            method: 'POST',
            headers: {
                'Accept': 'application/json',
                'Content-Type': 'application/json',
                'Messaggio-Login': MESSAGGIO_LOGIN
            },
            body: JSON.stringify(payload)
        });
        
        const data = await response.json();
        console.log('📨 Test response:', JSON.stringify(data, null, 2));
        
        if (!response.ok) {
            return res.status(response.status).json({
                error: 'Failed to send test message',
                details: data,
                tip: 'Check if your WhatsApp channel is active'
            });
        }
        
        res.json({
            success: true,
            message: '✅ Test message sent to your number successfully!',
            from: WHATSAPP_NUMBER,
            to: cleanNumber,
            message_id: data.messages?.[0]?.message_id || 'N/A',
            sender_code: WHATSAPP_FROM,
            response: data
        });
        
    } catch (error) {
        console.error('Test error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Webhook endpoint for Messaggio incoming messages
app.post('/api/webhook/messaggio', (req, res) => {
    try {
        const webhookData = req.body;
        console.log('📨 Webhook received from Messaggio:', JSON.stringify(webhookData, null, 2));
        
        // Process different webhook events
        if (webhookData.event === 'message.received') {
            console.log('💬 New incoming message from:', webhookData.data?.from);
            // Handle incoming message here
            // You can store it in a database, send auto-reply, etc.
        }
        
        if (webhookData.event === 'message.sent') {
            console.log('✅ Message sent successfully:', webhookData.data?.message_id);
        }
        
        if (webhookData.event === 'message.failed') {
            console.log('❌ Message failed:', webhookData.data?.error);
        }
        
        // Acknowledge receipt
        res.status(200).json({ 
            status: 'received',
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        console.error('Webhook error:', error);
        res.status(500).json({ error: 'Webhook processing failed' });
    }
});

// Start server
app.listen(PORT, () => {
    console.log('========================================');
    console.log(`🚀 ${PROJECT_NAME} API`);
    console.log(`📱 WhatsApp Number: ${WHATSAPP_NUMBER}`);
    console.log(`🔑 Sender Code: ${WHATSAPP_FROM}`);
    console.log(`🔗 Project Login: d92kko9jfeec73bck270`);
    console.log('========================================');
    console.log('✅ ALL CREDENTIALS CONFIGURED!');
    console.log('========================================');
    console.log('📋 Available endpoints:');
    console.log(`   • GET  http://localhost:${PORT}/api/health`);
    console.log(`   • GET  http://localhost:${PORT}/api/check-whatsapp-status`);
    console.log(`   • GET  http://localhost:${PORT}/api/get-channels`);
    console.log(`   • POST http://localhost:${PORT}/api/send-whatsapp`);
    console.log(`   • POST http://localhost:${PORT}/api/test-my-number`);
    console.log(`   • POST http://localhost:${PORT}/api/webhook/messaggio`);
    console.log('========================================');
    console.log('🧪 TEST YOUR CONNECTION:');
    console.log(`   curl -X POST http://localhost:${PORT}/api/test-my-number`);
    console.log('========================================');
});

module.exports = app;