document.addEventListener('DOMContentLoaded', () => {
    // 1. Initialize Canvas
    const canvas = new fabric.Canvas('collage-canvas', {
        width: 800,
        height: 800,
        backgroundColor: null, // Start transparent
        preserveObjectStacking: true,
        controlsAboveOverlay: true
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

    // Crop State
    let isCropMode = false;
    let cropRect = null;

    // 3. Mask & Overlay 
    async function updateOverlay(text = '18') {
        if (!text) text = ' ';
        await document.fonts.ready;
        const font = fontSelector.value;
        const charSpacing = parseInt(charSpacingInput.value) || 0;

        // Update Ghost Text (Behind everything - optional hint)
        if (!bgTextObj) {
            bgTextObj = new fabric.IText(text, {
                left: 400, top: 350, originX: 'center', originY: 'center',
                fontSize: 500, fontFamily: font, fontWeight: 900,
                fill: 'rgba(255,255,255,0.05)', selectable: false, evented: false
            });
            canvas.insertAt(bgTextObj, 0); 
        }
        bgTextObj.set({ text: text.toUpperCase(), fontFamily: font, charSpacing: charSpacing * 10 });
        const scaleBg = Math.min(750 / bgTextObj.width, 1);
        bgTextObj.set({ scaleX: scaleBg, scaleY: scaleBg });

        // Logic for Transparent vs Solid Background
        const currentBg = canvas.backgroundColor;
        const isTransparent = !currentBg || currentBg === 'transparent' || currentBg === 'null';

        if (isTransparent) {
            // TRANSPARENCY MODE: Use ClipPath for entire canvas
            canvas.setOverlayImage(null, canvas.renderAll.bind(canvas));
            
            const clipText = new fabric.Text(text.toUpperCase(), {
                left: 400, top: 350, originX: 'center', originY: 'center',
                fontSize: 500, fontFamily: font, fontWeight: 900,
                charSpacing: charSpacing * 10,
                absolutePositioned: true
            });
            
            const metrics = canvas.getContext().measureText(text.toUpperCase());
            const scale = Math.min(720 / (clipText.width), 1);
            clipText.set({ scaleX: scale, scaleY: scale });
            
            canvas.clipPath = clipText;
            canvas.renderAll();
        } else {
            // SOLID/GRADIENT MODE: Use Overlay Image with a Punched Hole
            canvas.clipPath = null;
            const tempCanvas = document.createElement('canvas');
            tempCanvas.width = 800;
            tempCanvas.height = 800;
            const ctx = tempCanvas.getContext('2d');

            // Draw current background
            if (typeof currentBg === 'string' && !currentBg.includes('gradient')) {
                ctx.fillStyle = currentBg;
            } else {
                ctx.fillStyle = '#121217'; // Fallback for gradients (handled by canvas itself)
            }
            ctx.fillRect(0, 0, 800, 800);

            // Prepare Text Mask
            const baseSize = 500;
            ctx.font = `900 ${baseSize}px ${font}, sans-serif`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';

            let metrics = ctx.measureText(text.toUpperCase());
            let actualWidth = metrics.width + (charSpacing * (text.length - 1));
            let scale = Math.min(720 / actualWidth, 1);

            ctx.save();
            ctx.translate(400, 350);
            ctx.scale(scale, scale);
            ctx.globalCompositeOperation = 'destination-out';

            let currentX = -actualWidth / 2;
            for (let i = 0; i < text.length; i++) {
                const char = text[i].toUpperCase();
                const charWidth = ctx.measureText(char).width;
                ctx.fillText(char, currentX + charWidth / 2, 0);
                currentX += charWidth + charSpacing;
            }
            ctx.restore();

            // Apply Texture to BACKGROUND
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
                if (isCropMode) img.set('opacity', 0.15); // Respect crop mode if updated during crop
                canvas.setOverlayImage(img, canvas.renderAll.bind(canvas));
            });
        }
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
        if (active && active.type === 'image' && !isCropMode) {
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
        canvas.setBackgroundColor(e.target.value, () => {
            updateOverlay(maskInput.value);
            canvas.renderAll();
            saveState();
        });
    });

    document.querySelectorAll('.grad-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            canvas.setBackgroundColor(btn.dataset.grad, () => {
                updateOverlay(maskInput.value);
                canvas.renderAll();
                saveState();
            });
        });
    });

    const btnSetTransparent = document.getElementById('btn-set-transparent');
    if (btnSetTransparent) {
        btnSetTransparent.onclick = () => {
            canvas.setBackgroundColor(null, () => {
                updateOverlay(maskInput.value);
                canvas.renderAll();
                saveState();
            });
        };
    }

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
        active.set({ scaleX: scale, scaleY: scale, left: 400, top: 350, originX: 'center', originY: 'center', angle: 0 });
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

    // 7.5 Crop Tool Logic
    let targetCropImage = null;

    function startCrop() {
        const active = canvas.getActiveObject();
        if (!active || active.type !== 'image' || isCropMode) return;
        
        targetCropImage = active;
        isCropMode = true;

        // Visual setup: Fade the mask to see the whole image
        const bg = canvas.overlayImage;
        if (bg) bg.set('opacity', 0.15);

        cropRect = new fabric.Rect({
            left: active.left,
            top: active.top,
            width: active.getScaledWidth() * 0.8,
            height: active.getScaledHeight() * 0.8,
            originX: 'center',
            originY: 'center',
            fill: 'rgba(255, 255, 255, 0.3)',
            stroke: '#8b5cf6',
            strokeWidth: 2,
            strokeDashArray: [5, 5],
            cornerColor: '#8b5cf6',
            cornerStyle: 'circle',
            transparentCorners: false,
            hasRotationPoint: false
        });

        canvas.discardActiveObject();
        canvas.add(cropRect);
        canvas.setActiveObject(cropRect);
        
        document.getElementById('crop-actions').style.display = 'flex';
        document.getElementById('btn-crop').style.display = 'none';
        document.getElementById('selection-controls').style.display = 'none';
        canvas.renderAll();
    }

    function finalizeCrop() {
        if (!targetCropImage || !cropRect) return;

        // Calculation
        const rect = cropRect.getBoundingRect();
        const img = targetCropImage;
        
        // Relative position
        const relX = (cropRect.left - img.left) / img.scaleX + img.width / 2 - cropRect.getScaledWidth() / (2 * img.scaleX);
        const relY = (cropRect.top - img.top) / img.scaleY + img.height / 2 - cropRect.getScaledHeight() / (2 * img.scaleY);
        
        const newWidth = cropRect.getScaledWidth() / img.scaleX;
        const newHeight = cropRect.getScaledHeight() / img.scaleY;

        img.set({
            cropX: (img.cropX || 0) + relX,
            cropY: (img.cropY || 0) + relY,
            width: newWidth,
            height: newHeight
        });

        img.setCoords();
        exitCropMode();
        saveState();
    }

    function exitCropMode() {
        if (cropRect) canvas.remove(cropRect);
        if (canvas.overlayImage) canvas.overlayImage.set('opacity', 1);
        
        isCropMode = false;
        cropRect = null;
        targetCropImage = null;

        document.getElementById('crop-actions').style.display = 'none';
        document.getElementById('btn-crop').style.display = 'flex';
        updateToolbar();
        canvas.renderAll();
    }

    document.getElementById('btn-crop').addEventListener('click', startCrop);
    document.getElementById('btn-crop-confirm').addEventListener('click', finalizeCrop);
    document.getElementById('btn-crop-cancel').addEventListener('click', exitCropMode);

    canvas.on('mouse:dblclick', (options) => {
        if (options.target) {
            if (options.target.type === 'image' && !isCropMode) {
                canvas.setActiveObject(options.target);
                startCrop();
            } else if (options.target === cropRect && isCropMode) {
                finalizeCrop();
            }
        }
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
        if (e.key === 'Escape' && isCropMode) {
            exitCropMode();
        }
    });

    updateOverlay('18');
    setTimeout(saveState, 500);
});
