const express = require('express');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const bodyParser = require('body-parser');
const session = require('express-session');

const app = express();
const PORT = 3000;

// Prevent caching
app.use((req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
});

app.use(express.static('public'));
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

app.use(session({
  secret: 'very-secret-key',
  resave: false,
  saveUninitialized: true
}));

const upload = multer({ dest: 'uploads/tmp/' });

function loadOtps() {
  return JSON.parse(fs.readFileSync('otps.json'));
}

function saveOtps(otps) {
  fs.writeFileSync('otps.json', JSON.stringify(otps, null, 2));
}

function generateOtp(length = 6) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  return Array.from({ length }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

app.get('/upload', (req, res) => {
  const otp = req.query.otp;
  if (!otp) {
    return res.status(400).send('OTP is required.');
  }

  let otps = loadOtps();
  let record = otps.find(o => o.code === otp && !o.used);

  if (record) {
    // Just verify OTP, save it in session, don't mark used yet
    req.session.verified = true;
    req.session.otp = otp;

    res.redirect('/logging');
  } else {
    res.status(403).send('Invalid or already used OTP.');
  }
});

app.get('/generate-otp', (req, res) => {
  const otps = loadOtps();

  const newCode = generateOtp();
  otps.push({ code: newCode, used: false });

  saveOtps(otps);

  const uploadUrl = `https://form-production-70f0.up.railway.app/upload?otp=${newCode}`;

  res.send(`
    <html>
      <body>
        <p>Your OTP code is: <strong>${newCode}</strong></p>
        <p>Use the following URL to start your upload:</p>
        <p><a href="${uploadUrl}">${uploadUrl}</a></p>
        <p>Copy and paste this URL in your browser to begin.</p>
      </body>
    </html>
  `);
  
  //res.json({ otp: newCode });
});

app.get('/logging', (req, res) => {
  if (req.session.verified) {
    res.sendFile(path.join(__dirname, 'views', 'form.html'));
  } else {
    res.status(403).send('Access Denied');
  }
});

app.post('/upload-chunk', upload.single('chunk'), (req, res) => {
  if (!req.session.verified) {
    return res.status(403).send('Unauthorized');
  }

  const { uploadId, chunkNumber } = req.body;
  const dir = path.join('uploads/tmp', uploadId);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const chunkPath = path.join(dir, `chunk_${chunkNumber}`);
  fs.renameSync(req.file.path, chunkPath);
  res.status(200).send('Chunk received');
});

app.post('/finalize-upload', (req, res) => {
  if (!req.session.verified) {
    return res.status(403).send('Unauthorized');
  }

  const { name, email, serial, message, uploadId, filename } = req.body;
  const dir = path.join('uploads/tmp', uploadId);
  const files = fs.readdirSync(dir).sort((a, b) => {
    return parseInt(a.split('_')[1]) - parseInt(b.split('_')[1]);
  });

  const finalPath = path.join('uploads', `${Date.now()}-${filename}`);
  const writeStream = fs.createWriteStream(finalPath);

  for (const file of files) {
    const filePath = path.join(dir, file);
    const data = fs.readFileSync(filePath);
    writeStream.write(data);
    fs.unlinkSync(filePath);
  }

  writeStream.end();
  fs.rmSync(dir, { recursive: true });

  // Mark OTP as used now, after upload success
  const otps = loadOtps();
  const otpIndex = otps.findIndex(o => o.code === req.session.otp);
  if (otpIndex !== -1) {
    otps[otpIndex].used = true;

    // Optional: generate and add a new OTP here if desired
    const newCode = generateOtp();
    otps.push({ code: newCode, used: false });

    saveOtps(otps);
  }

  const submission = {
    name,
    email,
    serial,
    message,
    file: path.basename(finalPath),
    date: new Date().toISOString()
  };
  fs.appendFileSync('submissions.json', JSON.stringify(submission) + '\n');

  // Destroy session after finishing upload
  req.session.destroy();

  res.send('Upload complete');
});

app.get('/submissions', (req, res) => {
  fs.readFile('submissions.json', 'utf8', (err, data) => {
    if (err) {
      console.error('Error reading file:', err);
      return res.status(500).send('Failed to read file');
    }

    res.type('text/plain');
    res.send(data);
  });
});

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});

