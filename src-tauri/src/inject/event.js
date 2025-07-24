// 函数定义部分
function setZoom(zoom) {
  const html = document.getElementsByTagName('html')[0];
  html.style.zoom = zoom;
  window.localStorage.setItem('htmlZoom', zoom);
}
// ... 原有代码 ...

// Rewrite the window.open function.
const originalWindowOpen = window.open;
window.open = function (url, name, specs) {
    // 禁止在新窗口打开，直接在当前窗口跳转
    location.href = url;
    // Call the original window.open function to maintain its normal functionality.
    return originalWindowOpen.call(window, url, name, specs);
};

// ... 原有代码 ...
function zoomCommon(zoomChange) {
  const currentZoom = window.localStorage.getItem('htmlZoom') || '100%';
  setZoom(zoomChange(currentZoom));
}

function zoomIn() {
  zoomCommon(currentZoom => `${Math.min(parseInt(currentZoom) + 10, 200)}%`);
}

function zoomOut() {
  zoomCommon(currentZoom => `${Math.max(parseInt(currentZoom) - 10, 30)}%`);
}

function handleShortcut(event) {
  if (shortcuts[event.key]) {
    event.preventDefault();
    shortcuts[event.key]();
  }
}

function isDownloadLink(url) {
  const fileExtensions = [
    '3gp', '7z', 'ai', 'apk', 'avi', 'bmp', 'csv', 'dmg', 'doc', 'docx',
    'fla', 'flv', 'gif', 'gz', 'gzip', 'ico', 'iso', 'indd', 'jar', 'jpeg',
    'jpg', 'm3u8', 'mov', 'mp3', 'mp4', 'mpa', 'mpg', 'mpeg', 'msi', 'odt',
    'ogg', 'ogv', 'pdf', 'png', 'ppt', 'pptx', 'psd', 'rar', 'raw',
    'svg', 'swf', 'tar', 'tif', 'tiff', 'ts', 'txt', 'wav', 'webm', 'webp',
    'wma', 'wmv', 'xls', 'xlsx', 'xml', 'zip', 'json', 'yaml', '7zip', 'mkv',
  ];
  const downloadLinkPattern = new RegExp(`\\.(${fileExtensions.join('|')})$`, 'i');
  return downloadLinkPattern.test(url);
}

function collectUrlToBlobs() {
  const backupCreateObjectURL = window.URL.createObjectURL;
  window.blobToUrlCaches = new Map();
  window.URL.createObjectURL = blob => {
    const url = backupCreateObjectURL.call(window.URL, blob);
    window.blobToUrlCaches.set(url, blob);
    return url;
  };
}

function convertBlobUrlToBinary(blobUrl) {
  return new Promise(resolve => {
    const blob = window.blobToUrlCaches.get(blobUrl);
    const reader = new FileReader();

    reader.readAsArrayBuffer(blob);
    reader.onload = () => {
      resolve(Array.from(new Uint8Array(reader.result)));
    };
  });
}

function downloadFromDataUri(dataURI, filename) {
  const byteString = atob(dataURI.split(',')[1]);
  const bufferArray = new ArrayBuffer(byteString.length);
  const binary = new Uint8Array(bufferArray);

  for (let i = 0; i < byteString.length; i++) {
    binary[i] = byteString.charCodeAt(i);
  }

  invoke('download_file_by_binary', {
    params: {
      filename,
      binary: Array.from(binary),
    },
  });
}

function downloadFromBlobUrl(blobUrl, filename) {
  convertBlobUrlToBinary(blobUrl).then(binary => {
    invoke('download_file_by_binary', {
      params: {
        filename,
        binary,
      },
    });
  });
}

function detectDownloadByCreateAnchor() {
  const createEle = document.createElement;
  document.createElement = el => {
    if (el !== 'a') return createEle.call(document, el);
    const anchorEle = createEle.call(document, el);

    anchorEle.addEventListener(
      'click',
      e => {
        const url = anchorEle.href;
        const filename = anchorEle.download || getFilenameFromUrl(url);
        if (window.blobToUrlCaches.has(url)) {
          downloadFromBlobUrl(url, filename);
        } else if (url.startsWith('data:')) {
          downloadFromDataUri(url, filename);
        }
      },
      true,
    );

    return anchorEle;
  };
}

function isSpecialDownload(url) {
  return ['blob', 'data'].some(protocol => url.startsWith(protocol));
}

function isDownloadRequired(url, anchorElement, e) {
  return anchorElement.download || e.metaKey || e.ctrlKey || isDownloadLink(url);
}

function handleExternalLink(url) {
  invoke('plugin:shell|open', {
    path: url,
  });
}

function detectAnchorElementClick(e) {
  const anchorElement = e.target.closest('a');

  if (anchorElement && anchorElement.href) {
    const target = anchorElement.target;
    const hrefUrl = new URL(anchorElement.href);
    const absoluteUrl = hrefUrl.href;
    let filename = anchorElement.download || getFilenameFromUrl(absoluteUrl);

    if (target === '_blank') {
      e.preventDefault();
      return;
    }

    if (target === '_new') {
      e.preventDefault();
      handleExternalLink(absoluteUrl);
      return;
    }

    if (isDownloadRequired(absoluteUrl, anchorElement, e) && !isSpecialDownload(absoluteUrl)) {
      e.preventDefault();
      invoke('download_file', { params: { url: absoluteUrl, filename } });
    }
  }
}

