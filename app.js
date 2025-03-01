const express = require('express');
const app = express();
const fs = require('fs');
const path = require('path');
const cookieParser = require('cookie-parser');
const iconv = require('iconv-lite');
const session = require('./lib/session.js');
const db = require('./lib/db.js');
const bcrypt = require('bcrypt');
const hashPassword = require('./lib/bcrypt.js'); // 올바르게 가져오기
const multer = require('multer');

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public'))); // 정적 파일 제공
app.use('/uploads', express.static(path.join(__dirname, 'uploads'))); // 업로드 파일 제공
app.use(session);
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

function formatDate() {
  const date = new Date();
  const YYYY = date.getFullYear();
  const MM = String(date.getMonth() + 1).padStart(2, '0'); // 월 (01~12)
  const DD = String(date.getDate()).padStart(2, '0'); // 일 (01~31)
  const HH = String(date.getHours()).padStart(2, '0'); // 시 (00~23)
  const mm = String(date.getMinutes()).padStart(2, '0'); // 분 (00~59)
  const SS = String(date.getSeconds()).padStart(2, '0'); // 초 (00~59)
  return `${YYYY}${MM}${DD}-${HH}${mm}${SS}`;
};

function authStatus(req, res) {
  if (req.session.is_logined) {
    return { 
      is_logined: true,
      user_id: req.session.user_id,
      username: req.session.username
    }
  } else {
    return false;
  }
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/'); // 파일 저장 폴더
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const baseName = path.basename(file.originalname, ext);
    const encodedName = iconv.decode(Buffer.from(baseName, 'binary'), 'utf-8');
    const safeFileName = encodedName.replace(/[^a-zA-Z0-9가-힣ㄱ-ㅎ]/g, '_');
    const date = formatDate();
    cb(null, `${date}-${safeFileName}${ext}`);
  },
});

const upload = multer({ 
  limits: { 
    fileSize: 10 * 1024 * 1024, // 한 파일당 10MB 제한
    files: 5, // 최대 5개 파일 제한
    fieldSize: 50 * 1024 * 1024 // 전체 업로드 크기 50MB 제한
   },
  storage: storage 
}).array('userfile', 5);

app.get('/downloads/:filename', function(req, res) {
  const filename = req.params.filename;
  const filePath = path.join(__dirname, 'uploads', filename);

  if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: '파일을 찾을 수 없습니다.' });
  }

  res.download(filePath);
});

app.post('/uploads', function (req, res) {
  upload(req, res, function (err) {
    if (err instanceof multer.MulterError) {
      // Multer에서 발생하는 오류 처리
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(413).send('파일 크기가 너무 큽니다! (최대 10MB)');
      }
      if (err.code === 'LIMIT_FILE_COUNT') {
        return res.status(413).send('파일 개수 제한을 초과했습니다! (최대 5개)');
      }
      if (err.code === 'LIMIT_FIELD_SIZE') {
        return res.status(413).send('총 업로드 크기가 너무 큽니다! (최대 50MB)');
      }
      return res.status(400).send('파일 업로드 중 오류가 발생했습니다.');
    } else if (err) {
      // 기타 서버 오류 처리
      return res.status(500).json({ error: '서버 내부 오류 발생' });
    }
    
    // 정상적으로 파일이 업로드된 경우
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: '파일이 업로드되지 않았습니다.' });
    }

    const id = req.body.id;
    const filenames = req.files.map(file => file.filename); // 파일명 배열

    let sqlQuery = `UPDATE tbl_board SET upload = CASE 
      WHEN upload IS NULL THEN JSON_ARRAY(?) 
      ELSE JSON_MERGE_PRESERVE(upload, JSON_ARRAY(${filenames.map(() => '?').join(', ')})) 
      END WHERE id = ?;`;

    db.query(sqlQuery, [filenames, ...filenames, id], function(error, data) {
      if (error) {
        console.log(error);
        return res.status(500).json({ error: '데이터베이스 업데이트 중 오류 발생' });
      }
      res.json({ success: true, message: '파일 업로드 성공!' });
    });
  });
});

