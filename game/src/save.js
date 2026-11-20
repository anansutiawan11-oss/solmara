// Save game: one localStorage slot. Autosaved after each finished mission,
// manually from the safehouse door (E) and from the pause menu.
const KEY = 'solmara-save-v1';

export function loadSave() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    return typeof data === 'object' && data ? data : null;
  } catch {
    return null; // corrupt save or storage unavailable: start fresh
  }
}

export function writeSave(data) {
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
    return true;
  } catch {
    return false;
  }
}

export function clearSave() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // private mode or blocked storage — nothing to do
  }
}
