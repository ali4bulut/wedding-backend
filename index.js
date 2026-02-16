const express = require("express");
const cors = require("cors");
const multer = require("multer");
const { google } = require("googleapis");
const stream = require("stream");

const app = express();

// ✅ Render için zorunlu
const PORT = process.env.PORT || 4000;

// ✅ Sadece frontend domainine izin ver
app.use(cors({
  origin: "https://wedding-frontend-rho.vercel.app"
}));

app.use(express.json());

// ✅ Multer memory storage
const upload = multer({
  storage: multer.memoryStorage()
});

// ✅ Service account JSON'u ENV içinden parse et
if (!process.env.GOOGLE_SERVICE_ACCOUNT_JSON) {
  throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON not defined in environment variables");
}

const serviceAccount = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);

const auth = new google.auth.GoogleAuth({
  credentials: serviceAccount,
  scopes: ["https://www.googleapis.com/auth/drive"]
});

const drive = google.drive({
  version: "v3",
  auth
});

// ✅ Drive upload fonksiyonu
async function uploadBufferToDrive(file) {
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

// ✅ Upload endpoint
app.post("/upload", upload.single("photo"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: "No file uploaded" });
    }

    const result = await uploadBufferToDrive(req.file);

    res.json({
      success: true,
      fileId: result.id
    });

  } catch (error) {
    console.error("Upload error:", error);
    res.status(500).json({
      success: false,
      error: "Upload failed"
    });
  }
});

// ✅ Health check (Render için iyi olur)
app.get("/", (req, res) => {
  res.send("Wedding photo upload server is running 🚀");
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
