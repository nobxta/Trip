/******************************************************************** 
 *  FULL UPDATED CODE FOR server.js
 ********************************************************************/

import "dotenv/config";
import express from "express";
import cors from "cors";
import nodemailer from "nodemailer";
import bodyParser from "body-parser";
import multer from "multer";
import fs from "fs";
import mongoose from "mongoose";
import { Telegraf, Markup } from "telegraf";

// 1️⃣ Create Express app
const app = express();

// 2️⃣ Configure CORS to allow requests from multiple frontends
app.use(
  cors({
    origin: [
      "https://www.ghumakkars.in",
      "https://gla-trip.vercel.app" // Add more URLs if needed
    ],
  })
);

// 3️⃣ Body Parser (JSON)
app.use(bodyParser.json());

// 4️⃣ Example test route
app.get("/api/hello", (req, res) => {
  res.json({ message: "Hello from the backend!" });
});

// 5️⃣ Connect to MongoDB
mongoose
  .connect(process.env.MONGO_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  })
  .then(() => console.log("✅ MongoDB connected"))
  .catch((err) => {
    console.error("❌ MongoDB connection error:", err);
    process.exit(1);
  });

// 6️⃣ Define Mongoose Schema & Model
const registrationSchema = new mongoose.Schema({
  bookingID: Number,
  fullName: String,
  email: String,
  mobile: String,
  whatsapp: String,
  paymentType: Number, // e.g., 1200 or 3300
  txid: String,
  peopleCount: Number,
  peopleDetails: [
    {
      name: String,
      age: Number,
    },
  ],
  status: {
    type: String,
    default: "pending", // possible: pending, locked, confirmed, rejected
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});
const Registration = mongoose.model("Registration", registrationSchema);

// 7️⃣ Environment-based Trip Details
const tripDetails = {
  tripStart: process.env.TRIP_START || "28/March/2025",
  tripEnd: process.env.TRIP_END || "1/Apr/2025",
  fromLocation: process.env.FROM_LOCATION || "Mathura",
  toLocation: process.env.TO_LOCATION || "Nainital & Kainchi Dham",
};

// 8️⃣ Initialize Telegram Bot
const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);

// 9️⃣ Ensure required environment variables
if (
  !process.env.SMTP_USER ||
  !process.env.SMTP_PASS ||
  !process.env.SMTP_HOST ||
  !process.env.SMTP_PORT ||
  !process.env.SMTP_ADMIN ||
  !process.env.TELEGRAM_BOT_TOKEN ||
  !process.env.TELEGRAM_CHAT_ID ||
  !process.env.WEBHOOK_URL
) {
  console.error("Missing environment variables. Check your .env file.");
  process.exit(1);
}

// 1️⃣0️⃣ Configure Multer for Aadhaar file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadPath = "./uploads";
    if (!fs.existsSync(uploadPath)) fs.mkdirSync(uploadPath);
    cb(null, uploadPath);
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + "-" + file.originalname);
  },
});
const upload = multer({ storage });

// 1️⃣1️⃣ Configure Nodemailer (SMTP)
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: parseInt(process.env.SMTP_PORT, 10),
  secure: false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

/**
 * Helper: Load an email template from /emails folder.
 * Optionally replace placeholders, e.g. {{fullName}}, {{bookingID}}, etc.
 */
function loadEmailTemplate(filename, replacements = {}) {
  const filePath = `./emails/${filename}`;
  let content = fs.readFileSync(filePath, "utf-8");

  for (const [key, value] of Object.entries(replacements)) {
    const regex = new RegExp(`{{${key}}}`, "g");
    content = content.replace(regex, value);
  }
  return content;
}

/******************************************************
 * Fetch booking by ID (API route)
 ******************************************************/
app.get("/api/booking/:id", async (req, res) => {
  try {
    const booking = await Registration.findOne({
      bookingID: Number(req.params.id),
    }).lean();

    if (!booking) {
      return res.status(404).json({
        error: "Booking not found",
        statusCode: 404,
      });
    }

    // Remove MongoDB-specific fields
    delete booking._id;
    delete booking.__v;

    // Format response explicitly
    const response = {
      bookingID: booking.bookingID,
      fullName: booking.fullName,
      email: booking.email,
      mobile: booking.mobile,
      whatsapp: booking.whatsapp,
      paymentType: booking.paymentType,
      txid: booking.txid,
      peopleCount: booking.peopleCount,
      peopleDetails: booking.peopleDetails.map((p) => ({
        name: p.name,
        age: p.age,
      })),
      status: booking.status,
      createdAt: booking.createdAt,
    };

    res.json(response);
  } catch (error) {
    res.status(500).json({
      error: "Server error",
      details: error.message,
      statusCode: 500,
    });
  }
});

