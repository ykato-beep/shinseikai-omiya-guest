/* 接続先（Apps Script ウェブアプリの /exec）。デプロイ後にここへ入れる。
 * 手元確認（localhost）では tools/serve.js の /api を使う。 */
(function () {
  var PROD = 'https://script.google.com/macros/s/AKfycbzZqQxd4psVDu2iYPyeJDfp6v3VYp-BlauGnBSdSlfIhiC0YdzYNDOScgMkdDikZufg/exec';
  var local = location.hostname === 'localhost' || location.hostname === '127.0.0.1';
  window.HEARING_API = local ? '/api' + (location.search || '') : PROD;
})();
