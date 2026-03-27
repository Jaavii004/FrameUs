document.addEventListener('DOMContentLoaded', () => {
    // 1. Initialize Canvas
    const canvas = new fabric.Canvas('collage-canvas', {
        width: 800,
        height: 800,
        backgroundColor: null, // Start transparent
        preserveObjectStacking: true
    });

    // 2. UI References
    const maskInput = document.getElementById('mask-text');
    const fontSelector = document.getElementById('font-family');
    const charSpacingInput = document.getElementById('input-char-spacing');
    const opacitySlider = document.getElementById('input-opacity');
    const contextToolbar = document.getElementById('selection-controls');
    const dropZone = document.getElementById('drop-zone');
    const uploadedGrid = document.getElementById('uploaded-images-grid');
    const bgColorPicker = document.getElementById('bg-color-picker');

    let currentTexture = 'none';
    let historyStack = [];
    let redoStack = [];
    let isHistoryLocked = false;
    let bgTextObj = null;

    // 3. Mask & Overlay 
    async function updateOverlay(text = '18') {
        if (!text) text = ' ';
        // Removed await document.fonts.ready for speed/stability
        const font = fontSelector.value;
        const charSpacing = parseInt(charSpacingInput.value) || 0;
        
        // Update Ghost Text (Background Text)
        if (!bgTextObj) {
            bgTextObj = new fabric.IText(text, {
                left: 400, top: 400, originX: 'center', originY: 'center',
                fontSize: 500, fontFamily: font, fontWeight: 900,
                fill: 'rgba(255,255,255,0.05)', selectable: false, evented: false
            });
            canvas.insertAt(bgTextObj, 0); // Always at bottom
        }
        bgTextObj.set({ text: text.toUpperCase(), fontFamily: font, charSpacing: charSpacing * 10 });
        const scaleBg = Math.min(750 / bgTextObj.width, 1);
        bgTextObj.set({ scaleX: scaleBg, scaleY: scaleBg });

        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = 800;
        tempCanvas.height = 800;
        const ctx = tempCanvas.getContext('2d');

        // Draw solid background
        ctx.fillStyle = '#121217';
        ctx.fillRect(0, 0, 800, 800);

        // Prepare Text Mask
        const baseSize = text.length > 5 ? 200 : (text.length > 2 ? 300 : 500);
        ctx.font = `900 ${baseSize}px ${font}, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        
        // Auto-scale font if too wide
        let metrics = ctx.measureText(text.toUpperCase());
        let actualWidth = metrics.width + (charSpacing * (text.length - 1));
        let scale = 1;
        if (actualWidth > 720) scale = 720 / actualWidth;
        
        ctx.save();
        ctx.translate(400, 400); // True center
        ctx.scale(scale, scale);
        
        // PUNCH THE HOLE
        ctx.globalCompositeOperation = 'destination-out';
        
        // Draw characters individually for spacing
        let currentX = -actualWidth / 2;
        for (let i = 0; i < text.length; i++) {
            const char = text[i].toUpperCase();
            const charWidth = ctx.measureText(char).width;
            ctx.fillText(char, currentX + charWidth / 2, 0);
            currentX += charWidth + charSpacing;
        }

        ctx.restore();

        // Apply Texture to BACKGROUND (not the hole)
        if (currentTexture !== 'none') {
            const texImg = await loadTextureImage(currentTexture);
            if (texImg) {
                ctx.globalCompositeOperation = 'source-atop';
                const pattern = ctx.createPattern(texImg, 'repeat');
                ctx.fillStyle = pattern;
                ctx.globalAlpha = 0.45;
                ctx.fillRect(0, 0, 800, 800);
                ctx.globalAlpha = 1;
            }
        }

        fabric.Image.fromURL(tempCanvas.toDataURL(), (img) => {
            img.set({ selectable: false, evented: false });
            canvas.setOverlayImage(img, canvas.renderAll.bind(canvas));
        });
    }

    function loadTextureImage(type) {
        return new Promise(resolve => {
            const img = new Image();
            img.onload = () => resolve(img);
            img.onerror = () => resolve(null);
            img.src = `assets/textures/${type}.png`;
        });
    }

    // 4. Layers & State
    function updateLayersList() {
        const list = document.getElementById('layers-list');
        if (!list) return;
        list.innerHTML = '';
        const objects = canvas.getObjects().reverse();
        objects.forEach((obj, idx) => {
            const item = document.createElement('div');
            item.className = 'layer-item';
            item.innerHTML = `<span>Capa ${objects.length - idx}</span><button class="btn-delete">×</button>`;
            item.querySelector('.btn-delete').onclick = (e) => { e.stopPropagation(); canvas.remove(obj); updateLayersList(); saveState(); };
            item.onclick = () => { canvas.setActiveObject(obj); canvas.renderAll(); };
            list.appendChild(item);
        });
    }

    function saveState() {
        if (isHistoryLocked) return;
        historyStack.push(JSON.stringify(canvas.toJSON()));
        redoStack = [];
        if (historyStack.length > 50) historyStack.shift();
    }

    function undo() {
        if (historyStack.length <= 1) return;
        isHistoryLocked = true;
        redoStack.push(historyStack.pop());
        const state = historyStack[historyStack.length - 1];
        canvas.loadFromJSON(state, () => { canvas.renderAll(); isHistoryLocked = false; updateLayersList(); });
    }

    function redo() {
        if (redoStack.length === 0) return;
        isHistoryLocked = true;
        const state = redoStack.pop();
        historyStack.push(state);
        canvas.loadFromJSON(state, () => { canvas.renderAll(); isHistoryLocked = false; updateLayersList(); });
    }

    // 5. Interaction Logic
    function updateToolbar() {
        const active = canvas.getActiveObject();
        if (active && active.type === 'image') {
            contextToolbar.style.display = 'flex';
            opacitySlider.value = (active.opacity || 1) * 100;
        } else {
            contextToolbar.style.display = 'none';
        }
    }

    function addImageToCanvas(src) {
        fabric.Image.fromURL(src, (img) => {
            const scale = 400 / Math.max(img.width, img.height);
            img.set({
                left: 400, top: 400, originX: 'center', originY: 'center',
                scaleX: scale, scaleY: scale,
                cornerStyle: 'circle', cornerColor: '#8b5cf6', transparentCorners: false
            });
            canvas.add(img);
            canvas.setActiveObject(img);
            updateLayersList();
            saveState();
        }, { crossOrigin: 'anonymous' });
    }

    function addImageToGrid(src) {
        const item = document.createElement('div');
        item.className = 'grid-item';
        item.style.backgroundImage = `url(${src})`;
        item.style.backgroundSize = 'cover';
        item.style.backgroundPosition = 'center';
        item.addEventListener('click', () => addImageToCanvas(src));
        uploadedGrid.prepend(item);
        addImageToCanvas(src);
    }

    // 6. Navigation Tabs
    const navItems = document.querySelectorAll('.nav-item');
    const panels = document.querySelectorAll('.panel-content');
    navItems.forEach(btn => {
        btn.addEventListener('click', () => {
            navItems.forEach(n => n.classList.remove('active'));
            panels.forEach(p => p.classList.remove('active'));
            btn.classList.add('active');
            const target = btn.dataset.tab;
            document.getElementById(`tab-${target}`).classList.add('active');
        });
    });

    // 7. Event Listeners
    maskInput.addEventListener('input', () => { updateOverlay(maskInput.value); saveState(); });
    fontSelector.addEventListener('change', () => { updateOverlay(maskInput.value); saveState(); });
    charSpacingInput.addEventListener('input', () => { updateOverlay(maskInput.value); saveState(); });
    
    document.querySelectorAll('.texture-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.texture-btn').forEach(b => b.classList.remove('active-texture'));
            btn.classList.add('active-texture');
            currentTexture = btn.dataset.texture;
            updateOverlay(maskInput.value);
            saveState();
        });
    });

    bgColorPicker.addEventListener('input', (e) => {
        canvas.setBackgroundColor(e.target.value, canvas.renderAll.bind(canvas));
        saveState();
    });

    document.querySelectorAll('.grad-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            canvas.setBackgroundColor(btn.dataset.grad, canvas.renderAll.bind(canvas));
            saveState();
        });
    });

    // Add a "Transparent" button logic if needed - for now, clear background
    const btnTransparent = document.createElement('button');
    btnTransparent.className = 'btn btn-outline-light btn-sm';
    btnTransparent.innerText = 'Fondo Transparente';
    btnTransparent.style.marginTop = '10px';
    btnTransparent.onclick = () => {
        canvas.setBackgroundColor(null, canvas.renderAll.bind(canvas));
        saveState();
    };
    document.getElementById('tab-background').appendChild(btnTransparent);

    document.getElementById('btn-clear').addEventListener('click', () => {
        if (confirm('¿Borrar todo?')) {
            canvas.getObjects().forEach(o => canvas.remove(o));
            updateLayersList();
            saveState();
        }
    });

    // Toolbar Buttons
    document.getElementById('btn-undo').addEventListener('click', undo);
    document.getElementById('btn-redo').addEventListener('click', redo);
    document.getElementById('btn-smart-fill').addEventListener('click', () => {
        const active = canvas.getActiveObject();
        if (!active || active.type !== 'image') return;
        const scale = Math.max(700 / active.width, 600 / active.height) * 1.1;
        active.set({ scaleX: scale, scaleY: scale, left: 400, top: 320, originX: 'center', originY: 'center', angle: 0 });
        canvas.renderAll(); saveState();
    });

    document.getElementById('btn-flip-h').addEventListener('click', () => {
        const active = canvas.getActiveObject();
        if (active) { active.set('flipX', !active.flipX); canvas.renderAll(); saveState(); }
    });
    document.getElementById('btn-flip-v').addEventListener('click', () => {
        const active = canvas.getActiveObject();
        if (active) { active.set('flipY', !active.flipY); canvas.renderAll(); saveState(); }
    });
    document.getElementById('btn-bring-forward').addEventListener('click', () => {
        const active = canvas.getActiveObject();
        if (active) { canvas.bringForward(active); updateLayersList(); saveState(); }
    });
    document.getElementById('btn-send-backward').addEventListener('click', () => {
        const active = canvas.getActiveObject();
        if (active) { canvas.sendBackwards(active); updateLayersList(); saveState(); }
    });
    document.getElementById('btn-delete-selection').addEventListener('click', () => {
        const active = canvas.getActiveObject();
        if (active) { canvas.remove(active); updateLayersList(); saveState(); }
    });
    document.getElementById('btn-align-center').addEventListener('click', () => {
        const active = canvas.getActiveObject();
        if (active) { canvas.centerObject(active); canvas.renderAll(); saveState(); }
    });

    // Filters
    document.getElementById('btn-filter-bw').addEventListener('click', () => {
        const active = canvas.getActiveObject();
        if (active && active.type === 'image') {
            active.filters = [new fabric.Image.filters.Grayscale()];
            active.applyFilters(); canvas.renderAll(); saveState();
        }
    });
    document.getElementById('btn-filter-sepia').addEventListener('click', () => {
        const active = canvas.getActiveObject();
        if (active && active.type === 'image') {
            active.filters = [new fabric.Image.filters.Sepia()];
            active.applyFilters(); canvas.renderAll(); saveState();
        }
    });
    document.getElementById('btn-filter-reset').addEventListener('click', () => {
        const active = canvas.getActiveObject();
        if (active && active.type === 'image') {
            active.filters = [];
            active.applyFilters(); canvas.renderAll(); saveState();
        }
    });

    opacitySlider.addEventListener('input', (e) => {
        const active = canvas.getActiveObject();
        if (active) { active.set('opacity', e.target.value / 100); canvas.renderAll(); }
    });

    // 8. Upload Logic
    document.getElementById('image-upload').addEventListener('change', (e) => {
        const files = Array.from(e.target.files);
        files.forEach(file => {
            const reader = new FileReader();
            reader.onload = (f) => addImageToGrid(f.target.result);
            reader.readAsDataURL(file);
        });
    });

    if (dropZone) {
        dropZone.addEventListener('dragover', (e) => { e.preventDefault(); dropZone.classList.add('drag-over'); });
        dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));
        dropZone.addEventListener('drop', (e) => {
            e.preventDefault(); dropZone.classList.remove('drag-over');
            const files = Array.from(e.dataTransfer.files);
            files.forEach(file => {
                const reader = new FileReader();
                reader.onload = (f) => addImageToGrid(f.target.result);
                reader.readAsDataURL(file);
            });
        });
    }

    // 9. Download
    document.getElementById('btn-download').addEventListener('click', () => {
        // Ensure high-quality export with transparency
        const multiplier = 2; 
        
        canvas.discardActiveObject().renderAll();
        
        // Final export to PNG
        const dataURL = canvas.toDataURL({
            format: 'png',
            multiplier: multiplier,
            quality: 1,
            enableRetinaScaling: true
        });
        
        const link = document.createElement('a');
        link.download = `FrameUs-${maskInput.value || '18'}-${Date.now()}.png`;
        link.href = dataURL;
        link.click();
        
        updateToolbar();
    });

    // 10. Initialization
    canvas.on('selection:created', updateToolbar);
    canvas.on('selection:updated', updateToolbar);
    canvas.on('selection:cleared', updateToolbar);
    canvas.on('object:modified', saveState);

    window.addEventListener('keydown', (e) => {
        if (e.ctrlKey || e.metaKey) {
            if (e.key === 'z') { e.preventDefault(); undo(); }
            if (e.key === 'y') { e.preventDefault(); redo(); }
        }
    });

    updateOverlay('18');
    setTimeout(saveState, 500);
    console.log('FrameUs Fully Restored & Premium Ready');
});
