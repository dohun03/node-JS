const express = require('express');
const app = express();
const path = require('path');
const cookieParser = require('cookie-parser');
const session = require('./lib/session.js');
const db = require('./lib/db.js');
const bcrypt = require('bcrypt');
const hashPassword = require('./lib/bcrypt.js'); // 올바르게 가져오기

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public'))); // 정적 파일 제공
app.use(session);

// EJS 템플릿 엔진 설정
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

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

app.get('/header', (req, res) => {
  res.render('header', {authStatus: authStatus(req, res)});  // 'header.ejs' 템플릿을 렌더링하여 응답
});

app.get('/', (req, res) => {
  let page = req.query.page ? parseInt(req.query.page) : 1;
  let line = 5;
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

  let sqlQuery = `SELECT B.*, U.username,
    COUNT(*) OVER() AS total, 
    COUNT(DISTINCT L.id) AS like_count, 
    COUNT(DISTINCT C.id) AS comment_count
  FROM tbl_board B
  LEFT JOIN tbl_likes L ON B.id = L.board_id
  LEFT JOIN tbl_comment C ON B.id = C.board_id
  LEFT JOIN tbl_user U ON B.user_id = U.id ${where}GROUP BY B.id ORDER BY B.id DESC LIMIT ?, ?;`;
  db.query(sqlQuery, params, function (error, data) {
    if (error) {
      res.status(500).send('Internal Server Error');
      return;
    }
    
    let selectOptionsHtml = '';
    const options = [5, 10, 50, 100];
    options.forEach(option => {
      const selected = option === line ? 'selected' : '';
      selectOptionsHtml += `<option value="${option}" ${selected}>${option} 줄</option>`;
    });

    let page_total = 0;
    if(data.length > 0){
      page_total = Math.ceil(parseInt(data[0]['total']) / line);
    }
    res.render('list', { data, page_total, selectOptionsHtml, currentPage: page, search, authStatus: authStatus(req, res)});
  });
});

app.get('/boards/:id', async (req, res) => {
  try {
    const id = req.params.id;
    const user_id = authStatus(req,res).user_id;
    const username = authStatus(req,res).username;

    // 쿼리 순차 실행 -> 병렬 실행(한번에 실행)
    const [[likes], [comment], [data]] = await Promise.all([
      db.promise().query(`SELECT user_id FROM tbl_likes WHERE board_id=?`, [id]),
      db.promise().query(`SELECT b.*, a.username FROM tbl_comment b LEFT JOIN tbl_user a ON b.user_id = a.id WHERE board_id=? ORDER BY b.created_at ASC;`, [id]),
      db.promise().query(`SELECT * FROM tbl_board WHERE id=?`, [id])
    ]);

    if (data && data.length > 0) {
      let views = data[0].views + 1;
      await db.promise().query(`UPDATE tbl_board SET views=? WHERE id=?`, [views, id]);
      let active = likes.some((value) => value.user_id === user_id);
      res.render('view', { data, id, active, likes, comment, username, user_id, authStatus: authStatus(req, res) });
    } else {
      res.status(404).send("요청하신 게시글을 찾을 수 없습니다.");
    }
  } catch (error) {
    console.error(error);
    res.status(500).send("서버 오류");
  }
});

app.get('/boards/:id/edit', (req, res) => {
  if(req.session.is_logined){
    const id = req.params.id != 'new' ? req.params.id : '';
    const user_id = authStatus(req,res).user_id;
    console.log(user_id)
    if (id) {
      db.query(`SELECT * FROM tbl_board where id=?`, [id], function(error, data) {
        if (error) {
          res.status(500).send('Internal Server Error');
          return;
        }
        if(data[0].user_id!=user_id) {
          res.status(500).render('error', { errorMessage:'당신은 수정 권한이 없습니다.', authStatus: authStatus(req, res) } );
          return;
        }
        res.render('edit', { data, id, user_id, status: 'update', authStatus: authStatus(req, res) });
      });
    } else {
      res.render('edit', { data:'', user_id, status: 'create', authStatus: authStatus(req, res) });
    }
  } else {
    res.status(500).render('error', { errorMessage:'당신은 작성 권한이 없습니다. 로그인 후 이용 가능합니다.', authStatus: authStatus(req, res) } );
    return;
  }
});

