import "dotenv/config";
import express from "express";
import cors from "cors";
import nodemailer from "nodemailer";
import bodyParser from "body-parser";
import multer from "multer";
import { Telegraf, Markup } from "telegraf";
import fs from "fs";
import PDFDocument from "pdfkit";

const app = express();
const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);

// ✅ Ensure all required environment variables exist
if (!process.env.SMTP_USER || !process.env.SMTP_PASS || !process.env.SMTP_HOST || !process.env.SMTP_PORT || !process.env.TELEGRAM_BOT_TOKEN || !process.env.TELEGRAM_CHAT_ID) {
    console.error("❌ Missing environment variables. Please check your .env file.");
    process.exit(1);
}

app.use(cors({ origin: ["http://localhost:5173"], methods: "GET,POST" }));
app.use(express.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

// ✅ Configure Multer for Aadhaar uploads
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const uploadPath = "./uploads";
        if (!fs.existsSync(uploadPath)) fs.mkdirSync(uploadPath);
        cb(null, uploadPath);
    },
    filename: (req, file, cb) => {
        cb(null, `${Date.now()}-${file.originalname}`);
    }
});
const upload = multer({ storage });

// ✅ Configure Nodemailer (SMTP)
const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: process.env.SMTP_PORT,
    secure: false,
    auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
    },
});

// ✅ Handle User Registration
app.post("/register", upload.array("aadhaarFiles"), async (req, res) => {
    try {
        // ✅ Extract Data
        const { fullName, age, email, mobile, whatsapp, paymentType } = req.body;
        const additionalPeople = req.body.additionalPeople ? JSON.parse(req.body.additionalPeople) : [];
        const aadhaarFiles = req.files ? req.files.map(file => file.filename) : [];
        const bookingID = Math.floor(10000000 + Math.random() * 90000000);

        if (!fullName || !email || !mobile || !age || !paymentType) {
            return res.status(400).json({ success: false, message: "Missing required fields" });
        }

        // ✅ Calculate Total Cost
        const numPeople = additionalPeople.length + 1;
        const totalAmount = paymentType === "seat" ? numPeople * 1200 : numPeople * 3300;

        // ✅ Thank You Email for User
        const userThankYouEmail = `
            <h2>Thank You for Registering</h2>
            <p>Dear ${fullName},</p>
            <p>Your trip registration is received. We will confirm your seat soon.</p>
            <p><strong>Booking ID:</strong> ${bookingID}</p>
            <p><strong>Total Amount Paid:</strong> ₹${totalAmount}</p>
            <p>If your details are incorrect, please re-submit the form with the same transaction ID.</p>
            <p>For any queries, contact us.</p>
        `;

        await transporter.sendMail({
            from: process.env.SMTP_USER,
            to: email,
            subject: "Thank You for Registering",
            html: userThankYouEmail,
        });

        // ✅ Admin Notification Email
        const adminEmailContent = `
            <h2>New Trip Registration</h2>
            <p><strong>Booking ID:</strong> ${bookingID}</p>
            <p><strong>Main Person:</strong> ${fullName}</p>
            <p><strong>Email:</strong> ${email}</p>
            <p><strong>Mobile:</strong> ${mobile}</p>
            <p><strong>WhatsApp:</strong> ${whatsapp}</p>
            <p><strong>Total People:</strong> ${numPeople}</p>
            <p><strong>Amount Paid:</strong> ₹${totalAmount}</p>
            <h3>Aadhaar Files:</h3>
            <ul>${aadhaarFiles.map(file => `<li>${file}</li>`).join("")}</ul>
        `;

        await transporter.sendMail({
            from: process.env.SMTP_USER,
            to: process.env.SMTP_ADMIN,
            subject: "New Trip Registration Received",
            html: adminEmailContent,
        });

        // ✅ Telegram Notification with Inline Buttons
        const telegramMessage = `
        New Trip Registration
        Booking ID: ${bookingID}
        Main Person: ${fullName}
        Email: ${email}
        Mobile: ${mobile}
        Total People: ${numPeople}
        Amount Paid: ₹${totalAmount}
        `;

        bot.telegram.sendMessage(
            process.env.TELEGRAM_CHAT_ID, 
            telegramMessage, 
            Markup.inlineKeyboard([
                Markup.button.callback("Confirm", `confirm_${email}_${bookingID}`),
                Markup.button.callback("Reject", `reject_${email}`)
            ])
        );

        res.json({ success: true, message: "Registration successful. Redirecting..." });

    } catch (error) {
        console.error("❌ Error in /register:", error);
        res.status(500).json({ success: false, message: "Something went wrong." });
    }
});

// ✅ Handle Telegram Button Clicks
bot.on("callback_query", async (ctx) => {
    const callbackData = ctx.callbackQuery.data;
    const chatId = ctx.callbackQuery.message.chat.id;

    if (callbackData.startsWith("confirm_")) {
        const [_, email, bookingID] = callbackData.split("_");
        const bookingDate = new Date().toISOString().split("T")[0];

        // ✅ Generate PDF Invoice
        const invoicePath = `./invoices/${bookingID}.pdf`;
        const doc = new PDFDocument();
        doc.pipe(fs.createWriteStream(invoicePath));
        doc.text(`Booking ID: ${bookingID}`, 100, 100);
        doc.text(`Booking Date: ${bookingDate}`, 100, 120);
        doc.text(`Recipient Mobile: ${email}`, 100, 140);
        doc.text(`Trip Confirmation`, 100, 160);
        doc.end();

        // ✅ Send Confirmation Email with Invoice
        await transporter.sendMail({
            from: process.env.SMTP_USER,
            to: email,
            subject: "Your Trip is Confirmed",
            html: `<p>Your seat has been confirmed. Please find your invoice attached.</p>`,
            attachments: [{ filename: `${bookingID}.pdf`, path: invoicePath }]
        });

        await ctx.answerCbQuery("Booking Confirmed");
        await ctx.editMessageText(ctx.callbackQuery.message.text + "\n\nConfirmed", { parse_mode: "Markdown" });
    }

    if (callbackData.startsWith("reject_")) {
        const userEmail = callbackData.split("_")[1];
        await ctx.answerCbQuery("Booking Rejected");
        await ctx.editMessageText(ctx.callbackQuery.message.text + "\n\nRejected", { parse_mode: "Markdown" });
    }
});

// ✅ Start Server & Bot
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
bot.launch();
