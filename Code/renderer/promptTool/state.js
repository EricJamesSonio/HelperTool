export let _data = null;
export let _modal = null;
export let _selectedCategoryId = null;

export function getData() { return _data; }
export function setData(d) { _data = d; }
export function getModal() { return _modal; }
export function setModal(m) { _modal = m; }
export function getSelectedCategoryId() { return _selectedCategoryId; }
export function setSelectedCategoryId(id) {
    _selectedCategoryId = id;
    document.querySelectorAll('.prompt-cat-btn').forEach(b => b.classList.remove('active'));
    const btn = document.getElementById(`promptCatBtn_${id}`);
    if (btn) btn.classList.add('active');
}