app.delete('/uploads', async function (req, res) {
  const id = req.body.id;
  let files = req.body.file;

  if (!files) {
    return res.status(400).json({ error: '삭제할 파일이 없습니다.' });
  }

  try {
    if (Array.isArray(files)) {
      // 배열인 경우 여러 파일 삭제
      const results = await Promise.all(
        files.map(async (file) => {
          const filePath = path.join(__dirname, 'uploads', file);
          try {
            await fs.promises.access(filePath); // 파일 존재 여부 확인
            await fs.promises.unlink(filePath); // 파일 삭제
            console.log(`파일 전체 삭제 성공: ${file}`);
            return { file, success: true };
          } catch (err) {
            console.error(`파일 삭제 실패: ${file}, 오류:`, err);
          }
        })
      );
      res.json({ success: true, deletedFiles: results });

    } else {
      const filePath = path.join(__dirname, 'uploads', files);
      try {
        await fs.promises.access(filePath);
        await fs.promises.unlink(filePath);
        console.log(`파일 단일 삭제 성공: ${files}`);
        await db.promise().query(
          `UPDATE tbl_board SET upload = JSON_REMOVE(upload, JSON_UNQUOTE(JSON_SEARCH(upload, 'one', ?))) WHERE id = ?;`,
          [files, id]
        );
        console.log('파일 삭제 후 DB 업데이트 성공');
        res.json({ success: true, deletedFile: files });
        
      } catch (err) {
        console.error(`파일 삭제 실패: ${file}, 오류:`, err);
        res.status(500).json({ success: false, error: err.message });
      }
    }
  } catch (err) {
    res.status(500).send('Internal Server Error');
  }
});

app.get('/header', (req, res) => {
  res.render('header', {authStatus: authStatus(req, res)});  // 'header.ejs' 템플릿을 렌더링하여 응답
});

app.get('/', (req, res) => {
  let page = req.query.page ? parseInt(req.query.page) : 1;
  let line = 100;
  if (req.cookies.line) {
    line = parseInt(req.cookies.line);
  }

  let where = '';
  let params = [];
  let search = req.query.search;
  if(search){
    where += `WHERE subject LIKE ? `;
    params.push(`%${search}%`);
  }
  params.push(line * (page - 1), line);

  let order_by = '';
  let view = req.cookies.view;
  switch (view) {
    case 'asc':
      order_by += 'view ASC, ';
      break;
    case 'desc':
      order_by += 'view DESC, ';
      break;
    default:
      order_by += '';
      break;
  }
  let like = req.cookies.like;
  switch (like) {
    case 'asc':
      order_by += 'like_count ASC, ';
      break;
    case 'desc':
      order_by += 'like_count DESC, ';
      break;
    default:
      order_by += '';
      break;
  }
  order_by += 'B.id DESC ';

  let sqlQuery = `SELECT B.*, U.username,
    COUNT(*) OVER() AS total, 
    COUNT(DISTINCT L.id) AS like_count, 
    COUNT(DISTINCT C.id) AS comment_count,
    MAX(B.view) AS view
  FROM tbl_board B
  LEFT JOIN tbl_like L ON B.id = L.board_id
  LEFT JOIN tbl_comment C ON B.id = C.board_id
  LEFT JOIN tbl_user U ON B.user_id = U.id ${where}GROUP BY B.id ORDER BY ${order_by}LIMIT ?, ?;`;
  // console.log('실행 쿼리:', db.format(sqlQuery, params));
  db.query(sqlQuery, params, function (error, data) {
    if (error) {
      res.status(500).send('Internal Server Error');
      return;
    }
    
    let selectOptionsHtml = '';
    const options = [5, 10, 50, 100];
    options.forEach(option => {
      const selected = option === line ? 'selected' : '';
      selectOptionsHtml += `<option value='${option}' ${selected}>${option} 줄</option>`;
    });

    let page_total = 0;
    if(data.length > 0){
      page_total = Math.ceil(parseInt(data[0]['total']) / line);
    }

    res.render('list', { data, page_total, selectOptionsHtml, currentPage: page, search, like, view, authStatus: authStatus(req, res)});
  });
});

app.get('/boards/:id', async (req, res) => {
  try {
    const id = req.params.id;
    const user_id = authStatus(req,res).user_id;

    // 쿼리 순차 실행 -> 병렬 실행(한번에 실행)
    const [[like], [comment], [data]] = await Promise.all([
      db.promise().query(`SELECT user_id FROM tbl_like WHERE board_id=?`, [id]),
      db.promise().query(`SELECT c.*, u.username FROM tbl_comment c LEFT JOIN tbl_user u ON c.user_id = u.id WHERE board_id=? ORDER BY c.created_at ASC;`, [id]),
      db.promise().query(`SELECT b.*, u.username FROM tbl_board b LEFT JOIN tbl_user u ON b.user_id=u.id WHERE b.id=?`, [id])
    ]);

    if (data && data.length > 0) {
      let view = data[0].view + 1;
      await db.promise().query(`UPDATE tbl_board SET view=? WHERE id=?`, [view, id]);
      let active = like.some((value) => value.user_id === user_id);
      res.render('view', { data, id, active, like, comment, user_id, authStatus: authStatus(req, res) });
    } else {
      res.status(404).send('요청하신 게시글을 찾을 수 없습니다.');
    }
  } catch (err) {
    res.status(500).send('Internal Server Error');
  }
});