/******************************************************
 * 1️⃣2️⃣ Handle Trip Registration
 ******************************************************/
app.post("/register", upload.array("aadhaarFiles"), async (req, res) => {
  try {
    const {
      peopleCount,
      fullName,
      email,
      mobile,
      whatsapp,
      paymentType,
      txid,
      peopleDetails,
    } = req.body;

    // Basic validation
    if (!fullName || !email || !mobile || !paymentType || !txid || !peopleCount) {
      return res.status(400).json({ message: "Missing required fields" });
    }

    // Parse peopleDetails if it's a JSON string
    let parsedPeople = [];
    if (typeof peopleDetails === "string") {
      try {
        parsedPeople = JSON.parse(peopleDetails);
      } catch (err) {
        console.error("Failed to parse peopleDetails as JSON:", err);
        return res.status(400).json({ message: "Invalid peopleDetails JSON" });
      }
    } else if (Array.isArray(peopleDetails)) {
      parsedPeople = peopleDetails;
    }

    // Generate a random 8-digit Booking ID
    const bookingID = Math.floor(10000000 + Math.random() * 90000000);

    // Save to MongoDB
    const newReg = await Registration.create({
      bookingID,
      fullName,
      email,
      mobile,
      whatsapp,
      paymentType,
      txid,
      peopleCount,
      peopleDetails: parsedPeople,
      status: "pending",
    });

    // Aadhaar attachments
    let aadhaarAttachments = [];
    if (req.files && req.files.length > 0) {
      aadhaarAttachments = req.files.map((file) => ({
        filename: file.originalname,
        path: file.path,
      }));
    }

    // (A) "Registration Received" Email to user
    const registrationReceivedHTML = loadEmailTemplate(
      "registrationReceived.html",
      {
        fullName,
        bookingID: String(bookingID),
        txid,
      }
    );
    await transporter.sendMail({
      from: `"Ghumakkars" <${process.env.SMTP_USER}>`, // Show name "Ghumakkars"
      to: email,
      subject: "Registration Received - Our Team Will Review",
      html: registrationReceivedHTML,
    });

    // (B) Admin Email
    let peopleListHTML = parsedPeople
      .map(
        (person, idx) =>
          `<li><strong>Person ${idx + 1}:</strong> ${person.name} (Age: ${person.age})</li>`
      )
      .join("");

    const adminHTML = `
      <h2>New Trip Registration</h2>
      <p><strong>Booking ID:</strong> ${bookingID}</p>
      <p><strong>Main Person:</strong> ${fullName}</p>
      <p><strong>Email:</strong> ${email}</p>
      <p><strong>Mobile:</strong> ${mobile}</p>
      <p><strong>WhatsApp:</strong> ${whatsapp}</p>
      <p><strong>Payment Type (pp):</strong> ₹${paymentType}</p>
      <p><strong>Transaction ID (TXID):</strong> ${txid}</p>
      <p><strong>Total People:</strong> ${peopleCount}</p>
      <h3>People Details</h3>
      <ul>${peopleListHTML}</ul>
    `;
    await transporter.sendMail({
      from: `"Ghumakkars" <${process.env.SMTP_USER}>`, // Show name "Ghumakkars"
      to: process.env.SMTP_ADMIN,
      subject: "New Trip Registration Received",
      html: adminHTML,
      attachments: aadhaarAttachments,
    });

    // (C) Telegram Notification w/ Accept/Reject Buttons
    const telegramMsg = `
<b>New Registration</b>
<b>Booking ID:</b> ${bookingID}
<b>Main Person:</b> ${fullName}
<b>Email:</b> ${email}
<b>Mobile:</b> ${mobile}
<b>PaymentType (pp):</b> ₹${paymentType}
<b>UPI TXID:</b> ${txid}
<b>Total People:</b> ${peopleCount}
    `;
    bot.telegram.sendMessage(process.env.TELEGRAM_CHAT_ID, telegramMsg, {
      parse_mode: "HTML",
      ...Markup.inlineKeyboard([
        Markup.button.callback("Accept", `accept_${bookingID}`),
        Markup.button.callback("Reject", `reject_${bookingID}`),
      ]),
    });

    console.log("Registration successful, Booking ID:", bookingID);
    return res.json({ message: "Registration successful" });
  } catch (error) {
    console.error("Error in /register:", error);
    return res.status(500).json({ message: "Server error" });
  }
});

