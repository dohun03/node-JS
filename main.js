const express = require('express');
const app = express();
const mysql = require('mysql');
const qs = require('querystring');
const pages = require('./lib/pages.js');
const cookieParser = require('cookie-parser');
const session = require('express-session');
const FileStore = require('session-file-store')(session)

app.use(cookieParser());
app.use(express.static(__dirname));
app.use(session({
  secret: 'dhlee', // 따로 보관해야함. 나만 알아야함.
  resave: false,
  saveUninitialized: true,
  store: new FileStore()
}))

const db = mysql.createConnection({
  host: 'localhost',
  user: 'root',
  password: '0000',
  database: 'nodejs'
});

db.connect();

app.get('/', (req, res) => {
  console.log(req.session);
  let page = req.query.page ? parseInt(req.query.page):1;
  let line = 5;
  if(req.cookies.line){
    line = parseInt(req.cookies.line);
  }

  //페이지 개수 합계
  let page_total;
  db.query(`SELECT COUNT(*) FROM tbl_board`,function(error, data) {
    page_total = Math.ceil(parseInt(data[0]['COUNT(*)']) / line);
  });

  db.query(`SELECT * FROM tbl_board order by id desc limit ?,?;`, [line*(page-1), line],function(error, data) {
    if (error) {
      res.status(500).send('Internal Server Error');
      console.log(error)
      return;
    }
    let html = '';
    for (let i = 0; i < data.length; i++) {
      html +=
        `
        <tr>
          <td>
          <a style="display:block; color:black; text-decoration-line: none; width:100%;" href="/view?id=${data[i].id}">${data[i].subject}
          </a>
          </td>
          <td style="text-align:center;">${data[i].user}</td>
          <td style="text-align:center;">523</td>
        </tr>
        `;
    }
    let selectOptionsHtml = '';
    const options = [5, 10, 50, 100];
    options.forEach(option => {
      const selected = option === line ? 'selected' : '';
      selectOptionsHtml += `<option value="${option}" ${selected}>${option} 줄</option>`;
    });
    html = `
      <div class="info" style="width:100%; margin-bottom: 10px;">
        <a href="/edit"><button type="button" class="btn btn-dark"><i class="fa fa-pencil-square-o" aria-hidden="true"></i> 글쓰기</button></a>
        <select class="form-select form-select-sm line" aria-label="Small select example" style="display:inline; width:100px;">
          ${selectOptionsHtml}
        </select>
        <div class="float-end">
          <span style="margin-right:10px;">${page} / ${page_total}</span>
          <a href="${page==1?'#':'/?page='+(page-1).toString()}"><button type="button" class="btn btn-dark" ${page==1?'disabled':''}><i class="fa fa-arrow-left" aria-hidden="true"></i></button></a>
          <a href="${page_total==page?'#':'/?page='+(page+1).toString()}"><button type="button" class="btn btn-dark" ${page_total==page ? 'disabled':''}><i class="fa fa-arrow-right" aria-hidden="true"></i></button></a>
        </div>
      </div>
      <table class="table table-hover" style="border: 1px solid #ccc;">
        <col style="width:80%;"><col><col style="width:7%;">
        <thead>
          <tr>
            <th scope="col">제목</th>
            <th style="text-align:center;" scope="col">작성자</th>
            <th style="text-align:center;" scope="col">조회수</th>
          </tr>
        </thead>
        <tbody class="table-group-divider">
        ${html}
        </tbody>
      </table>
      <div style="width:100%; background-color:white; padding:15px; border:5px solid black; border-radius:15px;">
        <h3>2024.04.23 패치노트</h3>
        <ul>
          <li>DHOUTSIDE 로고 추가(수제작)</li>
          <li>줄(line) 설정 기능 추가</li>
          <li>페이지 넘기기 기능 추가</li>
          <li>수정 및 삭제는 작성자만 가능하도록 변경</li>
          <li>로그인/회원가입 기능 / 제작 중</li>
          <li>댓글 기능 / 제작 중</li>
        </ul>
      </div>
    `
    script = `
    $(".line").on("change", function() {
      let line = $(this).val();
      $.ajax({
        url: '/cookie',
        method: 'POST',
        data: {
          line: line
         },
        success: function(response) {
          console.log('suc');
          document.location.href = '/';
        },
        error: function(xhr, status, error) {
          console.log('error');
        }
      });
    })
    `
    res.send(pages.main(html,script));
  });
});

