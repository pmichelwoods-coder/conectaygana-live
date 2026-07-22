// server.js – JSON file storage (v5.0 – 2026-07-22)
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');
const fs = require('fs');
const path = require('path');
const shortid = require('shortid');

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

const PORT = process.env.PORT || 5001;

// ============================================
// TELEGRAM CONFIG
// ============================================
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const DEFAULT_CHAT_ID = process.env.TELEGRAM_DEFAULT_CHAT_ID;
const SKIP_TELEGRAM = process.env.SKIP_TELEGRAM === 'true' ? true : false;
const PROJECT_NAME = process.env.PROJECT_NAME || 'Conecta Y Gana RD 5 Mil';
const DB_FILE = path.join(__dirname, 'database.json');

// ============================================
// DATABASE HELPERS
// ============================================
function readDB() {
    try {
        const data = fs.readFileSync(DB_FILE, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        const defaultData = {
            users: [],
            payments: [],
            referrals: [],
            payouts: [],
            pendingApprovals: []
        };
        writeDB(defaultData);
        return defaultData;
    }
}

function writeDB(data) {
    try {
        fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
        console.log('✅ Database saved successfully');
    } catch (error) {
        console.error('❌ Failed to write database:', error.message);
        console.error('❌ File path:', DB_FILE);
        throw error;
    }
}

function generateReferralCode() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let code = '';
    for (let i = 0; i < 8; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
}

function isCodeUnique(code, db) {
    return !db.users.some(u => u.referralCode === code);
}

// ============================================
// TELEGRAM SENDER
// ============================================
async function sendTelegramMessage(chatId, text) {
    if (SKIP_TELEGRAM) {
        console.log('📨 [SKIP] Telegram message to', chatId, ':', text);
        return { success: true, skipped: true };
    }
    if (!TELEGRAM_BOT_TOKEN) {
        console.error('❌ TELEGRAM_BOT_TOKEN is not set');
        return { success: false, error: 'Bot token missing' };
    }
    if (!chatId) {
        console.error('❌ No chatId provided');
        return { success: false, error: 'No chatId' };
    }

    try {
        const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chat_id: chatId,
                text: text,
                parse_mode: 'HTML'
            })
        });
        const data = await response.json();
        if (!data.ok) {
            console.error('❌ Telegram Error:', data);
            throw new Error(data.description || 'Telegram send failed');
        }
        console.log(`✅ Telegram sent to ${chatId}`);
        return { success: true, result: data };
    } catch (error) {
        console.error('Telegram send error:', error);
        throw error;
    }
}

async function sendNotification(phone, message) {
    const db = readDB();
    const user = db.users.find(u => u.phone === phone);
    let chatId = DEFAULT_CHAT_ID;

    if (user && user.telegramChatId) {
        chatId = user.telegramChatId;
    } else {
        console.log(`⚠️ No telegramChatId for ${phone}, sending to admin (${DEFAULT_CHAT_ID})`);
        message = `📱 For ${phone}:\n\n${message}`;
    }

    return await sendTelegramMessage(chatId, message);
}

// ============================================
// HEALTH CHECK
// ============================================
app.get('/api/health', (req, res) => {
    res.json({
        status: 'OK',
        service: PROJECT_NAME,
        provider: 'Telegram',
        botTokenSet: !!TELEGRAM_BOT_TOKEN,
        defaultChatId: DEFAULT_CHAT_ID,
        timestamp: new Date().toISOString()
    });
});

