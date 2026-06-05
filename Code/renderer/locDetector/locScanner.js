/**
 * locScanner.js
 * Responsible for calling the IPC scan and returning results.
 * Single responsibility: data fetching only.
 */

export default class LocScanner {
  async scan({ rootPath, threshold, mode }) {
    const response = await window.electronAPI.scan({
      rootPath,
      threshold,
      mode
    });

    if (!response.success) {
      throw new Error(response.error || 'Scan failed.');
    }

    return response;
  }
}