app.get('/view', (req, res) => {
  const id = req.query.id;
  let user = req.ip;
  user = user.replace("::ffff:","");
  db.query(`SELECT * FROM tbl_board where id=${id}`, function(error, data) {
    if (error) {
      res.status(500).send('Internal Server Error');
      return;
    }
    if (data && data.length > 0) {
      const html = `
        <h3 style="background-color:white; padding:10px; width:100%; margin-bottom:10px; font-weight:bold;">${data[0].subject}</h3>
        <div style="padding:10px;">작성자 IP: ${data[0].user}</div>
        <div style="background-color:white; padding:10px; width:100%; margin-bottom:10px; white-space: pre-line;">${data[0].content}</div>
        <br>
        <a href="/edit?id=${id}" class="${data[0].user!=user?'none':''}"><button class="btn btn-sm btn-success edit">Edit</button></a>
        <a href="/delete?id=${id}" class="${data[0].user!=user?'none':''}"><button class="btn btn-sm btn-danger delete">Delete</button></a>
        <hr>
        <div class="comment" style="margin-top:20px;">
          <textarea class="form-control content" placeholder="댓글을 입력하세요"></textarea><br>
          <a href="#"><button class="btn btn-sm btn-primary">댓글 저장</button></a>
        </div>
      `;
      res.send(pages.main(html));
    } else {
      res.status(404).send("요청하신 게시글을 찾을 수 없습니다람쥐썬더");
    }
  });
});

app.get('/edit', (req, res) => {
  const id = req.query.id;
  if (id) {
    db.query(`SELECT * FROM tbl_board where id=${id}`, function(error, data) {
      if (error) {
        res.status(500).send('Internal Server Error');
        return;
      }
      let user = req.ip;
      user = user.replace("::ffff:","");
      let html = `
      <input class="form-control subject" value="${data[0].subject}" placeholder="제목을 입력하세요" style="margin-bottom:10px;">
      <textarea class="form-control content" style="height:80%;">${data[0].content}</textarea>
      <br>
      <button class="btn btn-sm btn-primary save">Save</button>
      `;
      let script = `
      $(document).ready(function() {
        $('.save').click(function(e) {
          
          e.preventDefault();
          
          var subject = $('.subject').val();
          var content = $('.content').val();
          
          $.ajax({
            url: '/write',
            method: 'POST',
            data: { 
              id: '${id}',
              status: 'update',
              subject: subject, 
              content: content,
              user: '${user}'
              },
            success: function(response) {
              console.log('suc');
              document.location.href = '/view?id=${id}';
            },
            error: function(xhr, status, error) {
              console.log('error');
            }
          });
        });
      });
      `;
      if(data[0].user!=user) {
        html = '<h3>당신은 수정 권한이 없습니다.</h3>'
        script = '';
      }
      res.send(pages.main(html, script));
    });
  } else {
    let user = req.ip;
    user = user.replace("::ffff:","");
    const html = `
        <input class="form-control subject" placeholder="제목을 입력하세요" style="margin-bottom:10px;">
        <textarea class="form-control content" style="height:80%;"></textarea>
        <br>
        <button class="btn btn-sm btn-primary save">Save</button>
        `;
    const script = `
        $(document).ready(function() {
          $('.save').click(function(e) {
            if ($('.subject').val().length < 30) {
              e.preventDefault();
              
              var subject = $('.subject').val();
              var content = $('.content').val();
              
              $.ajax({
                url: '/write',
                method: 'POST',
                data: { 
                  status: 'create',
                  subject: subject, 
                  content: content,
                  user: '${user}'
                },
                success: function(response) {
                  document.location.href = '/view?id='+response.insertId;
                  console.log('suc');
                },
                error: function(xhr, status, error) {
                  console.log(xhr, status, error);
                }
              });
            } else {
              alert("글자는 20자 이내로 쓰세요");
            }
          });
        });
        `;
    res.send(pages.main(html, script));
  }
});

