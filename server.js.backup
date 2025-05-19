const express = require('express');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const bodyParser = require('body-parser');
const session = require('express-session');

const app = express();
const PORT = 3000;

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

app.get('/upload', (req, res) => {
  const otp = req.query.otp;
  if (!otp) {
    return res.status(400).send('OTP is required.');
  }

  let otps = loadOtps();
  let record = otps.find(o => o.code === otp && !o.used);

  if (record) {
    record.used = true;
    saveOtps(otps);
    req.session.verified = true;
    res.redirect('/logging');
  } else {
    res.status(403).send('Invalid or already used OTP.');
  }
});

//app.post('/verify-otp', (req, res) => {
//  const { otp } = req.body;
//  let otps = loadOtps();
//  let record = otps.find(o => o.code === otp && !o.used);
//  if (record) {
//    record.used = true;
//    saveOtps(otps);
//    req.session.verified = true;
//    res.redirect('/logging');
//  } else {
//    res.status(403).send('Invalid or already used OTP.');
//  }
//});

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

  const { name, email, message, uploadId, filename } = req.body;
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

  const submission = {
    name,
    email,
    message,
    file: path.basename(finalPath),
    date: new Date().toISOString()
  };
  fs.appendFileSync('submissions.json', JSON.stringify(submission) + '\n');

  // Invalidate session after successful upload
  req.session.destroy();

  res.send('Upload complete');
});

// Endpoint to return raw text from submissions.json
app.get('/submissions', (req, res) => {
  fs.readFile('submissions.json', 'utf8', (err, data) => {
    if (err) {
      console.error('Error reading file:', err);
      return res.status(500).send('Failed to read file');
    }

    res.type('text/plain'); // Set content type to plain text
    res.send(data);
  });
});

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