/******************************************************
 * 1️⃣3️⃣ Handle Telegram Bot Callbacks
 ******************************************************/
const webhookUrl = process.env.WEBHOOK_URL; // Make sure this is set in your .env

bot.telegram.setWebhook(`${webhookUrl}/telegram-webhook`);

// Express route to handle Telegram bot updates
app.post("/telegram-webhook", (req, res) => {
  bot.handleUpdate(req.body);
  res.sendStatus(200);
});

/******************************************************
 * Accept/Reject Callback Queries (existing logic)
 ******************************************************/
bot.on("callback_query", async (ctx) => {
  try {
    await ctx.answerCbQuery(); // short acknowledgment
  } catch (err) {
    console.error("Error answering callback:", err);
  }

  const data = ctx.callbackQuery.data;

  // A) ACCEPT
  if (data.startsWith("accept_")) {
    const bookingID = data.split("_")[1];
    const record = await Registration.findOne({ bookingID: Number(bookingID) });
    if (!record) {
      await ctx.editMessageText(
        ctx.callbackQuery.message.text + "\n\nBooking Not Found ❌"
      );
      return;
    }

    // Decide seatLock or tripConfirm
    let statusToUpdate, templateFile, emailSubject;
    if (record.paymentType === 1200) {
      statusToUpdate = "locked";
      templateFile = "seatLock.html";
      emailSubject = "Your Seat Is Locked";
    } else if (record.paymentType === 3300) {
      statusToUpdate = "confirmed";
      templateFile = "tripConfirm.html";
      emailSubject = "Your Trip Is Confirmed";
    } else {
      // Some other amount, handle as locked by default
      statusToUpdate = "locked";
      templateFile = "seatLock.html";
      emailSubject = "Your Seat Is Locked (Custom Payment)";
    }

    record.status = statusToUpdate;
    await record.save();

    // Replacements
    const replacements = {
      fullName: record.fullName,
      bookingID: String(record.bookingID),
      email: record.email,
      mobile: record.mobile,
      whatsapp: record.whatsapp,
      paymentType: String(record.paymentType),
      txid: record.txid,
      totalPeople: String(record.peopleCount),
      totalPaid: String(record.peopleCount * record.paymentType),
      tripStart: tripDetails.tripStart,
      tripEnd: tripDetails.tripEnd,
      fromLocation: tripDetails.fromLocation,
      toLocation: tripDetails.toLocation,
    };

    // Generate dynamic people rows
    let peopleRows = "";
    record.peopleDetails.forEach((person, idx) => {
      peopleRows += `
      <tr>
        <td>${idx + 1}</td>
        <td>${person.name}</td>
        <td>${person.age}</td>
      </tr>`;
    });
    replacements.peopleRows = peopleRows;

    const finalHTML = loadEmailTemplate(templateFile, replacements);
    await transporter.sendMail({
      from: `"Ghumakkars" <${process.env.SMTP_USER}>`,
      to: record.email,
      subject: emailSubject,
      html: finalHTML,
    });

    console.log("Booking accepted:", bookingID, `Status: ${statusToUpdate}`);
    await ctx.editMessageText(
      ctx.callbackQuery.message.text + `\n\nBooking ${statusToUpdate} ✅`
    );
  }

  // B) REJECT
  else if (data.startsWith("reject_")) {
    const bookingID = data.split("_")[1];
    const record = await Registration.findOne({ bookingID: Number(bookingID) });
    if (!record) {
      await ctx.editMessageText(
        ctx.callbackQuery.message.text + "\n\nBooking Not Found ❌"
      );
      return;
    }

    record.status = "rejected";
    await record.save();

    const rejectionHTML = loadEmailTemplate("rejection.html", {
      fullName: record.fullName,
      bookingID: String(record.bookingID),
      mobile: record.mobile,
      whatsapp: record.whatsapp,
    });

    await transporter.sendMail({
      from: `"Ghumakkars" <${process.env.SMTP_USER}>`,
      to: record.email,
      subject: "Your Registration Has Been Cancelled",
      html: rejectionHTML,
    });

    console.log("Booking rejected:", bookingID, "User:", record.email);
    await ctx.editMessageText(
      ctx.callbackQuery.message.text + "\n\nBooking Rejected ❌"
    );
  }

  /******************************************************
   * Additional Lock-Related Callbacks (existing logic)
   ******************************************************/
  else if (data.startsWith("lockinfo_")) {
    const bookingID = data.split("_")[1];
    await handleLockInfo(ctx, bookingID);
  } else if (data.startsWith("lockreminder_")) {
    const bookingID = data.split("_")[1];
    await handleLockReminder(ctx, bookingID);
  } else if (data.startsWith("lockconfirm_")) {
    const bookingID = data.split("_")[1];
    await handleLockConfirm(ctx, bookingID);
  }

  /******************************************************
   * New: userInfo_ callback to display full user data
   ******************************************************/
  else if (data.startsWith("userInfo_")) {
    const bookingID = data.split("_")[1];
    const record = await Registration.findOne({ bookingID: Number(bookingID) });
    if (!record) {
      return ctx.editMessageText("User not found.");
    }

    // Build a nicely formatted message with all details
    let msg = `<b>Booking ID:</b> ${record.bookingID}\n`;
    msg += `<b>Name:</b> ${record.fullName}\n`;
    msg += `<b>Email:</b> ${record.email}\n`;
    msg += `<b>Mobile:</b> ${record.mobile}\n`;
    msg += `<b>WhatsApp:</b> ${record.whatsapp}\n`;
    msg += `<b>Payment Type (₹):</b> ${record.paymentType}\n`;
    msg += `<b>TXID:</b> ${record.txid}\n`;
    msg += `<b>People Count:</b> ${record.peopleCount}\n`;
    msg += `<b>Status:</b> ${record.status}\n\n`;

    msg += `<b>People Details:</b>\n`;
    record.peopleDetails.forEach((p, idx) => {
      msg += `   ${idx + 1}. ${p.name} (Age: ${p.age})\n`;
    });

    await ctx.editMessageText(msg, { parse_mode: "HTML" });
  }
});

