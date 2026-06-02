import sanitizeHtml from 'sanitize-html';
import { redactSensitiveText } from './requestLogger';
import { DetailViewModel } from './types';

const sensitiveRawJsonKeys = new Set(['token', 'password', 'cookie']);

export function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function sanitizeRichHtml(value: unknown): string {
  return sanitizeHtml(String(value ?? ''), {
    allowedTags: [
      'p', 'br', 'div', 'span', 'strong', 'b', 'em', 'i', 'u', 's',
      'ul', 'ol', 'li', 'blockquote', 'pre', 'code',
      'table', 'thead', 'tbody', 'tr', 'th', 'td',
      'a', 'img', 'hr', 'h1', 'h2', 'h3', 'h4'
    ],
    allowedAttributes: {
      a: ['href', 'title', 'target', 'rel'],
      img: ['src', 'alt', 'title', 'width', 'height'],
      th: ['colspan', 'rowspan'],
      td: ['colspan', 'rowspan']
    },
    allowedSchemes: ['http', 'https', 'mailto'],
    allowedSchemesByTag: {
      a: ['http', 'https', 'mailto'],
      img: ['http', 'https']
    },
    allowProtocolRelative: false,
    disallowedTagsMode: 'discard'
  });
}

function redactSensitiveRawJsonKey(key: string, value: unknown): unknown {
  return sensitiveRawJsonKeys.has(key.toLowerCase()) ? '[REDACTED]' : value;
}

function escapedJson(value: unknown): string {
  return escapeHtml(redactSensitiveText(JSON.stringify(value, redactSensitiveRawJsonKey, 2)));
}

export interface RenderDetailHtmlOptions {
  detail: DetailViewModel;
  cspSource: string;
  nonce: string;
}

function renderFieldValue(field: DetailViewModel['basicFieldGroups'][number]['fields'][number]): string {
  if (field.links?.length) {
    return field.links.map((link) => renderDetailLink(link.type, link.id, link.text)).join('、');
  }
  if (field.linkType && typeof field.linkId === 'number') {
    return renderDetailLink(field.linkType, field.linkId, field.value);
  }
  return escapeHtml(field.value);
}

function renderDetailLink(type: string, id: number, text: string): string {
  return `<a data-detail-link-type="${escapeHtml(type)}" data-detail-link-id="${escapeHtml(id)}">${escapeHtml(text)}</a>`;
}