app.post('/write', (req, res) => {
  let body = '';
  req.on('data', function(data) {
    body = body + data;
  });
  req.on('end', function() {
    const post = qs.parse(body);
    if (post.status == 'create') {
      db.query(`INSERT INTO tbl_board (subject, content, user) VALUES (?,?,?);`, [post.subject, post.content, post.user], function(error, data) {
        if (error) {
          res.status(500).send('Internal Server Error');
          return;
        }
        console.log(data.insertId);
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
});

app.get('/delete', (req, res) => {
  const id = req.query.id;
  db.query(`select user FROM tbl_board where id=?`, [id], function(error, data) {
    let user = req.ip;
    user = user.replace("::ffff:","");
    if(data[0].user==user){
      db.query(`DELETE FROM tbl_board where id=?`, [id], function(error, data) {
        if (error) {
          res.status(500).send('Internal Server Error');
          return;
        }
        res.redirect('/');
      });
    } else {
      res.send("<h3>당신은 삭제 권한이 없습니다.</h3>");
    }
  })
});

app.post('/cookie', (req, res) => {
  let body = '';
  req.on('data', function(data) {
    body = body + data;
  });
  req.on('end', function() {
    const post = qs.parse(body);
    res.cookie('line', post.line, { maxAge: 86400000 }); // 1일 동안 쿠키 유지
    res.send();
  });
});

app.get('/login', (req, res) => {
  html = `
    <style>
        .container {
            max-width: 500px;
            margin: 100px auto;
            background: #fff;
            padding: 20px;
            border-radius: 5px;
            box-shadow: 0 0 10px rgba(0, 0, 0, 0.1);
        }
        h2 {
            text-align: center;
        }
        .form-group {
            margin-bottom: 20px;
        }
        label {
            font-weight: bold;
            display: block;
            margin-bottom: 5px;
        }
        input[type="text"], input[type="password"] {
            width: 100%;
            padding: 10px;
            border-radius: 5px;
            border: 1px solid #ccc;
        }
        input[type="submit"] {
            width: 100%;
            background: #007bff;
            color: #fff;
            border: none;
            padding: 10px;
            border-radius: 5px;
            cursor: pointer;
        }
        input[type="submit"]:hover {
            background: #0056b3;
        }
    </style>
    <div class="container">
      <h2>로그인</h2>
      <form action="/login_process" method="POST">
          <div class="form-group">
              <label for="username">사용자 아이디</label>
              <input type="text" id="username" name="username" required>
          </div>
          <div class="form-group">
              <label for="password">비밀번호</label>
              <input type="password" id="password" name="password" required>
          </div>
          <input type="submit" value="로그인">
      </form>
      <br>
      <a href="/signup">혹시 아이디가 없으신가요? 회원가입을 해라 당장.</a>
    </div>
  `
  res.send(pages.main(html));
});

app.get('/signup', (req, res) => {
  html = `
    <style>
        .container {
            max-width: 500px;
            background: #fff;
            padding: 20px;
            border-radius: 5px;
            box-shadow: 0 0 10px rgba(0, 0, 0, 0.1);
        }
        h2,h3 {
            text-align: center;
        }
        .form-group {
            margin-bottom: 20px;
        }
        label {
            font-weight: bold;
            display: block;
            margin-bottom: 5px;
        }
        input[type="text"], input[type="password"] {
            width: 100%;
            padding: 10px;
            border-radius: 5px;
            border: 1px solid #ccc;
        }
        input[type="submit"] {
            width: 100%;
            background: #007bff;
            color: #fff;
            border: none;
            padding: 10px;
            border-radius: 5px;
            cursor: pointer;
        }
        input[type="submit"]:hover {
            background: #0056b3;
        }
    </style>
    <div class="container">
      <h3>회원가입 전 서비스 이용 약관 동의</h3>
      <div class="terms">
          서비스에 액세스하거나 서비스를 사용함으로써 귀하는 본 약관을 준수할 것에 동의하게 됩니다.
      </div>
      <form action="/signup_process" method="POST">
          <label for="agree"><input type="checkbox" id="agree" name="agree" required> 서비스<span style="text-decoration: line-through;">(노예)</span> 약관에 동의합니다.</label><br>
          <div class="form-group">
              <label for="username">사용자 아이디</label>
              <input type="text" id="username" name="username" required>
          </div>
          <div class="form-group">
              <label for="password">비밀번호</label>
              <input type="password" id="password" name="password" required>
          </div>
          <input type="submit" value="회원가입">
      </form>
      <br>
    </div>
  `
  res.send(pages.main(html));
});

app.listen(3000);