/******************************************************
 * Helper Functions for "Locked" flow (existing)
 ******************************************************/
async function handleLockInfo(ctx, bookingID) {
  try {
    const record = await Registration.findOne({ bookingID: Number(bookingID) });
    if (!record) {
      return ctx.editMessageText("Booking not found.");
    }
    if (record.status !== "locked") {
      return ctx.editMessageText(
        `Booking ID ${bookingID} is not locked. Current status: ${record.status}`
      );
    }

    let msg =
      `<b>Booking ID:</b> ${record.bookingID}\n` +
      `<b>Name:</b> ${record.fullName}\n` +
      `<b>Email:</b> ${record.email}\n` +
      `<b>Mobile:</b> ${record.mobile}\n` +
      `<b>WhatsApp:</b> ${record.whatsapp}\n` +
      `<b>Payment Type:</b> ₹${record.paymentType}\n` +
      `<b>TXID:</b> ${record.txid}\n` +
      `<b>People Count:</b> ${record.peopleCount}\n` +
      `<b>Status:</b> ${record.status}\n\n` +
      `<b>People Details:</b>\n`;

    record.peopleDetails.forEach((p, idx) => {
      msg += `  ${idx + 1}. ${p.name} (Age: ${p.age})\n`;
    });

    const inlineButtons = [
      [
        Markup.button.callback("Send Reminder", `lockreminder_${bookingID}`),
        Markup.button.callback("Confirm Booking", `lockconfirm_${bookingID}`),
      ],
    ];

    await ctx.editMessageText(msg, {
      parse_mode: "HTML",
      reply_markup: { inline_keyboard: inlineButtons },
    });
  } catch (err) {
    console.error("Error in handleLockInfo:", err);
    await ctx.editMessageText("Error showing locked user info.");
  }
}

