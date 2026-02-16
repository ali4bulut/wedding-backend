const express = require("express");
const cors = require("cors");
const multer = require("multer");
const { google } = require("googleapis");
const stream = require("stream");

const app = express();
const PORT = process.env.PORT || 4000;

// ====== ENV CHECK ======
if (!process.env.GOOGLE_CLIENT_ID ||
    !process.env.GOOGLE_CLIENT_SECRET ||
    !process.env.GOOGLE_REDIRECT_URI ||
    !process.env.GOOGLE_DRIVE_FOLDER_ID) {
  throw new Error("Missing required environment variables");
}

app.set("trust proxy", 1);
// ====== CORS ======
app.use(cors({
  origin: "https://wedding-frontend-rho.vercel.app"
}));

app.use(express.json());

// ====== MULTER ======
const upload = multer({
  storage: multer.memoryStorage()
});

// ====== OAUTH CLIENT ======
const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI
);

// Token memory’de tutulacak
let oauthTokens = null;

// ====== AUTH ROUTE ======
app.get("/auth", (req, res) => {
  const url = oauth2Client.generateAuthUrl({
    access_type: "offline",
    scope: ["https://www.googleapis.com/auth/drive.file"]
  });
  res.redirect(url);
});

// ====== CALLBACK ======
app.get("/oauth2callback", async (req, res) => {
  try {
    const { code } = req.query;

    const { tokens } = await oauth2Client.getToken(code);
    oauth2Client.setCredentials(tokens);

    oauthTokens = tokens;

    res.send("OAuth successful. You can close this tab.");
  } catch (err) {
    console.error("OAuth error:", err);
    res.status(500).send("OAuth failed.");
  }
});

// ====== DRIVE INSTANCE ======
function getDrive() {
  if (!oauthTokens) {
    throw new Error("Not authenticated yet");
  }
  oauth2Client.setCredentials(oauthTokens);

  return google.drive({
    version: "v3",
    auth: oauth2Client
  });
}

// ====== UPLOAD FUNCTION ======
async function uploadBufferToDrive(file) {
  const drive = getDrive();

  const bufferStream = new stream.PassThrough();
  bufferStream.end(file.buffer);

  const response = await drive.files.create({
    requestBody: {
      name: file.originalname,
      parents: [process.env.GOOGLE_DRIVE_FOLDER_ID]
    },
    media: {
      mimeType: file.mimetype,
      body: bufferStream
    }
  });

  return response.data;
}

// ====== UPLOAD ENDPOINT ======
app.post("/upload", upload.single("photos"), async (req, res) => {
  try {
    if (!oauthTokens) {
      return res.status(401).json({
        success: false,
        error: "Not authenticated. Visit /auth first."
      });
    }

    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: "No file uploaded"
      });
    }

    const result = await uploadBufferToDrive(req.file);

    res.json({
      success: true,
      fileId: result.id
    });

  } catch (err) {
    console.error("Upload error:", err);
    res.status(500).json({
      success: false,
      error: "Upload failed"
    });
  }
});

// ====== HEALTH CHECK ======
app.get("/", (req, res) => {
  res.send("Wedding OAuth backend running 🚀");
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
