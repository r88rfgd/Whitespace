document.addEventListener('DOMContentLoaded', () => {
    const canvas = document.getElementById('canvas');
    const createBlockBtn = document.getElementById('create-block-btn');
    const createLineBtn = document.getElementById('create-line-btn');
    const deleteBtn = document.getElementById('delete-btn');
    const colorPicker = document.getElementById('color-picker');
    const backBtn = document.getElementById('back-btn');
    const homeBtn = document.getElementById('home-btn');
    const currentSpaceLabel = document.getElementById('current-space');

    let blocks = [];
    let lines = [];
    let mode = 'select';
    let selectedElement = null;
    let lineStart = null;
    let isDragging = false;
    let dragOffset = { x: 0, y: 0 };
    let currentColor = '#ffffff';
    let lastClickTime = 0;
    let tempLine = null;
    const doubleClickTime = 300; // ms

    // Navigation state
    let spaceHistory = [];
    let currentSpace = { id: 'main', name: 'Main Space', parentId: null };
    let spaces = [currentSpace];

    // Initialize canvas panning and zooming
    let isPanning = false;
    let startPanPosition = { x: 0, y: 0 };
    let canvasOffset = { x: 0, y: 0 };
    let scale = 1.0; // Add scale factor for zooming
    let minScale = 0.05; // Minimum zoom level (decrease this to allow more zoom out)
    let maxScale = 10.0; // Maximum zoom level (increase this to allow more zoom in)

    // Define boundaries for the canvas (effectively making it much larger)
    let canvasBounds = {
        minX: -10000,
        maxX: 10000,
        minY: -10000,
        maxY: 10000
    };

    // Load saved data
    loadFromLocalStorage();
    
    // Initialize image resize handlers after loading data
    initializeImageHandlers();

    // Setup event listeners for tool buttons
    createBlockBtn.addEventListener('click', () => setMode('block'));
    createLineBtn.addEventListener('click', () => setMode('line'));
    deleteBtn.addEventListener('click', () => setMode('delete'));
    colorPicker.addEventListener('input', (e) => currentColor = e.target.value);
    
    // Setup navigation buttons
    backBtn.addEventListener('click', navigateBack);
    homeBtn.addEventListener('click', navigateHome);
    
    // Add paste event listener for images
    document.addEventListener('paste', handlePaste);

    // Add mouse wheel event for zooming
    canvas.addEventListener('wheel', handleZoom);
    
    // Function to handle zooming with the mouse wheel
    function handleZoom(e) {
        // Prevent default scrolling behavior
        e.preventDefault();
        
        // Get mouse position relative to canvas
        const rect = canvas.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;
        
        // Calculate zoom factor with improved smoothness
        const zoomIntensity = 0.1;
        const zoomFactor = e.deltaY < 0 ? (1 + zoomIntensity) : (1 - zoomIntensity);
        
        // Calculate new scale with expanded range
        const newScale = Math.max(minScale, Math.min(maxScale, scale * zoomFactor));
        
        // Only proceed if scale changed
        if (newScale !== scale) {
            // Calculate the point where we're zooming 
            const canvasX = mouseX - canvasOffset.x;
            const canvasY = mouseY - canvasOffset.y;
            
            // Adjust offset to zoom centered on mouse position
            canvasOffset.x = mouseX - canvasX * (newScale / scale);
            canvasOffset.y = mouseY - canvasY * (newScale / scale);
            
            // Set new scale
            scale = newScale;
            
            // Update grid size based on scale
            updateGridSize();
            
            // Update block positions and sizes
            updateAllElements();
            
            // Save current view state
            saveToLocalStorage();
        }
    }
    
    // Function to update grid size based on scale
    function updateGridSize() {
        // Base grid size is 20px
        const baseGridSize = 20;
        const scaledGridSize = baseGridSize * scale;
        
        // Update the grid size in CSS
        canvas.style.backgroundSize = `${scaledGridSize}px ${scaledGridSize}px`;
    }
    
    // Function to update all elements (blocks and lines) based on panning and zoom
    function updateAllElements() {
        // Update blocks
        Array.from(canvas.children).forEach(child => {
            if (child.classList.contains('block')) {
                const blockId = child.id;
                const blockData = blocks.find(b => b.id === blockId);
                if (blockData) {
                    // Apply transform considering both offset and scale
                    child.style.left = `${blockData.x * scale + canvasOffset.x}px`;
                    child.style.top = `${blockData.y * scale + canvasOffset.y}px`;
                    child.style.transform = `scale(${scale})`;
                    child.style.transformOrigin = 'top left';
                }
            }
        });
        
        // Update all lines
        updateAllLines();
    }
    
    // Handle image pasting
    function handlePaste(e) {
        if (e.clipboardData && e.clipboardData.items) {
            // Check if there are any image items in the clipboard
            const items = e.clipboardData.items;
            let imageItem = null;
            
            for (let i = 0; i < items.length; i++) {
                if (items[i].type.indexOf('image') !== -1) {
                    imageItem = items[i];
                    break;
                }
            }
            
            if (imageItem) {
                e.preventDefault();
                
                // Get the image as a blob
                const blob = imageItem.getAsFile();
                
                // Convert the blob to a data URL
                const reader = new FileReader();
                reader.onload = function(event) {
                    const imageUrl = event.target.result;
                    
                    // If an editable block content is focused, insert the image there
                    if (document.activeElement && 
                        document.activeElement.classList.contains('block-content') && 
                        document.activeElement.isContentEditable) {
                        insertImageIntoBlock(document.activeElement, imageUrl);
                    } else {
                        // Otherwise create a new image block at the cursor position
                        createImageBlock(e.clientX, e.clientY, imageUrl);
                    }
                };
                reader.readAsDataURL(blob);
            }
        }
    }
    
    // Insert image into a block's content
    function insertImageIntoBlock(blockContent, imageUrl) {
        const imgElement = document.createElement('img');
        imgElement.src = imageUrl;
        imgElement.className = 'pasted-image';
        imgElement.style.maxWidth = '100%';
        
        // Insert at cursor position if possible
        const selection = window.getSelection();
        if (selection.rangeCount > 0) {
            const range = selection.getRangeAt(0);
            range.deleteContents();
            range.insertNode(imgElement);
            
            // Add resize functionality to the image
            setupImageResizeHandles(imgElement);
            
            // Move cursor after the image
            range.setStartAfter(imgElement);
            range.setEndAfter(imgElement);
            selection.removeAllRanges();
            selection.addRange(range);
        } else {
            // Append to the end if no selection
            blockContent.appendChild(imgElement);
            
            // Add resize functionality to the image
            setupImageResizeHandles(imgElement);
        }
        
        // Save the content
        const blockElement = blockContent.closest('.block');
        if (blockElement) {
            const blockId = blockElement.id;
            const block = blocks.find(b => b.id === blockId);
            if (block) {
                block.content = blockContent.innerHTML;
                saveToLocalStorage();
            }
        }
    }
    
    // Create a new block with an image
    function createImageBlock(clientX, clientY, imageUrl) {
        const rect = canvas.getBoundingClientRect();
        const x = clientX - rect.left + canvas.scrollLeft;
        const y = clientY - rect.top + canvas.scrollTop;
        
        const id = 'block-' + Date.now();
        const block = {
            id,
            // Store position in model coordinates (unscaled)
            x: (x - canvasOffset.x) / scale,
            y: (y - canvasOffset.y) / scale,
            content: `<img src="${imageUrl}" class="pasted-image" style="max-width: 100%;">`,
            title: 'Image',
            color: currentColor,
            completed: false,
            spaceId: currentSpace.id
        };
        
        blocks.push(block);
        
        const blockElement = document.createElement('div');
        blockElement.id = id;
        blockElement.className = 'block';
        blockElement.style.left = `${x}px`;
        blockElement.style.top = `${y}px`;
        blockElement.style.borderColor = currentColor;
        blockElement.style.transform = `scale(${scale})`;
        blockElement.style.transformOrigin = 'top left';
        
        blockElement.innerHTML = `
            <div class="connection-point top"></div>
            <div class="connection-point bottom"></div>
            <div class="block-header">
                <div class="checkbox-container">
                    <input type="checkbox" class="checkbox">
                </div>
                <div class="block-title" contenteditable="true">${block.title}</div>
            </div>
            <div class="block-content" contenteditable="true">${block.content}</div>
        `;
        
        canvas.appendChild(blockElement);
        
        // Setup block event listeners
        setupBlockEvents(blockElement);
        
        // Add resize functionality to the image
        const img = blockElement.querySelector('img');
        if (img) {
            setupImageResizeHandles(img);
        }
        
        // Immediately select the new block
        selectElement(blockElement);
        setMode('select');
        
        // Save state after creating a block
        saveToLocalStorage();
    }
    
    // Navigation functions
    function navigateBack() {
        if (spaceHistory.length > 0) {
            const prevSpace = spaceHistory.pop();
            navigateToSpace(prevSpace, true); // Pass true to indicate this is a back navigation
        }
    }
    
    function navigateHome() {
        if (currentSpace.id !== 'main') {
            navigateToSpace({ id: 'main', name: 'Main Space', parentId: null }, false, true);
            spaceHistory = []; // Clear history when going home
            saveToLocalStorage();
        }
    }
    
    function navigateToSpace(space, isBackNavigation = false, isHomeNavigation = false) {
        if (space.id !== currentSpace.id) {
            // Store current space in history only if not going back or home
            if (!isBackNavigation && !isHomeNavigation) {
                spaceHistory.push({...currentSpace});
            }
            
            // Clear canvas
            while (canvas.firstChild) {
                canvas.removeChild(canvas.firstChild);
            }
            
            // Update current space
            currentSpace = space;
            currentSpaceLabel.textContent = space.name;
            
            // Add space to spaces array if it doesn't exist
            if (!spaces.some(s => s.id === space.id)) {
                spaces.push(space);
            }
            
            // Reset zoom and pan when changing spaces
            scale = 1.0;
            canvasOffset = { x: 0, y: 0 };
            updateGridSize();
            
            // Load blocks for this space
            loadSpaceContent(space.id);
            
            // Save state after navigation
            saveToLocalStorage();
        }
    }
    
    function loadSpaceContent(spaceId) {
        // Get all blocks for this space
        const spaceBlocks = blocks.filter(b => b.spaceId === spaceId);
        
        // Render blocks
        spaceBlocks.forEach(block => {
            renderBlock(block);
        });
        
        // Draw lines for this space
        drawSpaceLines(spaceId);
    }
    
    function drawSpaceLines(spaceId) {
        // Find lines where both connected blocks are in this space
        lines.forEach(line => {
            const startBlock = blocks.find(b => b.id === line.startId);
            const endBlock = blocks.find(b => b.id === line.endId);
            
            if (startBlock && endBlock && 
                startBlock.spaceId === spaceId && 
                endBlock.spaceId === spaceId) {
                drawLine(line);
            }
        });
    }
    
    function renderBlock(block) {
        const blockElement = document.createElement('div');
        blockElement.id = block.id;
        blockElement.className = 'block';
        blockElement.style.left = `${block.x * scale + canvasOffset.x}px`;
        blockElement.style.top = `${block.y * scale + canvasOffset.y}px`;
        blockElement.style.borderColor = block.color;
        blockElement.style.transform = `scale(${scale})`;
        blockElement.style.transformOrigin = 'top left';
        
        if (block.completed) {
            blockElement.classList.add('completed');
        }
        
        blockElement.innerHTML = `
            <div class="connection-point top"></div>
            <div class="connection-point bottom"></div>
            <div class="block-header">
                <div class="checkbox-container">
                    <input type="checkbox" class="checkbox" ${block.completed ? 'checked' : ''}>
                </div>
                <div class="block-title" contenteditable="true">${block.title}</div>
            </div>
            <div class="block-content" contenteditable="true">${block.content}</div>
        `;
        
        canvas.appendChild(blockElement);
        
        // Setup block event listeners
        setupBlockEvents(blockElement);
    }
    
    function setMode(newMode) {
        mode = newMode;
        [createBlockBtn, createLineBtn, deleteBtn].forEach(btn => btn.classList.remove('active'));
        
        if (mode === 'block') createBlockBtn.classList.add('active');
        else if (mode === 'line') createLineBtn.classList.add('active');
        else if (mode === 'delete') deleteBtn.classList.add('active');
        
        // Reset any selection when changing modes
        if (selectedElement) {
            selectedElement.classList.remove('selected');
            selectedElement = null;
        }
        
        // Remove temp line when changing modes
        if (tempLine) {
            tempLine.remove();
            tempLine = null;
        }
        
        lineStart = null;
    }

    // Canvas Click Event
    canvas.addEventListener('mousedown', (e) => {
        if (e.target === canvas) {
            if (mode === 'block') {
                createBlock(e.clientX - canvas.getBoundingClientRect().left + canvas.scrollLeft, 
                            e.clientY - canvas.getBoundingClientRect().top + canvas.scrollTop);
            } else if (mode === 'select') {
                // Start panning
                isPanning = true;
                startPanPosition = { 
                    x: e.clientX - canvasOffset.x, 
                    y: e.clientY - canvasOffset.y 
                };
            }
        }
    });

    document.addEventListener('mousemove', (e) => {
        if (isDragging && selectedElement) {
            const rect = canvas.getBoundingClientRect();
            const x = e.clientX - rect.left - dragOffset.x + canvas.scrollLeft;
            const y = e.clientY - rect.top - dragOffset.y + canvas.scrollTop;
            
            selectedElement.style.left = `${x}px`;
            selectedElement.style.top = `${y}px`;
            
            // Update connected lines
            updateConnectedLines(selectedElement.id);
        } else if (isPanning) {
            // Calculate new offset with boundaries
            const newOffsetX = e.clientX - startPanPosition.x;
            const newOffsetY = e.clientY - startPanPosition.y;
            
            // Apply the offset but respect boundaries
            canvasOffset = {
                x: Math.max(canvasBounds.minX, Math.min(canvasBounds.maxX, newOffsetX)),
                y: Math.max(canvasBounds.minY, Math.min(canvasBounds.maxY, newOffsetY))
            };
            
            // Update all elements with new offset
            updateAllElements();
        } else if (mode === 'line' && lineStart !== null) {
            // Update the temporary line following the cursor
            updateTempLine(e.clientX, e.clientY);
        }
    });

    document.addEventListener('mouseup', () => {
        isDragging = false;
        isPanning = false;
        
        // Update block positions in data model if dragged
        if (selectedElement && selectedElement.classList.contains('block')) {
            const blockId = selectedElement.id;
            const block = blocks.find(b => b.id === blockId);
            if (block) {
                // Save position compensating for scale and offset
                block.x = (parseInt(selectedElement.style.left) - canvasOffset.x) / scale;
                block.y = (parseInt(selectedElement.style.top) - canvasOffset.y) / scale;
                saveToLocalStorage();
            }
        }
        
        // If we're in line mode but clicked outside of a block, reset line creation
        if (mode === 'line' && e && e.target === canvas) {
            if (tempLine) {
                tempLine.remove();
                tempLine = null;
            }
            lineStart = null;
        }
    });

    function createBlock(x, y) {
        const id = 'block-' + Date.now();
        const block = {
            id,
            // Store position in model coordinates (unscaled)
            x: (x - canvasOffset.x) / scale,
            y: (y - canvasOffset.y) / scale,
            content: '',
            title: 'New Block',
            color: currentColor,
            completed: false,
            spaceId: currentSpace.id
        };
        
        blocks.push(block);
        
        const blockElement = document.createElement('div');
        blockElement.id = id;
        blockElement.className = 'block';
        // Position in screen coordinates (with scale)
        blockElement.style.left = `${x}px`;
        blockElement.style.top = `${y}px`;
        blockElement.style.borderColor = currentColor;
        blockElement.style.transform = `scale(${scale})`;
        blockElement.style.transformOrigin = 'top left';
        
        blockElement.innerHTML = `
            <div class="connection-point top"></div>
            <div class="connection-point bottom"></div>
            <div class="block-header">
                <div class="checkbox-container">
                    <input type="checkbox" class="checkbox" ${block.completed ? 'checked' : ''}>
                </div>
                <div class="block-title" contenteditable="true">${block.title}</div>
            </div>
            <div class="block-content" contenteditable="true">${block.content}</div>
        `;
        
        canvas.appendChild(blockElement);
        
        // Setup block event listeners
        setupBlockEvents(blockElement);
        
        // Immediately select the new block
        selectElement(blockElement);
        setMode('select');
        
        // Save state after creating a block
        saveToLocalStorage();
    }

    function setupBlockEvents(blockElement) {
        const header = blockElement.querySelector('.block-header');
        const blockContent = blockElement.querySelector('.block-content');
        const checkbox = blockElement.querySelector('.checkbox');
        
        // Handle checkbox changes
        checkbox.addEventListener('change', () => {
            const blockId = blockElement.id;
            const block = blocks.find(b => b.id === blockId);
            if (block) {
                block.completed = checkbox.checked;
                if (checkbox.checked) {
                    blockElement.classList.add('completed');
                } else {
                    blockElement.classList.remove('completed');
                }
                saveToLocalStorage();
            }
        });
        
        // Add double-click to toggle whitespace
        blockElement.addEventListener('click', (e) => {
            const now = Date.now();
            
            // Detect double click
            if (now - lastClickTime < doubleClickTime) {
                toggleNestedCanvas(blockElement);
            }
            
            lastClickTime = now;
        });
        
        // Make block draggable via header
        header.addEventListener('mousedown', (e) => {
            // Don't initiate drag if clicking on checkbox or when editing
            if (e.target.classList.contains('checkbox') || 
                e.target.classList.contains('block-title') || 
                e.target.classList.contains('block-content')) {
                return;
            }
            
            if (mode === 'select' || mode === 'delete') {
                if (mode === 'delete') {
                    deleteBlock(blockElement.id);
                    return;
                }
                
                selectElement(blockElement);
                isDragging = true;
                const rect = blockElement.getBoundingClientRect();
                dragOffset = {
                    x: e.clientX - rect.left,
                    y: e.clientY - rect.top
                };
                e.preventDefault();
            } else if (mode === 'line' && lineStart === null) {
                lineStart = blockElement;
            } else if (mode === 'line' && lineStart !== null && lineStart !== blockElement) {
                createLine(lineStart.id, blockElement.id);
                lineStart = null;
                setMode('select');
            }
        });
        
        // Save content changes
        blockContent.addEventListener('blur', () => {
            const blockId = blockElement.id;
            const block = blocks.find(b => b.id === blockId);
            if (block) {
                block.content = blockContent.innerHTML;
                saveToLocalStorage();
            }
        });
        
        // Save title changes
        const titleElement = blockElement.querySelector('.block-title');
        titleElement.addEventListener('blur', () => {
            const blockId = blockElement.id;
            const block = blocks.find(b => b.id === blockId);
            if (block) {
                block.title = titleElement.textContent;
                saveToLocalStorage();
            }
        });
        
        // Setup resize handles for any images in the block
        const images = blockContent.querySelectorAll('img');
        images.forEach(img => {
            setupImageResizeHandles(img);
        });
    }
    
    function toggleNestedCanvas(blockElement) {
        const blockId = blockElement.id;
        const block = blocks.find(b => b.id === blockId);
        
        // Check if a space already exists for this block
        const existingSpace = spaces.find(s => s.blockId === blockId);
        
        if (existingSpace) {
            // Navigate to existing space
            navigateToSpace(existingSpace);
        } else {
            // Create a new whitespace
            const newSpaceId = 'space-' + Date.now();
            const newSpace = {
                id: newSpaceId,
                name: block.title + ' Space',
                parentId: currentSpace.id,
                blockId: blockId
            };
            
            // Add to spaces array
            spaces.push(newSpace);
            
            // Navigate to the new space
            navigateToSpace(newSpace);
        }
    }

    function createLine(startId, endId) {
        const id = `line-${startId}-${endId}`;
        
        // Check if line already exists
        if (lines.some(l => 
            (l.startId === startId && l.endId === endId) || 
            (l.startId === endId && l.endId === startId))) {
            return;
        }
        
        const line = {
            id,
            startId,
            endId,
            color: currentColor
        };
        
        lines.push(line);
        drawLine(line);
        
        // Save state after creating a line
        saveToLocalStorage();
    }

    function drawLine(line) {
        const startBlock = document.getElementById(line.startId);
        const endBlock = document.getElementById(line.endId);
        
        if (!startBlock || !endBlock) return;
        
        const startRect = startBlock.getBoundingClientRect();
        const endRect = endBlock.getBoundingClientRect();
        const canvasRect = canvas.getBoundingClientRect();
        
        // Calculate the starting point at the bottom of the start block
        const startX = startRect.left + startRect.width / 2 - canvasRect.left + canvas.scrollLeft;
        const startY = startRect.top + startRect.height - canvasRect.top + canvas.scrollTop;
        
        // Calculate the ending point at the top of the end block
        const endX = endRect.left + endRect.width / 2 - canvasRect.left + canvas.scrollLeft;
        const endY = endRect.top - canvasRect.top + canvas.scrollTop;
        
        // Calculate the direction vector
        const dx = endX - startX;
        const dy = endY - startY;
        const length = Math.sqrt(dx * dx + dy * dy);
        
        // Normalize direction
        const nx = dx / length;
        const ny = dy / length;
        
        // Calculate control points for a curved line (bezier)
        const ctrlDist = length * 0.4; // Control points distance
        const ctrlX1 = startX + nx * ctrlDist;
        const ctrlY1 = startY + ny * ctrlDist;
        const ctrlX2 = endX - nx * ctrlDist;
        const ctrlY2 = endY - ny * ctrlDist;
        
        // Remove existing line if any
        const existingLine = document.getElementById(line.id);
        if (existingLine) {
            existingLine.remove();
        }
        
        // Create SVG for line
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.id = line.id;
        svg.classList.add('connector');
        svg.style.left = '0';
        svg.style.top = '0';
        svg.style.width = '100%';
        svg.style.height = '100%';
        svg.style.position = 'absolute';
        
        // Create curved path
        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.setAttribute('d', `M ${startX} ${startY} C ${ctrlX1} ${ctrlY1}, ${ctrlX2} ${ctrlY2}, ${endX} ${endY}`);
        path.setAttribute('stroke', line.color);
        path.setAttribute('stroke-dasharray', '5,5'); // Dashed line
        path.style.pointerEvents = 'stroke';
        
        svg.appendChild(path);
        
        // Add arrow to the end
        const arrowSize = 8;
        const angle = Math.atan2(endY - ctrlY2, endX - ctrlX2);
        
        const arrowMarker = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
        arrowMarker.setAttribute('class', 'connector-arrow');
        arrowMarker.setAttribute('points', `
            ${endX},${endY} 
            ${endX - arrowSize * Math.cos(angle - Math.PI/6)},${endY - arrowSize * Math.sin(angle - Math.PI/6)} 
            ${endX - arrowSize * Math.cos(angle + Math.PI/6)},${endY - arrowSize * Math.sin(angle + Math.PI/6)}
        `);
        arrowMarker.setAttribute('fill', line.color);
        
        svg.appendChild(arrowMarker);
        
        // Add event listeners and append to canvas
        path.addEventListener('click', (e) => {
            if (mode === 'delete') {
                deleteLine(line.id);
            } else if (mode === 'select') {
                selectElement(svg);
            }
            e.stopPropagation();
        });
        
        canvas.appendChild(svg);
    }

    function updateConnectedLines(blockId) {
        lines.forEach(line => {
            if (line.startId === blockId || line.endId === blockId) {
                drawLine(line);
            }
        });
    }

    function updateAllLines() {
        lines.forEach(line => drawLine(line));
    }

    function selectElement(element) {
        // Deselect previous selection
        if (selectedElement) {
            selectedElement.classList.remove('selected');
        }
        
        // Select new element
        selectedElement = element;
        selectedElement.classList.add('selected');
    }

    function deleteBlock(blockId) {
        // Remove from blocks array
        const index = blocks.findIndex(b => b.id === blockId);
        if (index !== -1) {
            blocks.splice(index, 1);
        }
        
        // Remove from DOM
        const blockElement = document.getElementById(blockId);
        if (blockElement) {
            blockElement.remove();
        }
        
        // Remove connected lines
        const connectedLines = lines.filter(l => l.startId === blockId || l.endId === blockId);
        connectedLines.forEach(line => {
            deleteLine(line.id);
        });
        
        // Reset selection if needed
        if (selectedElement && selectedElement.id === blockId) {
            selectedElement = null;
        }
        
        // Save state after deleting a block
        saveToLocalStorage();
    }

    function deleteLine(lineId) {
        // Remove from lines array
        const index = lines.findIndex(l => l.id === lineId);
        if (index !== -1) {
            lines.splice(index, 1);
        }
        
        // Remove from DOM
        const lineElement = document.getElementById(lineId);
        if (lineElement) {
            lineElement.remove();
        }
        
        // Reset selection if needed
        if (selectedElement && selectedElement.id === lineId) {
            selectedElement = null;
        }
        
        // Save state after deleting a line
        saveToLocalStorage();
    }
    
    // Local Storage functions
    function saveToLocalStorage() {
        const appState = {
            blocks,
            lines,
            spaces,
            currentSpace,
            spaceHistory,
            viewState: {
                scale,
                offset: canvasOffset
            }
        };
        
        try {
            localStorage.setItem('whitespace-app-state', JSON.stringify(appState));
        } catch (err) {
            console.error('Error saving app state:', err);
        }
    }
    
    function loadFromLocalStorage() {
        const savedState = localStorage.getItem('whitespace-app-state');
        
        if (savedState) {
            try {
                const appState = JSON.parse(savedState);
                
                // Restore data
                blocks = appState.blocks || [];
                lines = appState.lines || [];
                spaces = appState.spaces || [currentSpace];
                
                // Ensure we have a valid spaces array with the main space
                if (!spaces.some(s => s.id === 'main')) {
                    spaces.unshift({ id: 'main', name: 'Main Space', parentId: null });
                }
                
                spaceHistory = appState.spaceHistory || [];
                
                // Restore current space
                if (appState.currentSpace) {
                    currentSpace = appState.currentSpace;
                    currentSpaceLabel.textContent = currentSpace.name;
                }
                
                // Restore view state if it exists
                if (appState.viewState) {
                    scale = appState.viewState.scale || 1.0;
                    canvasOffset = appState.viewState.offset || { x: 0, y: 0 };
                    // Update grid size based on restored scale
                    updateGridSize();
                }
                
                // Load content for current space
                loadSpaceContent(currentSpace.id);
            } catch (err) {
                console.error('Error loading app state:', err);
                
                // Reset to defaults if there's an error
                blocks = [];
                lines = [];
                spaces = [{ id: 'main', name: 'Main Space', parentId: null }];
                currentSpace = spaces[0];
                spaceHistory = [];
                scale = 1.0;
                canvasOffset = { x: 0, y: 0 };
            }
        }
    }

    // Add a new function to create and update the temporary line
    function updateTempLine(mouseX, mouseY) {
        // Remove previous temp line if it exists
        if (tempLine) {
            tempLine.remove();
        }
        
        if (!lineStart) return;
        
        const startBlock = lineStart;
        const startRect = startBlock.getBoundingClientRect();
        const canvasRect = canvas.getBoundingClientRect();
        
        // Calculate the starting point at the bottom of the start block
        const startX = startRect.left + startRect.width / 2 - canvasRect.left + canvas.scrollLeft;
        const startY = startRect.top + startRect.height - canvasRect.top + canvas.scrollTop;
        
        // Calculate the ending point at the mouse position
        const endX = mouseX - canvasRect.left + canvas.scrollLeft;
        const endY = mouseY - canvasRect.top + canvas.scrollTop;
        
        // Calculate the direction vector
        const dx = endX - startX;
        const dy = endY - startY;
        const length = Math.sqrt(dx * dx + dy * dy);
        
        // Normalize direction
        const nx = dx / length;
        const ny = dy / length;
        
        // Calculate control points for a curved line (bezier)
        const ctrlDist = length * 0.4; // Control points distance
        const ctrlX1 = startX + nx * ctrlDist;
        const ctrlY1 = startY + ny * ctrlDist;
        const ctrlX2 = endX - nx * ctrlDist;
        const ctrlY2 = endY - ny * ctrlDist;
        
        // Create SVG for temp line
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.id = 'temp-line';
        svg.classList.add('connector', 'temp-connector');
        svg.style.left = '0';
        svg.style.top = '0';
        svg.style.width = '100%';
        svg.style.height = '100%';
        svg.style.position = 'absolute';
        svg.style.pointerEvents = 'none'; // Make sure it doesn't interfere with clicks
        
        // Create curved path
        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.setAttribute('d', `M ${startX} ${startY} C ${ctrlX1} ${ctrlY1}, ${ctrlX2} ${ctrlY2}, ${endX} ${endY}`);
        path.setAttribute('stroke', currentColor);
        path.setAttribute('stroke-dasharray', '5,5'); // Dashed line
        
        svg.appendChild(path);
        
        // Add arrow to the end
        const arrowSize = 8;
        const angle = Math.atan2(endY - ctrlY2, endX - ctrlX2);
        
        const arrowMarker = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
        arrowMarker.setAttribute('class', 'connector-arrow');
        arrowMarker.setAttribute('points', `
            ${endX},${endY} 
            ${endX - arrowSize * Math.cos(angle - Math.PI/6)},${endY - arrowSize * Math.sin(angle - Math.PI/6)} 
            ${endX - arrowSize * Math.cos(angle + Math.PI/6)},${endY - arrowSize * Math.sin(angle + Math.PI/6)}
        `);
        arrowMarker.setAttribute('fill', currentColor);
        
        svg.appendChild(arrowMarker);
        canvas.appendChild(svg);
        
        tempLine = svg;
    }

    // Add this function to setup image resize functionality
    function setupImageResizeHandles(imgElement) {
        // Create resize handles
        const positions = ['nw', 'ne', 'sw', 'se'];
        const handles = [];
        
        // Remove any existing handles first
        const parent = imgElement.parentElement;
        if (parent) {
            const existingHandles = parent.querySelectorAll('.image-resize-handle');
            existingHandles.forEach(handle => handle.remove());
        }
        
        // Create container for the image if it doesn't exist
        let container = imgElement.closest('.image-container');
        if (!container) {
            container = document.createElement('div');
            container.className = 'image-container';
            container.style.position = 'relative';
            container.style.display = 'inline-block';
            imgElement.parentNode.insertBefore(container, imgElement);
            container.appendChild(imgElement);
        }
        
        // Create and append resize handles
        positions.forEach(pos => {
            const handle = document.createElement('div');
            handle.className = `image-resize-handle resize-handle-${pos}`;
            container.appendChild(handle);
            handles.push(handle);
            
            // Setup resize event listeners
            handle.addEventListener('mousedown', startResize.bind(null, imgElement, pos));
        });
        
        // Make the actual image non-contenteditable to prevent editing conflicts
        imgElement.contentEditable = 'false';
        
        // Function to start resize operation
        function startResize(img, position, e) {
            e.preventDefault();
            e.stopPropagation();
            
            // Add resizing class
            img.classList.add('resizing');
            
            // Store initial dimensions and mouse position
            const startWidth = img.offsetWidth;
            const startHeight = img.offsetHeight;
            const startX = e.clientX;
            const startY = e.clientY;
            
            // Calculate aspect ratio to maintain
            const aspectRatio = startWidth / startHeight;
            
            // Flag to check if we're in an editable context
            const inEditableContext = !!img.closest('[contenteditable="true"]');
            
            // Create move and stop functions
            function resizeMove(moveEvent) {
                moveEvent.preventDefault();
                moveEvent.stopPropagation();
                
                // Calculate deltas
                const dx = moveEvent.clientX - startX;
                const dy = moveEvent.clientY - startY;
                
                // Determine new dimensions based on resize handle position
                let newWidth, newHeight;
                
                switch(position) {
                    case 'se':
                        newWidth = Math.max(50, startWidth + dx);
                        newHeight = Math.max(50, startHeight + dy);
                        break;
                    case 'sw':
                        newWidth = Math.max(50, startWidth - dx);
                        newHeight = Math.max(50, startHeight + dy);
                        break;
                    case 'ne':
                        newWidth = Math.max(50, startWidth + dx);
                        newHeight = Math.max(50, startHeight - dy);
                        break;
                    case 'nw':
                        newWidth = Math.max(50, startWidth - dx);
                        newHeight = Math.max(50, startHeight - dy);
                        break;
                }
                
                // Maintain aspect ratio if shift key is pressed
                if (moveEvent.shiftKey) {
                    if (Math.abs(dx) > Math.abs(dy)) {
                        newHeight = newWidth / aspectRatio;
                    } else {
                        newWidth = newHeight * aspectRatio;
                    }
                }
                
                // Apply new dimensions
                img.style.width = `${newWidth}px`;
                img.style.height = `${newHeight}px`;
                
                // Update container dimensions
                if (container) {
                    container.style.width = `${newWidth}px`;
                    container.style.height = `${newHeight}px`;
                }
            }
            
            function resizeStop() {
                img.classList.remove('resizing');
                
                // Save changes if in an editable context
                if (inEditableContext) {
                    const blockContent = img.closest('.block-content');
                    if (blockContent) {
                        const blockElement = blockContent.closest('.block');
                        const blockId = blockElement?.id;
                        const block = blocks.find(b => b.id === blockId);
                        if (block) {
                            block.content = blockContent.innerHTML;
                            saveToLocalStorage();
                        }
                    }
                }
                
                // Remove event listeners
                document.removeEventListener('mousemove', resizeMove);
                document.removeEventListener('mouseup', resizeStop);
            }
            
            // Add event listeners for resize operation
            document.addEventListener('mousemove', resizeMove);
            document.addEventListener('mouseup', resizeStop);
        }
    }
    
    // Function to refresh all image resize handles
    function refreshImageResizeHandles() {
        document.querySelectorAll('.block-content img').forEach(img => {
            setupImageResizeHandles(img);
        });
    }
    
    // Call this function after loading the app to setup resize handles for existing images
    function initializeImageHandlers() {
        // Add resize capability to all existing images
        document.querySelectorAll('.block-content img').forEach(img => {
            setupImageResizeHandles(img);
        });
    }
    
    // Initialize with select mode
    setMode('select');
});