async function handleLockReminder(ctx, bookingID) {
  try {
    const record = await Registration.findOne({ bookingID: Number(bookingID) });
    if (!record) {
      return ctx.editMessageText("Booking not found for reminder.");
    }
    if (record.status !== "locked") {
      return ctx.editMessageText(
        `Cannot send reminder. Current status: ${record.status}`
      );
    }

    const reminderHTML = loadEmailTemplate("reminder.html", {
      fullName: record.fullName,
      bookingID: String(record.bookingID),
    });

    await transporter.sendMail({
      from: `"Ghumakkars" <${process.env.SMTP_USER}>`,
      to: record.email,
      subject: "Payment Reminder - Your Seat is Locked",
      html: reminderHTML,
    });

    console.log(`Reminder email sent -> Booking ${bookingID}, ${record.email}`);
    await ctx.editMessageText(
      ctx.callbackQuery.message.text + "\n\nReminder Sent ✅"
    );
  } catch (err) {
    console.error("Error in handleLockReminder:", err);
    await ctx.editMessageText("Error sending reminder.");
  }
}

async function handleLockConfirm(ctx, bookingID) {
  try {
    const record = await Registration.findOne({ bookingID: Number(bookingID) });
    if (!record) {
      return ctx.editMessageText("Booking not found for confirm.");
    }
    if (record.status !== "locked") {
      return ctx.editMessageText(
        `Cannot confirm. Current status: ${record.status}`
      );
    }

    // Update to confirmed
    record.status = "confirmed";
    await record.save();

    // Build placeholders
    const replacements = {
      fullName: record.fullName,
      bookingID: String(record.bookingID),
      email: record.email,
      mobile: record.mobile,
      whatsapp: record.whatsapp,
      paymentType: String(record.paymentType),
      txid: record.txid,
      totalPeople: String(record.peopleCount),
      totalPaid: String(record.peopleCount * record.paymentType),
      tripStart: tripDetails.tripStart,
      tripEnd: tripDetails.tripEnd,
      fromLocation: tripDetails.fromLocation,
      toLocation: tripDetails.toLocation,
    };

    // People rows
    let peopleRows = "";
    record.peopleDetails.forEach((person, idx) => {
      peopleRows += `
      <tr>
        <td>${idx + 1}</td>
        <td>${person.name}</td>
        <td>${person.age}</td>
      </tr>`;
    });
    replacements.peopleRows = peopleRows;

    // Send "tripConfirm"
    const confirmHTML = loadEmailTemplate("tripConfirm.html", replacements);
    await transporter.sendMail({
      from: `"Ghumakkars" <${process.env.SMTP_USER}>`,
      to: record.email,
      subject: "Your Trip is Confirmed!",
      html: confirmHTML,
    });

    console.log(`Locked booking ${bookingID} is now confirmed.`);
    await ctx.editMessageText(
      ctx.callbackQuery.message.text + "\n\nBooking Confirmed ✅"
    );
  } catch (err) {
    console.error("Error in handleLockConfirm:", err);
    await ctx.editMessageText("Error confirming booking.");
  }
}

/******************************************************
 * Emoji Helpers for Status
 ******************************************************/
function getStatusEmoji(status) {
  switch (status) {
    case "confirmed":
      return "🟢";
    case "locked":
      return "🟡";
    case "rejected":
      return "🔴";
    case "pending":
      return "⚪";
    default:
      return "⚪";
  }
}

function getInlineButtonLabel(reg) {
  const emoji = getStatusEmoji(reg.status);
  if (reg.peopleCount === 1) {
    // e.g. "[ 🟢 -- John ]"
    return `${emoji} -- ${reg.fullName}`;
  } else {
    // e.g. "[ 🟡 -- Gaurav | 2 people ]"
    return `${emoji} -- ${reg.fullName} | ${reg.peopleCount} people`;
  }
}

/******************************************************
 * 1️⃣4️⃣ Telegram Bot Commands (NEW & UPDATED)
 ******************************************************/

/**
 * Helper to get status counts
 */
async function getStatusCounts() {
  const totalRegistrations = await Registration.countDocuments({});
  const lockedCount = await Registration.countDocuments({ status: "locked" });
  const confirmedCount = await Registration.countDocuments({ status: "confirmed" });
  const rejectedCount = await Registration.countDocuments({ status: "rejected" });
  const pendingCount = await Registration.countDocuments({ status: "pending" });

  return { totalRegistrations, lockedCount, confirmedCount, rejectedCount, pendingCount };
}

/** 
 * /users 
 * Show all users + stats
 */
