require('dotenv').config();

const express = require('express');
const multer = require('multer');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { google } = require('googleapis');
const { Readable } = require('stream');

const app = express();

const PORT = process.env.PORT || 4000;

const {
  GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET,
  GOOGLE_REDIRECT_URI,
  GOOGLE_DRIVE_FOLDER_ID,
  GOOGLE_REFRESH_TOKEN,
} = process.env;

if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET || !GOOGLE_REDIRECT_URI) {
  console.error("Missing OAuth environment variables.");
  process.exit(1);
}

const oAuth2Client = new google.auth.OAuth2(
  GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET,
  GOOGLE_REDIRECT_URI
);

if (GOOGLE_REFRESH_TOKEN) {
  oAuth2Client.setCredentials({
    refresh_token: GOOGLE_REFRESH_TOKEN,
  });
}

const drive = google.drive({
  version: "v3",
  auth: oAuth2Client,
});

app.use(helmet());
app.use(cors());
app.use(rateLimit({ windowMs: 60000, max: 50 }));

// 🔐 STEP 1 — AUTH URL
app.get("/auth", (req, res) => {
  const authUrl = oAuth2Client.generateAuthUrl({
    access_type: "offline",
    scope: ["https://www.googleapis.com/auth/drive.file"],
  });

  res.redirect(authUrl);
});

// 🔐 STEP 2 — CALLBACK
app.get("/oauth2callback", async (req, res) => {
  const code = req.query.code;

  const { tokens } = await oAuth2Client.getToken(code);
  oAuth2Client.setCredentials(tokens);

  console.log("🔥 COPY THIS REFRESH TOKEN INTO .env:");
  console.log(tokens.refresh_token);

  res.send("Authorization successful. Check your terminal.");
});

// Upload setup
const upload = multer({
  storage: multer.memoryStorage(),
});

function generateFileName() {
  return `wedding_${Date.now()}.jpg`;
}

async function uploadToDrive(buffer, mimeType, filename) {
  const stream = Readable.from(buffer);

  const response = await drive.files.create({
    requestBody: {
      name: filename,
      parents: [GOOGLE_DRIVE_FOLDER_ID],
    },
    media: {
      mimeType,
      body: stream,
    },
    fields: "id, name",
  });

  return response.data;
}

app.post("/upload", upload.array("photos", 10), async (req, res) => {
  if (!GOOGLE_REFRESH_TOKEN) {
    return res.status(400).json({
      error: "OAuth not completed. Visit /auth first.",
    });
  }

  try {
    const results = [];

    for (const file of req.files) {
      const filename = generateFileName();

      const uploaded = await uploadToDrive(
        file.buffer,
        file.mimetype,
        filename
      );

      results.push(uploaded);
    }

    res.json({
      success: true,
      files: results,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Upload failed." });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