app.get('/boards/:id/edit', (req, res) => {
  if(!req.session.is_logined){
    res.status(500).render('error', { errorMessage:'당신은 작성 권한이 없습니다. 로그인 후 이용 가능합니다.' } );
    return;
  }

  const id = req.params.id != 'new' ? req.params.id : '';
  const user_id = authStatus(req, res).user_id;
  
  if (id) {
    db.query(`SELECT * FROM tbl_board where id=?`, [id], function(error, data) {
      if (error) {
        return res.status(500).send('Internal Server Error');
      }
      if(data[0].user_id!=user_id) {
        return res.status(500).render('error', { errorMessage:'당신은 수정 권한이 없습니다.' } );
      }
      res.render('edit', { data, id, user_id, status: 'update', authStatus: authStatus(req, res) });
    });
  } else {
    res.render('edit', { data:'', id, user_id, status: 'create', authStatus: authStatus(req, res) });
  }
});

app.post('/boards', (req, res) => {
  const post = req.body;
  db.query(`INSERT INTO tbl_board (user_id, subject, content) VALUES (?,?,?);`, [post.user_id, post.subject, post.content], function(error, data) {
    if (error) {
      res.status(500).send('Internal Server Error');
      return;
    }
    res.send({ insertId: data.insertId });
  });
});

app.patch('/boards/:id', (req, res) => {
  const id = req.params.id
  const post = req.body;
  db.query(`UPDATE tbl_board SET user_id=?, subject=?, content=? where id=?`, [post.user_id, post.subject, post.content, id], function(error, data) {
    if (error) {
      res.status(500).send('Internal Server Error');
      console.log(error)
      return;
    }
    res.send();
  });
});

app.delete('/boards/:id', (req, res) => {
  const id = req.params.id;
  const user_id = authStatus(req,res).user_id;
  db.query(`DELETE FROM tbl_board where id=? and user_id=?`, [id, user_id], function(error, data) {
    if (error) {
      res.status(500).send('Internal Server Error');
      return;
    }
    res.status(200).send('Delete success');
  });
});

app.post('/likes/:id', (req, res) => {
  const id = req.params.id;
  const user_id = authStatus(req,res).user_id;
  if(user_id) {
    db.query(`INSERT INTO tbl_like(user_id,board_id) VALUES(?,?)`, [user_id, id], function(error, data) {
      if (error) {
        res.status(500).send('Internal Server Error');
        console.log(error);
        return;
      }
      res.send('add');
    })
  } else {
    res.status(500).send('회원만 추천 가능합니다.');
  }
});

app.delete('/likes/:id', (req, res) => {
  const id = req.params.id;
  const user_id = authStatus(req,res).user_id;
  if(user_id) {
    db.query(`DELETE FROM tbl_like WHERE user_id=? and board_id=?`, [user_id, id], function(error, data) {
      if (error) {
        res.status(500).send('Internal Server Error');
        return;
      }
      res.send('delete');
    });
  } else {
    res.status(500).send('회원만 추천 가능합니다.');
  }
});

app.post('/comments', (req, res) => {
  const post = req.body;
  const user_id = authStatus(req, res).user_id;
  db.query(`INSERT INTO tbl_comment (board_id, user_id, content) VALUES (?,?,?);`, [post.board_id, user_id, post.content], function(error, data) {
    if (error) {
      res.status(500).send('Internal Server Error');
      console.log(error)
      return;
    }

    let insertedId = data.insertId;
    db.query(`SELECT c.id, c.content, c.created_at, u.id AS user_id, u.username FROM tbl_comment c LEFT JOIN tbl_user u ON u.id = c.user_id WHERE c.id = ?;`, [insertedId], function(selectError, result) {
      if (selectError) {
        res.status(500).send('Internal Server Error');
        console.log(selectError);
        return;
      }
      res.send({ comment: result[0] });
    });
  });
});

app.patch('/comments', (req, res) => {
  const post = req.body;
  const user_id = authStatus(req, res).user_id;
  db.query(`UPDATE tbl_comment SET content=? where id=? and user_id=?`, [post.content, post.id, user_id], function(error, data) {
    if (error) {
      res.status(500).send('Internal Server Error');
      console.log(error)
      return;
    }
    res.send();
  });
});

app.delete('/comments', (req, res) => {
  const post = req.body;
  const user_id = authStatus(req, res).user_id;
  db.query(`DELETE FROM tbl_comment where id=? and user_id=?`, [post.id, user_id], function(error, data) {
    if (error) {
      res.status(500).send('Internal Server Error');
      return;
    }
    res.status(200).send('Delete success');
  });
});

