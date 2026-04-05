// ==========================================================================
// ORBITAL TIMELINE - Login Background Animation
// ==========================================================================

(function () {
    const NODES = [
        { id: 1, title: 'Planning', icon: '📅', energy: 100 },
        { id: 2, title: 'Design', icon: '📄', energy: 90 },
        { id: 3, title: 'Development', icon: '💻', energy: 60 },
        { id: 4, title: 'Testing', icon: '🧪', energy: 30 },
        { id: 5, title: 'Release', icon: '🚀', energy: 10 },
    ];

    let rotationAngle = 0;
    let animationId = null;
    let lastTime = 0;
    const RADIUS = 200;
    const ROTATION_SPEED = 0.3; // degrees per frame tick (~50ms)

    function init() {
        const overlay = document.getElementById('login-overlay');
        if (!overlay) return;

        // Create orbital background container
        const bg = document.createElement('div');
        bg.className = 'orbital-bg';
        bg.id = 'orbital-bg';

        // Orbital center wrapper
        const center = document.createElement('div');
        center.className = 'orbital-center';

        // Orbit path ring
        const path = document.createElement('div');
        path.className = 'orbital-path';
        center.appendChild(path);

        // Central core orb
        const core = document.createElement('div');
        core.className = 'orbital-core';
        core.innerHTML = `
            <div class="orbital-core-ring1"></div>
            <div class="orbital-core-ring2"></div>
            <div class="orbital-core-inner"></div>
        `;
        center.appendChild(core);

        // Create nodes
        NODES.forEach((node, index) => {
            const el = document.createElement('div');
            el.className = 'orbital-node';
            el.dataset.index = index;

            const glowSize = node.energy * 0.5 + 40;
            const glow = document.createElement('div');
            glow.className = 'orbital-node-glow';
            glow.style.width = glowSize + 'px';
            glow.style.height = glowSize + 'px';
            glow.style.left = -(glowSize - 40) / 2 + 'px';
            glow.style.top = -(glowSize - 40) / 2 + 'px';

            const circle = document.createElement('div');
            circle.className = 'orbital-node-circle';
            circle.textContent = node.icon;

            const label = document.createElement('div');
            label.className = 'orbital-node-label';
            label.textContent = node.title;

            el.appendChild(glow);
            el.appendChild(circle);
            el.appendChild(label);
            center.appendChild(el);
        });

        bg.appendChild(center);
        overlay.insertBefore(bg, overlay.firstChild);

        startAnimation();
    }

    function calculatePosition(index, total) {
        const angle = ((index / total) * 360 + rotationAngle) % 360;
        const radian = (angle * Math.PI) / 180;

        const x = RADIUS * Math.cos(radian);
        const y = RADIUS * Math.sin(radian);
        const zIndex = Math.round(100 + 50 * Math.cos(radian));
        const opacity = Math.max(0.4, Math.min(1, 0.4 + 0.6 * ((1 + Math.sin(radian)) / 2)));

        return { x, y, zIndex, opacity };
    }

    function updateNodes() {
        const nodes = document.querySelectorAll('.orbital-node');
        const total = nodes.length;

        nodes.forEach((node) => {
            const index = parseInt(node.dataset.index);
            const pos = calculatePosition(index, total);

            node.style.transform = `translate(${pos.x}px, ${pos.y}px)`;
            node.style.zIndex = pos.zIndex;
            node.style.opacity = pos.opacity;
        });
    }

    function animate(timestamp) {
        if (timestamp - lastTime >= 50) {
            rotationAngle = (rotationAngle + ROTATION_SPEED) % 360;
            updateNodes();
            lastTime = timestamp;
        }
        animationId = requestAnimationFrame(animate);
    }

    function startAnimation() {
        if (animationId) return;
        animationId = requestAnimationFrame(animate);
    }

    function stopAnimation() {
        if (animationId) {
            cancelAnimationFrame(animationId);
            animationId = null;
        }
    }

    // Expose stop for when login succeeds
    window.stopOrbitalAnimation = stopAnimation;

    // Initialize when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