function setDefaultZoom() {
  const htmlZoom = window.localStorage.getItem('htmlZoom');
  if (htmlZoom) {
    setZoom(htmlZoom);
  }
}

function getFilenameFromUrl(url) {
  const urlPath = new URL(url).pathname;
  return urlPath.substring(urlPath.lastIndexOf('/') + 1);
}

// 快捷键定义
const shortcuts = {
  '[': () => window.history.back(),
  ']': () => window.history.forward(),
  '-': () => zoomOut(),
  '=': () => zoomIn(),
  '+': () => zoomIn(),
  0: () => setZoom('100%'),
  r: () => window.location.reload(),
  ArrowUp: () => scrollTo(0, 0),
  ArrowDown: () => scrollTo(0, document.body.scrollHeight),
};

// DOMContentLoaded 事件处理
document.addEventListener('DOMContentLoaded', () => {
  const tauri = window.__TAURI__;
  const appWindow = tauri.window.getCurrentWindow();
  const invoke = tauri.core.invoke;

  // 点击事件处理
  document.addEventListener('click', function (e) {
    const anchorElement = e.target.closest('a');
    if (anchorElement && anchorElement.href && anchorElement.target === '_blank') {
      e.preventDefault();
      window.location.href = anchorElement.href;
    }
  });

  if (!document.getElementById('pake-top-dom')) {
    const topDom = document.createElement('div');
    topDom.id = 'pake-top-dom';
    document.body.appendChild(topDom);
  }

  const domEl = document.getElementById('pake-top-dom');

  domEl.addEventListener('touchstart', () => {
    appWindow.startDragging();
  });

  domEl.addEventListener('mousedown', e => {
    e.preventDefault();
    if (e.buttons === 1 && e.detail !== 2) {
      appWindow.startDragging();
    }
  });

  domEl.addEventListener('dblclick', () => {
    appWindow.isFullscreen().then(fullscreen => {
      appWindow.setFullscreen(!fullscreen);
    });
  });

  if (window['pakeConfig']?.disabled_web_shortcuts !== true) {
    document.addEventListener('keyup', event => {
      if (/windows|linux/i.test(navigator.userAgent) && event.ctrlKey) {
        handleShortcut(event);
      }
      if (/macintosh|mac os x/i.test(navigator.userAgent) && event.metaKey) {
        handleShortcut(event);
      }
    });
  }

  collectUrlToBlobs();
  detectDownloadByCreateAnchor();

  // 重写 window.open 函数
  const originalWindowOpen = window.open;
  window.open = function (url, name, specs) {
    if (name === 'AppleAuthentication') {
      // do nothing
    } else if (specs && (specs.includes('height=') || specs.includes('width='))) {
      location.href = url;
    } else {
      const baseUrl = window.location.origin + window.location.pathname;
      const hrefUrl = new URL(url, baseUrl);
      handleExternalLink(hrefUrl.href);
    }
    // 根据具体需求决定是否调用原始的 window.open 函数
    // return originalWindowOpen.call(window, url, name, specs);
  };

  try {
    setDefaultZoom();
  } catch (e) {
    console.error('Failed to set default zoom:', e);
  }

  // 修复 Safari 中文输入法“Enter”问题
  document.addEventListener(
    'keydown',
    e => {
      if (e.keyCode === 229) e.stopPropagation();
    },
    true,
  );

  // 创建返回按钮
  const backButton = document.createElement('button');
  backButton.textContent = '←';
  backButton.style.cssText = `
    position: fixed;
    top: 20px;
    left: 20px;
    z-index: 9999;
    padding: 8px 12px;
    border: none;
    border-radius: 8px;
    background: rgba(255, 255, 255, 0.1);
    backdrop-filter: blur(10px);
    -webkit-backdrop-filter: blur(10px);
    box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
    color: white;
    cursor: pointer;
    display: none; /* 初始隐藏 */
  `;
  document.body.appendChild(backButton);

  // 记录初始页面的 URL
  const initialUrl = window.location.href;

  // 显示或隐藏按钮的函数
  function updateBackButtonVisibility() {
    if (window.location.href === initialUrl) {
      backButton.style.display = 'none';
    } else {
      backButton.style.display = 'block';
    }
  }

  // 绑定点击事件
  backButton.addEventListener('click', () => {
    window.history.back();
  });

  // 监听历史记录变化
  window.addEventListener('popstate', updateBackButtonVisibility);

  // 初始检查按钮是否显示
  updateBackButtonVisibility();

  // 重写 Notification 相关函数
  let permVal = 'granted';
  window.Notification = function (title, options) {
    const { invoke } = window.__TAURI__.core;
    const body = options?.body || '';
    let icon = options?.icon || '';

    if (icon.startsWith('/')) {
      icon = window.location.origin + icon;
    }

    invoke('send_notification', {
      params: {
        title,
        body,
        icon,
      },
    });
  };

  window.Notification.requestPermission = async () => 'granted';

  Object.defineProperty(window.Notification, 'permission', {
    enumerable: true,
    get: () => permVal,
    set: v => {
      permVal = v;
    },
  });
});