app.get('/login', (req, res) => {
  if( authStatus(req, res) ) {
    res.render('error', { errorMessage:'이미 로그인 됐습니다!' })
  } else {
    res.render('login', { authStatus: authStatus(req, res) })
  }
});

app.post('/login', (req, res) => {
  const post = req.body;

  if (!post.username || !post.password) {
    return res.status(400).render('error', { errorMessage: '아이디와 비밀번호를 입력해주세요.' });
  }

  db.query(`SELECT id, username, password FROM tbl_user WHERE username=?`,[post.username], function(error, data) {
    if(error){
      res.status(500).send('Internal Server Error');
      return;
    }

    if(data.length > 0){
      bcrypt.compare(post.password, data[0].password, function(err, result) {
        if (result) { // 비밀번호가 일치하는 경우
          req.session.is_logined = true;
          req.session.username = data[0].username;
          req.session.user_id = data[0].id;
          req.session.save(() => {
            res.json({ success: true });
          })
        } else {
          res.json({ success: false, message: '비밀번호가 맞지 않습니다.' });
        }
      })
    } else {
      res.json({ success: false, message: '존재하지 않는 아이디입니다.' });
    }
  });
});

app.get('/logout', (req, res) => {
  req.session.destroy((err)=>{
    if(err)
      throw err;

    res.redirect('/')
  })
});

app.get('/signup', (req, res) => {
  res.render('signup', { authStatus: authStatus(req, res) });
});

app.post('/signup', async (req, res) => {
  try {
    const post = req.body;
    const patternUsername = /^[A-Za-z0-9가-힣]{2,12}$/;
    const patternPassword = /^[A-Za-z0-9]{4,20}$/;

    if (!post.username || !post.password) {
      return res.status(400).render('error', { errorMessage: '아이디와 비밀번호를 입력해주세요.' });
    }

    if (!patternUsername.test(post.username) || !patternPassword.test(post.password)) {
      return res.status(400).render('error', { errorMessage: '조건에 맞게 아이디와 비밀번호를 입력해주세요.' });
    }

    const hashedPassword = await hashPassword(post.password);

    await db.promise().query(`INSERT INTO tbl_user (username, password) VALUES (?,?);`, [post.username, hashedPassword]);

    res.redirect('/login');
  } catch (err) {
    res.status(500).send('Internal Server Error');
  }
});

app.get('/settings', (req, res) => {
  res.render('setting');
});

app.patch('/settings/username', (req, res) => {
  const post = req.body;
  const patternUsername = /^[A-Za-z0-9가-힣]{2,12}$/;

  if (!post.username) {
    return res.status(400).send('아이디를 입력해주세요.');
  }

  if (!patternUsername.test(post.username)) {
    return res.status(400).send('조건에 맞게 아이디를 입력해주세요.');
  }

  db.query(`UPDATE tbl_user SET username = ? WHERE id=?`,[post.username, authStatus(req, res).user_id], function(error, data) {
    if(error){
      res.status(500).send('Internal Server Error');
      return;
    }
    req.session.username = post.username;
    req.session.save(() => {
      res.json({ success: true });
    });
  });
});

app.patch('/settings/password', async (req, res) => {
  try {
    const post = req.body;
    const user_id = authStatus(req, res).user_id;
    const patternPassword = /^[A-Za-z0-9]{4,20}$/;

    if (!post.password) {
      return res.status(400).send('비밀번호를 입력해주세요.');
    }
  
    if (!patternPassword.test(post.password)) {
      return res.status(400).send('조건에 맞게 비밀번호를 입력해주세요.');
    }
    
    const [data] = await db.promise().query(`SELECT id, username, password FROM tbl_user WHERE id=?`,[user_id]);
  
    if(data.length === 0) {
      return res.status(404).send('존재하지 않는 아이디입니다.');
    }

    const match = await bcrypt.compare(post.password, data[0].password);
    console.log(match)
  
    if(!match) {
      return res.status(400).send('비밀번호가 일치하지 않습니다.');
    }
  
    const newPassword = await hashPassword(post.newPassword);

    await db.promise().query(`UPDATE tbl_user SET password = ? WHERE id=?`,[newPassword, user_id]);

    res.send('비밀번호가 변경 되었습니다.');
  } catch (err) {
    console.log(err);
    res.status(500).send('Internal Server Error');
  }
});

app.post('/cookie', (req, res) => {
  if(req.body.line)
    res.cookie('line', req.body.line, { maxAge: 900000, httpOnly: true });

  if(req.body.view)
    res.cookie('view', req.body.view, { maxAge: 900000, httpOnly: true });

  if(req.body.like)
    res.cookie('like', req.body.like, { maxAge: 900000, httpOnly: true });

  res.send('Cookie set');
});

app.listen(3000, () => {
  console.log('Server is running on http://localhost:3000');
});