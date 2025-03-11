import "dotenv/config";
import express from "express";
import cors from "cors";
import nodemailer from "nodemailer";
import bodyParser from "body-parser";
import { Telegraf, Markup } from "telegraf";


const app = express();
app.use(cors());
app.use(express.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(cors({
    origin: "",  // ✅ Use your frontend URL
    methods: "GET,POST"
}));

const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);

// Configure Nodemailer (SMTP)
const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: process.env.SMTP_PORT,
    secure: false,
    auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
    },
});

// Store pending approvals for Telegram actions
let pendingApprovals = {};

// Handle User Registration
app.post("/register", async (req, res) => {
    try {
        const { fullName, email, mobile, whatsapp } = req.body;
        const amount = 1200;

        // Step 1: Send Email to User
        const userMailOptions = {
            from: process.env.SMTP_USER,
            to: email,
            subject: "Thanks for Registering - Nainital Trip",
            text: `Hello ${fullName},\n\nThank you for registering for the Nainital Trip! Soon you will receive a seat confirmation mail from our team.\n\nFor any information, contact us.\n\nBest Regards,\nTrip Organizer`,
        };
        await transporter.sendMail(userMailOptions);

        // Step 2: Send Email to Admin
        const adminMailOptions = {
            from: process.env.SMTP_USER,
            to: process.env.SMTP_ADMIN, // Your email
            subject: "New Trip Registration",
            text: `📩 New Registration Details:\n\n👤 Name: ${fullName}\n📧 Email: ${email}\n📞 Mobile: ${mobile}\n💰 Amount Paid: ₹${amount}`,
        };
        await transporter.sendMail(adminMailOptions);

        // Step 3: Send Telegram Notification with Accept/Reject Buttons
        const telegramMessage = `📩 *New Registration*\n\n👤 Name: ${fullName}\n📧 Email: ${email}\n📞 Mobile: ${mobile}\n💰 Amount: ₹${amount}\n\nConfirm Seat?`;

        const inlineKeyboard = Markup.inlineKeyboard([
            Markup.button.callback("✅ Accept", `accept_${email}`),
            Markup.button.callback("❌ Reject", `reject_${email}`),
        ]);

        // Store pending approval
        pendingApprovals[email] = { fullName, email };

        await bot.telegram.sendMessage(process.env.TELEGRAM_CHAT_ID, telegramMessage, { 
            parse_mode: "Markdown", 
            ...inlineKeyboard 
        });

        res.json({ success: true, message: "Registration successful. Check your email!" });
    } catch (error) {
        console.error("Error:", error);
        res.status(500).json({ success: false, message: "Something went wrong." });
    }
});

// Handle Telegram Accept Action
bot.action(/accept_(.+)/, async (ctx) => {
    const email = ctx.match[1];

    if (pendingApprovals[email]) {
        const { fullName } = pendingApprovals[email];

        // Send Seat Confirmation Email
        const confirmMailOptions = {
            from: process.env.SMTP_USER,
            to: email,
            subject: "Your Seat is Confirmed - Nainital Trip",
            text: `Dear ${fullName},\n\nCongratulations! Your seat for the Nainital Trip is confirmed. We look forward to seeing you.\n\nBest Regards,\nTrip Organizer`,
        };
        await transporter.sendMail(confirmMailOptions);

        delete pendingApprovals[email];

        await ctx.editMessageText(`✅ Seat Confirmed for ${fullName}!`);
    } else {
        await ctx.reply("This request is no longer available.");
    }
});

// Handle Telegram Reject Action
bot.action(/reject_(.+)/, async (ctx) => {
    const email = ctx.match[1];

    if (pendingApprovals[email]) {
        delete pendingApprovals[email];
        await ctx.editMessageText("❌ Registration Rejected.");
    } else {
        await ctx.reply("This request is no longer available.");
    }
});

// Health Check Route
app.get("/", (req, res) => {
    res.send("✅ Backend is running!");
});

// Start Express Server & Telegram Bot
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
bot.launch();
