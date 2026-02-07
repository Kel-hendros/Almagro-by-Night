window.TacticalMap = class TacticalMap {
  constructor(canvasId, containerId) {
    this.canvas = document.getElementById(canvasId);
    this.container = document.getElementById(containerId);
    this.ctx = this.canvas.getContext("2d");

    // State
    this.tokens = [];
    this.instances = []; // Reference to logical instances for status syncing
    this.gridSize = 50;
    this.offsetX = 0;
    this.offsetY = 0;
    this.scale = 1.0;

    this.isDragging = false;
    this.dragStart = { x: 0, y: 0 };
    this.lastRender = 0;

    // Event callbacks
    this.onTokenMove = null;

    this.resize();
    window.addEventListener("resize", () => this.resize());

    this.setupInteractions();
    this.startLoop();
  }

  resize() {
    if (!this.container) return;
    this.canvas.width = this.container.clientWidth;
    this.canvas.height = this.container.clientHeight;
    this.draw();
  }

  setData(tokens, instances) {
    this.tokens = tokens || [];
    this.instances = instances || [];

    // Preload images
    this.tokens.forEach((t) => {
      if (t.imgUrl && !t.img) {
        const img = new Image();
        img.src = t.imgUrl;
        t.img = img;
      }
    });
    this.draw();
  }

  setActiveInstance(id) {
    this.activeInstanceId = id;
    this.draw();
  }

  startLoop() {
    const loop = (timestamp) => {
      this.draw(timestamp);
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }

  draw(timestamp) {
    // Clear
    this.ctx.fillStyle = "#1a1a1a"; // Dark gray bg
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    this.ctx.save();

    // Apply Transform
    this.ctx.translate(this.offsetX, this.offsetY);
    this.ctx.scale(this.scale, this.scale);

    // Draw Layers
    this.drawGrid();
    this.drawTokens();

    this.ctx.restore();
  }

  drawGrid() {
    const viewportWidth = this.canvas.width / this.scale;
    const viewportHeight = this.canvas.height / this.scale;
    const startX = -this.offsetX / this.scale;
    const startY = -this.offsetY / this.scale;

    this.ctx.strokeStyle = "#333";
    this.ctx.lineWidth = 1;
    this.ctx.beginPath();

    // Draw grid lines covering the visible area + buffer
    const buffer = 100;
    const gridMinX =
      Math.floor((startX - buffer) / this.gridSize) * this.gridSize;
    const gridMaxX =
      Math.floor((startX + viewportWidth + buffer) / this.gridSize) *
      this.gridSize;
    const gridMinY =
      Math.floor((startY - buffer) / this.gridSize) * this.gridSize;
    const gridMaxY =
      Math.floor((startY + viewportHeight + buffer) / this.gridSize) *
      this.gridSize;

    for (let x = gridMinX; x <= gridMaxX; x += this.gridSize) {
      this.ctx.moveTo(x, gridMinY);
      this.ctx.lineTo(x, gridMaxY);
    }
    for (let y = gridMinY; y <= gridMaxY; y += this.gridSize) {
      this.ctx.moveTo(gridMinX, y);
      this.ctx.lineTo(gridMaxX, y);
    }
    this.ctx.stroke();
  }

  drawTokens() {
    this.tokens.forEach((token) => {
      const screenX = token.x * this.gridSize;
      const screenY = token.y * this.gridSize;
      const size = (token.size || 1) * this.gridSize;
      const radius = size * 0.4;
      const cx = screenX + size / 2;
      const cy = screenY + size / 2;

      this.ctx.save();

      // Shadow
      this.ctx.shadowColor = "rgba(0,0,0,0.5)";
      this.ctx.shadowBlur = 4;
      this.ctx.shadowOffsetX = 2;
      this.ctx.shadowOffsetY = 2;

      // Clip for Avatar
      this.ctx.beginPath();
      this.ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      this.ctx.closePath();

      this.ctx.fillStyle = "#444";
      this.ctx.fill(); // Fallback background

      this.ctx.clip();

      if (token.img && token.img.complete) {
        this.ctx.drawImage(
          token.img,
          cx - radius,
          cy - radius,
          radius * 2,
          radius * 2,
        );
      }

      // Restore for Border
      this.ctx.restore();

      this.ctx.beginPath();
      this.ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      this.ctx.strokeStyle = "#999";
      this.ctx.lineWidth = 2;
      this.ctx.stroke();

      // Selection ring
      if (this.selectedTokenId === token.id) {
        this.ctx.strokeStyle = "#ff9800";
        this.ctx.lineWidth = 3;
        this.ctx.stroke();
      }
    });
  }

  setupInteractions() {
    // Pan and Zoom listeners
    this.canvas.addEventListener("wheel", (e) => this.handleWheel(e));
    this.canvas.addEventListener("mousedown", (e) => this.handleMouseDown(e));
    this.canvas.addEventListener("contextmenu", (e) => e.preventDefault()); // Stop right-click menu
    window.addEventListener("mousemove", (e) => this.handleMouseMove(e));
    window.addEventListener("mouseup", (e) => this.handleMouseUp(e));
  }

  handleWheel(e) {
    e.preventDefault();
    const zoomIntensity = 0.1;
    const delta = e.deltaY > 0 ? -zoomIntensity : zoomIntensity;

    // Zoom towards mouse
    const rect = this.canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    // Current world coords
    const worldX = (mouseX - this.offsetX) / this.scale;
    const worldY = (mouseY - this.offsetY) / this.scale;

    const newScale = Math.min(Math.max(0.1, this.scale + delta), 5);

    // New offset to keep mouse world coords same
    this.offsetX = mouseX - worldX * newScale;
    this.offsetY = mouseY - worldY * newScale;
    this.scale = newScale;
  }

  handleMouseDown(e) {
    if (e.button === 1 || e.button === 2 || e.metaKey) {
      // Pan: Middle, Right, or Meta+Left
      e.preventDefault(); // Stop default browser behavior (scrolling etc)
      this.isPanning = true;
      this.dragStart = { x: e.clientX, y: e.clientY };
    } else if (e.button === 0) {
      // Left click: Select or Drag Token
      const rect = this.canvas.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;

      // World Coords
      const worldX = (mouseX - this.offsetX) / this.scale;
      const worldY = (mouseY - this.offsetY) / this.scale;

      // Check collision (reverse order to pick top)
      const clickedToken = [...this.tokens].reverse().find((t) => {
        const tx = t.x * this.gridSize;
        const ty = t.y * this.gridSize;
        const size = (t.size || 1) * this.gridSize;
        return (
          worldX >= tx &&
          worldX <= tx + size &&
          worldY >= ty &&
          worldY <= ty + size
        );
      });

      if (clickedToken) {
        this.isDraggingToken = true;
        this.selectedTokenId = clickedToken.id;
        this.draggedToken = clickedToken;
        // Calculate offset within the token
        this.dragTokenOffset = {
          x: worldX - clickedToken.x * this.gridSize,
          y: worldY - clickedToken.y * this.gridSize,
        };
      } else {
        this.selectedTokenId = null;
      }
    }
  }

  handleMouseMove(e) {
    if (this.isPanning) {
      const dx = e.clientX - this.dragStart.x;
      const dy = e.clientY - this.dragStart.y;
      this.offsetX += dx;
      this.offsetY += dy;
      this.dragStart = { x: e.clientX, y: e.clientY };
    } else if (this.isDraggingToken && this.draggedToken) {
      const rect = this.canvas.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;
      const worldX = (mouseX - this.offsetX) / this.scale;
      const worldY = (mouseY - this.offsetY) / this.scale;

      // Snap logic eventually, for now smooth drag visual?
      // Actually let's just create a 'ghost' or move freely and snap on release.
      // For simplicity V1: immediate snap move
      const rawGridX = (worldX - this.dragTokenOffset.x) / this.gridSize;
      const rawGridY = (worldY - this.dragTokenOffset.y) / this.gridSize;

      this.draggedToken.x = Math.round(rawGridX);
      this.draggedToken.y = Math.round(rawGridY);
    }
  }

  handleMouseUp(e) {
    this.isPanning = false;
    if (this.isDraggingToken) {
      this.isDraggingToken = false;
      if (this.onTokenMove && this.draggedToken) {
        this.onTokenMove(
          this.draggedToken.id,
          this.draggedToken.x,
          this.draggedToken.y,
        );
      }
      this.draggedToken = null;
    }
  }
};