app.post('/boards', (req, res) => {
  let post = req.body;
  db.query(`INSERT INTO tbl_board (user_id, subject, content) VALUES (?,?,?);`, [post.user_id, post.subject, post.content], function(error, data) {
    if (error) {
      res.status(500).send('Internal Server Error');
      return;
    }
    res.send({ insertId: data.insertId });
  });
});

app.put('/boards/:id', (req, res) => {
  const id = req.params.id
  let post = req.body;
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
    db.query(`INSERT INTO tbl_likes(user_id,board_id) VALUES(?,?)`, [user_id, id], function(error, data) {
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
    db.query(`DELETE FROM tbl_likes WHERE user_id=? and board_id=?`, [user_id, id], function(error, data) {
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
  let post = req.body;
  db.query(`INSERT INTO tbl_comment (board_id, user_id, content) VALUES (?,?,?);`, [post.board_id, post.user_id, post.content], function(error, data) {
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

app.delete('/comments', (req, res) => {
  let post = req.body;
  db.query(`DELETE FROM tbl_comment where id=? and user_id=?`, [post.id, post.user_id], function(error, data) {
    if (error) {
      res.status(500).send('Internal Server Error');
      return;
    }
    res.status(200).send('Delete success');
  });
});

// app.get('/report', (req, res) => {
//   res.render('report', { authStatus: authStatus(req, res) })
// });

// app.post('/report_process', (req, res) => {
//   let post = req.body;
//   res.render('error', { errorMessage:'신고가 접수되었습니다.', authStatus: authStatus(req, res) } );
// });

app.get('/login', (req, res) => {
  if( authStatus(req, res) ) {
    res.render('error', { errorMessage:'이미 로그인 됐습니다!' })
  } else {
    res.render('login', { authStatus: authStatus(req, res) })
  }
});

app.post('/login', async (req, res) => {
  let post = req.body;
  db.query(`SELECT id, username, password FROM tbl_user WHERE username=?`,[post.username], function(error, data) {
    if(error){
      res.status(500).send('Internal Server Error');
      return;
    } else if(data && data.length > 0){
      if(data[0].username == post.username){
        bcrypt.compare(post.password, data[0].password, function(err, result) {
          if (result) { // 비밀번호가 일치하는 경우
            req.session.is_logined = true;
            req.session.username = data[0].username;
            req.session.user_id = data[0].id;
            req.session.save( function() {
              res.json({ success: true });
            })
          } else {
            res.json({ success: false, message: '비밀번호가 맞지 않습니다.' });
          }
        })
      } else {
        res.json({ success: false, message: '존재하지 않는 아이디입니다.' });
      }
    } else { //쿼리 결과가 0개인 경우[ 아이디가 없는 경우. ]
      res.json({ success: false, message: '아이디 또는 비밀번호가 맞지 않습니다.' });
    }
  })
});

app.get('/signup', (req, res) => {
  res.render('signup', { authStatus: authStatus(req, res) });
});

app.post('/signup_process', async (req, res) => {
  try {
    let post = req.body;
    const hashedPassword = await hashPassword(post.password);
    db.query(`INSERT INTO tbl_user (username, password) VALUES (?,?);`, [post.username, hashedPassword], function(error, data) {
      if (error) {
        res.status(500).render('error', { errorMessage:'이미 존재하는 아이디 입니다.', authStatus: authStatus(req, res) } );
        return;
      }
      res.redirect('/login');
    });
  } catch {
    // 해싱 중 에러가 발생하면 처리
    res.status(500).render('error', { errorMessage: '비밀번호 해싱 중 오류가 발생했습니다.', authStatus: authStatus(req, res) });
  }
});

app.get('/logout', (req, res) => {
  req.session.destroy((err)=>{
    if(err)
      throw err;

    res.redirect('/')
  })
});

app.post('/cookie', (req, res) => {
  res.cookie('line', req.body.line, { maxAge: 900000, httpOnly: true });
  res.send('Cookie set');
});

app.listen(3000, () => {
  console.log('Server is running on http://localhost:3000');
});