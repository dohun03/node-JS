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
  db.query(`SELECT * FROM tbl_board;`, function(error, data) {
    if (error) {
      res.status(500).send('Internal Server Error');
      return;
    }
    let html = '';
    for (let i = 0; i < data.length; i++) {
      html +=
        `
          <div class="accordion-item">
            <h2 class="accordion-header">
              <button class="accordion-button collapsed" type="button" data-bs-toggle="collapse" data-bs-target="#collapse${i}" aria-expanded="false" aria-controls="collapse${i}">
                ${data[i].subject}
              </button>
            </h2>
            <div id="collapse${i}" class="accordion-collapse collapse" data-bs-parent="#accordionExample">
              <a href="/view?id=${data[i].id}">
              <div class="accordion-body">
                ${data[i].content}
              </div>
              </a>
            </div>
          </div>
          `;
    }
    html = `<div class="accordion" id="accordionExample">${html}</div>`;
    res.send(page.main(html));
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
            <div>작성자 IP: ${data[0].user}</div>
            <div style="background-color:white; padding:10px; width:100%; margin-bottom:10px; white-space: pre-line;">${data[0].content}</div>
            <br>
            <a href="/delete?id=${id}"><button class="btn btn-sm btn-danger delete">Delete</button></a>
          `;
      res.send(page.main(html));
    } else {
      res.status(404).send("요청하신 게시글을 찾을 수 없습니노.");
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
                  status: 'update',
                  subject: subject, 
                  content: content
                 },
                success: function(response) {
                  console.log('suc');
                  document.location.href = '/';
                },
                error: function(xhr, status, error) {
                  console.log('fuck');
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
                  console.log('suc');
                  document.location.href = '/';
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
        res.send();
      });
    } else if (post.status == 'update') {
      // Update logic here
    } else {
      res.status(404).send('Not found, Go home');
    }
  });
});

app.get('/delete', (req, res) => {
  const id = req.query.id;
  db.query(`DELETE FROM tbl_board where id=${id}`, function(error, data) {
    if (error) {
      res.status(500).send('Internal Server Error');
      return;
    }
    res.redirect('/');
  });
});

app.listen(3000, () => {
  console.log('서버가 3000번 포트에서 실행 중입니다.');
});