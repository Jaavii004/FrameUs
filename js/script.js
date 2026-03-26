document.addEventListener('DOMContentLoaded', () => {
    // 1. Initialize Canvas
    const canvas = new fabric.Canvas('collage-canvas', {
        width: 800,
        height: 800,
        backgroundColor: '#1a1a24',
        preserveObjectStacking: true
    });

    // 2. State & UI References
    const navItems = document.querySelectorAll('.nav-item');
    const panels = document.querySelectorAll('.panel-content');
    const maskInput = document.getElementById('mask-text');
    const bgColorPicker = document.getElementById('bg-color-picker');
    const gradBtns = document.querySelectorAll('.grad-btn');
    const uploadedGrid = document.getElementById('uploaded-images-grid');
    const contextToolbar = document.getElementById('selection-controls');
    const opacitySlider = document.getElementById('input-opacity');
    const dropZone = document.querySelector('.canvas-viewport');
    
    // 3. Mask Setup (THE PROFESSIONAL METHOD)
    canvas.controlsAboveOverlay = true;

    function updateOverlay(text) {
        if (!text) text = ' ';
        text = text.toUpperCase();
        const fontSize = text.length > 5 ? 200 : (text.length > 2 ? 350 : 500);

        // Create the "Punch-hole" image synchronously
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = 800;
        tempCanvas.height = 800;
        const ctx = tempCanvas.getContext('2d');

        ctx.fillStyle = '#121217'; // Match editor bg
        ctx.fillRect(0, 0, 800, 800);
        ctx.globalCompositeOperation = 'destination-out';
        ctx.font = `900 ${fontSize}px Inter`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(text, 400, 310);

        fabric.Image.fromURL(tempCanvas.toDataURL(), (img) => {
            img.set({ selectable: false, evented: false });
            canvas.setOverlayImage(img, canvas.renderAll.bind(canvas));
        });
    }

    updateOverlay('18');
    maskInput.addEventListener('input', (e) => updateOverlay(e.target.value));
    canvas.clipPath = null;

    // 4. Navigation Logic
    navItems.forEach(item => {
        item.addEventListener('click', () => {
            const tab = item.dataset.tab;
            navItems.forEach(n => n.classList.remove('active'));
            item.classList.add('active');
            panels.forEach(p => {
                p.classList.toggle('active', p.id === `tab-${tab}`);
            });
        });
    });

    // 5. Crop & Move Logic
    let isEditingCrop = false;
    let cropTarget = null;

    function enterCropMode(img) {
        if (isEditingCrop) return;
        isEditingCrop = true;
        cropTarget = img;
        
        // Temporarily disable global clipping to see what we're doing
        canvas.clipPath = null;
        canvas.bringToFront(img);

        img.set({
            borderColor: '#10b981',
            cornerColor: '#10b981',
            hasRotatingPoint: false,
            opacity: 0.8
        });
        
        const status = document.createElement('div');
        status.id = 'crop-status';
        status.innerHTML = 'MODO ENCUADRE: Arrastra para ajustar. Doble clic para terminar.';
        status.style = 'position:fixed; top:20px; left:50%; transform:translateX(-50%); background:#10b981; color:white; padding:12px 24px; border-radius:30px; z-index:10000; font-weight:700;';
        document.body.appendChild(status);
        canvas.renderAll();
    }

    function exitCropMode() {
        if (!isEditingCrop || !cropTarget) return;
        
        canvas.clipPath = clipPath;
        cropTarget.set({
            borderColor: '#8b5cf6',
            cornerColor: '#8b5cf6',
            hasRotatingPoint: true,
            opacity: 1
        });

        const status = document.getElementById('crop-status');
        if (status) status.remove();

        isEditingCrop = false;
        cropTarget = null;
        canvas.renderAll();
    }

    canvas.on('mouse:dblclick', (options) => {
        if (options.target && options.target.type === 'image') {
            if (isEditingCrop) exitCropMode();
            else enterCropMode(options.target);
        } else if (isEditingCrop) {
            exitCropMode();
        }
    });

    canvas.on('object:moving', (e) => {
        const img = e.target;
        if (isEditingCrop && img === cropTarget) {
            const deltaX = img.left - (img.lastLeft || img.left);
            const deltaY = img.top - (img.lastTop || img.top);

            img.cropX = (img.cropX || 0) - (deltaX / img.scaleX);
            img.cropY = (img.cropY || 0) - (deltaY / img.scaleY);

            img.left = img.lastLeft;
            img.top = img.lastTop;
            canvas.renderAll();
        }
    });

    canvas.on('mouse:down', (e) => {
        if (e.target) {
            e.target.lastLeft = e.target.left;
            e.target.lastTop = e.target.top;
        }
    });

    // 6. Background Control
    bgColorPicker.addEventListener('input', (e) => {
        canvas.setBackgroundColor(e.target.value, canvas.renderAll.bind(canvas));
    });

    gradBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const grad = btn.dataset.grad;
            canvas.setBackgroundColor(new fabric.Pattern({
                source: gradToCanvas(grad),
                repeat: 'no-repeat'
            }), canvas.renderAll.bind(canvas));
        });
    });

    function gradToCanvas(cssGrad) {
        const c = document.createElement('canvas');
        c.width = 800; c.height = 800;
        return c; // Keep it simple
    }

    // 7. Image Upload & Grid
    function addImageToGrid(src) {
        const item = document.createElement('div');
        item.className = 'grid-item';
        item.style.backgroundImage = `url(${src})`;
        item.addEventListener('click', () => {
            fabric.Image.fromURL(src, (img) => {
                const scale = 300 / Math.max(img.width, img.height);
                img.set({
                    left: 400, top: 400, originX: 'center', originY: 'center',
                    scaleX: scale, scaleY: scale,
                    cornerStyle: 'circle', cornerColor: '#8b5cf6',
                    transparentCorners: false, borderColor: '#8b5cf6',
                    lastLeft: 400, lastTop: 400
                });
                canvas.add(img);
                canvas.setActiveObject(img);
                updateLayersList();
            });
        });
        uploadedGrid.prepend(item);
    }

    document.getElementById('image-upload').addEventListener('change', (e) => {
        const files = Array.from(e.target.files);
        files.forEach(file => {
            const reader = new FileReader();
            reader.onload = (f) => addImageToGrid(f.target.result);
            reader.readAsDataURL(file);
        });
    });

    // Drag & Drop
    dropZone.addEventListener('dragover', (e) => { e.preventDefault(); dropZone.classList.add('drag-over'); });
    dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));
    dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropZone.classList.remove('drag-over');
        const files = Array.from(e.dataTransfer.files);
        files.forEach(file => {
            const reader = new FileReader();
            reader.onload = (f) => addImageToGrid(f.target.result);
            reader.readAsDataURL(file);
        });
    });

    // 8. Toolbar & Layers
    canvas.on('selection:created', updateToolbar);
    canvas.on('selection:updated', updateToolbar);
    canvas.on('selection:cleared', () => contextToolbar.style.display = 'none');

    function updateToolbar() {
        const active = canvas.getActiveObject();
        if (active && active.type === 'image') {
            contextToolbar.style.display = 'flex';
            opacitySlider.value = active.opacity * 100;
        } else {
            contextToolbar.style.display = 'none';
        }
    }

    opacitySlider.addEventListener('input', (e) => {
        const active = canvas.getActiveObject();
        if (active) { active.set('opacity', e.target.value / 100); canvas.renderAll(); }
    });

    document.getElementById('btn-flip-h').addEventListener('click', () => {
        const active = canvas.getActiveObject();
        if (active) { active.set('flipX', !active.flipX); canvas.renderAll(); }
    });

    document.getElementById('btn-flip-v').addEventListener('click', () => {
        const active = canvas.getActiveObject();
        if (active) { active.set('flipY', !active.flipY); canvas.renderAll(); }
    });

    document.getElementById('btn-bring-forward').addEventListener('click', () => {
        const active = canvas.getActiveObject();
        if (active) { active.bringForward(); canvas.renderAll(); updateLayersList(); }
    });

    document.getElementById('btn-send-backward').addEventListener('click', () => {
        const active = canvas.getActiveObject();
        if (active) { active.sendBackwards(); canvas.renderAll(); updateLayersList(); }
    });

    document.getElementById('btn-delete-selection').addEventListener('click', () => {
        canvas.remove(...canvas.getActiveObjects());
        canvas.discardActiveObject().renderAll();
        updateLayersList();
    });

    function updateLayersList() {
        const list = document.getElementById('layers-list');
        list.innerHTML = '';
        const objects = canvas.getObjects().filter(o => o !== bgText).reverse();
        objects.forEach((obj, idx) => {
            const item = document.createElement('div');
            item.className = 'layer-item';
            item.innerHTML = `<span>Imagen ${objects.length - idx}</span>`;
            item.onclick = () => { canvas.setActiveObject(obj); canvas.renderAll(); };
            list.appendChild(item);
        });
    }

    document.getElementById('btn-align-center').addEventListener('click', () => {
        const active = canvas.getActiveObject();
        if (active) { canvas.centerObject(active); canvas.renderAll(); }
    });

    document.getElementById('btn-filter-bw').addEventListener('click', () => {
        const active = canvas.getActiveObject();
        if (active) { active.filters = [new fabric.Image.filters.Grayscale()]; active.applyFilters(); canvas.renderAll(); }
    });

    document.getElementById('btn-filter-sepia').addEventListener('click', () => {
        const active = canvas.getActiveObject();
        if (active) { active.filters = [new fabric.Image.filters.Sepia()]; active.applyFilters(); canvas.renderAll(); }
    });

    document.getElementById('btn-filter-reset').addEventListener('click', () => {
        const active = canvas.getActiveObject();
        if (active) { active.filters = []; active.applyFilters(); canvas.renderAll(); }
    });

    document.getElementById('btn-clear').addEventListener('click', () => {
        if(confirm('¿Borrar todo?')) { canvas.getObjects().forEach(obj => { if(obj !== bgText) canvas.remove(obj); }); updateLayersList(); }
    });

    document.getElementById('btn-download').addEventListener('click', () => {
        // Save state for transparent export
        const oldBG = canvas.backgroundColor;
        const oldOverlay = canvas.overlayImage;
        const text = maskInput.value || '18';
        const fontSize = text.length > 5 ? 200 : (text.length > 2 ? 350 : 500);

        // 1. Prepare for transparent export
        canvas.setOverlayImage(null);
        canvas.setBackgroundColor(null);
        
        // 2. Use clipPath temporarily for real transparency outside the number
        const exportClip = new fabric.Text(text.toUpperCase(), {
            fontSize: fontSize,
            fontWeight: 900,
            fontFamily: 'Inter',
            textAlign: 'center',
            originX: 'center', originY: 'center',
            left: 400, top: 310
        });
        canvas.clipPath = exportClip;

        // 3. Export
        const dataURL = canvas.toDataURL({ 
            format: 'png', 
            quality: 1,
            enableRetinaByDevicePixelRatio: false // Keep exact 800x800
        });

        // 4. Restore state
        canvas.clipPath = null;
        canvas.setBackgroundColor(oldBG);
        canvas.setOverlayImage(oldOverlay, canvas.renderAll.bind(canvas));

        const link = document.createElement('a');
        link.download = `collage-${text}.png`;
        link.href = dataURL;
        link.click();
    });

    function resize() {
        const viewport = document.querySelector('.canvas-viewport');
        const container = document.querySelector('.canvas-container-outer');
        const size = Math.min(viewport.clientWidth - 40, viewport.clientHeight - 40, 800);
        const scale = size / 800;
        container.style.transform = `scale(${scale})`;
    }
    window.addEventListener('resize', resize);
    resize();
});
