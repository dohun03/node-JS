const express = require('express');
const app = express();
const mysql = require('mysql');
const qs = require('querystring');
const page = require('./lib/page.js');

const db = mysql.createConnection({
  host: 'localhost',
  user: 'root',
  password: '0000',
  database: 'nodejs'
});

db.connect();

app.get('/', (req, res) => {
  let line = 5;
  if(req.query.line){
    line = parseInt(req.query.line);
  }
  db.query(`SELECT * FROM tbl_board limit ?;`, [line],function(error, data) {
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
    const options = [5, 10, 50, 100]; // 선택할 수 있는 옵션들
    options.forEach(option => {
      const selected = option === line ? 'selected' : ''; // 현재 line 값과 option 값이 같은 경우 selected 설정
      selectOptionsHtml += `<option value="${option}" ${selected}>${option} 줄</option>`;
    });
    html = `
      <div class="info" style="width:100%; margin-bottom: 10px;">
        <a href="/edit"><button type="button" class="btn btn-dark">글쓰기</button></a>
        <select class="form-select form-select-sm line" aria-label="Small select example" style="display:inline; width:100px;">
        ${selectOptionsHtml}
        </select>
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
    `
    script = `
    $(".line").on("change", function() {
      document.location.href = '/?line='+$(this).val();
    })
    `
    res.send(page.main(html,script));
  });
});

app.get('/view', (req, res) => {
  const id = req.query.id;
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
            <a href="/edit?id=${id}"><button class="btn btn-sm btn-success edit">Edit</button></a>
            <a href="/delete?id=${id}"><button class="btn btn-sm btn-danger delete">Delete</button></a>
          `;
      res.send(page.main(html));
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
      const html = `
          <input class="form-control subject" value="${data[0].subject}" placeholder="제목을 입력하세요" style="margin-bottom:10px;">
          <textarea class="form-control content" style="height:80%;">${data[0].content}</textarea>
          <br>
          <button class="btn btn-sm btn-primary save">Save</button>
          `;
      const script = `
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
      res.send(page.main(html, script));
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
              alert("글자는 20자 이내로 쳐 쓰세요");
            }
          });
        });
        `;
    res.send(page.main(html, script));
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
  db.query(`DELETE FROM tbl_board where id=?`, [id], function(error, data) {
    if (error) {
      res.status(500).send('Internal Server Error');
      return;
    }
    res.redirect('/');
  });
});

app.get('/login', (req, res) => {
  res.status(404).send('아직 구현중인 기능입니노');
})

app.listen(3000, () => {
  console.log('서버가 3000번 포트에서 실행 중입니다.');
});