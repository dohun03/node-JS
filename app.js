const express = require('express');
const app = express();
const path = require('path');
const cookieParser = require('cookie-parser');
const session = require('./lib/session.js');
const db = require('./lib/db.js');
const bodyParser = require('body-parser');

// 미들웨어 설정
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public'))); // 정적 파일 제공
app.use(session);

// EJS 템플릿 엔진 설정
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

function authStatus(req, res) {
  if (req.session.is_logined) {
    return req.session.username;
  } else {
    return false;
  }
}

app.get('/', (req, res) => {
  let page = req.query.page ? parseInt(req.query.page) : 1;
  let line = 5;
  if (req.cookies.line) {
    line = parseInt(req.cookies.line);
  }

  db.query(`SELECT COUNT(*) FROM tbl_board`, function (error, countData) {
    if (error) {
      res.status(500).send('Internal Server Error');
      return;
    }
    const page_total = Math.ceil(parseInt(countData[0]['COUNT(*)']) / line);

    db.query(`SELECT * FROM tbl_board order by id desc limit ?,?`, [line * (page - 1), line], function (error, data) {
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
      res.render('list', { data, page_total, selectOptionsHtml, currentPage: page, authStatus: authStatus(req, res)});
    });
  });
});

app.get('/view', (req, res) => {
  const id = req.query.id;
  const user = authStatus(req,res);
  let likes;
  db.query(`SELECT user_id FROM tbl_likes where board_id=?`, [id], function(error, data) {
    if(error){
      console.log(error);
      return;
    }
    likes = data;
  });
  
  db.query(`SELECT * FROM tbl_board where id=?`, [id], function(error, data) {
    if (error) {
      res.status(500).send('Internal Server Error');
      return;
    }
    if (data && data.length > 0) {
      
      // 내가 좋아요 눌렀는지 여부
      let active;
      likes.forEach((value) => {
        if(value.user_id==user)
          active = true;
      });
      res.render('view', { data, id, active, likes, user, authStatus: authStatus(req, res) });
    } else {
      res.status(404).send("요청하신 게시글을 찾을 수 없습니다.");
    }
  });
});

app.get('/edit', (req, res) => {
  if(req.session.is_logined){
    const id = req.query.id;
    const user = authStatus(req,res);
    if (id) {
      db.query(`SELECT * FROM tbl_board where id=?`, [id], function(error, data) {
        if (error) {
          res.status(500).send('Internal Server Error');
          return;
        }
        if(data[0].user!=user) {
          res.status(500).render('error', { errorMessage:'당신은 수정 권한이 없습니다.', authStatus: authStatus(req, res) } );
          return;
        }
        res.render('edit', { data, id, user, status: 'update', authStatus: authStatus(req, res) });
      });
    } else {
      res.render('edit', { data:'', user, status: 'create', authStatus: authStatus(req, res) });
    }
  } else {
    res.status(500).render('error', { errorMessage:'당신은 작성 권한이 없습니다. 로그인 후 이용 가능합니다.', authStatus: authStatus(req, res) } );
    return;
  }
});

app.post('/write', (req, res) => {
  let post = req.body;
  if (post.status == 'create') {
    db.query(`INSERT INTO tbl_board (subject, content, user) VALUES (?,?,?);`, [post.subject, post.content, post.user], function(error, data) {
      if (error) {
        res.status(500).send('Internal Server Error');
        return;
      }
      res.send({ insertId: data.insertId });
    });
  } else if (post.status == 'update') {
    db.query(`UPDATE tbl_board SET subject=?, content=?, user=? where id=?`, [post.subject, post.content, post.user, post.id], function(error, data) {
      if (error) {
        res.status(500).send('Internal Server Error');
        return;
      }
      res.send();
    });
  } else {
    res.status(404).send('Not found, Go home');
  }
});

app.get('/delete', (req, res) => {
  const id = req.query.id;
  const user = authStatus(req,res);
  db.query(`DELETE FROM tbl_board where id=? and user=?`, [id, user], function(error, data) {
    if (error) {
      res.status(500).send('Internal Server Error');
      return;
    }

    res.redirect('/');
  });
});

app.post('/likes', (req, res) => {
  let post = req.body;
  const user = authStatus(req,res);
  // 누른건지 해제한건지 상태 확인, true면 삽입, false면 해제니까 delete.
  if(user) {
    if(post.status=='add'){
      db.query(`INSERT INTO tbl_likes(user_id,board_id) VALUES(?,?)`, [user, post.board], function(error, data) {
        if (error) {
          res.status(500).send('Internal Server Error');
          console.log(error);
          return;
        }
        res.send('add');
      })
    } else if(post.status=='delete'){
      db.query(`DELETE FROM tbl_likes WHERE user_id=? and board_id=?`, [user, post.board], function(error, data) {
        if (error) {
          res.status(500).send('Internal Server Error');
          return;
        }
        res.send('delete');
      })
    }
  }
});

app.get('/report', (req, res) => {
  res.render('report', { authStatus: authStatus(req, res) })
})

app.post('/report_process', (req, res) => {
  let post = req.body;
  res.render('error', { errorMessage:'신고가 접수ㅋ되었습니다.', authStatus: authStatus(req, res) } );
});

app.get('/login', (req, res) => {
  res.render('login', { authStatus: authStatus(req, res) })
});

app.post('/login_process', (req, res) => {
  let post = req.body;
  db.query(`SELECT username, password FROM tbl_user WHERE username=?`,[post.username], function(error, data) {
    if(error){ //쿼리 자체에 문제가 생겼을 경우
      return;
    } else if(data && data.length > 0){ //쿼리 결과가 1개 이상 있을 경우
      if(data[0].username == post.username && data[0].password == post.password){
        req.session.is_logined = true;
        req.session.username = data[0].username;
        req.session.save( function() {
          res.json({ success: true });
        })
      } else {
        res.json({ success: false, message: '아이디 또는 비밀번호가 맞지 않습니다.' });
      }
    } else { //쿼리 결과가 0개인 경우[ 아이디가 없는 경우. ]
      res.json({ success: false, message: '아이디 또는 비밀번호가 맞지 않습니다.' });
    }
  })
});

app.get('/signup', (req, res) => {
  res.render('signup', { authStatus: authStatus(req, res) });
});

app.post('/signup_process', (req, res) => {
  let post = req.body;
  db.query(`INSERT INTO tbl_user (username, password) VALUES (?,?);`, [post.username, post.password], function(error, data) {
    if (error) {
      res.status(500).render('error', { errorMessage:'이미 존재하는 아이디 입니다.', authStatus: authStatus(req, res) } );
      return;
    }
    res.redirect('/login');
  });
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