bot.command("users", async (ctx) => {
  try {
    // Stats on top
    const {
      totalRegistrations,
      lockedCount,
      confirmedCount,
      rejectedCount,
      pendingCount,
    } = await getStatusCounts();

    // Build top line
    let topMsg = `Total Registration: ${totalRegistrations}, `;
    topMsg += `Confirmed: ${confirmedCount}, `;
    topMsg += `Rejected: ${rejectedCount}, `;
    topMsg += `Seat Lock: ${lockedCount}, `;
    topMsg += `Pending: ${pendingCount}\n\n`;

    // Fetch all registrations
    const registrations = await Registration.find({}).sort({ createdAt: -1 });
    if (!registrations.length) {
      return ctx.reply("No registrations found.");
    }

    // Build inline keyboard
    const inlineKeyboard = registrations.map((reg) => {
      const label = getInlineButtonLabel(reg);
      return [Markup.button.callback(label, `userInfo_${reg.bookingID}`)];
    });

    await ctx.reply(`<b>${topMsg}</b>`, {
      parse_mode: "HTML",
      reply_markup: { inline_keyboard: inlineKeyboard },
    });
  } catch (err) {
    console.error("Error in /users:", err);
    ctx.reply("Error fetching users.");
  }
});

/** 
 * /confirmed 
 * Show only confirmed users
 */
bot.command("confirmed", async (ctx) => {
  try {
    const confirmedRegs = await Registration.find({ status: "confirmed" });
    const count = confirmedRegs.length;

    if (count === 0) {
      return ctx.reply("No confirmed users found.");
    }

    let header = `Confirmed Users: ${count}\n\n`;
    // Build inline keyboard
    const inlineKeyboard = confirmedRegs.map((reg) => {
      const label = getInlineButtonLabel(reg);
      return [Markup.button.callback(label, `userInfo_${reg.bookingID}`)];
    });

    await ctx.reply(`<b>${header}</b>`, {
      parse_mode: "HTML",
      reply_markup: { inline_keyboard: inlineKeyboard },
    });
  } catch (err) {
    console.error("Error in /confirmed:", err);
    ctx.reply("Error fetching confirmed users.");
  }
});

/**
 * /rejected
 * Show all rejected users
 */
bot.command("rejected", async (ctx) => {
  try {
    const rejectedRegs = await Registration.find({ status: "rejected" });
    const count = rejectedRegs.length;

    if (count === 0) {
      return ctx.reply("No rejected users found.");
    }

    let header = `Rejected Users: ${count}\n\n`;
    const inlineKeyboard = rejectedRegs.map((reg) => {
      const label = getInlineButtonLabel(reg);
      return [Markup.button.callback(label, `userInfo_${reg.bookingID}`)];
    });

    await ctx.reply(`<b>${header}</b>`, {
      parse_mode: "HTML",
      reply_markup: { inline_keyboard: inlineKeyboard },
    });
  } catch (err) {
    console.error("Error in /rejected:", err);
    ctx.reply("Error fetching rejected users.");
  }
});

/**
 * /pending
 * Show all pending users
 */
bot.command("pending", async (ctx) => {
  try {
    const pendingRegs = await Registration.find({ status: "pending" });
    const count = pendingRegs.length;

    if (count === 0) {
      return ctx.reply("No pending users found.");
    }

    let header = `Pending Users: ${count}\n\n`;
    const inlineKeyboard = pendingRegs.map((reg) => {
      const label = getInlineButtonLabel(reg);
      return [Markup.button.callback(label, `userInfo_${reg.bookingID}`)];
    });

    await ctx.reply(`<b>${header}</b>`, {
      parse_mode: "HTML",
      reply_markup: { inline_keyboard: inlineKeyboard },
    });
  } catch (err) {
    console.error("Error in /pending:", err);
    ctx.reply("Error fetching pending users.");
  }
});

/**
 * /lock 
 * Similar to old one, but add total count on top and color-coded
 */
bot.command("lock", async (ctx) => {
  try {
    const lockedRegs = await Registration.find({ status: "locked" });
    const count = lockedRegs.length;

    if (!count) {
      return ctx.reply("No locked registrations found.");
    }

    let header = `Locked Registrations: ${count}\n\n`;
    // Build inline keyboard
    const inlineButtons = lockedRegs.map((reg) => {
      const label = getInlineButtonLabel(reg);
      return [Markup.button.callback(label, `lockinfo_${reg.bookingID}`)];
    });

    await ctx.reply(`<b>${header}</b>`, {
      parse_mode: "HTML",
      reply_markup: { inline_keyboard: inlineButtons },
      parse_mode: "HTML",
    });
  } catch (err) {
    console.error("Error in /lock:", err);
    ctx.reply("Error fetching locked registrations.");
  }
});

