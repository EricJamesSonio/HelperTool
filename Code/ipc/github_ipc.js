const { ipcMain } = require('electron');
const https = require('https');

function githubApiGet(path, token) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'api.github.com',
      path,
      method: 'GET',
      headers: {
        'User-Agent': 'HelperTool/1.0',
        'Accept': 'application/vnd.github.v3+json',
        ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
      },
    };
    const req = https.get(options, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode === 200) {
          try { resolve(JSON.parse(data)); }
          catch (e) { reject(new Error('Invalid JSON response')); }
        } else {
          reject(new Error(`GitHub API ${res.statusCode}: ${data.slice(0, 200)}`));
        }
      });
    });
    req.on('error', reject);
    req.setTimeout(30000, () => { req.destroy(); reject(new Error('Request timeout')); });
  });
}

function parseGithubUrl(url) {
  const match = url.match(/github\.com\/([^/]+)\/([^/\s?#]+)/);
  if (!match) throw new Error('Invalid GitHub URL. Expected: https://github.com/owner/repo');
  return { owner: match[1], repo: match[2].replace(/\.git$/, '') };
}

function register() {
  ipcMain.handle('github:loadTree', async (event, { url, token }) => {
    try {
      const { owner, repo } = parseGithubUrl(url);

      const repoInfo = await githubApiGet(`/repos/${owner}/${repo}`, token);
      const branch = repoInfo.default_branch;

      const treeData = await githubApiGet(
        `/repos/${owner}/${repo}/git/trees/${branch}?recursive=1`,
        token
      );

      const allItems = treeData.tree || [];
      const fileItems = allItems.filter(i => i.type === 'blob');

      return {
        success: true,
        repoName: `${owner}/${repo}`,
        branch,
        description: repoInfo.description || '',
        truncated: !!treeData.truncated,
        tree: allItems,
        totalFiles: fileItems.length,
      };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });
}

module.exports = { register };
