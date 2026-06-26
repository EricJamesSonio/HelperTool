export let _data = null;
export let _modal = null;
export let _selectedCategoryId = null;
export let _selectedCategoryColor = null;

export function getData() { return _data; }
export function setData(d) { _data = d; }
export function getModal() { return _modal; }
export function setModal(m) { _modal = m; }
export function getSelectedCategoryId() { return _selectedCategoryId; }
export function setSelectedCategoryId(id) { _selectedCategoryId = id; }
export function getSelectedCategoryColor() { return _selectedCategoryColor; }
export function setSelectedCategoryColor(c) { _selectedCategoryColor = c; }
