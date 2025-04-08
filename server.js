const express = require('express');
const multer = require('multer');
const shortid = require('shortid');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = 3000;

// アップロード先フォルダ
const UPLOAD_FOLDER = path.join(__dirname, 'uploads');

// フォルダがなければ作成
if (!fs.existsSync(UPLOAD_FOLDER)) {
  fs.mkdirSync(UPLOAD_FOLDER);
}

// multer の設定
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, UPLOAD_FOLDER);
  },
  filename: (req, file, cb) => {
    // 元のファイル名の拡張子を保持したまま短いID名で保存
    const ext = path.extname(file.originalname);
    const id = shortid.generate();
    const filename = `${id}${ext}`;
    cb(null, filename);
  },
});
const upload = multer({ storage });

// 静的ファイルの配信 (index.htmlなど)
app.use(express.static(path.join(__dirname, 'public')));

// メモリ上で { 短縮ID: 実際のファイル名 } を管理するマップ
// 実運用ではDBなどを使うと安全ですが、サンプルではメモリ管理とします。
let fileMap = {};

// アップロード処理
app.post('/upload', upload.single('file'), (req, res) => {
  if (!req.file) {
    return res.status(400).send('ファイルがアップロードされていません');
  }

  // req.file.filename は "短いID + 拡張子" になっている
  const savedFilename = req.file.filename;
  // 短いID部分を取り出す（拡張子を除く）
  const shortId = path.parse(savedFilename).name;

  // メモリ上のマップを更新
  fileMap[shortId] = savedFilename;

  // 短縮URLを生成（例: http://localhost:3000/f/abc12）
  const fileUrl = `${req.protocol}://${req.get('host')}/f/${shortId}`;

  // アップロード後に表示するページ
  // ここではシンプルにJSONで返すか、HTMLを返すかはお好みで。
  // とりあえず短縮URLを返してあげます。
  res.send(`
    <html>
      <head>
        <meta charset="utf-8" />
        <title>アップロード完了</title>
      </head>
      <body>
        <h1>アップロード完了!</h1>
        <p>以下のURLを共有してください:</p>
        <a href="${fileUrl}">${fileUrl}</a>
      </body>
    </html>
  `);
});

// アップロードされたファイルを表示するルート
// /f/:id
app.get('/f/:id', (req, res) => {
  const id = req.params.id;
  const filename = fileMap[id];
  if (!filename) {
    return res.status(404).send('ファイルが見つかりません');
  }

  // ファイルの実際のパス
  const filePath = path.join(UPLOAD_FOLDER, filename);
  // ファイルの拡張子を取得し、表示方法を分ける
  const ext = path.extname(filename).toLowerCase();

  // ダウンロードリンク
  const downloadUrl = `${req.protocol}://${req.get('host')}/download/${id}`;

  // ファイルをどう表示するかHTMLで返す
  let contentHtml = '';

  if (ext.match(/\.(mp4|webm|ogg)$/)) {
    // 動画
    contentHtml = `
      <video controls style="max-width: 100%; height: auto;">
        <source src="/download/${id}" type="video/${ext.replace('.', '')}">
        お使いのブラウザは video タグをサポートしていません。
      </video>
      <br/>
      <a href="${downloadUrl}">この動画をダウンロード</a>
    `;
  } else if (ext.match(/\.(png|jpg|jpeg|gif|bmp|webp|svg)$/)) {
    // 画像
    contentHtml = `
      <img src="/download/${id}" alt="uploaded image" style="max-width: 100%; height: auto;">
      <br/>
      <a href="${downloadUrl}">この画像をダウンロード</a>
    `;
  } else if (ext.match(/\.(txt|md|html|css|js|json|csv)$/)) {
    // 文字ファイル
    // テキストをそのまま表示するために、中身を読み込む
    const fileContent = fs.readFileSync(filePath, 'utf8');
    // エスケープなど最小限の考慮
    const safeContent = fileContent
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');

    contentHtml = `
      <pre style="white-space: pre-wrap; word-wrap: break-word;">${safeContent}</pre>
      <br/>
      <a href="${downloadUrl}">このファイルをダウンロード</a>
    `;
  } else if (ext.match(/\.(mp3|wav|ogg|m4a)$/)) {
    // 音声ファイル
    contentHtml = `
      <audio controls>
        <source src="/download/${id}" type="audio/${ext.replace('.', '')}">
        お使いのブラウザは audio タグをサポートしていません。
      </audio>
      <br/>
      <a href="${downloadUrl}">この音声をダウンロード</a>
    `;
  } else {
    // その他の拡張子 ⇒ ダウンロードのみ
    contentHtml = `
      <p>このファイルタイプはプレビューに対応していません。</p>
      <a href="${downloadUrl}">このファイルをダウンロード</a>
    `;
  }

  res.send(`
    <html>
      <head>
        <meta charset="utf-8" />
        <title>ファイル表示</title>
      </head>
      <body>
        <h1>ファイルプレビュー</h1>
        ${contentHtml}
      </body>
    </html>
  `);
});

// ダウンロード用ルート
app.get('/download/:id', (req, res) => {
  const id = req.params.id;
  const filename = fileMap[id];
  if (!filename) {
    return res.status(404).send('ファイルが見つかりません');
  }
  const filePath = path.join(UPLOAD_FOLDER, filename);
  // ダウンロード時に元のファイル名を指定したい場合は、実際のアップロード前のファイル名を
  // 別途保存しておく必要があるが、今回は短縮IDファイル名で送る。
  res.download(filePath, filename);
});

app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
