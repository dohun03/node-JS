var http = require('http');
var fs = require('fs');
var url = require('url');
var qs = require('querystring');
var express = require('express');
var path = require('path');
var page = require('./lib/page.js');
// var template = require('./lib/create.js');
var mysql = require('mysql');
var db = mysql.createConnection({
  host     : 'localhost',
  user     : 'root',
  password : '0000',
  database : 'nodejs'
});

db.connect();

var app = http.createServer(function(request,response){
    var _url = request.url;
    var queryData = url.parse(_url, true).query;
    var pathname = url.parse(_url, true).pathname;

    if(pathname === '/'){
      db.query(`SELECT * FROM tbl_board;`, function(error, data){
        html = '';
        for(let i=0; i<data.length; i++){
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
        response.writeHead(200);
        response.end(page.main(html));
      });

    } else if(pathname === '/view') {
      db.query(`SELECT * FROM tbl_board where id=${queryData.id}`, function(error, data){
        html = `
        <h3 style="background-color:white; padding:5px; width:100%; margin-bottom:10px; font-weight:bold;">${data[0].subject}</h3>
        <div style="background-color:white; padding:5px; width:100%; margin-bottom:10px;">${data[0].content}</div>
        <br>
        <button class="btn btn-sm btn-success edit">Edit</button>
        <button class="btn btn-sm btn-danger delete">Delete</button>
        `;
        script = `
        let edit = document.querySelector(".edit");
        edit.addEventListener("click", function() {
          document.location.href = '/edit?id=${queryData.id}';
        });
        `
        response.writeHead(200);
        response.end(page.main(html, script));
      });
    } else if(pathname === '/edit'){
      if(queryData.id){
        db.query(`SELECT * FROM tbl_board where id=${queryData.id}`, function(error, data){
          html = `
          <input class="form-control subject" value="${data[0].subject}" placeholder="제목을 입력하세요" style="margin-bottom:10px;">
          <textarea class="form-control content" style="height:80%;">${data[0].content}</textarea>
          <br>
          <button class="btn btn-sm btn-primary save">Save</button>
          `
          script = `
          $(document).ready(function() {
            $('.save').click(function(e) {
              e.preventDefault();
              
              var subject = $('.subject').val();
              var content = $('.content').val();
              
              $.ajax({
                url: '/create',
                method: 'POST',
                data: { 
                  // send: 1,
                  status: 'update',
                  subject: subject, 
                  content: content
                 },
                success: function(response) {
                  console.log('suc');
                  document.location.href = '/';
                },
                error: function(xhr, status, error) {
                  console.log(xhr, status, error);
                }
              });
            });
          });
          `
          response.writeHead(200);
          response.end(page.main(html, script));
        });
      } else {
        html = `
        <input class="form-control subject" placeholder="제목을 입력하세요" style="margin-bottom:10px;">
        <textarea class="form-control content" style="height:80%;"></textarea>
        <br>
        <button class="btn btn-sm btn-primary save">Save</button>
        `
        script = `
        $(document).ready(function() {
          $('.save').click(function(e) {
            e.preventDefault();
            
            var subject = $('.subject').val();
            var content = $('.content').val();
            
            $.ajax({
              url: '/create',
              method: 'POST',
              data: { 
                // send: 1,
                status: 'create',
                subject: subject, 
                content: content
               },
              success: function(response) {
                console.log('suc');
                document.location.href = '/';
              },
              error: function(xhr, status, error) {
                console.log(xhr, status, error);
              }
            });
          });
        });
        `
        response.writeHead(200);
        response.end(page.main(html, script));
      }
    } else if(pathname === '/create'){
      var body = '';
      request.on('data', function(data){
          body = body + data;
      });
      request.on('end', function(){
        var post = qs.parse(body);
        if(post.status == 'create'){
          db.query(`INSERT INTO tbl_board (subject, content) VALUES (?,?);`,[post.subject, post.content], function(error, data){
            if(error)
              throw error;
  
            response.writeHead(200);
            response.end();
          });
        } else if(post.status == 'update'){
          // db.query(`update tbl_board (subject, content) VALUES (?,?);`,[post.subject, post.content], function(error, data){
          //   if(error)
          //     throw error;
  
          //   response.writeHead(200);
          //   response.end();
          // });
        } else {
          response.writeHead(404);
          response.end('Not found, Go home');
        }
      });
    } else if(pathname === '/delete'){
      response.writeHead(404);
      response.end('Not found');
    } else {
      response.writeHead(404);
      response.end('Not found');
    }
});
app.listen(3000);
