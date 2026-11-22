/**
 * WORD NINJA — 入口
 */
(function (root) {
  'use strict';

  var WN = root.WN = root.WN || {};

  // 运行期错误标记：便于自动化烟测与用户反馈时定位
  root.addEventListener('error', function (e) {
    try {
      document.body.setAttribute('data-fatal', String(e.message || 'error'));
    } catch (err) { /* ignore */ }
  });
  root.addEventListener('unhandledrejection', function (e) {
    try {
      document.body.setAttribute('data-fatal', 'unhandled:' + String(e.reason));
    } catch (err) { /* ignore */ }
  });

  function boot() {
    try {
      if (/[?&]qa=/i.test(root.location ? root.location.search : '')) {
        document.body.classList.add('qa');
      }
      WN.app.boot();
    } catch (err) {
      var box = document.createElement('div');
      box.className = 'fatal';
      box.innerHTML = '<h2>WORD NINJA 启动失败</h2><pre></pre>';
      box.querySelector('pre').textContent = String(err && err.stack || err);
      document.body.appendChild(box);
      throw err;
    }
  }

  // 存档导入：文件选择框是设置页临时插入的，用文档级监听兜住
  document.addEventListener('change', function (e) {
    if (e.target && e.target.id === 'import-file') {
      var f = e.target.files && e.target.files[0];
      if (f) { WN.app.handleImportFile(f); }
      e.target.value = '';
    }
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})(typeof window !== 'undefined' ? window : globalThis);
