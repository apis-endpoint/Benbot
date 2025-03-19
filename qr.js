const express = require('express');
const fs = require('fs');
const { exec } = require("child_process");
const router = express.Router();
const pino = require("pino");
const {
    default: makeWASocket,
    useMultiFileAuthState,
    delay,
    makeCacheableSignalKeyStore,
    Browsers,
    jidNormalizedUser
} = require("@whiskeysockets/baileys");
const QRCode = require('qrcode');

function removeFile(FilePath) {
    if (!fs.existsSync(FilePath)) return false;
    fs.rmSync(FilePath, { recursive: true, force: true });
}

router.get('/', async (req, res) => {
    async function startQRSession() {
        const { state, saveCreds } = await useMultiFileAuthState(`./session`);

        try {
            let bot = makeWASocket({
                auth: {
                    creds: state.creds,
                    keys: makeCacheableSignalKeyStore(state.keys, pino({ level: "fatal" }).child({ level: "fatal" })),
                },
                printQRInTerminal: false,
                logger: pino({ level: "fatal" }).child({ level: "fatal" }),
                browser: Browsers.macOS("Safari"),
            });

            bot.ev.on('creds.update', async () => {
                await saveCreds();
                console.log("✅ Credentials updated and saved.");
            });

            bot.ev.on("connection.update", async (s) => {
                const { connection, lastDisconnect, qr } = s;

                if (qr) {
                    const qrImage = await QRCode.toDataURL(qr);
                    res.send(`
                        <html lang="en">
                            <head>
                                <meta charset="UTF-8">
                                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                                <title>Scan QR Code</title>
                                <style>
                                    body {
                                        display: flex;
                                        justify-content: center;
                                        align-items: center;
                                        height: 100vh;
                                        background-color: black;
                                        color: white;
                                        font-family: Arial, sans-serif;
                                    }
                                    .container {
                                        text-align: center;
                                    }
                                    img {
                                        width: 250px;
                                        height: 250px;
                                        border-radius: 10px;
                                    }
                                    .reload {
                                        display: block;
                                        margin-top: 15px;
                                        padding: 10px;
                                        background: #3498db;
                                        color: white;
                                        text-decoration: none;
                                        border-radius: 5px;
                                    }
                                </style>
                            </head>
                            <body>
                                <div class="container">
                                    <h2>Scan This QR Code</h2>
                                    <img src="${qrImage}" alt="QR Code"/>
                                    <a href="javascript:location.reload()" class="reload">Reload</a>
                                </div>
                            </body>
                        </html>
                    `);
                }

                if (connection === "open") {
                    console.log("✅ WhatsApp Connected!");

                    try {
                        await delay(5000); // زمان کوتاه برای ثبت اطلاعات

                        // چک کردن فایل creds.json بعد از ذخیره
                        if (!fs.existsSync('./session/creds.json')) {
                            console.log("⚠️ Error: creds.json not found!");
                            return;
                        }

                        const sessionData = fs.readFileSync('./session/creds.json', 'utf-8');
                        const userJid = jidNormalizedUser(bot.user.id);

                        // ارسال پیام موفقیت‌آمیز
                        await bot.sendMessage(userJid, { text: "*SESSION ID GENERATED SUCCESSFULLY* ✅\n" });
                        await delay(2000);
                        const sessionMessage = await bot.sendMessage(userJid, { text: sessionData });
                        await bot.sendMessage(userJid, {
                            text: `*SESSION ID GENERATED SUCCESSFULLY* ✅

*Join our YouTube channel for tutorials* 🎥  
https://youtube.com/@nothingben01?si=kMgsSUMmgAtfRfVE

*BEN-WHATSAPP-BOT* 🥀`,
                            quoted: sessionMessage
                        });

                        console.log(`✅ Session ID sent to ${userJid}`);
                    } catch (e) {
                        console.log("❌ Error sending session ID:", e);
                        exec('pm2 restart bot');
                    }

                    await delay(100);
                    removeFile('./session');
                    console.log("🗑️ Session folder removed.");
                    process.exit(0);
                } else if (connection === "close" && lastDisconnect?.error?.output?.statusCode !== 401) {
                    console.log("🔄 Connection closed, retrying...");
                    await delay(10000);
                    startQRSession();
                }
            });
        } catch (err) {
            console.log("❌ Fatal Error:", err);
            exec('pm2 restart bot');
            startQRSession();
        }
    }

    return await startQRSession();
});

process.on('uncaughtException', function (err) {
    console.log('⚠️ Caught exception:', err);
    exec('pm2 restart bot');
});

module.exports = router;