/**
 * dragScroll.js
 * Drag-to-scroll behaviour on #treeContainer.
 * Call init() once on DOMContentLoaded, destroy() on teardown.
 */

let _scrollHandlers = null;

export function init() {
    const scroller = document.getElementById('treeContainer');
    const cursorEl = document.querySelector('.tree-view-container');
    if (!scroller) return;

    if (_scrollHandlers) destroy();

    let isDragging = false;
    let didDrag    = false;
    let startX = 0, startY = 0;
    let scrollLeft = 0, scrollTop = 0;
    const DRAG_THRESHOLD = 4;

    const onMouseDown = (e) => {
        if (e.button !== 0) return;
        if (e.target.closest('button, input, a, label')) return;
        isDragging = true;
        didDrag    = false;
        startX     = e.clientX;
        startY     = e.clientY;
        scrollLeft = scroller.scrollLeft;
        scrollTop  = scroller.scrollTop;
    };

    const onMouseMove = (e) => {
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
    };

    const onMouseUp = () => {
        if (!isDragging) return;
        isDragging = false;
        cursorEl?.classList.remove('is-dragging');
        scroller.classList.remove('is-dragging');
    };

    const onMouseLeave = () => {
        isDragging = false;
        cursorEl?.classList.remove('is-dragging');
        scroller?.classList.remove('is-dragging');
    };

    scroller.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    window.addEventListener('mouseleave', onMouseLeave);

    _scrollHandlers = { scroller, onMouseDown, onMouseMove, onMouseUp, onMouseLeave };
}

export function destroy() {
    if (!_scrollHandlers) return;
    const { scroller, onMouseDown, onMouseMove, onMouseUp, onMouseLeave } = _scrollHandlers;
    scroller?.removeEventListener('mousedown', onMouseDown);
    window.removeEventListener('mousemove', onMouseMove);
    window.removeEventListener('mouseup', onMouseUp);
    window.removeEventListener('mouseleave', onMouseLeave);
    _scrollHandlers = null;
}