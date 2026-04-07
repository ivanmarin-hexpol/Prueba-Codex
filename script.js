(() => {
  const STORAGE_KEY = 'notion_ai_local_app_v1';

  const state = {
    docs: [],
    activeDocId: null,
  };

  const elements = {
    docList: document.getElementById('doc-list'),
    newDocBtn: document.getElementById('new-doc-btn'),
    deleteDocBtn: document.getElementById('delete-doc-btn'),
    openDirectBtn: document.getElementById('open-direct-btn'),
    docTitle: document.getElementById('doc-title'),
    blocksContainer: document.getElementById('blocks-container'),
    addBlockBtn: document.getElementById('add-block-btn'),
    blockTemplate: document.getElementById('block-template'),
  };

  function uid(prefix = 'id') {
    return `${prefix}_${Math.random().toString(36).slice(2, 9)}_${Date.now().toString(36)}`;
  }

  function createEmptyDoc(name = 'Documento nuevo') {
    return {
      id: uid('doc'),
      title: name,
      blocks: [],
      updatedAt: Date.now(),
    };
  }

  function createBlock(type = 'texto') {
    return {
      id: uid('block'),
      type,
      content: '',
      checked: false,
    };
  }

  function saveState() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  function loadState() {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      const first = createEmptyDoc('Mi primer documento');
      first.blocks.push(createBlock('titulo'));
      first.blocks[0].content = 'Bienvenido';
      state.docs = [first];
      state.activeDocId = first.id;
      saveState();
      return;
    }

    try {
      const parsed = JSON.parse(raw);
      state.docs = Array.isArray(parsed.docs) ? parsed.docs : [];
      state.activeDocId = parsed.activeDocId || (state.docs[0] && state.docs[0].id) || null;
      if (!state.docs.length) {
        const fallback = createEmptyDoc('Documento nuevo');
        state.docs = [fallback];
        state.activeDocId = fallback.id;
      }
    } catch (_) {
      const fallback = createEmptyDoc('Documento nuevo');
      state.docs = [fallback];
      state.activeDocId = fallback.id;
      saveState();
    }
  }

  function getActiveDoc() {
    return state.docs.find((doc) => doc.id === state.activeDocId) || null;
  }

  function setActiveDoc(id) {
    state.activeDocId = id;
    saveState();
    render();
  }

  function addDocument() {
    const doc = createEmptyDoc(`Documento ${state.docs.length + 1}`);
    state.docs.unshift(doc);
    state.activeDocId = doc.id;
    saveState();
    render();
    elements.docTitle.focus();
    elements.docTitle.select();
  }

  function deleteActiveDocument() {
    if (state.docs.length === 1) {
      alert('Debe existir al menos un documento.');
      return;
    }
    state.docs = state.docs.filter((doc) => doc.id !== state.activeDocId);
    state.activeDocId = state.docs[0]?.id || null;
    saveState();
    render();
  }

  function renameActiveDocument(title) {
    const doc = getActiveDoc();
    if (!doc) return;
    doc.title = title.trim() || 'Sin título';
    doc.updatedAt = Date.now();
    saveState();
    renderDocList();
  }

  function updateBlock(doc, blockId, patch) {
    const idx = doc.blocks.findIndex((b) => b.id === blockId);
    if (idx === -1) return;
    doc.blocks[idx] = { ...doc.blocks[idx], ...patch };
    doc.updatedAt = Date.now();
    saveState();
  }

  function moveBlock(doc, blockId, direction) {
    const idx = doc.blocks.findIndex((b) => b.id === blockId);
    if (idx === -1) return;
    const next = direction === 'up' ? idx - 1 : idx + 1;
    if (next < 0 || next >= doc.blocks.length) return;
    [doc.blocks[idx], doc.blocks[next]] = [doc.blocks[next], doc.blocks[idx]];
    doc.updatedAt = Date.now();
    saveState();
    renderBlocks();
  }

  function removeBlock(doc, blockId) {
    doc.blocks = doc.blocks.filter((b) => b.id !== blockId);
    doc.updatedAt = Date.now();
    saveState();
    renderBlocks();
  }

  function aiTransform(action, text) {
    const cleaned = (text || '').trim();
    if (!cleaned) return '';

    if (action === 'resumir') {
      const sentences = cleaned.split(/(?<=[.!?])\s+/).filter(Boolean);
      if (sentences.length <= 1) return `Resumen: ${cleaned}`;
      return `Resumen: ${sentences.slice(0, 2).join(' ')}`;
    }

    if (action === 'expandir') {
      return `${cleaned}\n\nDetalle ampliado:\n- Contexto principal del bloque.\n- Ejemplo aplicado.\n- Próximo paso recomendado.`;
    }

    if (action === 'reescribir') {
      return cleaned
        .split(/\s+/)
        .map((word, i) => {
          if (i % 7 === 0) return word.toUpperCase();
          if (i % 5 === 0) return word.toLowerCase();
          return word;
        })
        .join(' ');
    }

    return cleaned;
  }

  function buildBlockInput(block, doc) {
    const contentRoot = document.createElement('div');

    if (block.type === 'titulo') {
      const input = document.createElement('input');
      input.className = 'block-title-input';
      input.placeholder = 'Escribe un título';
      input.value = block.content || '';
      input.addEventListener('input', (e) => updateBlock(doc, block.id, { content: e.target.value }));
      contentRoot.appendChild(input);
      return contentRoot;
    }

    if (block.type === 'checklist') {
      const wrap = document.createElement('label');
      wrap.className = 'block-check';

      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.checked = Boolean(block.checked);
      checkbox.addEventListener('change', (e) => {
        updateBlock(doc, block.id, { checked: e.target.checked });
      });

      const text = document.createElement('input');
      text.type = 'text';
      text.placeholder = 'Tarea';
      text.value = block.content || '';
      text.addEventListener('input', (e) => updateBlock(doc, block.id, { content: e.target.value }));

      wrap.append(checkbox, text);
      contentRoot.appendChild(wrap);
      return contentRoot;
    }

    const input = document.createElement('textarea');
    input.value = block.content || '';
    input.placeholder = block.type === 'codigo' ? 'Escribe código aquí...' : 'Escribe texto aquí...';
    input.className = block.type === 'codigo' ? 'block-code' : 'block-textarea';
    input.addEventListener('input', (e) => updateBlock(doc, block.id, { content: e.target.value }));
    contentRoot.appendChild(input);
    return contentRoot;
  }

  function renderDocList() {
    elements.docList.innerHTML = '';
    state.docs.forEach((doc) => {
      const li = document.createElement('li');
      li.className = `doc-item ${doc.id === state.activeDocId ? 'active' : ''}`;
      li.textContent = doc.title || 'Sin título';
      li.addEventListener('click', () => setActiveDoc(doc.id));
      elements.docList.appendChild(li);
    });
  }

  function renderBlocks() {
    const doc = getActiveDoc();
    elements.blocksContainer.innerHTML = '';

    if (!doc) return;

    if (!doc.blocks.length) {
      const empty = document.createElement('div');
      empty.className = 'empty-state';
      empty.textContent = 'Este documento no tiene bloques todavía.';
      elements.blocksContainer.appendChild(empty);
      return;
    }

    doc.blocks.forEach((block) => {
      const node = elements.blockTemplate.content.firstElementChild.cloneNode(true);
      const select = node.querySelector('.block-type-select');
      const deleteBtn = node.querySelector('.block-delete');
      const upBtn = node.querySelector('.move-up');
      const downBtn = node.querySelector('.move-down');
      const contentHolder = node.querySelector('.block-content');
      const aiButtons = node.querySelectorAll('.ai-action');

      select.value = block.type;
      select.addEventListener('change', (e) => {
        updateBlock(doc, block.id, { type: e.target.value });
        renderBlocks();
      });

      deleteBtn.addEventListener('click', () => removeBlock(doc, block.id));
      upBtn.addEventListener('click', () => moveBlock(doc, block.id, 'up'));
      downBtn.addEventListener('click', () => moveBlock(doc, block.id, 'down'));

      aiButtons.forEach((btn) => {
        btn.addEventListener('click', () => {
          const action = btn.dataset.action;
          const transformed = aiTransform(action, block.content);
          updateBlock(doc, block.id, { content: transformed });
          renderBlocks();
        });
      });

      contentHolder.appendChild(buildBlockInput(block, doc));
      elements.blocksContainer.appendChild(node);
    });
  }

  function addBlockToActiveDoc() {
    const doc = getActiveDoc();
    if (!doc) return;
    doc.blocks.push(createBlock('texto'));
    doc.updatedAt = Date.now();
    saveState();
    renderBlocks();
  }

  function render() {
    const doc = getActiveDoc();
    renderDocList();
    if (!doc) return;
    elements.docTitle.value = doc.title || '';
    renderBlocks();
  }

  function openAppDirectly() {
    const opened = window.open(window.location.href, '_blank', 'noopener,noreferrer');
    if (!opened) {
      alert('Tu navegador bloqueó la apertura automática. Usa clic derecho > Abrir en nueva pestaña.');
    }
  }

  function bindEvents() {
    elements.newDocBtn.addEventListener('click', addDocument);
    elements.deleteDocBtn.addEventListener('click', deleteActiveDocument);
    elements.addBlockBtn.addEventListener('click', addBlockToActiveDoc);

    elements.openDirectBtn.addEventListener('click', openAppDirectly);

    elements.docTitle.addEventListener('input', (e) => {
      renameActiveDocument(e.target.value);
    });
  }

  function init() {
    loadState();
    bindEvents();
    render();
  }

  init();
})();