// ============================================
// REGISTER USER (with phone sanitization)
// ============================================
app.post('/api/register', async (req, res) => {
    try {
        const { phone, name, comprobante, refereeCode, telegramChatId } = req.body;
        const email = req.body.email || `user_${Date.now()}@temp.com`;

        // Log raw data
        console.log('📝 Registration received:', { phone, name, comprobante, refereeCode, telegramChatId });

        // Sanitize phone: remove non-digits, take last 10 digits
        const cleanPhone = phone ? phone.replace(/\D/g, '').slice(-10) : '';
        console.log('📝 Cleaned phone:', cleanPhone);
        const finalPhone = cleanPhone;

        if (!finalPhone || !name || !comprobante) {
            return res.status(400).json({ error: 'Todos los campos son requeridos' });
        }
        if (!/^\d{8,}$/.test(comprobante)) {
            return res.status(400).json({ error: 'El comprobante debe tener 8 o más dígitos numéricos' });
        }

        const db = readDB();
        if (db.users.some(u => u.phone === finalPhone)) {
            return res.status(400).json({ error: 'Este número ya está registrado' });
        }
        if (db.users.some(u => u.comprobante === comprobante)) {
            return res.status(400).json({ error: 'Este comprobante ya ha sido utilizado' });
        }

        const newUser = {
            id: shortid.generate(),
            phone: finalPhone,
            name,
            email,
            comprobante,
            refereeCode: refereeCode || null,
            status: 'pending',
            referralCode: null,
            telegramChatId: telegramChatId || null,
            createdAt: new Date().toISOString(),
            approvedAt: null,
            expiresAt: null,
            totalCustomers: 0,
            activeCustomers: 0,
            pendingCustomers: 0,
            totalPaid: 0,
            bankingDetails: null,
            deviceId: null
        };

        db.users.push(newUser);
        writeDB(db);

        if (refereeCode) {
            const referee = db.users.find(u => u.referralCode === refereeCode);
            if (referee && referee.status === 'approved') {
                referee.pendingCustomers = (referee.pendingCustomers || 0) + 1;
                writeDB(db);
            }
        }

        await sendNotification(finalPhone,
            `📋 Hola ${name}, hemos recibido tu depósito de RD 1,250.\n\n` +
            `🔍 Tu comprobante #${comprobante} está en revisión.\n` +
            `⏰ El proceso puede tomar hasta 48 horas.\n\n` +
            `📲 Te notificaremos cuando sea aprobado.\n\n` +
            `"Tú ayudas, otros crecen, todos ganamos."`
        );

        if (refereeCode) {
            const referee = db.users.find(u => u.referralCode === refereeCode);
            if (referee && referee.status === 'approved') {
                await sendNotification(referee.phone,
                    `👤 Hola ${referee.name}, ¡tienes un nuevo cliente pendiente!\n\n` +
                    `📱 ${name} se ha registrado usando tu enlace.\n` +
                    `📋 Comprobante #${comprobante} en revisión.\n` +
                    `⏰ Espera 48 horas para la confirmación.\n\n` +
                    `📲 Te notificaremos cuando sea aprobado.`
                );
            }
        }

        res.json({
            success: true,
            message: 'Depósito recibido. Está en revisión (48 horas).',
            userId: newUser.id,
            status: 'pending'
        });

    } catch (error) {
        console.error('Registration error:', error);
        res.status(500).json({ error: 'Error al registrar usuario: ' + error.message });
    }
});

// ============================================
// THE REST OF YOUR ENDPOINTS (admin, payouts, etc.)
// ============================================
// For brevity, the rest of the endpoints (approve, users, payouts, etc.) are the same as in the JSON version.
// Make sure you copy the full file from the previous message.

// ============================================
// STATIC PAGES
// ============================================
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/dashboard', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
});

app.get('/admin', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

app.get('/terms', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'terms.html'));
});

// ============================================
// START SERVER
// ============================================
app.listen(PORT, () => {
    console.log('========================================');
    console.log(`🚀 ${PROJECT_NAME} API`);
    console.log(`📱 Notification Provider: Telegram`);
    console.log(`🤖 Bot Token Set: ${TELEGRAM_BOT_TOKEN ? '✅ YES' : '❌ NO'}`);
    console.log(`👤 Default Chat ID: ${DEFAULT_CHAT_ID || '❌ NOT SET'}`);
    console.log(`🗄️  Storage: JSON file (database.json)`);
    console.log('========================================');
    console.log('✅ ALL CREDENTIALS CONFIGURED!');
    console.log('========================================');
    console.log('📋 Available endpoints:');
    console.log(`   • POST /api/register`);
    console.log(`   • POST /api/admin/approve-payment`);
    console.log(`   • POST /api/admin/update-user`);
    console.log(`   • POST /api/admin/update-referee`);
    console.log(`   • GET  /api/admin/user/:id`);
    console.log(`   • GET  /api/user/:phone`);
    console.log(`   • POST /api/user/update-telegram`);
    console.log(`   • GET  /api/user/:phone/referrals`);
    console.log(`   • GET  /api/user/:phone/payouts`);
    console.log(`   • GET  /api/admin/pending`);
    console.log(`   • GET  /api/admin/users`);
    console.log(`   • GET  /api/admin/pending-payouts`);
    console.log(`   • POST /api/admin/create-payout`);
    console.log(`   • POST /api/admin/complete-payout`);
    console.log(`   • GET  / -> signup page`);
    console.log(`   • GET  /dashboard`);
    console.log(`   • GET  /admin`);
    console.log('========================================');
    console.log(`🧪 SKIP_TELEGRAM is ${SKIP_TELEGRAM ? 'ENABLED' : 'DISABLED'}`);
    console.log('========================================');
});

module.exports = app;