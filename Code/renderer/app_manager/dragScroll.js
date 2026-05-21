/**
 * dragScroll.js
 * Drag-to-scroll behaviour on #treeContainer.
 * Call init() once on DOMContentLoaded.
 */

export function init() {
    const scroller = document.getElementById('treeContainer');
    const cursorEl = document.querySelector('.tree-view-container');
    if (!scroller) return;

    let isDragging = false;
    let didDrag    = false;
    let startX = 0, startY = 0;
    let scrollLeft = 0, scrollTop = 0;
    const DRAG_THRESHOLD = 4;

    scroller.addEventListener('mousedown', (e) => {
        if (e.button !== 0) return;
        if (e.target.closest('button, input, a, label')) return;
        isDragging = true;
        didDrag    = false;
        startX     = e.clientX;
        startY     = e.clientY;
        scrollLeft = scroller.scrollLeft;
        scrollTop  = scroller.scrollTop;
    });

    window.addEventListener('mousemove', (e) => {
        if (!isDragging) return;
        const dx = e.clientX - startX;
        const dy = e.clientY - startY;
        if (!didDrag && Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
        if (!didDrag) {
            didDrag = true;
            cursorEl?.classList.add('is-dragging');
            scroller.classList.add('is-dragging');
        }
        e.preventDefault();
        scroller.scrollLeft = scrollLeft - dx;
        scroller.scrollTop  = scrollTop  - dy;
    });

    window.addEventListener('mouseup', () => {
        if (!isDragging) return;
        isDragging = false;
        cursorEl?.classList.remove('is-dragging');
        scroller.classList.remove('is-dragging');
    });

    window.addEventListener('mouseleave', () => {
        isDragging = false;
        cursorEl?.classList.remove('is-dragging');
        scroller?.classList.remove('is-dragging');
    });
}