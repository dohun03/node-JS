var sanitizehtml = require('sanitize-html');

module.exports = {
  main: function(html, script){
    return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.1/dist/css/bootstrap.min.css">
      <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/4.7.0/css/font-awesome.css"/>
      <script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.1/dist/js/bootstrap.bundle.min.js"></script>
      <title>Node JS</title>
      <style>
        html { height: 100%; }
        body { height: 100%; margin: 0; padding: 0; }
        .__body__ { padding: 120px 340px 40px 340px; height:100%; background-color:#f0f0f0; overflow: auto; /* 내용이 넘칠 경우 스크롤바 표시 */ }
      
      /* 미디어 쿼리를 사용하여 화면 크기에 따라 스타일 변경 */
        @media (max-width: 768px) {
            .__body__ {
                padding: 80px 20px; /* 작은 화면에서 패딩 조정 */
            }
        }
        .navbar {
          position: fixed;
          top: 0;
          width: 100%;
          z-index: 1000;
        }
        .none {
          display:none;
        }
      </style>
    </head>
    <body>
      <nav class="navbar navbar-expand-lg bg-body-tertiary">
        <div class="container-fluid">
          <a class="navbar-brand" href="/">
            <img src="dhoutside.png" style="width:30px;">
            <b><i>dhoutside.com</i></b>
          </a>
          <div class="collapse navbar-collapse" id="navbarSupportedContent">
            <ul class="navbar-nav me-auto mb-2 mb-lg-0">
              <li class="nav-item">
                <a class="nav-link active" aria-current="page" href="/login">로그인/회원가입</a>
              </li>
              <li class="nav-item">
                <a class="nav-link disabled" aria-disabled="true">비활성화 메뉴</a>
              </li>
            </ul>
            <form class="d-flex" role="search">
              <input class="form-control me-2" type="search" placeholder="Search" aria-label="Search">
              <button class="btn btn-outline-success" type="submit">Search</button>
            </form>
          </div>
        </div>
      </nav>
      <div class="__body__">${html}</div>
    </body>
    <script src="https://code.jquery.com/jquery-3.6.0.min.js"></script>
    <script>${script}</script>
    </html>
    `;
  }
}