export function renderDetailHtml(options: RenderDetailHtmlOptions): string {
  const { detail, cspSource, nonce } = options;
  const fieldGroups = detail.basicFieldGroups.map((group) => `
    <div class="fields">${group.fields.map((field) => `
      <div class="field-row"><strong>${escapeHtml(field.label)}</strong><span>${renderFieldValue(field)}</span></div>`).join('')}
    </div>`).join('');

  const contentSections = detail.contentSections.map((section) => `
    <section class="focus-block"><h2>${escapeHtml(section.title)}</h2><div class="rich-content">${section.html}</div></section>`).join('');

  const attachments = detail.attachments.length
    ? `<table class="attachment-table"><thead><tr><th>文件名</th><th>大小</th><th>添加时间</th><th>预览</th></tr></thead><tbody>${detail.attachments.map((attachment, index) => `
      <tr><td><a data-attachment-index="${index}">${escapeHtml(attachment.name)}</a></td><td>${escapeHtml(attachment.size || '暂无')}</td><td>${escapeHtml(attachment.addedDate || '未知')}</td><td><a data-preview-attachment-index="${index}">预览</a></td></tr>`).join('')}</tbody></table>`
    : '<p>暂无附件</p>';

  const activities = detail.activities.length
    ? `<ol class="activity-list">${detail.activities.map((activity) => `
      <li>
        <div class="rich-content">${activity.contentHtml || '暂无'}</div>
      </li>`).join('')}</ol>`
    : '<p>暂无历史记录</p>';

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${cspSource} https: http:; style-src 'unsafe-inline' ${cspSource}; script-src 'nonce-${nonce}';">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(detail.title)}</title>
  <style>
    body { font-family: var(--vscode-font-family); color: var(--vscode-foreground); padding: 16px; }
    h1 { font-size: 20px; margin: 0 0 12px; }
    h2 { font-size: 15px; margin: 18px 0 8px; }
    .fields { border: 1px solid var(--vscode-panel-border); border-radius: 6px; padding: 8px 10px; margin-bottom: 12px; }
    .field-row { display: grid; grid-template-columns: 96px 1fr; gap: 8px; line-height: 1.45; font-size: 13px; }
    .focus-block { border: 1px solid var(--vscode-panel-border); border-radius: 6px; padding: 10px; margin: 10px 0; }
    .attachment-table { border-collapse: collapse; width: 100%; margin: 8px 0 12px; }
    .attachment-table th, .attachment-table td { border: 1px solid var(--vscode-panel-border); padding: 6px 8px; text-align: left; }
    .attachment-table th { background: var(--vscode-editor-background); }
    .activity-list { padding-left: 22px; }
    li { margin: 8px 0; }
    a { color: var(--vscode-textLink-foreground); cursor: pointer; text-decoration: underline; }
    a:hover { text-decoration: none; }
    button { color: var(--vscode-button-foreground); background: var(--vscode-button-background); border: 0; border-radius: 3px; padding: 5px 10px; cursor: pointer; }
    button:hover { background: var(--vscode-button-hoverBackground); }
    .detail-actions { display: flex; justify-content: flex-end; margin-bottom: 12px; }
    .search-panel[hidden] { display: none; }
    .search-panel { position: sticky; top: 0; z-index: 5; display: flex; gap: 8px; align-items: center; margin-bottom: 12px; padding: 8px; border: 1px solid var(--vscode-panel-border); background: var(--vscode-editor-background); }
    .search-panel input { flex: 1; color: var(--vscode-input-foreground); background: var(--vscode-input-background); border: 1px solid var(--vscode-input-border); padding: 4px 6px; }
    .search-panel button { padding: 3px 6px; font-size: 12px; }
    mark.search-match { color: var(--vscode-editor-foreground); background: var(--vscode-editor-findMatchHighlightBackground); }
    mark.search-current { outline: 1px solid var(--vscode-editor-findMatchBorder); background: var(--vscode-editor-findMatchBackground); }
    pre { overflow: auto; padding: 8px; border: 1px solid var(--vscode-panel-border); }
    .rich-content table { border-collapse: collapse; }
    .rich-content th, .rich-content td { border: 1px solid var(--vscode-panel-border); padding: 4px 6px; }
    .rich-content img { max-width: 100%; cursor: zoom-in; }
    .image-modal[hidden] { display: none; }
    .image-modal { position: fixed; inset: 0; z-index: 10; display: flex; align-items: center; justify-content: center; background: rgba(0, 0, 0, 0.72); }
    .image-modal-content { position: relative; display: flex; flex-direction: column; gap: 10px; align-items: flex-end; }
    .image-modal-actions { display: flex; gap: 6px; align-items: center; background: var(--vscode-editor-background); border: 1px solid var(--vscode-panel-border); border-radius: 6px; padding: 4px 8px; }
    .image-modal-actions button { font-size: 12px; padding: 3px 8px; min-width: 24px; text-align: center; }
    .zoom-level { font-size: 12px; color: var(--vscode-descriptionForeground); min-width: 36px; text-align: center; }
    .image-modal-image-wrapper { overflow: hidden; max-width: 96vw; max-height: 88vh; position: relative; cursor: grab; }
    .image-modal-image-wrapper.dragging { cursor: grabbing; }
    .image-modal img { transform-origin: 0 0; transition: none; object-fit: contain; background: var(--vscode-editor-background); display: block; }
  </style>
</head>
<body>
  <div class="search-panel" data-search-panel hidden>
    <label for="zentao-detail-search">Ctrl+F</label>
    <input id="zentao-detail-search" data-search-input type="text" placeholder="搜索当前详情">
    <span data-search-count>0/0</span>
    <button type="button" data-search-prev title="上一个 (Shift+Enter)">&#x25B2;</button>
    <button type="button" data-search-next title="下一个 (Enter)">&#x25BC;</button>
    <button type="button" data-close-search>关闭</button>
  </div>
  <div class="detail-actions"><button type="button" data-export-markdown>导出 MD</button></div>
  <h1>#${escapeHtml(detail.id)} ${escapeHtml(detail.title)}</h1>
  <section>${fieldGroups}</section>
  ${contentSections}
  <section><h2>附件</h2>${attachments}</section>
  <section class="focus-block"><h2>历史记录</h2>${activities}</section>
  <details><summary>完整原始响应</summary><pre>${escapedJson(detail.raw)}</pre></details>
  <div class="image-modal" data-image-modal hidden>
    <div class="image-modal-content">
      <div class="image-modal-actions">
        <button type="button" data-zoom-out title="缩小">−</button>
        <span class="zoom-level" data-zoom-level>100%</span>
        <button type="button" data-zoom-in title="放大">＋</button>
        <button type="button" data-zoom-fit title="适合窗口">⊡</button>
        <button type="button" data-zoom-original title="原始大小">1:1</button>
        <button type="button" data-download-image>下载图片</button>
        <button type="button" data-close-image-modal>关闭</button>
      </div>
      <div class="image-modal-image-wrapper" data-image-wrapper>
        <img data-modal-image alt="">
      </div>
    </div>
  </div>
  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    const exportMarkdownButton = document.querySelector('[data-export-markdown]');
    const imageModal = document.querySelector('[data-image-modal]');
    const modalImage = document.querySelector('[data-modal-image]');
    const imageWrapper = document.querySelector('[data-image-wrapper]');
    const zoomLevelEl = document.querySelector('[data-zoom-level]');
    const downloadImageButton = document.querySelector('[data-download-image]');
    const zoomInButton = document.querySelector('[data-zoom-in]');
    const zoomOutButton = document.querySelector('[data-zoom-out]');
    const zoomFitButton = document.querySelector('[data-zoom-fit]');
    const zoomOriginalButton = document.querySelector('[data-zoom-original]');
    let activeImageSrc = '';
    let imageScale = 1;
    let imageNaturalWidth = 0;
    let imageNaturalHeight = 0;
    let isDragging = false;
    let dragStartX = 0;
    let dragStartY = 0;
    let scrollStartX = 0;
    let scrollStartY = 0;

    exportMarkdownButton?.addEventListener('click', () => {
      vscode.postMessage({ type: 'exportMarkdown' });
    });

    document.querySelectorAll('[data-attachment-index]').forEach((link) => {
      link.addEventListener('click', (event) => {
        event.preventDefault();
        vscode.postMessage({ type: 'downloadAttachment', index: Number(link.dataset.attachmentIndex) });
      });
    });

    document.querySelectorAll('[data-preview-attachment-index]').forEach((link) => {
      link.addEventListener('click', (event) => {
        event.preventDefault();
        vscode.postMessage({ type: 'previewAttachment', index: Number(link.dataset.previewAttachmentIndex) });
      });
    });

    document.querySelectorAll('[data-detail-link-type][data-detail-link-id]').forEach((link) => {
      link.addEventListener('click', (event) => {
        event.preventDefault();
        vscode.postMessage({ type: 'openDetail', itemType: link.dataset.detailLinkType, id: Number(link.dataset.detailLinkId) });
      });
    });

    function updateZoomDisplay() {
      if (zoomLevelEl) {
        zoomLevelEl.textContent = Math.round(imageScale * 100) + '%';
      }
    }

    function applyImageTransform() {
      if (modalImage instanceof HTMLImageElement) {
        modalImage.style.transform = 'scale(' + imageScale + ')';
        modalImage.style.width = imageNaturalWidth + 'px';
        modalImage.style.height = imageNaturalHeight + 'px';
      }
      updateZoomDisplay();
    }

    function zoomTo(scale) {
      imageScale = scale;
      applyImageTransform();
    }

    function fitImage() {
      const maxW = window.innerWidth * 0.96;
      const maxH = window.innerHeight * 0.88;
      if (imageNaturalWidth <= 0 || imageNaturalHeight <= 0) { return; }
      const fitScale = Math.min(maxW / imageNaturalWidth, maxH / imageNaturalHeight, 1);
      zoomTo(fitScale);
    }

    function originalSize() {
      zoomTo(1);
    }

    function zoomIn() {
      zoomTo(Math.min(imageScale * 1.25, 10));
    }

    function zoomOut() {
      zoomTo(Math.max(imageScale / 1.25, 0.1));
    }

    downloadImageButton?.addEventListener('click', () => {
      if (activeImageSrc) {
        vscode.postMessage({ type: 'downloadImage', src: activeImageSrc });
      }
    });

    zoomInButton?.addEventListener('click', zoomIn);
    zoomOutButton?.addEventListener('click', zoomOut);
    zoomFitButton?.addEventListener('click', fitImage);
    zoomOriginalButton?.addEventListener('click', originalSize);

    document.querySelectorAll('.rich-content img').forEach((image) => {
      image.addEventListener('click', () => {
        const src = image.getAttribute('src');
        if (!src || !imageModal || !modalImage) {
          return;
        }
        activeImageSrc = src;
        modalImage.setAttribute('src', src);
        modalImage.setAttribute('alt', image.getAttribute('alt') || '');
        modalImage.style.transform = '';
        modalImage.style.width = '';
        modalImage.style.height = '';
        imageScale = 1;
        imageNaturalWidth = 0;
        imageNaturalHeight = 0;
        if (imageWrapper) {
          imageWrapper.scrollLeft = 0;
          imageWrapper.scrollTop = 0;
        }
        imageModal.removeAttribute('hidden');
        if (modalImage instanceof HTMLImageElement && modalImage.complete && modalImage.naturalWidth) {
          imageNaturalWidth = modalImage.naturalWidth;
          imageNaturalHeight = modalImage.naturalHeight;
          fitImage();
        } else if (modalImage instanceof HTMLImageElement) {
          modalImage.addEventListener('load', function onLoad() {
            imageNaturalWidth = modalImage.naturalWidth;
            imageNaturalHeight = modalImage.naturalHeight;
            fitImage();
            modalImage.removeEventListener('load', onLoad);
          });
        }
      });
    });

    if (imageWrapper) {
      imageWrapper.addEventListener('wheel', (event) => {
        if (!imageModal || imageModal.hasAttribute('hidden')) { return; }
        event.preventDefault();
        if (event.deltaY < 0) { zoomIn(); } else { zoomOut(); }
      }, { passive: false });

      imageWrapper.addEventListener('mousedown', (event) => {
        if (event.button !== 0) { return; }
        isDragging = true;
        dragStartX = event.clientX;
        dragStartY = event.clientY;
        scrollStartX = imageWrapper.scrollLeft;
        scrollStartY = imageWrapper.scrollTop;
        imageWrapper.classList.add('dragging');
        event.preventDefault();
      });

      document.addEventListener('mousemove', (event) => {
        if (!isDragging) { return; }
        const dx = event.clientX - dragStartX;
        const dy = event.clientY - dragStartY;
        imageWrapper.scrollLeft = scrollStartX - dx;
        imageWrapper.scrollTop = scrollStartY - dy;
      });

      document.addEventListener('mouseup', () => {
        if (isDragging) {
          isDragging = false;
          imageWrapper?.classList.remove('dragging');
        }
      });
    }

    function closeImageModal() {
      if (!imageModal || !modalImage) {
        return;
      }
      imageModal.setAttribute('hidden', '');
      modalImage.removeAttribute('src');
      activeImageSrc = '';
      imageScale = 1;
      updateZoomDisplay();
    }

    imageModal?.addEventListener('click', (event) => {
      const target = event.target;
      if (target === imageModal || target instanceof Element && target.hasAttribute('data-close-image-modal')) {
        closeImageModal();
      }
    });

    const searchPanel = document.querySelector('[data-search-panel]');
    const searchInput = document.querySelector('[data-search-input]');
    const searchCount = document.querySelector('[data-search-count]');
    const closeSearchButton = document.querySelector('[data-close-search]');
    let searchMatches = [];
    let currentSearchIndex = -1;

    function clearSearchHighlights() {
      document.querySelectorAll('mark.search-match').forEach((mark) => {
        mark.replaceWith(document.createTextNode(mark.textContent || ''));
      });
      document.body.normalize();
      searchMatches = [];
      currentSearchIndex = -1;
      updateSearchCount();
    }

    function updateSearchCount() {
      if (searchCount) {
        searchCount.textContent = searchMatches.length ? String(currentSearchIndex + 1) + '/' + String(searchMatches.length) : '0/0';
      }
    }

    function collectTextNodes(root) {
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
        acceptNode(node) {
          const parent = node.parentElement;
          if (!parent || parent.closest('script, style, [data-search-panel], .image-modal')) {
            return NodeFilter.FILTER_REJECT;
          }
          return node.nodeValue && node.nodeValue.trim() ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
        }
      });
      const nodes = [];
      while (walker.nextNode()) {
        nodes.push(walker.currentNode);
      }
      return nodes;
    }

    function runSearch(query) {
      clearSearchHighlights();
      if (!query) {
        return;
      }
      const lowerQuery = query.toLocaleLowerCase();
      collectTextNodes(document.body).forEach((node) => {
        const text = node.nodeValue || '';
        const lowerText = text.toLocaleLowerCase();
        let start = 0;
        const fragment = document.createDocumentFragment();
        let matched = false;
        while (true) {
          const index = lowerText.indexOf(lowerQuery, start);
          if (index === -1) {
            break;
          }
          matched = true;
          fragment.append(document.createTextNode(text.slice(start, index)));
          const mark = document.createElement('mark');
          mark.className = 'search-match';
          mark.textContent = text.slice(index, index + query.length);
          fragment.append(mark);
          searchMatches.push(mark);
          start = index + query.length;
        }
        if (matched) {
          fragment.append(document.createTextNode(text.slice(start)));
          node.replaceWith(fragment);
        }
      });
      if (searchMatches.length) {
        currentSearchIndex = 0;
        focusSearchMatch(0);
      }
      updateSearchCount();
    }

    function focusSearchMatch(index) {
      searchMatches.forEach((match) => match.classList.remove('search-current'));
      const match = searchMatches[index];
      if (match) {
        match.classList.add('search-current');
        match.scrollIntoView({ block: 'center' });
      }
      updateSearchCount();
    }

    function moveSearch(delta) {
      if (!searchMatches.length) {
        return;
      }
      currentSearchIndex = (currentSearchIndex + delta + searchMatches.length) % searchMatches.length;
      focusSearchMatch(currentSearchIndex);
    }

    function openSearch() {
      searchPanel?.removeAttribute('hidden');
      searchInput?.focus();
      if (searchInput?.value) {
        runSearch(searchInput.value);
      }
    }

    function closeSearch() {
      searchPanel?.setAttribute('hidden', '');
      if (searchInput) {
        searchInput.value = '';
      }
      clearSearchHighlights();
    }

    searchInput?.addEventListener('input', () => runSearch(searchInput.value));
    searchInput?.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        moveSearch(event.shiftKey ? -1 : 1);
      }
    });
    closeSearchButton?.addEventListener('click', closeSearch);
    document.querySelector('[data-search-prev]')?.addEventListener('click', () => moveSearch(-1));
    document.querySelector('[data-search-next]')?.addEventListener('click', () => moveSearch(1));

    document.addEventListener('keydown', (event) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'f') {
        event.preventDefault();
        openSearch();
        return;
      }
      if (event.key === 'Escape') {
        closeImageModal();
        closeSearch();
      }
    });
  </script>
</body>
</html>`;
}