/******************************************************
 * (Existing) /stats - aggregated stats
 ******************************************************/
bot.command("stats", async (ctx) => {
  try {
    const totalRegistrations = await Registration.countDocuments({});
    const lockedCount = await Registration.countDocuments({ status: "locked" });
    const confirmedCount = await Registration.countDocuments({
      status: "confirmed",
    });
    const rejectedCount = await Registration.countDocuments({
      status: "rejected",
    });
    const pendingCount = await Registration.countDocuments({
      status: "pending",
    });

    // sum of peopleCount for locked + confirmed
    const acceptedRegs = await Registration.find({
      status: { $in: ["locked", "confirmed"] },
    });

    let totalPeople = 0;
    let totalMoney = 0;
    acceptedRegs.forEach((r) => {
      totalPeople += r.peopleCount;
      totalMoney += r.peopleCount * r.paymentType;
    });

    let msg = "<b>Trip Stats</b>\n\n";
    msg += `Total Registrations: <b>${totalRegistrations}</b>\n`;
    msg += `Locked: <b>${lockedCount}</b>\n`;
    msg += `Confirmed: <b>${confirmedCount}</b>\n`;
    msg += `Rejected: <b>${rejectedCount}</b>\n`;
    msg += `Pending: <b>${pendingCount}</b>\n`;
    msg += `\nTotal People (locked+confirmed): <b>${totalPeople}</b>\n`;
    msg += `Total Money (locked+confirmed): <b>₹${totalMoney}</b>\n`;

    return ctx.reply(msg, { parse_mode: "HTML" });
  } catch (err) {
    console.error("Error in /stats:", err);
    return ctx.reply("Error generating stats.");
  }
});

/******************************************************
 * 1️⃣5️⃣ Health Check Routes
 ******************************************************/
app.get("/", (req, res) => {
  res.send("Backend is running!");
});
app.get("/api/", (req, res) => {
  res.send("API is working!");
});

const PORT = process.env.PORT || 3000;

/******************************************************
 * Telegram Webhook Registration & Keep-Alive
 ******************************************************/
const setWebhook = async (retryCount = 0) => {
  try {
    const response = await fetch(
      `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/setWebhook`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: `${process.env.WEBHOOK_URL}/telegram-webhook`,
        }),
      }
    );
    const data = await response.json();

    if (data.ok) {
      console.log("✅ Webhook successfully set:", data);
    } else {
      console.error("❌ Webhook Error:", data);

      if (data.error_code === 429 && data.parameters?.retry_after) {
        const waitTime = data.parameters.retry_after * 1000;
        console.warn(
          `⚠️ Too many requests. Retrying after ${data.parameters.retry_after} seconds...`
        );
        setTimeout(() => setWebhook(retryCount + 1), waitTime);
      } else {
        console.error(
          "❌ Webhook could not be set. Check your bot token and webhook URL."
        );
      }
    }
  } catch (err) {
    console.error("❌ Error setting webhook:", err);
  }
};

// Re-register the webhook every 30 minutes
setInterval(setWebhook, 30 * 60 * 1000);

// Keep Render free-tier service alive every 5 minutes
const keepAlive = () => {
  setInterval(() => {
    fetch(process.env.WEBHOOK_URL)
      .then(() => console.log("✅ Keep-alive ping successful"))
      .catch((err) => console.error("⚠️ Keep-alive failed:", err.message));
  }, 5 * 60 * 1000);
};

// Prevent crashes from unhandled errors
process.on("uncaughtException", (err) => {
  console.error("❌ Uncaught Exception:", err);
});
process.on("unhandledRejection", (err) => {
  console.error("❌ Unhandled Rejection:", err);
});

// Start the server
app.listen(PORT, async () => {
  console.log(`✅ Server running on port ${PORT}`);

  // Register webhook on startup
  await setWebhook();

  // Keep server alive
  keepAlive();
});
/********************************************************************
 *  END OF FULL UPDATED CODE
 ********************************************************************/
